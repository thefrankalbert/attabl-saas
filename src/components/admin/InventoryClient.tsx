'use client';

import { useState, useEffect } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useIngredients, useSuppliers } from '@/hooks/queries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveDataTable } from '@/components/admin/ResponsiveDataTable';
import { useTranslations } from 'next-intl';
import RoleGuard from '@/components/admin/RoleGuard';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import InventoryFilters from '@/components/admin/inventory/InventoryFilters';
import InventoryMobileCard from '@/components/admin/inventory/InventoryMobileCard';
import InventoryFormModal from '@/components/admin/inventory/InventoryFormModal';
import InventoryAdjustModal from '@/components/admin/inventory/InventoryAdjustModal';
import { useInventoryColumns } from '@/components/admin/inventory/use-inventory-columns';
import { useInventoryActions } from '@/components/admin/inventory/use-inventory-actions';

interface InventoryClientProps {
  tenantId: string;
  currency: string;
}

export default function InventoryClient({ tenantId, currency }: InventoryClientProps) {
  const [searchQuery, setSearchQuery] = useSessionState('inventory:searchQuery', '');
  const [filterStatus, setFilterStatus] = useSessionState<'all' | 'low' | 'out'>(
    'inventory:filterStatus',
    'all',
  );

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // TanStack Query for ingredients and suppliers
  const {
    data: ingredients = [],
    isLoading: isQueryLoading,
    isError,
    refetch,
  } = useIngredients(tenantId);
  const loading = !isMounted || isQueryLoading;
  const { data: activeSuppliers = [] } = useSuppliers(tenantId, { activeOnly: true });

  const {
    modalMode,
    selectedIngredient,
    formName,
    setFormName,
    formUnit,
    setFormUnit,
    formStock,
    setFormStock,
    formMinAlert,
    setFormMinAlert,
    formCostPerUnit,
    setFormCostPerUnit,
    formCategory,
    setFormCategory,
    adjustQty,
    setAdjustQty,
    adjustType,
    setAdjustType,
    adjustNotes,
    setAdjustNotes,
    adjustSupplierId,
    setAdjustSupplierId,
    isSubmitting,
    confirmDeactivate,
    setConfirmDeactivate,
    openAdd,
    openEdit,
    openAdjust,
    closeModal,
    handleSave,
    handleDeactivate,
    handleAdjust,
  } = useInventoryActions(tenantId);

  // ─── Realtime: ingredients updates with low-stock alerts ─
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `inventory_${tenantId}`,
    table: 'ingredients',
    filter: `tenant_id=eq.${tenantId}`,
    onUpdate: (record) => {
      const stock = record.current_stock as number | undefined;
      const minAlert = record.min_stock_alert as number | undefined;
      if (stock != null && minAlert != null && stock <= minAlert && stock > 0) {
        toast({
          title: t('lowStock'),
          description: `${String(record.name)} - ${String(stock)} ${String(record.unit || '')}`,
          variant: 'destructive',
        });
      }
    },
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    },
  });

  // Filtered list
  const filtered = ingredients.filter((ing) => {
    if (searchQuery && !ing.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterStatus === 'low' && ing.current_stock > ing.min_stock_alert) return false;
    if (filterStatus === 'out' && ing.current_stock > 0) return false;
    return true;
  });

  const columns = useInventoryColumns(currency, openAdjust, openEdit);

  const lowCount = ingredients.filter(
    (i) => i.current_stock > 0 && i.current_stock <= i.min_stock_alert,
  ).length;
  const outCount = ingredients.filter((i) => i.current_stock <= 0).length;

  return (
    <RoleGuard permission="canViewStocks">
      <div className="h-full flex flex-col overflow-hidden">
        {/* Fixed header area */}
        <div className="shrink-0 space-y-4">
          <AdminPageHeader
            title={t('inventory')}
            count={loading || isError ? undefined : ingredients.length}
            actions={
              <>
                {/* Search - compact */}
                <div className="relative w-full @lg:w-56 @xl:w-64 @2xl:w-80 shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
                  <Input
                    data-search-input
                    placeholder={t('searchProduct')}
                    className="pl-9 h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Add button */}
                <Button onClick={openAdd} variant="default" className="gap-2 h-9 shrink-0">
                  <Plus className="w-4 h-4" />
                  {t('addIngredient')}
                </Button>
              </>
            }
          />

          {/* Filter pills */}
          <InventoryFilters
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            lowCount={lowCount}
            outCount={outCount}
            totalCount={ingredients.length}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-app-text-secondary">
            {tc('loading')}
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="w-10 h-10 text-app-text-muted" />
            <p className="text-sm text-status-error">{tc('loadingError')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {tc('retry')}
            </Button>
          </div>
        ) : (
          <>
            {/* Table / Cards */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 @sm:mt-6">
              <ResponsiveDataTable
                columns={columns}
                data={filtered}
                emptyMessage={t('noProductFound')}
                storageKey="inventory"
                mobileConfig={{
                  renderCard: (ing) => (
                    <InventoryMobileCard
                      ing={ing}
                      currency={currency}
                      onAdjust={openAdjust}
                      onEdit={openEdit}
                    />
                  ),
                }}
              />
            </div>

            {/* Modal - Add / Edit */}
            <InventoryFormModal
              isOpen={modalMode === 'add' || modalMode === 'edit'}
              mode={modalMode}
              onClose={closeModal}
              formName={formName}
              setFormName={setFormName}
              formUnit={formUnit}
              setFormUnit={setFormUnit}
              formStock={formStock}
              setFormStock={setFormStock}
              formMinAlert={formMinAlert}
              setFormMinAlert={setFormMinAlert}
              formCostPerUnit={formCostPerUnit}
              setFormCostPerUnit={setFormCostPerUnit}
              formCategory={formCategory}
              setFormCategory={setFormCategory}
              confirmDeactivate={confirmDeactivate}
              setConfirmDeactivate={setConfirmDeactivate}
              isSubmitting={isSubmitting}
              handleSave={handleSave}
              handleDeactivate={handleDeactivate}
            />

            {/* Modal - Adjust Stock */}
            <InventoryAdjustModal
              isOpen={modalMode === 'adjust' && !!selectedIngredient}
              onClose={closeModal}
              selectedIngredient={selectedIngredient}
              adjustType={adjustType}
              setAdjustType={setAdjustType}
              adjustQty={adjustQty}
              setAdjustQty={setAdjustQty}
              adjustNotes={adjustNotes}
              setAdjustNotes={setAdjustNotes}
              adjustSupplierId={adjustSupplierId}
              setAdjustSupplierId={setAdjustSupplierId}
              activeSuppliers={activeSuppliers}
              isSubmitting={isSubmitting}
              handleAdjust={handleAdjust}
            />
          </>
        )}
      </div>
    </RoleGuard>
  );
}

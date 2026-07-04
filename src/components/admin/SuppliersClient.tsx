'use client';

import { useState, useEffect } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import { Plus, Search, AlertTriangle, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSuppliers } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveDataTable } from '@/components/admin/ResponsiveDataTable';
import AdminModal from '@/components/admin/AdminModal';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import SupplierImportExcel from '@/components/features/inventory/SupplierImportExcel';
import { actionUpdateSupplier, actionDeleteSupplier } from '@/app/actions/suppliers';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Supplier } from '@/types/supplier.types';
import { useSupplierForm } from './suppliers/useSupplierForm';
import { useSupplierColumns } from './suppliers/useSupplierColumns';
import SupplierCard from './suppliers/SupplierCard';
import SupplierFormModal from './suppliers/SupplierFormModal';

interface SuppliersClientProps {
  tenantId: string;
}

export default function SuppliersClient({ tenantId }: SuppliersClientProps) {
  const [searchQuery, setSearchQuery] = useSessionState('suppliers:searchQuery', '');
  const [filterActive, setFilterActive] = useSessionState<'all' | 'active' | 'inactive'>(
    'suppliers:filterActive',
    'all',
  );

  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { toast } = useToast();
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // TanStack Query for suppliers
  const {
    data: suppliers = [],
    isLoading: isQueryLoading,
    isError,
    refetch,
  } = useSuppliers(tenantId);
  const loading = !isMounted || isQueryLoading;

  const loadSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers', tenantId] });
  };

  const form = useSupplierForm(tenantId, loadSuppliers);
  const { openAdd, openEdit } = form;

  const filtered = suppliers.filter((s) => {
    if (filterActive === 'active' && !s.is_active) return false;
    if (filterActive === 'inactive' && s.is_active) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.contact_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleToggleActive = async (supplier: Supplier) => {
    try {
      const r = await actionUpdateSupplier(tenantId, supplier.id, {
        is_active: !supplier.is_active,
      });
      if (r.error) throw new Error(r.error);
      toast({ title: supplier.is_active ? t('supplierDisabled') : t('supplierEnabled') });
      loadSuppliers();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleDelete = async (supplierId: string) => {
    try {
      const r = await actionDeleteSupplier(tenantId, supplierId);
      if (r.error) throw new Error(r.error);
      toast({ title: t('supplierDeleted') });
      setDeleteConfirm(null);
      loadSuppliers();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  const columns = useSupplierColumns({
    openEdit,
    handleToggleActive,
    handleDelete,
    deleteConfirm,
    setDeleteConfirm,
  });

  return (
    <RoleGuard permission="canManageStocks">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 space-y-4">
          <AdminPageHeader
            title={t('title')}
            actions={
              <>
                <div className="relative w-full xl:w-56 2xl:w-64 shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
                  <Input
                    data-search-input
                    placeholder={t('searchPlaceholder')}
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 shrink-0">
                  {(['all', 'active', 'inactive'] as const).map((status) => (
                    <Button
                      key={status}
                      variant={filterActive === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterActive(status)}
                      className="rounded-full"
                    >
                      {status === 'all'
                        ? t('filterAll')
                        : status === 'active'
                          ? t('filterActive')
                          : t('filterInactive')}
                    </Button>
                  ))}
                </div>

                <Button
                  onClick={() => setShowImportModal(true)}
                  variant="outline"
                  className="gap-2 shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  {t('importExcel')}
                </Button>

                <Button onClick={openAdd} variant="default" className="gap-2 shrink-0">
                  <Plus className="w-4 h-4" />
                  {t('addSupplier')}
                </Button>
              </>
            }
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-app-text-secondary">
            {t('loadingSuppliers')}
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
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
              {/* Table / Cards */}
              <ResponsiveDataTable
                columns={columns}
                data={filtered}
                emptyMessage={t('noSuppliersFound')}
                storageKey="suppliers"
                mobileConfig={{
                  renderCard: (supplier) => (
                    <SupplierCard
                      supplier={supplier}
                      openEdit={openEdit}
                      onToggleActive={handleToggleActive}
                    />
                  ),
                }}
              />
            </div>

            {/* Modal - Add / Edit */}
            <SupplierFormModal form={form} />
          </>
        )}

        {/* Import Excel Modal */}
        <AdminModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title={t('importExcel')}
          size="lg"
        >
          {showImportModal && (
            <SupplierImportExcel
              onImportComplete={loadSuppliers}
              onCancel={() => setShowImportModal(false)}
            />
          )}
        </AdminModal>
      </div>
    </RoleGuard>
  );
}

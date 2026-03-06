'use client';

import { useState, useMemo } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { Package, Plus, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useIngredients, useSuppliers } from '@/hooks/queries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AdminModal from '@/components/admin/AdminModal';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import { useTranslations } from 'next-intl';
import { createInventoryService } from '@/services/inventory.service';
import { formatCurrency } from '@/lib/utils/currency';
import type { ColumnDef } from '@tanstack/react-table';
import type { CurrencyCode } from '@/types/admin.types';
import type {
  Ingredient,
  IngredientUnit,
  CreateIngredientInput,
  MovementType,
  INGREDIENT_UNITS as UNITS_TYPE,
} from '@/types/inventory.types';
import { INGREDIENT_UNITS, MOVEMENT_TYPE_LABELS } from '@/types/inventory.types';
import RoleGuard from '@/components/admin/RoleGuard';

interface InventoryClientProps {
  tenantId: string;
  currency: string;
}

type ModalMode = 'add' | 'edit' | 'adjust' | null;

export default function InventoryClient({ tenantId, currency }: InventoryClientProps) {
  const [searchQuery, setSearchQuery] = useSessionState('inventory:searchQuery', '');
  const [filterStatus, setFilterStatus] = useSessionState<'all' | 'low' | 'out'>(
    'inventory:filterStatus',
    'all',
  );

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState<IngredientUnit>('kg');
  const [formStock, setFormStock] = useState('');
  const [formMinAlert, setFormMinAlert] = useState('');
  const [formCostPerUnit, setFormCostPerUnit] = useState('');
  const [formCategory, setFormCategory] = useState('');

  // Adjust stock fields
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<MovementType>('manual_add');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSupplierId, setAdjustSupplierId] = useState('');

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const supabase = createClient();
  const queryClient = useQueryClient();
  const inventoryService = createInventoryService(supabase);

  // TanStack Query for ingredients and suppliers
  const { data: ingredients = [], isLoading: loading } = useIngredients(tenantId);
  const { data: activeSuppliers = [] } = useSuppliers(tenantId, { activeOnly: true });

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
          description: `${String(record.name)} — ${String(stock)} ${String(record.unit || '')}`,
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

  const getStockBadge = (ing: Ingredient) => {
    if (ing.current_stock <= 0) return { label: t('outOfStock'), bg: 'bg-red-500/10 text-red-500' };
    if (ing.current_stock <= ing.min_stock_alert)
      return { label: t('lowStock'), bg: 'bg-amber-500/10 text-amber-500' };
    return { label: t('stockOk'), bg: 'bg-green-500/10 text-green-500' };
  };

  // TanStack Table column definitions
  const columns = useMemo<ColumnDef<Ingredient, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader column={column}>{tc('product')}</SortableHeader>,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-app-text">{row.original.name}</p>
            {row.original.category && (
              <p className="text-xs text-app-text-secondary">{row.original.category}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'unit',
        header: () => tc('unit'),
        cell: ({ row }) => INGREDIENT_UNITS[row.original.unit]?.labelShort || row.original.unit,
        enableSorting: false,
      },
      {
        accessorKey: 'current_stock',
        header: ({ column }) => (
          <SortableHeader column={column} className="ml-auto">
            {t('currentStock')}
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const ing = row.original;
          return (
            <span className="font-mono font-bold text-app-text">
              {ing.current_stock.toFixed(ing.unit === 'pièce' || ing.unit === 'bouteille' ? 0 : 2)}
            </span>
          );
        },
        meta: { className: 'text-right' },
      },
      {
        accessorKey: 'min_stock_alert',
        header: () => t('minAlert'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">{row.original.min_stock_alert}</span>
        ),
        enableSorting: false,
        meta: { className: 'text-right' },
      },
      {
        accessorKey: 'cost_per_unit',
        header: ({ column }) => (
          <SortableHeader column={column} className="ml-auto">
            {t('costPerUnit')}
          </SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">
            {formatCurrency(row.original.cost_per_unit, currency as CurrencyCode)}
          </span>
        ),
        meta: { className: 'text-right' },
      },
      {
        id: 'status',
        header: () => <span className="w-full text-center block">{tc('status')}</span>,
        cell: ({ row }) => {
          const badge = getStockBadge(row.original);
          return (
            <div className="text-center">
              <span className={cn('px-2 py-1 rounded-full text-xs font-bold', badge.bg)}>
                {badge.label}
              </span>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="w-full text-right block">{tc('actions')}</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openAdjust(row.original)}
              className="text-xs"
            >
              +/-
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(row.original)}
              className="text-xs"
            >
              {tc('edit')}
            </Button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, t, tc],
  );

  const resetForm = () => {
    setFormName('');
    setFormUnit('kg');
    setFormStock('');
    setFormMinAlert('');
    setFormCostPerUnit('');
    setFormCategory('');
    setAdjustQty('');
    setAdjustType('manual_add');
    setAdjustNotes('');
    setAdjustSupplierId('');
    setSelectedIngredient(null);
  };

  const openAdd = () => {
    resetForm();
    setModalMode('add');
  };

  const openEdit = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setFormName(ing.name);
    setFormUnit(ing.unit);
    setFormMinAlert(String(ing.min_stock_alert));
    setFormCostPerUnit(String(ing.cost_per_unit));
    setFormCategory(ing.category || '');
    setModalMode('edit');
  };

  const openAdjust = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setAdjustQty('');
    setAdjustType('manual_add');
    setAdjustNotes('');
    setModalMode('adjust');
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: t('nameRequired'), variant: 'destructive' });
      return;
    }

    try {
      if (modalMode === 'add') {
        const input: CreateIngredientInput = {
          name: formName.trim(),
          unit: formUnit,
          current_stock: parseFloat(formStock) || 0,
          min_stock_alert: parseFloat(formMinAlert) || 0,
          cost_per_unit: parseFloat(formCostPerUnit) || 0,
          category: formCategory.trim() || undefined,
        };
        await inventoryService.createIngredient(tenantId, input);
        toast({ title: t('productAdded') });
      } else if (modalMode === 'edit' && selectedIngredient) {
        await inventoryService.updateIngredient(selectedIngredient.id, tenantId, {
          name: formName.trim(),
          unit: formUnit,
          min_stock_alert: parseFloat(formMinAlert) || 0,
          cost_per_unit: parseFloat(formCostPerUnit) || 0,
          category: formCategory.trim() || null,
        });
        toast({ title: t('productUpdated') });
      }
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleAdjust = async () => {
    if (!selectedIngredient || !adjustQty) return;

    try {
      await inventoryService.adjustStock(tenantId, {
        ingredient_id: selectedIngredient.id,
        quantity: parseFloat(adjustQty),
        movement_type: adjustType,
        notes: adjustNotes.trim() || undefined,
        supplier_id: adjustSupplierId || undefined,
      });
      toast({ title: t('stockAdjusted') });
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const lowCount = ingredients.filter(
    (i) => i.current_stock > 0 && i.current_stock <= i.min_stock_alert,
  ).length;
  const outCount = ingredients.filter((i) => i.current_stock <= 0).length;

  return (
    <RoleGuard permission="canViewStocks">
      <div className="h-full flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-app-text-secondary">
            {tc('loading')}
          </div>
        ) : (
          <>
            {/* Fixed header area */}
            <div className="shrink-0 space-y-3">
              {/* Row 1: Title + Search + Filters + Add — all on one line (desktop) */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                {/* Title */}
                <h1 className="text-xl font-bold text-app-text flex items-center gap-2 shrink-0">
                  <Package className="w-5 h-5" />
                  {t('inventory')}
                  <span className="text-sm font-normal text-app-text-muted">
                    ({ingredients.length})
                  </span>
                </h1>

                {/* Search — compact */}
                <div className="relative w-full lg:w-56 xl:w-64 shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
                  <Input
                    data-search-input
                    placeholder={t('searchProduct')}
                    className="pl-9 h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Filter pills */}
                <div className="flex items-center gap-1.5">
                  {(['all', 'low', 'out'] as const).map((status) => {
                    const count =
                      status === 'low'
                        ? lowCount
                        : status === 'out'
                          ? outCount
                          : ingredients.length;
                    return (
                      <Button
                        key={status}
                        variant={filterStatus === status ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus(status)}
                        className={cn(
                          'rounded-full h-8 text-xs px-3 gap-1.5',
                          status === 'out' &&
                            outCount > 0 &&
                            filterStatus !== status &&
                            'border-red-500/30 text-red-500',
                          status === 'low' &&
                            lowCount > 0 &&
                            filterStatus !== status &&
                            'border-amber-500/30 text-amber-500',
                        )}
                      >
                        {status === 'all'
                          ? tc('all')
                          : status === 'low'
                            ? t('lowStock')
                            : t('rupture')}
                        {status !== 'all' && count > 0 && (
                          <span
                            className={cn(
                              'inline-flex items-center justify-center rounded-full min-w-[18px] h-[18px] text-[10px] font-bold px-1',
                              filterStatus === status
                                ? 'bg-white/20'
                                : status === 'out'
                                  ? 'bg-red-500/15'
                                  : 'bg-amber-500/15',
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>

                {/* Add button — pushed right */}
                <div className="lg:ml-auto shrink-0">
                  <Button onClick={openAdd} variant="default" className="gap-2 h-9">
                    <Plus className="w-4 h-4" />
                    {t('addIngredient')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Table / Cards */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
              <ResponsiveDataTable
                columns={columns}
                data={filtered}
                emptyMessage={t('noProductFound')}
                storageKey="inventory"
                mobileConfig={{
                  renderCard: (ing) => {
                    const badge = getStockBadge(ing);
                    const unitLabel = INGREDIENT_UNITS[ing.unit]?.labelShort || ing.unit;
                    return (
                      <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
                        {/* Row 1: Name + Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-app-text truncate">{ing.name}</p>
                            {ing.category && (
                              <p className="text-xs text-app-text-secondary">{ing.category}</p>
                            )}
                          </div>
                          <span
                            className={cn(
                              'px-2 py-1 rounded-full text-xs font-bold shrink-0',
                              badge.bg,
                            )}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Row 2: Stock + Cost */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-app-text-secondary">
                            {t('currentStock')}:{' '}
                            <span className="font-mono font-bold text-app-text">
                              {ing.current_stock.toFixed(
                                ing.unit === 'pièce' || ing.unit === 'bouteille' ? 0 : 2,
                              )}
                            </span>{' '}
                            {unitLabel}
                          </span>
                          <span className="text-app-text-secondary">
                            {formatCurrency(ing.cost_per_unit, currency as CurrencyCode)}/
                            {unitLabel}
                          </span>
                        </div>

                        {/* Row 3: Actions */}
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAdjust(ing)}
                            className="text-xs min-h-[44px]"
                          >
                            +/-
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(ing)}
                            className="text-xs min-h-[44px]"
                          >
                            {tc('edit')}
                          </Button>
                        </div>
                      </div>
                    );
                  },
                }}
              />
            </div>

            {/* Modal — Add / Edit */}
            <AdminModal
              isOpen={modalMode === 'add' || modalMode === 'edit'}
              onClose={() => {
                setModalMode(null);
                resetForm();
              }}
              title={modalMode === 'add' ? t('addIngredient') : t('editIngredient')}
              size="lg"
            >
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {tc('name')}
                  </label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('ingredientNamePlaceholder')}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {tc('unit')}
                    </label>
                    <select
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value as IngredientUnit)}
                      className="w-full h-10 px-3 border border-app-border rounded-lg text-sm bg-app-elevated text-app-text focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      {(Object.keys(INGREDIENT_UNITS) as IngredientUnit[]).map((u) => (
                        <option key={u} value={u}>
                          {(INGREDIENT_UNITS as typeof UNITS_TYPE)[u].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {modalMode === 'add' && (
                    <div>
                      <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {t('currentStock')}
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formStock}
                        onChange={(e) => setFormStock(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {t('minAlert')}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formMinAlert}
                      onChange={(e) => setFormMinAlert(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {t('costPerUnit')}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formCostPerUnit}
                      onChange={(e) => setFormCostPerUnit(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {t('categoryOptional')}
                  </label>
                  <Input
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder={t('categoryPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setModalMode(null);
                    resetForm();
                  }}
                >
                  {tc('cancel')}
                </Button>
                <Button onClick={handleSave} variant="default">
                  {tc('save')}
                </Button>
              </div>
            </AdminModal>

            {/* Modal — Adjust Stock */}
            <AdminModal
              isOpen={modalMode === 'adjust' && !!selectedIngredient}
              onClose={() => {
                setModalMode(null);
                resetForm();
              }}
              title={t('adjustStock')}
              size="lg"
            >
              {selectedIngredient && (
                <>
                  <p className="text-sm text-app-text-secondary mb-4">
                    {selectedIngredient.name} — {t('currentStock')} :{' '}
                    <span className="font-bold">
                      {selectedIngredient.current_stock}{' '}
                      {INGREDIENT_UNITS[selectedIngredient.unit]?.labelShort}
                    </span>
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {t('movementType')}
                      </label>
                      <select
                        value={adjustType}
                        onChange={(e) => setAdjustType(e.target.value as MovementType)}
                        className="w-full h-10 px-3 border border-app-border rounded-lg text-sm bg-app-elevated text-app-text focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {(
                          ['manual_add', 'manual_remove', 'adjustment', 'opening'] as MovementType[]
                        ).map((mt) => (
                          <option key={mt} value={mt}>
                            {MOVEMENT_TYPE_LABELS[mt].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {tc('quantity')}
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        value={adjustQty}
                        onChange={(e) => setAdjustQty(e.target.value)}
                        placeholder="0"
                        autoFocus
                      />
                    </div>

                    {adjustType === 'manual_add' && activeSuppliers.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                          {t('supplierOptional')}
                        </label>
                        <select
                          value={adjustSupplierId}
                          onChange={(e) => setAdjustSupplierId(e.target.value)}
                          className="w-full h-10 px-3 border border-app-border rounded-lg text-sm bg-app-elevated text-app-text focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          <option value="">— {tc('none')} —</option>
                          {activeSuppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {t('notesOptional')}
                      </label>
                      <Input
                        value={adjustNotes}
                        onChange={(e) => setAdjustNotes(e.target.value)}
                        placeholder={t('adjustReasonPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-6">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setModalMode(null);
                        resetForm();
                      }}
                    >
                      {tc('cancel')}
                    </Button>
                    <Button onClick={handleAdjust} disabled={!adjustQty} variant="default">
                      {tc('confirm')}
                    </Button>
                  </div>
                </>
              )}
            </AdminModal>
          </>
        )}
      </div>
    </RoleGuard>
  );
}

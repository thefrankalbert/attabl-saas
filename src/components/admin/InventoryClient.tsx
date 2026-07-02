'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { Plus, Search, Check, AlertTriangle, XCircle, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useIngredients, useSuppliers } from '@/hooks/queries';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import AdminModal from '@/components/admin/AdminModal';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import { useTranslations } from 'next-intl';
import {
  actionCreateIngredient,
  actionUpdateIngredient,
  actionAdjustStock,
} from '@/app/actions/inventory';
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
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { StatusBadge, type BadgeTone } from '@/components/admin/shared/StatusBadge';
import type { LucideIcon } from 'lucide-react';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // TanStack Query for ingredients and suppliers
  const { data: ingredients = [], isLoading: isQueryLoading } = useIngredients(tenantId);
  const loading = !isMounted || isQueryLoading;
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

  const getStockBadge = (ing: Ingredient): { label: string; tone: BadgeTone; icon: LucideIcon } => {
    if (ing.current_stock <= 0)
      return { label: t('outOfStock'), tone: 'destructive', icon: XCircle };
    if (ing.current_stock <= ing.min_stock_alert)
      return { label: t('lowStock'), tone: 'warning', icon: AlertTriangle };
    return { label: t('stockOk'), tone: 'success', icon: Check };
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
              <StatusBadge tone={badge.tone} icon={badge.icon}>
                {badge.label}
              </StatusBadge>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: openAdjust/openEdit are stable dialog openers (only call setState); excluding them keeps the column defs from rebuilding on every render, and a stale reference is harmless here (2026-06-18)
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
    setConfirmDeactivate(false);
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
    if (isSubmitting) return;
    if (!formName.trim()) {
      toast({ title: t('nameRequired'), variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
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
        const r = await actionCreateIngredient(tenantId, input);
        if (r.error) throw new Error(r.error);
        toast({ title: t('productAdded') });
      } else if (modalMode === 'edit' && selectedIngredient) {
        const r = await actionUpdateIngredient(tenantId, selectedIngredient.id, {
          name: formName.trim(),
          unit: formUnit,
          min_stock_alert: parseFloat(formMinAlert) || 0,
          cost_per_unit: parseFloat(formCostPerUnit) || 0,
          category: formCategory.trim() || null,
        });
        if (r.error) throw new Error(r.error);
        toast({ title: t('productUpdated') });
      }
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (isSubmitting || !selectedIngredient) return;

    setIsSubmitting(true);
    try {
      const r = await actionUpdateIngredient(tenantId, selectedIngredient.id, {
        is_active: false,
      });
      if (r.error) throw new Error(r.error);
      toast({ title: tc('deletedSuccess') });
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjust = async () => {
    if (isSubmitting) return;
    if (!selectedIngredient || !adjustQty) return;

    setIsSubmitting(true);
    try {
      const r = await actionAdjustStock(tenantId, {
        ingredient_id: selectedIngredient.id,
        quantity: parseFloat(adjustQty),
        movement_type: adjustType,
        notes: adjustNotes.trim() || undefined,
        supplier_id: adjustSupplierId || undefined,
      });
      if (r.error) throw new Error(r.error);
      toast({ title: t('stockAdjusted') });
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

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
            subtitle={t('subtitle')}
            count={loading ? undefined : ingredients.length}
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
          <div className="flex items-center gap-1.5">
            {(['all', 'low', 'out'] as const).map((status) => {
              const count =
                status === 'low' ? lowCount : status === 'out' ? outCount : ingredients.length;
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
                      'border-[var(--border)] text-[var(--destructive)]',
                    status === 'low' &&
                      lowCount > 0 &&
                      filterStatus !== status &&
                      'border-[var(--border)] text-[var(--warning)]',
                  )}
                >
                  {status === 'all' ? tc('all') : status === 'low' ? t('lowStock') : t('rupture')}
                  {status !== 'all' && count > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center rounded-full min-w-[18px] h-[18px] text-[10px] font-bold px-1',
                        filterStatus === status
                          ? 'bg-app-bg/30'
                          : status === 'out'
                            ? 'text-[var(--destructive)]'
                            : 'text-[var(--warning)]',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-app-text-secondary">
            {tc('loading')}
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
                  renderCard: (ing) => {
                    const badge = getStockBadge(ing);
                    const unitLabel = INGREDIENT_UNITS[ing.unit]?.labelShort || ing.unit;
                    return (
                      <div className="border-b border-app-border py-3 px-4">
                        {/* Row 1: Name + Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-app-text break-words">{ing.name}</p>
                            {ing.category && (
                              <p className="text-xs text-app-text-secondary">{ing.category}</p>
                            )}
                          </div>
                          <StatusBadge tone={badge.tone} icon={badge.icon} className="shrink-0">
                            {badge.label}
                          </StatusBadge>
                        </div>

                        {/* Row 2: Stock + Cost */}
                        <div className="flex items-center justify-between text-sm mt-2">
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
                        <div className="flex justify-end gap-2 pt-2">
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

            {/* Modal - Add / Edit */}
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
                  <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {tc('name')}
                  </Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('ingredientNamePlaceholder')}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {tc('unit')}
                    </Label>
                    <Select
                      value={formUnit}
                      onValueChange={(val) => setFormUnit(val as IngredientUnit)}
                    >
                      <SelectTrigger className="w-full h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(INGREDIENT_UNITS) as IngredientUnit[]).map((u) => (
                          <SelectItem key={u} value={u}>
                            {(INGREDIENT_UNITS as typeof UNITS_TYPE)[u].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {modalMode === 'add' && (
                    <div>
                      <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {t('currentStock')}
                      </Label>
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
                    <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {t('minAlert')}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formMinAlert}
                      onChange={(e) => setFormMinAlert(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {t('costPerUnit')}
                    </Label>
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
                  <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {t('categoryOptional')}
                  </Label>
                  <Input
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder={t('categoryPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex justify-between gap-2 mt-6">
                <div>
                  {modalMode === 'edit' &&
                    (confirmDeactivate ? (
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          onClick={handleDeactivate}
                          disabled={isSubmitting}
                        >
                          {tc('confirm')}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                          {tc('cancel')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmDeactivate(true)}
                        className="text-status-error hover:text-status-error gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        {tc('delete')}
                      </Button>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setModalMode(null);
                      resetForm();
                    }}
                  >
                    {tc('cancel')}
                  </Button>
                  <Button onClick={handleSave} disabled={isSubmitting} variant="default">
                    {tc('save')}
                  </Button>
                </div>
              </div>
            </AdminModal>

            {/* Modal - Adjust Stock */}
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
                    {selectedIngredient.name} - {t('currentStock')} :{' '}
                    <span className="font-bold">
                      {selectedIngredient.current_stock}{' '}
                      {INGREDIENT_UNITS[selectedIngredient.unit]?.labelShort}
                    </span>
                  </p>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {t('movementType')}
                      </Label>
                      <Select
                        value={adjustType}
                        onValueChange={(val) => setAdjustType(val as MovementType)}
                      >
                        <SelectTrigger className="w-full h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            [
                              'manual_add',
                              'manual_remove',
                              'adjustment',
                              'opening',
                            ] as MovementType[]
                          ).map((mt) => (
                            <SelectItem key={mt} value={mt}>
                              {MOVEMENT_TYPE_LABELS[mt].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {tc('quantity')}
                      </Label>
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
                        <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                          {t('supplierOptional')}
                        </Label>
                        <Select
                          value={adjustSupplierId || '__none__'}
                          onValueChange={(val) =>
                            setAdjustSupplierId(val === '__none__' ? '' : val)
                          }
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__"> - {tc('none')} - </SelectItem>
                            {activeSuppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                        {t('notesOptional')}
                      </Label>
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
                    <Button
                      onClick={handleAdjust}
                      disabled={!adjustQty || isSubmitting}
                      variant="default"
                    >
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

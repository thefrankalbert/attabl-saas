'use client';

import { useEffect, useState, useCallback } from 'react';
import { Package, Plus, Search, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { createInventoryService } from '@/services/inventory.service';
import { createSupplierService } from '@/services/supplier.service';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import type { Supplier } from '@/types/supplier.types';
import type {
  Ingredient,
  IngredientUnit,
  CreateIngredientInput,
  MovementType,
  INGREDIENT_UNITS as UNITS_TYPE,
} from '@/types/inventory.types';
import { INGREDIENT_UNITS, MOVEMENT_TYPE_LABELS } from '@/types/inventory.types';

interface InventoryClientProps {
  tenantId: string;
  currency: string;
}

type ModalMode = 'add' | 'edit' | 'adjust' | null;

export default function InventoryClient({ tenantId, currency }: InventoryClientProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'out'>('all');

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
  const [activeSuppliers, setActiveSuppliers] = useState<Supplier[]>([]);

  const { toast } = useToast();
  const { t } = useLanguage();
  const supabase = createClient();
  const inventoryService = createInventoryService(supabase);
  const supplierService = createSupplierService(supabase);

  const loadIngredients = useCallback(async () => {
    try {
      const data = await inventoryService.getIngredients(tenantId);
      setIngredients(data);
    } catch {
      toast({ title: 'Erreur de chargement', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await supplierService.getActiveSuppliers(tenantId);
      setActiveSuppliers(data);
    } catch {
      // Silent fail — suppliers are optional
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    loadIngredients();
    loadSuppliers();

    // Realtime updates on ingredients
    const channel = supabase
      .channel(`inventory-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ingredients',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          loadIngredients();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, loadIngredients, loadSuppliers]);

  // Filtered list
  const filtered = ingredients.filter((ing) => {
    if (searchQuery && !ing.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterStatus === 'low' && ing.current_stock > ing.min_stock_alert) return false;
    if (filterStatus === 'out' && ing.current_stock > 0) return false;
    return true;
  });

  const getStockBadge = (ing: Ingredient) => {
    if (ing.current_stock <= 0) return { label: t('out_of_stock'), bg: 'bg-red-100 text-red-700' };
    if (ing.current_stock <= ing.min_stock_alert)
      return { label: t('low_stock'), bg: 'bg-amber-100 text-amber-700' };
    return { label: t('stock_ok'), bg: 'bg-green-100 text-green-700' };
  };

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
      toast({ title: 'Nom requis', variant: 'destructive' });
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
        toast({ title: 'Produit ajouté' });
      } else if (modalMode === 'edit' && selectedIngredient) {
        await inventoryService.updateIngredient(selectedIngredient.id, tenantId, {
          name: formName.trim(),
          unit: formUnit,
          min_stock_alert: parseFloat(formMinAlert) || 0,
          cost_per_unit: parseFloat(formCostPerUnit) || 0,
          category: formCategory.trim() || null,
        });
        toast({ title: 'Produit modifié' });
      }
      setModalMode(null);
      resetForm();
      loadIngredients();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
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
      toast({ title: 'Stock ajusté' });
      setModalMode(null);
      resetForm();
      loadIngredients();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  const lowCount = ingredients.filter(
    (i) => i.current_stock > 0 && i.current_stock <= i.min_stock_alert,
  ).length;
  const outCount = ingredients.filter((i) => i.current_stock <= 0).length;

  if (loading) {
    return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6" />
            {t('inventory')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {ingredients.length} {t('ingredients_count')}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          {t('add_ingredient')}
        </Button>
      </div>

      {/* Stats Badges */}
      {(lowCount > 0 || outCount > 0) && (
        <div className="flex gap-3">
          {outCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">
                {outCount} {t('rupture')}
              </span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">
                {lowCount} {t('low_stock')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un produit..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'low', 'out'] as const).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className="rounded-full"
            >
              {status === 'all' ? 'Tous' : status === 'low' ? t('low_stock') : t('rupture')}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Produit</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Unité</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    {t('current_stock')}
                    <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  {t('min_alert')}
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  {t('cost_per_unit')}
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">{t('status')}</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((ing) => {
                const badge = getStockBadge(ing);
                return (
                  <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{ing.name}</p>
                        {ing.category && <p className="text-xs text-gray-400">{ing.category}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {INGREDIENT_UNITS[ing.unit]?.labelShort || ing.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                      {ing.current_stock.toFixed(
                        ing.unit === 'pièce' || ing.unit === 'bouteille' ? 0 : 2,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{ing.min_stock_alert}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {formatCurrency(ing.cost_per_unit, currency as CurrencyCode)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-1 rounded-full text-xs font-bold', badge.bg)}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAdjust(ing)}
                          className="text-xs"
                        >
                          +/-
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(ing)}
                          className="text-xs"
                        >
                          {t('edit')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Aucun produit trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal — Add / Edit */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="font-bold text-lg mb-4">
              {modalMode === 'add' ? t('add_ingredient') : t('edit_ingredient')}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nom</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Poulet, Riz, Huile..."
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Unité</label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value as IngredientUnit)}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary"
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
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      {t('current_stock')}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    {t('min_alert')}
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
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    {t('cost_per_unit')}
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
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Catégorie (optionnel)
                </label>
                <Input
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="Ex: Viandes, Légumes..."
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
                {t('cancel')}
              </Button>
              <Button onClick={handleSave}>{t('save')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Adjust Stock */}
      {modalMode === 'adjust' && selectedIngredient && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="font-bold text-lg mb-1">{t('adjust_stock')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {selectedIngredient.name} — Stock actuel :{' '}
              <span className="font-bold">
                {selectedIngredient.current_stock}{' '}
                {INGREDIENT_UNITS[selectedIngredient.unit]?.labelShort}
              </span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Type de mouvement
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as MovementType)}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary"
                >
                  {(['manual_add', 'manual_remove', 'adjustment', 'opening'] as MovementType[]).map(
                    (mt) => (
                      <option key={mt} value={mt}>
                        {MOVEMENT_TYPE_LABELS[mt].label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Quantité</label>
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
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    Fournisseur (optionnel)
                  </label>
                  <select
                    value={adjustSupplierId}
                    onChange={(e) => setAdjustSupplierId(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary"
                  >
                    <option value="">— Aucun —</option>
                    {activeSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Notes (optionnel)
                </label>
                <Input
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Ex: Livraison fournisseur, perte..."
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
                {t('cancel')}
              </Button>
              <Button onClick={handleAdjust} disabled={!adjustQty}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

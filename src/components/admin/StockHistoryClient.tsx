'use client';

import { useEffect, useState, useCallback } from 'react';
import { History, Search, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createInventoryService } from '@/services/inventory.service';
import type { StockMovement, MovementType } from '@/types/inventory.types';
import { MOVEMENT_TYPE_LABELS } from '@/types/inventory.types';

interface StockHistoryClientProps {
  tenantId: string;
}

const MOVEMENT_FILTERS: { value: MovementType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'order_destock', label: 'Commandes' },
  { value: 'manual_add', label: 'Ajouts' },
  { value: 'manual_remove', label: 'Retraits' },
  { value: 'adjustment', label: 'Ajustements' },
  { value: 'opening', label: 'Ouverture' },
];

export default function StockHistoryClient({ tenantId }: StockHistoryClientProps) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MovementType | 'all'>('all');

  const { toast } = useToast();
  const supabase = createClient();
  const inventoryService = createInventoryService(supabase);

  const loadMovements = useCallback(async () => {
    try {
      const data = await inventoryService.getStockMovements(tenantId);
      setMovements(data);
    } catch {
      toast({ title: 'Erreur chargement historique', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const filtered = movements.filter((m) => {
    const matchesType = filterType === 'all' || m.movement_type === filterType;
    const matchesSearch =
      !searchQuery ||
      m.ingredient?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Chargement de l&apos;historique...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <History className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Historique des mouvements</h1>
            <p className="text-sm text-gray-500">
              {filtered.length} mouvement{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par ingrédient ou note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
          {MOVEMENT_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterType(f.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                filterType === f.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Aucun mouvement trouvé</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ingrédient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Quantité</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fournisseur</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const typeInfo = MOVEMENT_TYPE_LABELS[m.movement_type];
                  const isPositive = m.quantity > 0;
                  return (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {m.ingredient?.name || '—'}
                        {m.ingredient?.unit && (
                          <span className="text-gray-400 ml-1 text-xs">({m.ingredient.unit})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn('text-xs font-medium', typeInfo?.color || 'text-gray-600')}
                        >
                          {typeInfo?.label || m.movement_type}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-mono font-medium',
                          isPositive ? 'text-green-600' : 'text-red-600',
                        )}
                      >
                        {isPositive ? '+' : ''}
                        {m.quantity}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {m.supplier?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                        {m.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

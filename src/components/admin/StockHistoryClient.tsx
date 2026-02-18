'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { History, Search, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DataTable, SortableHeader } from '@/components/admin/DataTable';
import { createInventoryService } from '@/services/inventory.service';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockMovement, MovementType } from '@/types/inventory.types';
import { MOVEMENT_TYPE_LABELS } from '@/types/inventory.types';

interface StockHistoryClientProps {
  tenantId: string;
}

export default function StockHistoryClient({ tenantId }: StockHistoryClientProps) {
  const t = useTranslations('stockHistory');
  const tc = useTranslations('common');
  const locale = useLocale();

  const movementFilters: { value: MovementType | 'all'; label: string }[] = [
    { value: 'all', label: t('filterAll') },
    { value: 'order_destock', label: t('filterOrders') },
    { value: 'manual_add', label: t('filterAdditions') },
    { value: 'manual_remove', label: t('filterWithdrawals') },
    { value: 'adjustment', label: t('filterAdjustments') },
    { value: 'opening', label: t('filterOpening') },
  ];

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
      toast({ title: tc('errorLoading'), variant: 'destructive' });
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
    return d.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // TanStack Table column definitions
  const columns = useMemo<ColumnDef<StockMovement, unknown>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column}>{t('columnDate')}</SortableHeader>,
        cell: ({ row }) => (
          <span className="text-neutral-500 whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'ingredient_name',
        accessorFn: (row) => row.ingredient?.name ?? '',
        header: ({ column }) => (
          <SortableHeader column={column}>{t('columnIngredient')}</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-neutral-900">
            {row.original.ingredient?.name || '\u2014'}
            {row.original.ingredient?.unit && (
              <span className="text-neutral-400 ml-1 text-xs">
                ({row.original.ingredient.unit})
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'movement_type',
        header: () => t('columnType'),
        cell: ({ row }) => {
          const typeInfo = MOVEMENT_TYPE_LABELS[row.original.movement_type];
          return (
            <span className={cn('text-xs font-medium', typeInfo?.color || 'text-neutral-600')}>
              {typeInfo?.label || row.original.movement_type}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'quantity',
        header: ({ column }) => (
          <SortableHeader column={column} className="ml-auto">
            {t('columnQuantity')}
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const isPositive = row.original.quantity > 0;
          return (
            <span
              className={cn(
                'font-mono font-medium',
                isPositive ? 'text-green-600' : 'text-red-600',
              )}
            >
              {isPositive ? '+' : ''}
              {row.original.quantity}
            </span>
          );
        },
        meta: { className: 'text-right' },
      },
      {
        id: 'supplier_name',
        accessorFn: (row) => row.supplier?.name ?? '',
        header: () => t('columnSupplier'),
        cell: ({ row }) => (
          <span className="text-neutral-500 whitespace-nowrap">
            {row.original.supplier?.name || '\u2014'}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'notes',
        header: () => t('columnNotes'),
        cell: ({ row }) => (
          <span className="text-neutral-500 max-w-[200px] truncate block">
            {row.original.notes || '\u2014'}
          </span>
        ),
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, t],
  );

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">{tc('loading')}</div>;
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
            <h1 className="text-xl font-bold text-neutral-900">{t('title')}</h1>
            <p className="text-sm text-neutral-500">
              {filtered.length} {t('movementsCount')}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter className="h-4 w-4 text-neutral-400 flex-shrink-0" />
          {movementFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterType(f.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                filterType === f.value
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={filtered} emptyMessage={t('noMovements')} />
    </div>
  );
}

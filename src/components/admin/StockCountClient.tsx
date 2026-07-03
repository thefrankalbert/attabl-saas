'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import { actionOpenStockCount } from '@/app/actions/stock-count';
import { useStockCounts } from '@/hooks/queries/useStockCounts';
import type { StockCount, StockCountStatus } from '@/types/inventory.types';

interface StockCountClientProps {
  tenantId: string;
}

function StatusBadge({ status }: { status: StockCountStatus }) {
  const t = useTranslations('inventory');
  const variants: Record<StockCountStatus, 'default' | 'secondary' | 'destructive'> = {
    open: 'default',
    committed: 'secondary',
    cancelled: 'destructive',
  };
  const labels: Record<StockCountStatus, string> = {
    open: t('countStatusOpen'),
    committed: t('countStatusCommitted'),
    cancelled: t('countStatusCancelled'),
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

export default function StockCountClient({ tenantId }: StockCountClientProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isNewCountOpen, setIsNewCountOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: counts = [], isLoading } = useStockCounts(tenantId);

  const columns: ColumnDef<StockCount, unknown>[] = [
    {
      accessorKey: 'reference',
      header: ({ column }) => (
        <SortableHeader column={column}>{t('countReference')}</SortableHeader>
      ),
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.original.reference ?? '-'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <SortableHeader column={column}>{tc('status')}</SortableHeader>,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <SortableHeader column={column}>{t('countColDate')}</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-sm text-app-text-muted">
          {new Date(row.original.created_at).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`./counts/${row.original.id}`);
          }}
        >
          {t('countView')}
        </Button>
      ),
    },
  ];

  async function handleOpenCount() {
    setIsSubmitting(true);
    const result = await actionOpenStockCount(tenantId, {
      reference: reference.trim() || undefined,
    });
    setIsSubmitting(false);

    if (!result.success) {
      toast({ title: result.error, variant: 'destructive' });
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['stock-counts', tenantId] });
    setIsNewCountOpen(false);
    setReference('');

    if (result.data) {
      router.push(`./counts/${result.data}`);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 sm:p-6 gap-4">
      <div className="shrink-0">
        <AdminPageHeader
          title={t('physicalCount')}
          count={counts.length}
          actions={
            <Button size="sm" className="min-h-[44px]" onClick={() => setIsNewCountOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('newCount')}
            </Button>
          }
        />
      </div>

      {counts.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center gap-3">
          <ClipboardList className="h-12 w-12 text-app-text-muted opacity-40" />
          <p className="font-medium text-app-text-muted">{t('countsEmptyTitle')}</p>
          <p className="text-sm text-app-text-muted">{t('countsEmptyBody')}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 min-h-[44px]"
            onClick={() => setIsNewCountOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('newCount')}
          </Button>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveDataTable
            columns={columns}
            data={counts}
            isLoading={isLoading}
            emptyMessage={t('countsEmptyTitle')}
            onRowClick={(row) => router.push(`./counts/${row.id}`)}
            storageKey="stock-counts-sort"
            pageSize={20}
          />
        </div>
      )}

      <Dialog open={isNewCountOpen} onOpenChange={setIsNewCountOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('newCount')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="count-reference">{t('countReference')}</Label>
              <Input
                id="count-reference"
                placeholder={t('countReferencePlaceholder')}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={120}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSubmitting) {
                    void handleOpenCount();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsNewCountOpen(false);
                  setReference('');
                }}
                disabled={isSubmitting}
              >
                {tc('cancel')}
              </Button>
              <Button
                onClick={() => void handleOpenCount()}
                disabled={isSubmitting}
                className="min-h-[44px]"
              >
                {isSubmitting ? t('saving') : t('newCount')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

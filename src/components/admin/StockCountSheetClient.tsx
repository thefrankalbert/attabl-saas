'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

import { cn } from '@/lib/utils';
import { useStockCount } from '@/hooks/queries/useStockCounts';
import {
  actionSaveStockCountLines,
  actionCommitStockCount,
  actionCancelStockCount,
} from '@/app/actions/stock-count';
import type { StockCountStatus } from '@/types/inventory.types';

interface StockCountSheetClientProps {
  tenantId: string;
  countId: string;
}

function StatusBadge({ status }: { status: StockCountStatus }) {
  const t = useTranslations('inventory');
  const map: Record<
    StockCountStatus,
    { label: string; variant: 'default' | 'secondary' | 'destructive' }
  > = {
    open: { label: t('countStatusOpen'), variant: 'default' },
    committed: { label: t('countStatusCommitted'), variant: 'secondary' },
    cancelled: { label: t('countStatusCancelled'), variant: 'destructive' },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export default function StockCountSheetClient({ tenantId, countId }: StockCountSheetClientProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useStockCount(tenantId, countId);

  // Local edits: ingredient_id -> counted_qty (null = not yet counted)
  const [edits, setEdits] = useState<Map<string, number | null>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  const isReadOnly = data?.count.status !== 'open';

  const getDisplayQty = useCallback(
    (ingredientId: string): number | null => {
      if (edits.has(ingredientId)) return edits.get(ingredientId) ?? null;
      const line = data?.lines.find((l) => l.ingredient_id === ingredientId);
      return line?.counted_qty ?? null;
    },
    [edits, data?.lines],
  );

  const getVariance = (ingredientId: string, theoretical: number): number | null => {
    const counted = getDisplayQty(ingredientId);
    if (counted === null) return null;
    return counted - theoretical;
  };

  const linesWithVariance =
    data?.lines.filter((l) => {
      const v = getVariance(l.ingredient_id, l.theoretical_qty);
      return v !== null && v !== 0;
    }).length ?? 0;

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stock-count', tenantId, countId] }),
      queryClient.invalidateQueries({ queryKey: ['stock-counts', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['stock-status', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] }),
    ]);
  }

  async function handleSave() {
    if (!data) return;
    setIsSaving(true);

    const lines = data.lines.map((l) => ({
      ingredient_id: l.ingredient_id,
      counted_qty: getDisplayQty(l.ingredient_id),
    }));

    const result = await actionSaveStockCountLines(tenantId, countId, lines);
    setIsSaving(false);

    if (!result.success) {
      toast({ title: result.error, variant: 'destructive' });
      return;
    }

    await invalidateAll();
    setEdits(new Map());
    toast({ title: t('countSaved') });
  }

  async function handleCommit() {
    setIsCommitting(true);
    const saveLines = data?.lines.map((l) => ({
      ingredient_id: l.ingredient_id,
      counted_qty: getDisplayQty(l.ingredient_id),
    }));

    if (saveLines) {
      const saveResult = await actionSaveStockCountLines(tenantId, countId, saveLines);
      if (!saveResult.success) {
        toast({ title: saveResult.error, variant: 'destructive' });
        setIsCommitting(false);
        setShowCommitDialog(false);
        return;
      }
    }

    const result = await actionCommitStockCount(tenantId, countId);
    setIsCommitting(false);
    setShowCommitDialog(false);

    if (!result.success) {
      toast({ title: result.error, variant: 'destructive' });
      return;
    }

    await invalidateAll();
    toast({ title: t('countCommitted') });
  }

  async function handleCancel() {
    setIsCancelling(true);
    const result = await actionCancelStockCount(tenantId, countId);
    setIsCancelling(false);

    if (!result.success) {
      toast({ title: result.error, variant: 'destructive' });
      return;
    }

    await invalidateAll();
  }

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 p-4 sm:p-6 gap-4">
        <div className="animate-pulse h-8 w-48 rounded bg-app-elevated" />
        <div className="flex-1 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse h-12 rounded bg-app-elevated" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col flex-1 min-h-0 p-4 sm:p-6 items-center justify-center text-app-text-muted">
        <AlertTriangle className="h-8 w-8 mb-2" />
        <p>{t('countNotFound')}</p>
      </div>
    );
  }

  const { count, lines } = data;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 p-4 sm:p-6 border-b border-app-border">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => router.back()}
          aria-label={tc('back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{count.reference ?? t('countSheet')}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={count.status} />
            <span className="text-xs text-app-text-muted">
              {new Date(count.created_at).toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
        {!isReadOnly && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] text-destructive"
            onClick={() => void handleCancel()}
            disabled={isCancelling}
          >
            {t('cancelCount')}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">{t('ingredients')}</TableHead>
              <TableHead className="text-right">{t('theoreticalQty')}</TableHead>
              <TableHead className="text-right">{t('countedQty')}</TableHead>
              <TableHead className="text-right">{t('variance')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const variance = getVariance(line.ingredient_id, line.theoretical_qty);

              return (
                <TableRow key={line.id}>
                  <TableCell className="py-2">
                    <div className="font-medium text-sm">{line.ingredient?.name ?? '-'}</div>
                    <div className="text-xs text-app-text-muted">{line.ingredient?.unit ?? ''}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {line.theoretical_qty}
                  </TableCell>
                  <TableCell className="text-right">
                    {isReadOnly ? (
                      <span className="tabular-nums text-sm">{line.counted_qty ?? '-'}</span>
                    ) : (
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step="any"
                        className="w-24 text-right min-h-[44px] ml-auto"
                        placeholder="-"
                        value={
                          edits.has(line.ingredient_id)
                            ? (edits.get(line.ingredient_id) ?? '')
                            : (line.counted_qty ?? '')
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setEdits((prev) => {
                            const next = new Map(prev);
                            next.set(line.ingredient_id, raw === '' ? null : parseFloat(raw));
                            return next;
                          });
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell
                    className={cn('text-right tabular-nums text-sm', {
                      'text-status-error': variance !== null && variance < 0,
                      'text-status-warning': variance !== null && variance > 0,
                      'text-app-text-muted': variance === null || variance === 0,
                    })}
                  >
                    {variance === null ? '-' : variance > 0 ? `+${variance}` : variance}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Sticky bottom bar (only when open) */}
      {!isReadOnly && (
        <div className="shrink-0 h-14 border-t border-app-border bg-app-background flex items-center justify-end gap-2 px-4 sm:px-6">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => void handleSave()}
            disabled={isSaving || isCommitting}
          >
            {isSaving ? t('saving') : t('saveCount')}
          </Button>
          <Button
            size="sm"
            className="min-h-[44px]"
            onClick={() => setShowCommitDialog(true)}
            disabled={isSaving || isCommitting}
          >
            {t('commitCount')}
          </Button>
        </div>
      )}

      {/* Commit confirmation dialog */}
      <Dialog open={showCommitDialog} onOpenChange={setShowCommitDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('commitConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {linesWithVariance > 0
                ? t('itemsWithVariance', { count: linesWithVariance })
                : t('noVariance')}
              {'. '}
              {t('commitConfirmBody')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowCommitDialog(false)}
              disabled={isCommitting}
            >
              {tc('cancel')}
            </Button>
            <Button
              onClick={() => void handleCommit()}
              disabled={isCommitting}
              className="min-h-[44px]"
            >
              {isCommitting ? t('saving') : t('commitCount')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

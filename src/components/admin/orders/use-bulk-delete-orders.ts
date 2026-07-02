'use client';

import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { actionDeleteOrders } from '@/app/actions/orders';
import { logger } from '@/lib/logger';
import type { Order } from '@/types/admin.types';

interface UseBulkDeleteOrdersParams {
  tenantId: string;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
}

interface UseBulkDeleteOrdersResult {
  handleBulkDelete: () => Promise<void>;
  isDeleting: boolean;
}

/**
 * Optimistic bulk delete for orders with rollback on error.
 *
 * NOTE: order_items and related records are deleted via ON DELETE CASCADE
 * in the database schema. No manual cleanup needed.
 */
export function useBulkDeleteOrders({
  tenantId,
  selectedIds,
  setSelectedIds,
  setShowDeleteConfirm,
}: UseBulkDeleteOrdersParams): UseBulkDeleteOrdersResult {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useTranslations('orders');

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Snapshot current data for rollback on error
    const previousOrders = queryClient.getQueryData<Order[]>(['orders', tenantId]);

    // Optimistic update: remove deleted orders from cache immediately
    const idsSet = new Set(ids);
    queryClient.setQueryData<Order[]>(['orders', tenantId], (old) =>
      old ? old.filter((o) => !idsSet.has(o.id)) : old,
    );
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);

    setIsDeleting(true);
    try {
      const result = await actionDeleteOrders(ids);

      if (result.error) {
        logger.error('Bulk delete orders failed', new Error(result.error), { orderIds: ids });
        // Rollback optimistic update
        queryClient.setQueryData(['orders', tenantId], previousOrders);
        setSelectedIds(new Set(ids));
        toast({
          title: t('bulkDeleteError'),
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('bulkDeleteSuccess', { count: result.deletedCount ?? ids.length }),
      });
      // Revalidate in background to sync with server
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
    } catch (err) {
      logger.error('Bulk delete orders unexpected error', err as Error, { orderIds: ids });
      // Rollback optimistic update
      queryClient.setQueryData(['orders', tenantId], previousOrders);
      setSelectedIds(new Set(ids));
      toast({
        title: t('bulkDeleteError'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedIds, tenantId, queryClient, toast, t, setSelectedIds, setShowDeleteConfirm]);

  return { handleBulkDelete, isDeleting };
}

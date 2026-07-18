'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { submitOrder } from '@/lib/offline/submit-order';

// Server assignment mutations route through the durable outbox
// (submitOrder -> /api/orders/mutations) so assigning or releasing a server
// during a network outage is queued and replayed idempotently on reconnect,
// instead of failing hard.

export function useAssignServer(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, serverId }: { tableId: string; serverId: string }) => {
      const result = await submitOrder({
        endpoint: '/api/orders/mutations',
        body: { type: 'assign', tableId, serverId },
        clientRequestId: crypto.randomUUID(),
      });
      if (result.status === 'sent') return result.data;
      if (result.status === 'queued') return null;
      throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
    // No TanStack retry: transient failures are durably queued and replayed
    // idempotently by the outbox; thrown errors are server rejections.
    retry: false,
  });
}

export function useReleaseAssignment(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const result = await submitOrder({
        endpoint: '/api/orders/mutations',
        body: { type: 'release', assignmentId },
        clientRequestId: crypto.randomUUID(),
      });
      if (result.status === 'sent' || result.status === 'queued') return;
      throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
    retry: false,
  });
}

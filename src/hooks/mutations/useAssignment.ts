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
        // Ordre de rejeu garanti par table (OFF-08).
        scopeKey: `table:${tableId}`,
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
    // tableId n'est pas necessaire au serveur (l'assignation le porte deja), mais
    // il l'est cote client pour ranger `release` et `assign` dans le MEME scope
    // de rejeu (OFF-08). Sans ca: le manager libere la table 5 puis la reassigne,
    // le `release` prend un 409, l'`assign` passe, et le `release` s'applique au
    // drain suivant - la table se retrouve sans serveur.
    mutationFn: async ({ assignmentId, tableId }: { assignmentId: string; tableId?: string }) => {
      const result = await submitOrder({
        endpoint: '/api/orders/mutations',
        body: { type: 'release', assignmentId },
        clientRequestId: crypto.randomUUID(),
        scopeKey: tableId ? `table:${tableId}` : undefined,
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

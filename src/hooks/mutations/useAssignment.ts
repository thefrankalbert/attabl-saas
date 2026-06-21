'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actionAssignServer, actionReleaseAssignment } from '@/app/actions/assignments';

export function useAssignServer(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, serverId }: { tableId: string; serverId: string }) => {
      const result = await actionAssignServer(tenantId, tableId, serverId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useReleaseAssignment(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const result = await actionReleaseAssignment(tenantId, assignmentId);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
  });
}

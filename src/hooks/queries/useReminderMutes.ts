'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { actionSetReminderMute } from '@/app/actions/reminders';
import { REMINDER_RULES, type ReminderRule } from '@/lib/validations/reminders.schema';

/** Les rappels que la personne connectee a coupes pour elle (RLS: ses lignes seulement). */
export function useReminderMutes(tenantId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['reminder-mutes', tenantId];

  const { data: muted = [] } = useQuery<ReminderRule[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('reminder_preferences')
        .select('rule')
        .eq('tenant_id', tenantId)
        .eq('muted', true);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.rule as ReminderRule)
        .filter((r) => REMINDER_RULES.includes(r));
    },
    enabled: !!tenantId,
  });

  const setMuted = useCallback(
    async (rule: ReminderRule, on: boolean) => {
      const res = await actionSetReminderMute(rule, on);
      await queryClient.invalidateQueries({ queryKey: ['reminder-mutes', tenantId] });
      return res;
    },
    [queryClient, tenantId],
  );

  return { muted, setMuted };
}

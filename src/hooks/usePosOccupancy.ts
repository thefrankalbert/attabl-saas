'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { releaseStaleTablesThrottled } from '@/lib/pos/release-stale-tables';

/** Tables holding an OPEN session at the till, kept live (split out of usePOSData). */
export function usePosOccupancy(tenantId: string) {
  const supabase = createClient();

  // --- Table occupancy (open table_sessions) --------------
  // Set of table_number for tables with an OPEN session (same canonical signal the
  // Service floor view + dashboard use). Lets the dine-in picker show free/occupied
  // so the cashier does not seat a party on a table another party already holds.
  const [occupiedTableNumbers, setOccupiedTableNumbers] = useState<Set<string>>(new Set());
  // --- Table occupancy load + realtime -------------------
  const loadOccupancy = useCallback(async () => {
    // Paid tables never marked served free themselves after a delay.
    await releaseStaleTablesThrottled();
    const { data } = await supabase
      .from('table_sessions')
      .select('table_number')
      .eq('tenant_id', tenantId)
      .eq('status', 'open');
    if (data) {
      setOccupiedTableNumbers(
        new Set((data as { table_number: string }[]).map((s) => s.table_number)),
      );
    }
  }, [supabase, tenantId]);

  useEffect(() => {
    loadOccupancy();
  }, [loadOccupancy]);

  // Refresh occupancy whenever a session opens/closes (cleanup handled by the hook).
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `pos_sessions_${tenantId}`,
    table: 'table_sessions',
    filter: `tenant_id=eq.${tenantId}`,
    onChange: () => {
      loadOccupancy();
    },
  });

  return { occupiedTableNumbers, loadOccupancy };
}

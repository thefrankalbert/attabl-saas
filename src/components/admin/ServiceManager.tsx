'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAssignments } from '@/hooks/queries/useAssignments';
import { useAssignServer, useReleaseAssignment } from '@/hooks/mutations/useAssignment';
import { UserCheck, X, Users } from 'lucide-react';
import type { Table, Zone, AdminUser } from '@/types/admin.types';

interface Props {
  tenantId: string;
}

export default function ServiceManager({ tenantId }: Props) {
  const t = useTranslations('service');
  const [zones, setZones] = useState<(Zone & { tables: Table[] })[]>([]);
  const [servers, setServers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: assignments = [] } = useAssignments(tenantId);
  const assignServer = useAssignServer(tenantId);
  const releaseAssignment = useReleaseAssignment(tenantId);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      // Fetch zones with tables (zones belong to venues which belong to tenants)
      const { data: zonesData } = await supabase
        .from('zones')
        .select('*, tables(*), venues!inner(tenant_id)')
        .eq('venues.tenant_id', tenantId)
        .order('display_order');

      // Fetch servers (waiters + managers)
      const { data: serversData } = await supabase
        .from('admin_users')
        .select('id, full_name, role, is_active')
        .eq('tenant_id', tenantId)
        .in('role', ['waiter', 'manager', 'admin', 'owner'])
        .eq('is_active', true)
        .order('full_name');

      if (zonesData) setZones(zonesData as (Zone & { tables: Table[] })[]);
      if (serversData) setServers(serversData as AdminUser[]);
      setLoading(false);
    }
    fetchData();
  }, [tenantId]);

  // Realtime subscription for assignments
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('assignments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'table_assignments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // TanStack Query will auto-refetch via invalidation
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const getAssignmentForTable = (tableId: string) =>
    assignments.find((a) => a.table_id === tableId);

  const handleAssign = (tableId: string, serverId: string) => {
    assignServer.mutate({ tableId, serverId });
  };

  const handleRelease = (assignmentId: string) => {
    releaseAssignment.mutate(assignmentId);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-neutral-900">{t('title')}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-24 bg-neutral-50 rounded-xl border border-neutral-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-neutral-500" />
          {t('title')}
        </h1>
        <div className="text-sm text-neutral-500">
          {t('activeAssignments', { count: assignments.length })}
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="text-center py-12 text-neutral-500 bg-white rounded-xl border border-neutral-100">
          {t('noZones')}
        </div>
      ) : (
        zones.map((zone) => (
          <div key={zone.id} className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-700">{zone.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {zone.tables
                .filter((tbl: Table) => tbl.is_active)
                .map((table: Table) => {
                  const assignment = getAssignmentForTable(table.id);
                  return (
                    <div
                      key={table.id}
                      className={`rounded-xl border p-4 transition-colors ${
                        assignment
                          ? 'border-[#CCFF00]/50 bg-[#CCFF00]/5'
                          : 'border-neutral-100 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono font-bold text-neutral-900">
                          {table.display_name || table.table_number}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {t('seats', { count: table.capacity })}
                        </span>
                      </div>

                      {assignment ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-medium text-neutral-900">
                              {assignment.server?.full_name ?? t('server')}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRelease(assignment.id)}
                            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-red-500 transition-colors"
                            title={t('release')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <select
                          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:border-[#CCFF00] focus:outline-none focus:ring-2 focus:ring-[#CCFF00]/20"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handleAssign(table.id, e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="" disabled>
                            {t('assignServer')}
                          </option>
                          {servers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.full_name} ({s.role})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

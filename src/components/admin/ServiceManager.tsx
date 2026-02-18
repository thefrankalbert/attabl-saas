'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAssignments } from '@/hooks/queries/useAssignments';
import { useAssignServer, useReleaseAssignment } from '@/hooks/mutations/useAssignment';
import { UserCheck, X, Users } from 'lucide-react';
import type { Table, Zone, AdminUser } from '@/types/admin.types';

interface Props {
  tenantId: string;
}

export default function ServiceManager({ tenantId }: Props) {
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
        <h1 className="text-2xl font-bold text-white">Service</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-neutral-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-[#CCFF00]" />
          Service
        </h1>
        <div className="text-sm text-neutral-400">
          {assignments.length} assignation{assignments.length !== 1 ? 's' : ''} active
          {assignments.length !== 1 ? 's' : ''}
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          Aucune zone configuree. Creez des zones et tables dans les parametres.
        </div>
      ) : (
        zones.map((zone) => (
          <div key={zone.id} className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-300">{zone.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {zone.tables
                .filter((t: Table) => t.is_active)
                .map((table: Table) => {
                  const assignment = getAssignmentForTable(table.id);
                  return (
                    <div
                      key={table.id}
                      className={`rounded-xl border p-4 transition-colors ${
                        assignment
                          ? 'border-[#CCFF00]/30 bg-[#CCFF00]/5'
                          : 'border-neutral-800 bg-neutral-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono font-bold text-white">
                          {table.display_name || table.table_number}
                        </span>
                        <span className="text-xs text-neutral-500">{table.capacity} places</span>
                      </div>

                      {assignment ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-[#CCFF00]" />
                            <span className="text-sm font-medium text-[#CCFF00]">
                              {assignment.server?.full_name ?? 'Serveur'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRelease(assignment.id)}
                            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-500 hover:text-red-400 transition-colors"
                            title="Liberer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <select
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-[#CCFF00] focus:outline-none"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handleAssign(table.id, e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="" disabled>
                            Assigner un serveur...
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

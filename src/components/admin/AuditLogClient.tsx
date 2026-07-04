'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Filter, ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createAuditReadService } from '@/services/audit.service';
import { useSessionState } from '@/hooks/useSessionState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { PAGE_SIZE, type AuditLogEntry } from './audit-log/types';
import AuditLogFilters from './audit-log/AuditLogFilters';
import AuditLogTable from './audit-log/AuditLogTable';
import AuditLogPagination from './audit-log/AuditLogPagination';

interface AuditLogClientProps {
  tenantId: string;
  initialLogs?: Record<string, unknown>[];
  initialCount?: number;
}

export default function AuditLogClient({
  tenantId,
  initialLogs,
  initialCount,
}: AuditLogClientProps) {
  const t = useTranslations('auditLog');

  const [logs, setLogs] = useState<AuditLogEntry[]>(
    // Supabase join type gap
    (initialLogs as unknown as AuditLogEntry[]) || [],
  );
  const [loading, setLoading] = useState(!initialLogs);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useSessionState('auditLog:page', 0);
  const [totalCount, setTotalCount] = useState(initialCount || 0);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterAction, setFilterAction] = useSessionState<string>('auditLog:filterAction', '');
  const [filterEntity, setFilterEntity] = useSessionState<string>('auditLog:filterEntity', '');
  const [searchEmail, setSearchEmail] = useSessionState('auditLog:searchEmail', '');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const service = createAuditReadService(createClient());
      const { logs: data, count } = await service.listLogs({
        tenantId,
        page,
        pageSize: PAGE_SIZE,
        action: filterAction || undefined,
        entityType: filterEntity || undefined,
        searchEmail: searchEmail || undefined,
      });
      setLogs((data as AuditLogEntry[]) || []);
      setTotalCount(count);
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterAction, filterEntity, searchEmail, t]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleFilterReset = () => {
    setFilterAction('');
    setFilterEntity('');
    setSearchEmail('');
    setPage(0);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4">
        <AdminPageHeader
          title={t('title')}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              type="button"
              className={cn(showFilters && 'bg-app-bg')}
            >
              <Filter className="w-4 h-4 mr-1.5" />
              {t('filters')}
            </Button>
          }
        />

        {/* Filters */}
        {showFilters && (
          <AuditLogFilters
            filterAction={filterAction}
            filterEntity={filterEntity}
            searchEmail={searchEmail}
            setFilterAction={setFilterAction}
            setFilterEntity={setFilterEntity}
            setSearchEmail={setSearchEmail}
            setPage={setPage}
            onReset={handleFilterReset}
          />
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        {/* Log entries */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-app-text-muted" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-status-error">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchLogs}>
              {t('retry')}
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-app-card rounded-xl border border-app-border/60 p-12 text-center">
            <div className="w-14 h-14 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
              <ScrollText className="w-7 h-7 text-app-text-muted" />
            </div>
            <h3 className="text-base font-bold text-app-text">{t('empty')}</h3>
            <p className="text-sm text-app-text-secondary mt-2">{t('emptyDesc')}</p>
          </div>
        ) : (
          <>
            <AuditLogTable logs={logs} />

            {/* Pagination */}
            {totalPages > 1 && (
              <AuditLogPagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                setPage={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ScrollText, Loader2, ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AuditLogEntry {
  id: string;
  created_at: string;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

const PAGE_SIZE = 25;

const ENTITY_TYPES = [
  'order',
  'menu',
  'item',
  'category',
  'user',
  'permission',
  'setting',
  'ingredient',
  'coupon',
  'supplier',
] as const;
const ACTIONS = ['create', 'update', 'delete'] as const;

export default function AuditLogClient({ tenantId }: { tenantId: string }) {
  const t = useTranslations('auditLog');
  const tc = useTranslations('common');
  const supabase = createClient();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');
  const [searchEmail, setSearchEmail] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterAction) query = query.eq('action', filterAction);
      if (filterEntity) query = query.eq('entity_type', filterEntity);
      if (searchEmail) query = query.ilike('user_email', `%${searchEmail}%`);

      const { data, count } = await query;
      setLogs((data as AuditLogEntry[]) || []);
      setTotalCount(count || 0);
    } catch {
      // Non-critical — logs are informational
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, page, filterAction, filterEntity, searchEmail]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  };

  const actionBadge = (action: string) => {
    switch (action) {
      case 'create':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">
            {t('actionCreate')}
          </Badge>
        );
      case 'update':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[10px]">
            {t('actionUpdate')}
          </Badge>
        );
      case 'delete':
        return (
          <Badge className="bg-red-50 text-red-700 border-red-100 text-[10px]">
            {t('actionDelete')}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {action}
          </Badge>
        );
    }
  };

  const entityLabel = (type: string) => {
    const key = `entity_${type}` as Parameters<typeof t>[0];
    try {
      return t(key);
    } catch {
      return type;
    }
  };

  const renderChanges = (entry: AuditLogEntry) => {
    if (entry.action === 'create' && entry.new_data) {
      const keys = Object.keys(entry.new_data).slice(0, 3);
      return (
        <span className="text-[10px] text-text-muted">
          {keys.map((k) => `${k}: ${String(entry.new_data![k])}`).join(', ')}
          {Object.keys(entry.new_data).length > 3 && '...'}
        </span>
      );
    }
    if (entry.action === 'update' && entry.old_data && entry.new_data) {
      const changedKeys = Object.keys(entry.new_data).filter(
        (k) => JSON.stringify(entry.old_data![k]) !== JSON.stringify(entry.new_data![k]),
      );
      if (changedKeys.length === 0) return null;
      return (
        <span className="text-[10px] text-text-muted">
          {changedKeys.slice(0, 2).map((k) => (
            <span key={k}>
              {k}:{' '}
              <span className="line-through text-red-400">{String(entry.old_data![k] ?? '—')}</span>
              {' → '}
              <span className="text-emerald-600">{String(entry.new_data![k] ?? '—')}</span>
              {', '}
            </span>
          ))}
          {changedKeys.length > 2 && `+${changedKeys.length - 2} ${t('more')}`}
        </span>
      );
    }
    return null;
  };

  const handleFilterReset = () => {
    setFilterAction('');
    setFilterEntity('');
    setSearchEmail('');
    setPage(0);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <ScrollText className="w-6 h-6 text-text-secondary" />
            {t('title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t('subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(showFilters && 'bg-surface-secondary')}
        >
          <Filter className="w-4 h-4 mr-1.5" />
          {t('filters')}
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-surface-primary rounded-xl border border-border-default p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary mb-1 block">
                {t('filterAction')}
              </label>
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  setPage(0);
                }}
                className="w-full h-9 px-3 text-sm border border-border-default rounded-lg bg-surface-primary"
              >
                <option value="">{tc('all')}</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary mb-1 block">
                {t('filterEntity')}
              </label>
              <select
                value={filterEntity}
                onChange={(e) => {
                  setFilterEntity(e.target.value);
                  setPage(0);
                }}
                className="w-full h-9 px-3 text-sm border border-border-default rounded-lg bg-surface-primary"
              >
                <option value="">{tc('all')}</option>
                {ENTITY_TYPES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary mb-1 block">
                {t('filterUser')}
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <Input
                  value={searchEmail}
                  onChange={(e) => {
                    setSearchEmail(e.target.value);
                    setPage(0);
                  }}
                  placeholder={t('searchPlaceholder')}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
          </div>
          {(filterAction || filterEntity || searchEmail) && (
            <Button variant="ghost" size="sm" onClick={handleFilterReset} className="text-xs">
              {t('clearFilters')}
            </Button>
          )}
        </div>
      )}

      {/* Log entries */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-surface-primary rounded-xl border border-border-default p-12 text-center">
          <div className="w-14 h-14 bg-surface-secondary rounded-xl flex items-center justify-center mx-auto mb-4">
            <ScrollText className="w-7 h-7 text-text-muted" />
          </div>
          <h3 className="text-base font-bold text-text-primary">{t('empty')}</h3>
          <p className="text-sm text-text-secondary mt-2">{t('emptyDesc')}</p>
        </div>
      ) : (
        <>
          <div className="bg-surface-primary rounded-xl border border-border-default overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-default bg-surface-secondary/50">
                    <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">
                      {t('colDate')}
                    </th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">
                      {t('colUser')}
                    </th>
                    <th className="text-center text-xs font-semibold text-text-secondary px-4 py-3">
                      {t('colAction')}
                    </th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">
                      {t('colEntity')}
                    </th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">
                      {t('colDetails')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-secondary transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-sm text-text-primary">
                            {entry.user_email || '—'}
                          </span>
                          {entry.user_role && (
                            <span className="ml-1.5 text-[10px] text-text-muted font-medium">
                              ({entry.user_role})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">{actionBadge(entry.action)}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-text-primary">
                          {entityLabel(entry.entity_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">{renderChanges(entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border-default">
              {logs.map((entry) => (
                <div key={entry.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">{formatDate(entry.created_at)}</span>
                    {actionBadge(entry.action)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {entityLabel(entry.entity_type)}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary">
                    {entry.user_email || '—'}
                    {entry.user_role && ` (${entry.user_role})`}
                  </div>
                  {renderChanges(entry) && <div className="pt-1">{renderChanges(entry)}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">
                {t('showing', {
                  from: page * PAGE_SIZE + 1,
                  to: Math.min((page + 1) * PAGE_SIZE, totalCount),
                  total: totalCount,
                })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                  className="h-9 w-9 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-text-primary px-3">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="h-9 w-9 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

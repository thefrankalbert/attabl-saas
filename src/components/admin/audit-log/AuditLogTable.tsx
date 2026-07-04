'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuditLogEntry } from './types';

interface AuditLogTableProps {
  logs: AuditLogEntry[];
}

export default function AuditLogTable({ logs }: AuditLogTableProps) {
  const t = useTranslations('auditLog');
  const locale = useLocale();

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    );
  };

  const actionBadge = (action: string) => {
    switch (action) {
      case 'create':
        return (
          <Badge className="border border-[var(--border)] text-[var(--success)] text-[10px]">
            {t('actionCreate')}
          </Badge>
        );
      case 'update':
        return (
          <Badge className="border border-[var(--border)] text-[var(--muted-foreground)] text-[10px]">
            {t('actionUpdate')}
          </Badge>
        );
      case 'delete':
        return (
          <Badge className="border border-[var(--border)] text-[var(--destructive)] text-[10px]">
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
        <span className="text-[10px] text-app-text-muted">
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
        <span className="text-[10px] text-app-text-muted">
          {changedKeys.slice(0, 2).map((k) => (
            <span key={k}>
              {k}:{' '}
              <span className="line-through text-[var(--destructive)]">
                {String(entry.old_data![k] ?? ' - ')}
              </span>
              {' → '}
              <span className="text-[var(--success)]">{String(entry.new_data![k] ?? ' - ')}</span>
              {', '}
            </span>
          ))}
          {changedKeys.length > 2 && `+${changedKeys.length - 2} ${t('more')}`}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="bg-app-card rounded-xl border border-app-border/60 overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-app-border/60 bg-app-bg/50">
              <TableHead className="text-left text-xs font-semibold text-app-text-secondary px-4 py-3">
                {t('colDate')}
              </TableHead>
              <TableHead className="text-left text-xs font-semibold text-app-text-secondary px-4 py-3">
                {t('colUser')}
              </TableHead>
              <TableHead className="text-center text-xs font-semibold text-app-text-secondary px-4 py-3">
                {t('colAction')}
              </TableHead>
              <TableHead className="text-left text-xs font-semibold text-app-text-secondary px-4 py-3">
                {t('colEntity')}
              </TableHead>
              <TableHead className="text-left text-xs font-semibold text-app-text-secondary px-4 py-3">
                {t('colDetails')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((entry) => (
              <TableRow
                key={entry.id}
                className="border-b border-app-border/60 last:border-0 hover:bg-app-bg transition-colors"
              >
                <TableCell className="px-4 py-3 text-xs text-app-text-secondary whitespace-nowrap">
                  {formatDate(entry.created_at)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div>
                    <span className="text-sm text-app-text">{entry.user_email || ' - '}</span>
                    {entry.user_role && (
                      <span className="ml-1.5 text-[10px] text-app-text-muted font-medium">
                        ({entry.user_role})
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-center">{actionBadge(entry.action)}</TableCell>
                <TableCell className="px-4 py-3">
                  <span className="text-sm font-medium text-app-text">
                    {entityLabel(entry.entity_type)}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 max-w-xs">{renderChanges(entry)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-app-border/60">
        {logs.map((entry) => (
          <div key={entry.id} className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-app-text-muted">{formatDate(entry.created_at)}</span>
              {actionBadge(entry.action)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-app-text">
                {entityLabel(entry.entity_type)}
              </span>
            </div>
            <div className="text-xs text-app-text-secondary">
              {entry.user_email || ' - '}
              {entry.user_role && ` (${entry.user_role})`}
            </div>
            {(() => {
              const changes = renderChanges(entry);
              return changes ? <div className="pt-1">{changes}</div> : null;
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, History, Receipt, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

const ANALYSE_TABS = [
  { path: '/reports', labelKey: 'tabReports', icon: BarChart3 },
  { path: '/stock-history', labelKey: 'tabStockHistory', icon: History },
  { path: '/invoices', labelKey: 'tabInvoices', icon: Receipt },
  { path: '/audit-logs', labelKey: 'tabAuditLogs', icon: ScrollText },
] as const;

export default function AnalyseTabs() {
  const pathname = usePathname();
  const t = useTranslations('reports');
  const basePath = pathname.replace(/\/(reports|stock-history|invoices|audit-logs).*$/, '');

  return (
    <div className="flex items-center gap-1 border-b border-app-border pb-2 mb-1 overflow-x-auto">
      {ANALYSE_TABS.map(({ path, labelKey, icon: Icon }) => {
        const href = `${basePath}${path}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={path}
            href={href}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors',
              active
                ? 'bg-accent/10 text-accent'
                : 'text-app-text-muted hover:text-app-text hover:bg-app-hover',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(labelKey)}
          </Link>
        );
      })}
    </div>
  );
}

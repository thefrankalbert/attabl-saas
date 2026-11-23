'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, History, MapPin, Receipt, ScrollText, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ANALYSE_TABS = [
  { path: '/reports', labelKey: 'tabReports', icon: BarChart3 },
  { path: '/reports/venues', labelKey: 'tabVenueReports', icon: MapPin },
  { path: '/stock-history', labelKey: 'tabStockHistory', icon: History },
  { path: '/stock-losses', labelKey: 'tabStockLosses', icon: TrendingDown },
  { path: '/invoices', labelKey: 'tabInvoices', icon: Receipt },
  { path: '/audit-logs', labelKey: 'tabAuditLogs', icon: ScrollText },
] as const;

export default function AnalyseTabs() {
  const pathname = usePathname();
  const t = useTranslations('reports');
  const basePath = pathname.replace(
    /\/(reports|stock-history|stock-losses|invoices|audit-logs).*$/,
    '',
  );

  return (
    <div className="flex items-center gap-1 border-b border-app-border pb-2 mb-1 overflow-x-auto">
      {ANALYSE_TABS.map(({ path, labelKey, icon: Icon }) => {
        const href = `${basePath}${path}`;
        // L'onglet actif est celui dont le chemin est le plus long a correspondre:
        // /reports/venues ne doit pas allumer aussi l'onglet /reports.
        const matches = (p: string) => {
          const h = `${basePath}${p}`;
          return pathname === h || pathname.startsWith(`${h}/`);
        };
        const active =
          matches(path) &&
          !ANALYSE_TABS.some((o) => o.path.length > path.length && matches(o.path));
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

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QrCode, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QRQuickCardProps {
  href: string;
  tableCount?: number;
}

/** Dashboard entry point to the QR codes manager (assign a code per table/zone). */
export function QRQuickCard({ href, tableCount }: QRQuickCardProps) {
  const t = useTranslations('qrCodes');

  return (
    <div className="flex items-center gap-4 rounded-xl border border-app-border bg-app-card p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <QrCode className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-app-text">{t('dashCardTitle')}</p>
        <p className="text-xs text-app-text-muted">
          {tableCount && tableCount > 0
            ? t('dashCardDescCount', { count: tableCount })
            : t('dashCardDesc')}
        </p>
      </div>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link href={href}>
          {t('dashCardCta')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

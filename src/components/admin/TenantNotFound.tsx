'use client';

import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function TenantNotFound() {
  const t = useTranslations('common');

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-app-bg">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-app-card border border-app-border shadow-sm">
          <AlertCircle className="h-7 w-7 text-app-text-muted" />
        </div>

        <h2 className="text-lg font-bold text-app-text mb-2">{t('tenantNotFound')}</h2>
        <p className="text-sm text-app-text-secondary leading-relaxed">{t('tenantNotFoundDesc')}</p>

        <Button asChild variant="outline" className="mt-6 gap-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            {t('backToHome')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

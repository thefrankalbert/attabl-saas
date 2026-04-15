'use client';

import Link from 'next/link';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorLayout } from '@/components/shared/ErrorLayout';
import { useTranslations } from 'next-intl';

export default function TenantNotFound() {
  const params = useParams();
  const site = params?.site as string | undefined;
  const menuHref = site ? `/sites/${site}/menu` : '/';
  const t = useTranslations('tenant');

  return (
    <ErrorLayout
      variant="tenant"
      code="404"
      brand={
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5" style={{ backgroundColor: '#06C167' }}>
            <UtensilsCrossed className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
            ATTABL
          </span>
        </div>
      }
      title={t('notFoundTitle')}
      description={t('notFoundDescription')}
      actions={
        <Button
          asChild
          className="gap-2 h-12 rounded-xl text-white font-semibold px-6"
          style={{ backgroundColor: '#1A1A1A' }}
        >
          <Link href={menuHref}>
            <ArrowLeft className="h-4 w-4" />
            {t('backToMenu')}
          </Link>
        </Button>
      }
    />
  );
}

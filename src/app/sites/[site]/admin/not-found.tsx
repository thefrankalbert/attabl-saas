'use client';

import Link from 'next/link';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorLayout } from '@/components/shared/ErrorLayout';
import { useTranslations } from 'next-intl';

export default function AdminNotFound() {
  const params = useParams();
  const site = params?.site as string | undefined;
  const dashboardHref = site ? `/sites/${site}/admin` : '/';
  const t = useTranslations('common');

  return (
    <ErrorLayout
      variant="admin"
      code="404"
      brand={
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent p-2.5">
            <LayoutDashboard className="h-6 w-6 text-accent-text" />
          </div>
          <span className="text-2xl font-bold text-app-text">ATTABL</span>
        </div>
      }
      title={t('notFoundTitle')}
      description={t('notFoundDescription')}
      actions={
        <Button asChild className="gap-2 h-11 rounded-xl">
          <Link href={dashboardHref}>
            <ArrowLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Link>
        </Button>
      }
    />
  );
}

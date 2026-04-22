import Link from 'next/link';
import { ArrowLeft, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorLayout } from '@/components/shared/ErrorLayout';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('common');

  return (
    <div className="min-h-dvh">
      <ErrorLayout
        variant="admin"
        code="404"
        brand={
          <div className="flex items-center gap-3">
            <div className="rounded-[10px] bg-accent p-2.5">
              <Layout className="h-6 w-6 text-accent-text" />
            </div>
            <span className="text-2xl font-bold text-app-text">ATTABL</span>
          </div>
        }
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
        actions={
          <Button asChild className="gap-2 h-11 rounded-[10px]">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              {t('backToHome')}
            </Link>
          </Button>
        }
      />
    </div>
  );
}

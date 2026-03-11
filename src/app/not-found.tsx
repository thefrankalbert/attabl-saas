import Link from 'next/link';
import { ArrowLeft, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-8 flex items-center justify-center gap-3">
          <div className="rounded-xl bg-[#CCFF00] p-2.5">
            <Layout className="h-6 w-6 text-black" />
          </div>
          <span className="text-2xl font-bold text-app-text">ATTABL</span>
        </div>

        <p className="text-7xl font-black text-app-text-muted/20">404</p>
        <h1 className="mt-4 text-xl font-semibold text-app-text">{t('notFoundTitle')}</h1>
        <p className="mt-2 text-sm text-app-text-muted leading-relaxed">
          {t('notFoundDescription')}
        </p>

        <Button asChild className="mt-8 gap-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            {t('backToHome')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

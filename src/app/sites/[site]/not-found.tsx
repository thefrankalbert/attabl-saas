'use client';

import Link from 'next/link';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function TenantNotFound() {
  const params = useParams();
  const site = params?.site as string | undefined;
  const menuHref = site ? `/sites/${site}/menu` : '/';
  const t = useTranslations('tenant');

  return (
    <div className="flex h-full items-center justify-center bg-white px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm border border-[#EEEEEE]">
          <UtensilsCrossed className="h-7 w-7" style={{ color: '#B0B0B0' }} />
        </div>

        <p className="text-5xl font-black" style={{ color: '#B0B0B0' }}>
          404
        </p>
        <h1 className="mt-3 text-lg font-semibold" style={{ color: '#1A1A1A' }}>
          {t('notFoundTitle')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: '#737373' }}>
          {t('notFoundDescription')}
        </p>

        <Button asChild className="mt-6 gap-2 w-full" style={{ backgroundColor: '#06C167' }}>
          <Link href={menuHref}>
            <ArrowLeft className="h-4 w-4" />
            {t('backToMenu')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

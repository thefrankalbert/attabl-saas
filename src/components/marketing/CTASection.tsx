import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export default async function CTASection() {
  const t = await getTranslations('marketing.home.cta');

  return (
    <section className="bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mx-auto max-w-2xl font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
          {t('title')}
        </h2>
        <p className="mt-4 text-neutral-400">{t('subtitle')}</p>
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <Button asChild size="lg" variant="secondary">
            <Link href="/signup">{t('primary')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/contact">{t('secondary')}</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-neutral-500">{t('footer')}</p>
      </div>
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Smartphone,
  Tablet,
  Printer,
  Archive,
  CreditCard,
  ScanBarcode,
  Bluetooth,
  BadgeCheck,
  FileX,
  WifiOff,
  Check,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

export const revalidate = 3600; // ISR

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.materiel');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

const DEVICES = [
  { key: 'phone', Icon: Smartphone },
  { key: 'tablet', Icon: Tablet },
  { key: 'printer', Icon: Printer },
  { key: 'drawer', Icon: Archive },
  { key: 'terminal', Icon: CreditCard },
  { key: 'scanner', Icon: ScanBarcode },
] as const;

const KITS = [
  { key: 'counter', items: ['i1', 'i2', 'i3'], featured: false },
  { key: 'room', items: ['i1', 'i2', 'i3', 'i4'], featured: true },
  { key: 'hotel', items: ['i1', 'i2', 'i3', 'i4'], featured: false },
] as const;

const REASSURE = [
  { key: 'wireless', Icon: Bluetooth },
  { key: 'brands', Icon: BadgeCheck },
  { key: 'nocontract', Icon: FileX },
  { key: 'offline', Icon: WifiOff },
] as const;

export default async function MaterielPage() {
  const t = await getTranslations('marketing.materiel');
  return (
    <>
      {/* Hero */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[1120px] px-5 pb-12 pt-20 text-center sm:px-7 sm:pt-[88px]">
          <BlurFade offset={18} blur="0px" duration={0.7}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              {t('eyebrow')}
            </p>
            <h1 className="mx-auto mt-3.5 max-w-[760px] text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-950 lg:text-[52px] dark:text-zinc-50">
              {t('title')}
            </h1>
            <p className="mx-auto mt-4 max-w-[580px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
              {t('subtitle')}
            </p>
          </BlurFade>
        </div>
      </section>

      {/* Devices */}
      <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-[88px]">
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {DEVICES.map(({ key, Icon }) => (
              <BlurFade
                key={key}
                inView
                offset={20}
                blur="0px"
                duration={0.7}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-[26px] dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                  <Icon className="h-5 w-5 text-zinc-900 dark:text-zinc-100" strokeWidth={2} />
                </span>
                <div className="mt-4 text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                  {t(`devices.${key}.title`)}
                </div>
                <p className="mt-2 text-sm leading-[1.55] text-zinc-600 dark:text-zinc-400">
                  {t(`devices.${key}.body`)}
                </p>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Kits */}
      <section className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-[88px]">
          <BlurFade
            inView
            offset={20}
            blur="0px"
            duration={0.7}
            className="mx-auto mb-11 max-w-[560px] text-center"
          >
            <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {t('kits.title')}
            </h2>
            <p className="mt-3 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {t('kits.subtitle')}
            </p>
          </BlurFade>
          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">
            {KITS.map(({ key, items, featured }) => (
              <BlurFade
                key={key}
                inView
                offset={20}
                blur="0px"
                duration={0.7}
                className={
                  featured
                    ? 'rounded-2xl border-2 border-orange-500 bg-white p-[26px] dark:bg-zinc-950'
                    : 'rounded-2xl border border-zinc-200 bg-white p-[26px] dark:border-zinc-800 dark:bg-zinc-950'
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
                    {t(`kits.items.${key}.place`)}
                  </span>
                  {featured && (
                    <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-orange-600 dark:text-orange-400">
                      {t('kits.recommended')}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[19px] font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
                  {t(`kits.items.${key}.name`)}
                </div>
                <p className="mt-1.5 text-sm leading-[1.5] text-zinc-600 dark:text-zinc-400">
                  {t(`kits.items.${key}.for`)}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {items.map((it) => (
                    <li key={it} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 h-[18px] w-[18px] shrink-0 text-orange-600 dark:text-orange-400"
                        strokeWidth={2.5}
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {t(`kits.items.${key}.${it}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Reassurance */}
      <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-20">
          <div className="grid grid-cols-1 gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
            {REASSURE.map(({ key, Icon }) => (
              <BlurFade key={key} inView offset={20} blur="0px" duration={0.7}>
                <Icon className="h-6 w-6 text-orange-600 dark:text-orange-400" strokeWidth={2} />
                <div className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-zinc-950 dark:text-zinc-50">
                  {t(`reassure.${key}.title`)}
                </div>
                <p className="mt-1.5 text-sm leading-[1.55] text-zinc-600 dark:text-zinc-400">
                  {t(`reassure.${key}.body`)}
                </p>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white px-5 pb-[110px] pt-10 sm:px-7 dark:bg-zinc-950">
        <BlurFade
          inView
          offset={20}
          blur="0px"
          duration={0.7}
          className="mx-auto max-w-[1120px] rounded-3xl bg-zinc-950 px-6 py-[72px] text-center sm:px-10 dark:bg-zinc-900"
        >
          <h2 className="mx-auto max-w-[560px] text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-white sm:text-4xl">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-base leading-[1.5] text-zinc-400">
            {t('cta.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center rounded-[10px] bg-white px-[26px] py-3.5 text-[15px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              {t('cta.primary')}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-[10px] border border-white/15 bg-white/[0.08] px-[22px] py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.14]"
            >
              {t('cta.secondary')}
            </Link>
          </div>
        </BlurFade>
      </section>
    </>
  );
}

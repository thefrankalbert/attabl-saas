import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Rocket,
  Receipt,
  Package,
  Wallet,
  Users,
  WifiOff,
  Search,
  MessageCircle,
  Mail,
  MapPin,
  Clock,
  Check,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const revalidate = 3600; // ISR

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.support');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

const CATEGORIES = [
  { key: 'start', Icon: Rocket },
  { key: 'pos', Icon: Receipt },
  { key: 'stock', Icon: Package },
  { key: 'billing', Icon: Wallet },
  { key: 'team', Icon: Users },
  { key: 'network', Icon: WifiOff },
] as const;

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
const GUIDES = ['g1', 'g2', 'g3'] as const;
const PERKS = ['p1', 'p2', 'p3'] as const;

export default async function SupportPage() {
  const t = await getTranslations('marketing.support');

  // Static FAQ structured data (built from i18n, not user content) for rich results.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map((k) => ({
      '@type': 'Question',
      name: t(`faq.items.${k}.q`),
      acceptedAnswer: { '@type': 'Answer', text: t(`faq.items.${k}.a`) },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Static, app-controlled data - safe to inline (not user-generated).
        // Escape "<" so no string could ever break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }}
      />
      {/* Hero + search */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[760px] px-5 pb-12 pt-20 text-center sm:px-7 sm:pt-[88px]">
          <BlurFade offset={18} blur="0px" duration={0.7}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              {t('eyebrow')}
            </p>
            <h1 className="mx-auto mt-3.5 max-w-[620px] text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-950 lg:text-[52px] dark:text-zinc-50">
              {t('title')}
            </h1>
            <p className="mx-auto mt-4 max-w-[540px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
              {t('subtitle')}
            </p>
            <form action="/recherche" className="mx-auto mt-7 flex max-w-[520px] gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" />
                <Input
                  type="search"
                  name="q"
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchLabel')}
                  className="h-12 rounded-xl border-zinc-200 bg-white pl-11 text-base md:text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
              </div>
              <Button
                type="submit"
                className="h-12 rounded-xl bg-zinc-950 px-5 text-[15px] font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {t('searchButton')}
              </Button>
            </form>
          </BlurFade>
        </div>
      </section>

      {/* Categories */}
      <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-20">
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map(({ key, Icon }) => (
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
                  {t(`categories.${key}.title`)}
                </div>
                <p className="mt-2 text-sm leading-[1.55] text-zinc-600 dark:text-zinc-400">
                  {t(`categories.${key}.body`)}
                </p>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-[720px] px-5 py-16 sm:px-7 sm:py-20">
          <BlurFade inView offset={20} blur="0px" duration={0.7} className="mb-9 text-center">
            <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {t('faq.title')}
            </h2>
            <p className="mt-3 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {t('faq.subtitle')}{' '}
              <Link
                href="/contact"
                className="font-medium text-orange-600 hover:underline dark:text-orange-400"
              >
                {t('faq.cta')}
              </Link>
            </p>
          </BlurFade>
          <Accordion type="single" collapsible className="flex flex-col gap-2.5">
            {FAQ_KEYS.map((k, i) => (
              <AccordionItem
                key={k}
                value={`item-${i}`}
                className="overflow-hidden rounded-[14px] border border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <AccordionTrigger className="py-5 text-left text-[17px] font-medium tracking-[-0.01em] text-zinc-950 hover:no-underline dark:text-zinc-50">
                  {t(`faq.items.${k}.q`)}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15.5px] leading-[1.55] text-zinc-600 dark:text-zinc-400">
                  {t(`faq.items.${k}.a`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Guides */}
      <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-20">
          <BlurFade inView offset={20} blur="0px" duration={0.7} className="mb-11 max-w-[560px]">
            <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {t('guides.title')}
            </h2>
            <p className="mt-3 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {t('guides.subtitle')}
            </p>
          </BlurFade>
          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">
            {GUIDES.map((g, i) => (
              <BlurFade
                key={g}
                inView
                offset={20}
                blur="0px"
                duration={0.7}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-[26px] dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
                    {t(`guides.items.${g}.time`)}
                  </span>
                </div>
                <div className="mt-4 text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                  {t(`guides.items.${g}.title`)}
                </div>
                <p className="mt-2 text-sm leading-[1.55] text-zinc-600 dark:text-zinc-400">
                  {t(`guides.items.${g}.body`)}
                </p>
              </BlurFade>
            ))}
          </div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2.5">
            {PERKS.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                <Check
                  className="h-[18px] w-[18px] text-orange-600 dark:text-orange-400"
                  strokeWidth={2.5}
                />
                {t(`guides.perks.${p}`)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Contact channels */}
      <section className="border-t border-zinc-200 bg-zinc-50 px-5 py-16 sm:px-7 sm:py-20 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-[1120px]">
          <BlurFade inView offset={20} blur="0px" duration={0.7} className="mb-9 max-w-[560px]">
            <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {t('contact.title')}
            </h2>
            <p className="mt-3 flex items-center gap-2 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
              <Clock className="h-[18px] w-[18px]" strokeWidth={2} />
              {t('contact.hours')}
            </p>
          </BlurFade>
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
            <Link
              href="/contact"
              className="group rounded-2xl border border-zinc-200 bg-white p-[26px] transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <MessageCircle
                className="h-6 w-6 text-orange-600 dark:text-orange-400"
                strokeWidth={2}
              />
              <div className="mt-3.5 text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                {t('contact.whatsapp.title')}
              </div>
              <p className="mt-1.5 text-sm leading-[1.5] text-zinc-600 dark:text-zinc-400">
                {t('contact.whatsapp.body')}
              </p>
            </Link>
            <a
              href="mailto:support@attabl.com"
              className="group rounded-2xl border border-zinc-200 bg-white p-[26px] transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <Mail className="h-6 w-6 text-orange-600 dark:text-orange-400" strokeWidth={2} />
              <div className="mt-3.5 text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                {t('contact.email.title')}
              </div>
              <p className="mt-1.5 text-sm leading-[1.5] text-zinc-600 dark:text-zinc-400">
                support@attabl.com
              </p>
            </a>
            <div className="rounded-2xl border border-zinc-200 bg-white p-[26px] dark:border-zinc-800 dark:bg-zinc-950">
              <MapPin className="h-6 w-6 text-orange-600 dark:text-orange-400" strokeWidth={2} />
              <div className="mt-3.5 text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                {t('contact.cities.title')}
              </div>
              <p className="mt-1.5 text-sm leading-[1.5] text-zinc-600 dark:text-zinc-400">
                {t('contact.cities.body')}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

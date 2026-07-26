'use client';

import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FAQ_KEYS } from '../pricing-data';

export function FaqSection() {
  const t = useTranslations('marketing.pricing');

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[740px] px-5 py-[96px] sm:px-7">
        <h2 className="mb-10 text-center text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
          {t('faq.title')}
        </h2>
        <Accordion type="single" collapsible className="flex flex-col gap-2.5">
          {FAQ_KEYS.map((k) => (
            <AccordionItem
              key={k}
              value={k}
              className="overflow-hidden rounded-[14px] border border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <AccordionTrigger className="py-5 text-left text-[17px] font-medium tracking-[-0.01em] text-zinc-950 hover:no-underline dark:text-zinc-50">
                {t(`faq.items.${k}.question`)}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-[15.5px] leading-[1.55] text-zinc-600 dark:text-zinc-400">
                {t(`faq.items.${k}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

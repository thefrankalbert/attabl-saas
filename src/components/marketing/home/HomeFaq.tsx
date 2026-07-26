import { getTranslations } from 'next-intl/server';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { BlurFade } from '@/components/ui/blur-fade';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4'] as const;

export async function HomeFaq() {
  const t = await getTranslations('marketing.home.faq');
  const items = FAQ_KEYS.map((k) => ({ q: t(`items.${k}.q`), a: t(`items.${k}.a`) }));

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[720px] px-5 py-20 sm:px-7 sm:py-[120px]">
        <BlurFade inView offset={20} blur="0px" duration={0.7}>
          <h2 className="mb-11 text-center text-3xl font-semibold leading-tight tracking-[-0.025em] text-zinc-950 sm:text-[40px] dark:text-zinc-50">
            {t('title')}
          </h2>
        </BlurFade>
        <Accordion type="single" collapsible className="flex flex-col gap-2.5">
          {items.map((item, i) => (
            <AccordionItem
              key={item.q}
              value={`item-${i}`}
              className="overflow-hidden rounded-[14px] border border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <AccordionTrigger className="py-5 text-left text-[17px] font-medium tracking-[-0.01em] text-zinc-950 hover:no-underline dark:text-zinc-50">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-[15.5px] leading-[1.55] text-zinc-600 dark:text-zinc-400">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

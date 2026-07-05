'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FAQ_KEYS } from '../pricing-data';

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left h-auto px-0 hover:bg-transparent"
      >
        <span className="font-semibold text-neutral-900 dark:text-white text-sm sm:text-base pr-4">
          {question}
        </span>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-neutral-400 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </Button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-40 pb-5' : 'max-h-0',
        )}
      >
        <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

export function FaqSection() {
  const t = useTranslations('marketing.pricing');

  return (
    <section className="bg-white dark:bg-neutral-950 py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white mb-8 text-center">
          {t('faq.title')}
        </h2>
        <div>
          {FAQ_KEYS.map((k) => (
            <FaqItem
              key={k}
              question={t(`faq.items.${k}.question`)}
              answer={t(`faq.items.${k}.answer`)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

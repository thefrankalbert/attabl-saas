'use client';

import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface FaqItem {
  q: string;
  a: string;
}

export function SupportFAQ() {
  const t = useTranslations('adminSupport');
  const items = Object.values(t.raw('faq') as Record<string, FaqItem>);

  return (
    <Accordion type="single" collapsible className="px-4 sm:px-5">
      {items.map((item, index) => (
        <AccordionItem key={item.q} value={`faq-${index}`}>
          <AccordionTrigger className="text-left text-sm font-medium text-app-text hover:no-underline">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-sm leading-relaxed text-app-text-secondary">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

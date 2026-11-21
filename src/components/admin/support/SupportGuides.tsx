'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

/** Un guide par tache courante, et la page de l'application ou la faire. */
const GUIDES = [
  { id: 'menu', path: '/menus' },
  { id: 'orders', path: '/kitchen' },
  { id: 'pos', path: '/pos' },
  { id: 'qr', path: '/qr-codes' },
  { id: 'stock', path: '/inventory' },
  { id: 'team', path: '/users' },
  { id: 'reports', path: '/reports' },
  { id: 'subscription', path: '/subscription' },
] as const;

export function SupportGuides({ basePath }: { basePath: string }) {
  const t = useTranslations('adminSupport');

  return (
    <Accordion type="single" collapsible className="px-4 sm:px-5">
      {GUIDES.map(({ id, path }) => {
        const steps = Object.values(t.raw(`guides.${id}.steps`) as Record<string, string>);
        return (
          <AccordionItem key={id} value={id}>
            <AccordionTrigger className="text-left text-sm font-medium text-app-text hover:no-underline">
              {t(`guides.${id}.title`)}
            </AccordionTrigger>
            <AccordionContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-app-text-secondary marker:text-app-text-muted">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <Button asChild variant="outline" className="mt-4 h-11 rounded-xl px-4">
                <Link href={`${basePath}${path}`} prefetch={false}>
                  {t('openPage', { page: t(`guides.${id}.page`) })}
                </Link>
              </Button>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

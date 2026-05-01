'use client';

import { useTranslations } from 'next-intl';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const ROW_KEYS = ['software', 'hardware', 'fees', 'commitment', 'total'] as const;

export function TcoComparisonTable() {
  const t = useTranslations('marketing.pricing');

  return (
    <section className="bg-white dark:bg-neutral-950 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="font-[family-name:var(--font-sora)] text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
            {t('tco.title')}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">{t('tco.subtitle')}</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
                <TableHead className="text-left py-4 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 w-[30%]">
                  {t('tco.headers.feature')}
                </TableHead>
                <TableHead className="text-center py-4 px-3 text-sm font-bold text-green-700 dark:text-green-400 w-[17.5%] bg-green-50 dark:bg-green-950/30">
                  {t('tco.headers.attabl')}
                </TableHead>
                <TableHead className="text-center py-4 px-3 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[17.5%]">
                  {t('tco.headers.toast')}
                </TableHead>
                <TableHead className="text-center py-4 px-3 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[17.5%]">
                  {t('tco.headers.square')}
                </TableHead>
                <TableHead className="text-center py-4 px-3 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[17.5%]">
                  {t('tco.headers.lightspeed')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROW_KEYS.map((key) => (
                <TableRow
                  key={key}
                  className={cn(
                    'border-b border-neutral-100 dark:border-neutral-800',
                    key === 'total' &&
                      'bg-neutral-50 dark:bg-neutral-900/50 font-semibold border-t-2 border-neutral-200 dark:border-neutral-700',
                  )}
                >
                  <TableCell className="py-3 px-4 text-sm text-neutral-700 dark:text-neutral-300">
                    {t(`tco.rows.${key}.label`)}
                  </TableCell>
                  <TableCell className="py-3 px-3 text-center text-sm text-green-700 dark:text-green-400 bg-green-50/50 dark:bg-green-950/20">
                    {t(`tco.rows.${key}.attabl`)}
                  </TableCell>
                  <TableCell className="py-3 px-3 text-center text-sm text-neutral-600 dark:text-neutral-400">
                    {t(`tco.rows.${key}.toast`)}
                  </TableCell>
                  <TableCell className="py-3 px-3 text-center text-sm text-neutral-600 dark:text-neutral-400">
                    {t(`tco.rows.${key}.square`)}
                  </TableCell>
                  <TableCell className="py-3 px-3 text-center text-sm text-neutral-600 dark:text-neutral-400">
                    {t(`tco.rows.${key}.lightspeed`)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-3 text-center">
          {t('tco.note')}
        </p>
      </div>
    </section>
  );
}

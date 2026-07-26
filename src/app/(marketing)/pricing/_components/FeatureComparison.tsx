'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Minus } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { featureCategories, type ComparisonValue } from '../pricing-data';

function FeatureCell({
  value,
  unlimitedLabel,
  supportLabels,
}: {
  value: ComparisonValue;
  unlimitedLabel: string;
  supportLabels: { whatsappPro: string; whatsappBusiness: string; whatsappEnterprise: string };
}) {
  if (value === true)
    return <Check className="mx-auto h-4 w-4 text-green-600 dark:text-green-500" strokeWidth={2} />;
  if (value === false)
    return <Minus className="mx-auto h-4 w-4 text-zinc-300 dark:text-zinc-600" />;
  if ('kind' in value) {
    if (value.kind === 'unlimited') {
      return (
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          {unlimitedLabel}
        </span>
      );
    }
    const v = value.value;
    const resolved =
      v === 'whatsappPro'
        ? supportLabels.whatsappPro
        : v === 'whatsappBusiness'
          ? supportLabels.whatsappBusiness
          : v === 'whatsappEnterprise'
            ? supportLabels.whatsappEnterprise
            : v;
    return <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{resolved}</span>;
  }
  return null;
}

const PLAN_NAMES = ['Starter', 'Pro', 'Business', 'Enterprise'];
const PRO_HL = 'bg-zinc-100 dark:bg-zinc-800/60';

export function FeatureComparison() {
  const t = useTranslations('marketing.pricing');

  const supportLabels = {
    whatsappPro: t('comparison.categories.support.features.whatsappPro'),
    whatsappBusiness: t('comparison.categories.support.features.whatsappBusiness'),
    whatsappEnterprise: t('comparison.categories.support.features.whatsappEnterprise'),
  };
  const unlimitedLabel = t('comparison.unlimited');
  const values = (f: (typeof featureCategories)[number]['features'][number]) => [
    f.starter,
    f.pro,
    f.business,
    f.enterprise,
  ];

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1080px] px-5 pt-[96px] sm:px-7">
        <h2 className="text-center text-[32px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
          {t('compareTitle')}
        </h2>
        <p className="mx-auto mb-10 mt-2 max-w-[440px] text-center text-base text-zinc-500 dark:text-zinc-400">
          {t('compareSubtitle')}
        </p>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-200 bg-zinc-50 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/40">
                <TableHead className="w-[40%] px-5 py-4 text-left text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                  {t('comparison.featureColumn')}
                </TableHead>
                {PLAN_NAMES.map((name) => (
                  <TableHead
                    key={name}
                    className={cn(
                      'w-[15%] px-2 py-4 text-center text-[13px] font-semibold text-zinc-900 dark:text-zinc-100',
                      name === 'Pro' && PRO_HL,
                    )}
                  >
                    {name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {featureCategories.map((cat) => (
                <Fragment key={cat.key}>
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="px-5 pb-3 pt-8 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500"
                    >
                      {t(`comparison.categories.${cat.key}.title`)}
                    </TableCell>
                  </TableRow>
                  {cat.features.map((f) => (
                    <TableRow
                      key={f.labelKey}
                      className="border-b border-zinc-100 hover:bg-transparent dark:border-zinc-800/60"
                    >
                      <TableCell className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                        {t(`comparison.categories.${cat.key}.features.${f.labelKey}`)}
                      </TableCell>
                      {values(f).map((v, i) => (
                        <TableCell
                          key={i}
                          className={cn('px-2 py-3 text-center', i === 1 && PRO_HL)}
                        >
                          <FeatureCell
                            value={v}
                            unlimitedLabel={unlimitedLabel}
                            supportLabels={supportLabels}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

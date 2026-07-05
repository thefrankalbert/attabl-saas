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
import { featureCategories, type ComparisonValue } from '../pricing-data';

function FeatureCell({
  value,
  unlimitedLabel,
  supportLabels,
}: {
  value: ComparisonValue;
  unlimitedLabel: string;
  supportLabels: {
    whatsappPro: string;
    whatsappBusiness: string;
    whatsappEnterprise: string;
  };
}) {
  if (value === true) return <Check className="w-4 h-4 text-green-600 mx-auto" />;
  if (value === false)
    return <Minus className="w-4 h-4 text-neutral-300 dark:text-neutral-600 mx-auto" />;
  if ('kind' in value) {
    if (value.kind === 'unlimited') {
      return (
        <span className="text-xs font-medium text-neutral-900 dark:text-white">
          {unlimitedLabel}
        </span>
      );
    }
    // text kind: may be a direct value or a support label key
    const v = value.value;
    const resolved =
      v === 'whatsappPro'
        ? supportLabels.whatsappPro
        : v === 'whatsappBusiness'
          ? supportLabels.whatsappBusiness
          : v === 'whatsappEnterprise'
            ? supportLabels.whatsappEnterprise
            : v;
    return <span className="text-xs font-medium text-neutral-900 dark:text-white">{resolved}</span>;
  }
  return null;
}

export function FeatureComparison() {
  const t = useTranslations('marketing.pricing');

  const planNames = ['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

  const supportLabels = {
    whatsappPro: t('comparison.categories.support.features.whatsappPro'),
    whatsappBusiness: t('comparison.categories.support.features.whatsappBusiness'),
    whatsappEnterprise: t('comparison.categories.support.features.whatsappEnterprise'),
  };
  const unlimitedLabel = t('comparison.unlimited');

  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white text-center mb-12">
          {t('comparison.title')}
        </h2>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-neutral-200 dark:border-neutral-700">
                <TableHead className="text-left py-4 pr-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 w-[40%]">
                  {t('comparison.featureColumn')}
                </TableHead>
                {planNames.map((name) => (
                  <TableHead
                    key={name}
                    className="text-center py-4 px-2 text-sm font-bold text-neutral-900 dark:text-white w-[15%]"
                  >
                    {name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {featureCategories.map((cat) => (
                <Fragment key={cat.key}>
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="pt-8 pb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
                    >
                      {t(`comparison.categories.${cat.key}.title`)}
                    </TableCell>
                  </TableRow>
                  {cat.features.map((f) => (
                    <TableRow
                      key={f.labelKey}
                      className="border-b border-neutral-100 dark:border-neutral-800"
                    >
                      <TableCell className="py-3 pr-4 text-sm text-neutral-700 dark:text-neutral-300">
                        {t(`comparison.categories.${cat.key}.features.${f.labelKey}`)}
                      </TableCell>
                      <TableCell className="py-3 px-2 text-center">
                        <FeatureCell
                          value={f.starter}
                          unlimitedLabel={unlimitedLabel}
                          supportLabels={supportLabels}
                        />
                      </TableCell>
                      <TableCell className="py-3 px-2 text-center">
                        <FeatureCell
                          value={f.pro}
                          unlimitedLabel={unlimitedLabel}
                          supportLabels={supportLabels}
                        />
                      </TableCell>
                      <TableCell className="py-3 px-2 text-center">
                        <FeatureCell
                          value={f.business}
                          unlimitedLabel={unlimitedLabel}
                          supportLabels={supportLabels}
                        />
                      </TableCell>
                      <TableCell className="py-3 px-2 text-center">
                        <FeatureCell
                          value={f.enterprise}
                          unlimitedLabel={unlimitedLabel}
                          supportLabels={supportLabels}
                        />
                      </TableCell>
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

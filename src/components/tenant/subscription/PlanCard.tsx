'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Crown, Zap, Building2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PLAN_NAMES } from '@/lib/plans/features';
import type { BillingInterval } from '@/types/billing';
import { planMonthlyPrice, planBilledTotal, type SelfServicePlan } from './pricing-format';

const PLAN_ICON_MAP: Record<SelfServicePlan, typeof Zap> = {
  starter: Zap,
  pro: Crown,
  business: Building2,
};

interface PlanCardProps {
  plan: SelfServicePlan;
  features: string[];
  billingInterval: BillingInterval;
  isCurrent: boolean;
  isRecommended: boolean;
  isLoading: boolean;
  disabled: boolean;
  onChoose: () => void;
}

export function PlanCard({
  plan,
  features,
  billingInterval,
  isCurrent,
  isRecommended,
  isLoading,
  disabled,
  onChoose,
}: PlanCardProps) {
  const t = useTranslations('admin');
  const locale = useLocale();

  const PlanIcon = PLAN_ICON_MAP[plan];
  const price = planMonthlyPrice(plan, billingInterval).toLocaleString(locale);

  const subtitle = (() => {
    if (billingInterval === 'monthly') return null;
    const total = planBilledTotal(plan, billingInterval).toLocaleString(locale);
    return billingInterval === 'yearly'
      ? t('subscription.billedYearly', { total })
      : t('subscription.billedSemiannual', { total });
  })();

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border p-5 transition-colors',
        isCurrent
          ? 'border-app-border-hover bg-app-elevated'
          : isRecommended
            ? 'border-status-info/40 bg-app-card ring-1 ring-status-info/40'
            : 'border-app-border bg-app-card',
      )}
    >
      {/* Header: icon + name, badge on the right (in flow, never clipped) */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-bg">
            <PlanIcon className="h-4 w-4 text-app-text-secondary" />
          </div>
          <h3 className="text-sm font-bold text-app-text">{PLAN_NAMES[plan]}</h3>
        </div>
        {isCurrent ? (
          <span className="rounded-full bg-app-hover px-2.5 py-0.5 text-[11px] font-semibold text-app-text-secondary">
            {t('subscription.currentPlan')}
          </span>
        ) : isRecommended ? (
          <span className="rounded-full bg-status-info-bg px-2.5 py-0.5 text-[11px] font-semibold text-status-info">
            {t('subscription.popularPlan')}
          </span>
        ) : null}
      </div>

      {/* Price */}
      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight tabular-nums text-app-text">
            {price}
          </span>
          <span className="text-xs text-app-text-muted">{t('subscription.perMonth')}</span>
        </div>
        <p className="mt-1 h-4 text-xs text-app-text-muted">{subtitle}</p>
      </div>

      {/* Features */}
      <ul className="mb-5 flex-1 space-y-2.5">
        {features.map((key) => (
          <li key={key} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
            <span className="text-xs text-app-text-secondary">
              {t(`subscription.${key}` as Parameters<typeof t>[0])}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Button
        onClick={() => !isCurrent && onChoose()}
        disabled={disabled || isCurrent}
        variant={isRecommended ? 'default' : 'outline'}
        className={cn(
          'h-10 w-full rounded-lg text-sm font-semibold',
          isCurrent
            ? 'cursor-default border-app-border bg-transparent text-app-text-muted hover:bg-transparent'
            : isRecommended
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border-app-border bg-app-elevated text-app-text hover:bg-app-hover',
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isCurrent ? (
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            {t('subscription.currentPlan')}
          </span>
        ) : (
          t('subscription.choosePlan')
        )}
      </Button>
    </div>
  );
}

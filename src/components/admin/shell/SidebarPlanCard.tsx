'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarPlanCardProps {
  basePath: string;
  /** Current plan display name (e.g. "Pro"), already localized/capitalized. */
  planName: string;
  /** Current plan in upper case (STARTER / PRO / BUSINESS / ENTERPRISE / GRATUIT). */
  planRaw: string;
  collapsed: boolean;
}

/**
 * Next self-service tier to upsell from the current plan, or null when the
 * tenant is already on the top self-service plan (Business) or Enterprise.
 * Case-insensitive; anything below Pro (gratuit/starter/trial/unknown) upsells
 * to Pro. Pure + exported for unit testing.
 */
export function getUpsellTarget(planRaw: string): 'pro' | 'business' | null {
  const current = planRaw.toLowerCase();
  if (current === 'business' || current === 'enterprise') return null;
  return current === 'pro' ? 'business' : 'pro';
}

/**
 * Upsell card in the sidebar footer: current plan + a one-tap upgrade to the
 * next tier. Hidden once the tenant is on the top self-service plan (Business)
 * or Enterprise. Admin palette (neutral + blue accent), never the brand lime.
 */
export function SidebarPlanCard({ basePath, planName, planRaw, collapsed }: SidebarPlanCardProps) {
  const t = useTranslations('sidebar');

  const next = getUpsellTarget(planRaw);
  if (!next) return null;

  const nextName = next === 'pro' ? 'Pro' : 'Business';
  const subtitle = next === 'pro' ? t('planCardUpsellPro') : t('planCardUpsellBusiness');
  const cta = t('planCardCta', { plan: nextName });
  const href = `${basePath}/subscription`;

  if (collapsed) {
    return (
      <Link
        href={href}
        prefetch={false}
        title={cta}
        aria-label={cta}
        className="mx-auto mb-2 flex size-9 items-center justify-center rounded-lg border border-status-info/25 bg-status-info/10 text-status-info transition-colors hover:bg-status-info/15"
      >
        <Sparkles className="size-4" />
      </Link>
    );
  }

  return (
    <div className="mb-2 flex flex-col gap-2.5 rounded-xl border border-status-info/25 bg-status-info/10 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-info/15 text-status-info">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-[var(--muted-foreground)]">{t('planCardTitle')}</p>
          <p className="truncate text-xs font-semibold text-[var(--sidebar-foreground)]">
            {planName}
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">{subtitle}</p>
      <Button
        asChild
        className="h-8 w-full gap-1.5 rounded-lg bg-[var(--primary)] text-xs font-semibold text-[var(--primary-foreground)] hover:opacity-90"
      >
        <Link href={href} prefetch={false}>
          <Zap className="size-3.5" />
          {cta}
        </Link>
      </Button>
    </div>
  );
}

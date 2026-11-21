'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface SidebarPlanCardProps {
  basePath: string;
  /** Current plan display name (e.g. "Starter"), already localized/capitalized. */
  planName: string;
  /** Current plan in upper case (STARTER / PRO / BUSINESS / ENTERPRISE / TRIAL). */
  planRaw: string;
  collapsed: boolean;
}

/**
 * Upsell target from the current plan. Only plans below Pro are invited to
 * upgrade: a Pro, Business or Enterprise tenant already pays for the full
 * product, and pushing the next tier at every screen reads as nagging (decision
 * du proprietaire, 2026-11-17). Case-insensitive; starter and unknown plans
 * upsell to Pro. An active trial has everything (offre Business): nothing to
 * unlock, the card invites to choose a plan instead. Pure + exported for unit
 * testing.
 */
export function getUpsellTarget(planRaw: string): 'pro' | 'choose' | null {
  const current = planRaw.toLowerCase();
  if (current === 'trial') return 'choose';
  if (current === 'pro' || current === 'business' || current === 'enterprise') return null;
  return 'pro';
}

/**
 * Sobre upgrade card in the sidebar footer, text only (no icon), shown to
 * plans below Pro. Hidden when the sidebar is collapsed: an icon-only button
 * would be the decoration the owner asked to remove. Admin palette (neutral +
 * blue accent), never the brand lime.
 */
export function SidebarPlanCard({ basePath, planName, planRaw, collapsed }: SidebarPlanCardProps) {
  const t = useTranslations('sidebar');

  const target = getUpsellTarget(planRaw);
  if (collapsed || !target) return null;

  return (
    <div className="mb-2 rounded-lg border border-[var(--sidebar-border)] px-3 py-2.5">
      <p className="text-[11px] text-[var(--muted-foreground)]">
        {t('planCardTitle')} : {planName}
      </p>
      <p className="mt-1 text-xs leading-snug text-[var(--sidebar-foreground)]">
        {target === 'choose' ? t('planCardTrial') : t('planCardUpsellPro')}
      </p>
      <Link
        href={`${basePath}/subscription`}
        prefetch={false}
        className="mt-2 inline-block text-xs font-semibold text-status-info hover:underline"
      >
        {target === 'choose' ? t('planCardTrialCta') : t('planCardCta', { plan: 'Pro' })}
      </Link>
    </div>
  );
}

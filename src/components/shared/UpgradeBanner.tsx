'use client';

import { Crown, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTenant } from '@/contexts/TenantContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface UpgradeBannerProps {
  /** Feature name to display in the message */
  feature: string;
  /** Optional custom message */
  message?: string;
  /** Compact mode (inline) vs full banner */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Banner shown when a feature is restricted by the current plan.
 * Links to the subscription management page for upgrade.
 */
export function UpgradeBanner({
  feature,
  message,
  compact = false,
  className = '',
}: UpgradeBannerProps) {
  const { slug } = useTenant();
  const { planName } = useSubscription();
  const upgradeUrl = `/sites/${slug}/admin/subscription`;

  const defaultMessage = `${feature} est disponible avec le plan Premium.`;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm ${className}`}>
        <Crown className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{message || defaultMessage}</span>
        <Link
          href={upgradeUrl}
          className="text-amber-800 font-semibold hover:underline whitespace-nowrap flex items-center gap-1"
        >
          Passer au Premium
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 ${className}`}
    >
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-200/30 to-transparent rounded-bl-full" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Crown className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Fonctionnalite Premium</h3>
            <p className="text-xs text-gray-500">
              Votre plan actuel : <span className="font-semibold">{planName}</span>
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-700 mb-4">
          {message || defaultMessage}
        </p>

        <Link
          href={upgradeUrl}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
        >
          <Crown className="w-4 h-4" />
          Passer au Premium
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Small lock badge for inline use (e.g., on sound items)
 */
export function PremiumBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded-full ${className}`}
    >
      <Crown className="w-3 h-3" />
      Premium
    </span>
  );
}

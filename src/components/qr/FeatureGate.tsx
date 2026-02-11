'use client';

import { ReactNode } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { FeatureKey } from '@/lib/plans/features';
import { Lock, Crown } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  planRequired?: 'premium' | 'enterprise';
}

// ─── Component ─────────────────────────────────────────

export function FeatureGate({ feature, children, planRequired }: FeatureGateProps) {
  const { canAccess } = useSubscription();

  const hasAccess = canAccess(feature);

  if (hasAccess) {
    return <>{children}</>;
  }

  const isEnterprise = planRequired === 'enterprise';

  return (
    <div className="relative">
      {/* Gated content - dimmed and non-interactive */}
      <div className="opacity-40 pointer-events-none select-none">{children}</div>

      {/* Overlay with badge */}
      <div className="absolute inset-0 flex items-start justify-end p-2">
        {isEnterprise ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100/80 text-purple-700 backdrop-blur-sm">
            <Crown className="h-3.5 w-3.5" />
            Enterprise
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100/80 text-amber-700 backdrop-blur-sm">
            <Lock className="h-3.5 w-3.5" />
            Premium
          </span>
        )}
      </div>
    </div>
  );
}

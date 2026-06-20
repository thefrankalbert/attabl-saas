'use client';

import { Crown } from 'lucide-react';

/**
 * Small lock badge for inline use (e.g., on sound items)
 */
export function PremiumBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-600 text-[10px] font-bold uppercase rounded-full ${className}`}
    >
      <Crown className="w-3 h-3" />
      Premium
    </span>
  );
}

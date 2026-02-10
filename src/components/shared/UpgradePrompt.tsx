'use client';

import Link from 'next/link';
import { ArrowRight, AlertTriangle } from 'lucide-react';

interface UpgradePromptProps {
  resource: string;
  currentCount: number;
  maxAllowed: number;
  tenantSlug: string;
}

export function UpgradePrompt({
  resource,
  currentCount,
  maxAllowed,
  tenantSlug,
}: UpgradePromptProps) {
  const percentage = maxAllowed > 0 ? Math.min((currentCount / maxAllowed) * 100, 100) : 0;
  const isAtLimit = currentCount >= maxAllowed;
  const upgradeUrl = `/sites/${tenantSlug}/admin/subscription`;

  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-5">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle
          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isAtLimit ? 'text-amber-500' : 'text-blue-500'}`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {currentCount}/{maxAllowed} {resource}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isAtLimit
              ? 'Passez au Premium pour en ajouter davantage'
              : 'Vous approchez de la limite de votre plan'}
          </p>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            isAtLimit
              ? 'bg-gradient-to-r from-amber-400 to-red-400'
              : 'bg-gradient-to-r from-blue-400 to-indigo-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <Link
        href={upgradeUrl}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all"
      >
        Passer au Premium
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

'use client';

import { Check, X, Minus } from 'lucide-react';
import { PLAN_LIMITS, PLAN_NAMES } from '@/lib/plans/features';
import type { SubscriptionPlan } from '@/types/billing';
import { cn } from '@/lib/utils';

interface FeatureComparisonTableProps {
  currentPlan?: SubscriptionPlan;
}

interface FeatureRow {
  label: string;
  key: string;
  format?: 'boolean' | 'number';
}

const FEATURES: FeatureRow[] = [
  { label: 'Administrateurs', key: 'maxAdmins', format: 'number' },
  { label: 'Espaces / Venues', key: 'maxVenues', format: 'number' },
  { label: 'Cartes / Menus', key: 'maxMenus', format: 'number' },
  { label: 'Articles / Plats', key: 'maxItems', format: 'number' },
  { label: 'Sons personnalis\u00e9s', key: 'maxSounds', format: 'number' },
  { label: 'Upload sons custom', key: 'customSoundUpload', format: 'boolean' },
  { label: 'Statistiques avanc\u00e9es', key: 'advancedStats', format: 'boolean' },
  { label: 'Support WhatsApp', key: 'whatsappSupport', format: 'boolean' },
  { label: 'Commande \u00e0 table', key: 'tableOrdering', format: 'boolean' },
  { label: 'QR Codes', key: 'qrCodes', format: 'boolean' },
  { label: 'Cuisine temps r\u00e9el (KDS)', key: 'realtimeKDS', format: 'boolean' },
  { label: 'Branding personnalis\u00e9', key: 'customBranding', format: 'boolean' },
  { label: 'Multi-langues (FR/EN)', key: 'multiLanguage', format: 'boolean' },
];

const PLANS: SubscriptionPlan[] = ['essentiel', 'premium', 'enterprise'];

function formatValue(value: boolean | number, format: string | undefined): React.ReactNode {
  if (format === 'boolean') {
    return value ? (
      <Check className="w-4 h-4 text-emerald-500 mx-auto" />
    ) : (
      <X className="w-4 h-4 text-gray-300 mx-auto" />
    );
  }
  if (format === 'number') {
    const num = value as number;
    if (num >= 99) return <Minus className="w-4 h-4 text-gray-400 mx-auto" />;
    return <span className="font-bold text-gray-900">{num}</span>;
  }
  return String(value);
}

export function FeatureComparisonTable({ currentPlan }: FeatureComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-4 px-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
              Fonctionnalit\u00e9
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan}
                className={cn(
                  'text-center py-4 px-3 font-bold text-sm',
                  plan === 'premium' && 'bg-blue-50/50 rounded-t-xl',
                  currentPlan === plan && 'text-blue-600',
                )}
              >
                <div>{PLAN_NAMES[plan]}</div>
                {currentPlan === plan && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mt-1 inline-block">
                    Votre plan
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURES.map((feature, idx) => (
            <tr
              key={feature.key}
              className={cn('border-b border-gray-100', idx % 2 === 0 && 'bg-gray-50/30')}
            >
              <td className="py-3 px-3 text-gray-700 font-medium">{feature.label}</td>
              {PLANS.map((plan) => {
                const limits = PLAN_LIMITS[plan];
                const value = limits[feature.key as keyof typeof limits];
                return (
                  <td
                    key={plan}
                    className={cn('text-center py-3 px-3', plan === 'premium' && 'bg-blue-50/50')}
                  >
                    {formatValue(value as boolean | number, feature.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

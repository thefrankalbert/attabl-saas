/* eslint-disable @next/next/no-img-element */
'use client';

import { useTranslations } from 'next-intl';
import { Check, Layout } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

interface LaunchSummaryCardProps {
  data: OnboardingData;
  accentColor: string;
  completedItems: Array<{ label: string; done: boolean }>;
}

export function LaunchSummaryCard({ data, accentColor, completedItems }: LaunchSummaryCardProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="mb-6 rounded-xl border border-app-border bg-app-elevated p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-app-border shadow-sm"
          style={{ backgroundColor: accentColor }}
        >
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="Logo" className="h-full w-full rounded-xl object-cover" />
          ) : (
            <Layout className="h-7 w-7 text-white" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-app-text">{data.tenantName}</h2>
          <p className="text-sm capitalize text-app-text-secondary">
            {data.establishmentType} &bull; {data.city || t('cityNotSet')}
          </p>
        </div>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {completedItems.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                item.done ? 'bg-accent text-accent-text' : 'bg-app-elevated text-app-text-muted'
              }`}
            >
              <Check className="h-3 w-3" />
            </div>
            <span className={`text-sm ${item.done ? 'text-app-text' : 'text-app-text-muted'}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
    <div className="mb-6 p-5 rounded-xl bg-app-elevated/40 border border-app-border">
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border border-app-border/50"
          style={{ backgroundColor: accentColor }}
        >
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="Logo" className="w-full h-full rounded-xl object-cover" />
          ) : (
            <Layout className="h-7 w-7 text-white" />
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold text-app-text">{data.tenantName}</h2>
          <p className="text-app-text-secondary capitalize text-sm">
            {data.establishmentType} &bull; {data.city || t('cityNotSet')}
          </p>
        </div>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {completedItems.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={
                item.done
                  ? { backgroundColor: accentColor, color: '#fff' }
                  : {
                      backgroundColor: 'var(--app-elevated)',
                      color: 'var(--app-text-muted)',
                    }
              }
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

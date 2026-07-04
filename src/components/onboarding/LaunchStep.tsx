'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Paintbrush, Type, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LaunchQR } from '@/components/qr/LaunchQR';
import { onboardingDataToQRConfig } from '@/components/onboarding/utils/qr-config-bridge';
import { getSegmentFeatures } from '@/lib/segment-features';
import { getTenantUrl } from '@/lib/constants';
import type { OnboardingData } from '@/app/onboarding/page';
import { LaunchSummaryCard } from './launch/LaunchSummaryCard';
import { LaunchMenuUrl } from './launch/LaunchMenuUrl';
import { LaunchDashboardNote } from './launch/LaunchDashboardNote';
import { LaunchStyleTab } from './launch/LaunchStyleTab';
import { LaunchTextTab } from './launch/LaunchTextTab';

interface LaunchStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
  variant?: 'qr' | 'summary';
}

type LaunchTab = 'style' | 'text' | 'export';

export function LaunchStep({ data, updateData, variant = 'qr' }: LaunchStepProps) {
  const t = useTranslations('onboarding');
  const [activeTab, setActiveTab] = useState<LaunchTab>('style');

  const showQr = variant === 'qr';
  const showSummary = variant === 'summary';

  const menuUrl = data.tenantSlug ? getTenantUrl(data.tenantSlug) : 'https://attabl.com';

  const features = getSegmentFeatures(data.establishmentType);
  const completedItems = [
    { label: t('checkAccountCreated'), done: true },
    { label: t('checkIdentityConfigured'), done: !!data.establishmentType },
    ...(features.showTables
      ? [{ label: t('checkTablesConfigured'), done: data.tableConfigMode !== 'skip' }]
      : []),
    { label: t('checkBrandingCustomized'), done: !!data.primaryColor },
    { label: t('checkMenuInitialized'), done: data.menuOption !== 'skip' },
  ];

  const accentColor = data.primaryColor || '#000';

  const tabs: Array<{ id: LaunchTab; icon: typeof Paintbrush; label: string }> = [
    { id: 'style', icon: Paintbrush, label: t('qrStyleTab') },
    { id: 'text', icon: Type, label: t('qrTextTab') },
    { id: 'export', icon: Download, label: t('qrExportTab') },
  ];

  const qrConfig = useMemo(() => onboardingDataToQRConfig(data), [data]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-lg font-bold text-app-text mb-1">
              {showSummary ? t('launchTitle') : t('qrCodeTitle')}
            </h1>
            <p className="text-app-text-secondary text-sm">{t('launchSubtitle')}</p>
          </div>

          {/* Summary Card -- Full width */}
          {showSummary && (
            <LaunchSummaryCard
              data={data}
              accentColor={accentColor}
              completedItems={completedItems}
            />
          )}

          {/* Menu URL */}
          {showSummary && <LaunchMenuUrl menuUrl={menuUrl} accentColor={accentColor} />}

          {/* LaunchQR export for summary variant */}
          {showSummary && (
            <div className="mb-6">
              <LaunchQR
                config={qrConfig}
                url={menuUrl}
                tenantName={data.tenantName}
                logoUrl={data.logoUrl || undefined}
              />
            </div>
          )}

          {/* Dashboard handoff - names where the launch lands the user */}
          {showSummary && <LaunchDashboardNote />}

          {/* QR Customization */}
          {showQr && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
                QR Code
              </p>

              {/* Tab Pills */}
              <div className="flex flex-wrap gap-1.5 mb-6 p-1 rounded-xl bg-app-elevated border border-app-border">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant={isActive ? 'default' : 'ghost'}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 h-auto ${
                        isActive
                          ? 'bg-accent text-accent-text'
                          : 'text-app-text-muted hover:text-app-text-secondary hover:bg-app-hover'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </Button>
                  );
                })}
              </div>

              {/* Style Tab */}
              {activeTab === 'style' && <LaunchStyleTab data={data} updateData={updateData} />}

              {/* Text Tab */}
              {activeTab === 'text' && <LaunchTextTab data={data} updateData={updateData} />}

              {/* Export Tab */}
              {activeTab === 'export' && (
                <div>
                  <LaunchQR
                    config={qrConfig}
                    url={menuUrl}
                    tenantName={data.tenantName}
                    logoUrl={data.logoUrl || undefined}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

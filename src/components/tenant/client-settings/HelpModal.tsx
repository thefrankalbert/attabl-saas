'use client';

import { useTranslations } from 'next-intl';
import { X, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsRow } from './SettingsPrimitives';

export function HelpModal({ tenantName, onClose }: { tenantName: string; onClose: () => void }) {
  const t = useTranslations('tenant');
  const tc = useTranslations('common');

  return (
    <div className="fixed inset-0 z-[1001] flex items-end justify-center">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(26,26,26,0.6)' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white"
        style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid rgb(238, 238, 238)' }}
        >
          <div className="w-8" />
          <h2 className="text-base font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
            {t('helpModalTitle')}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-full bg-app-elevated"
            aria-label={tc('close')}
          >
            <X className="h-4 w-4" style={{ color: 'rgb(176, 176, 176)' }} />
          </Button>
        </div>

        <div className="py-2">
          <SettingsRow
            icon={<Mail className="h-[18px] w-[18px]" strokeWidth={1.5} />}
            label={t('helpEmailLabel')}
            subtitle={t('helpEmailSubtitle')}
            onClick={() => {
              window.location.href = `mailto:support@attabl.com?subject=${encodeURIComponent(
                `[${tenantName}] Demande d'assistance`,
              )}`;
              onClose();
            }}
          />
          <SettingsRow
            icon={<Phone className="h-[18px] w-[18px]" strokeWidth={1.5} />}
            label={t('helpCallBurkinaLabel')}
            subtitle={t('helpCallBurkinaSubtitle')}
            onClick={() => {
              window.location.href = 'tel:+22665565411';
              onClose();
            }}
          />
          <SettingsRow
            icon={<Phone className="h-[18px] w-[18px]" strokeWidth={1.5} />}
            label={t('helpCallChadLabel')}
            subtitle={t('helpCallChadSubtitle')}
            onClick={() => {
              window.location.href = 'tel:+23564940372';
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}

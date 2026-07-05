'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrivacyModal({ onClose }: { onClose: () => void }) {
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
        className="relative max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white"
        style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid rgb(238, 238, 238)' }}
        >
          <div className="w-8" />
          <h2 className="text-base font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
            {t('privacyTitle')}
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
        <div className="max-h-[75vh] space-y-5 overflow-y-auto p-6 pb-24">
          <section>
            <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
              {t('dataCollectionTitle')}
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
              {t('dataCollectionDesc')}
            </p>
          </section>
          <section>
            <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
              {t('usageTitle')}
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
              {t('usageDesc')}
            </p>
          </section>
          <section>
            <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
              {t('storageTitle')}
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
              {t('storageDesc')}
            </p>
          </section>
          <section>
            <h3 className="mb-1.5 text-sm font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
              {t('rightsTitle')}
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(115, 115, 115)' }}>
              {t('rightsDesc')}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

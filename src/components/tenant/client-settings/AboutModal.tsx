'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AboutModal({ onClose }: { onClose: () => void }) {
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
        className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white"
        style={{ boxShadow: '0 -2px 16px rgba(0,0,0,0.08)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid rgb(238, 238, 238)' }}
        >
          <div className="w-8" />
          <h2 className="text-base font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
            {t('aboutTitle')}
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
        <div className="max-h-[85vh] overflow-y-auto px-10 py-10 pb-20">
          <div className="mb-10 text-center">
            <h3 className="text-[11px] font-medium" style={{ color: 'rgb(26, 26, 26)' }}>
              ATTABL
            </h3>
          </div>
          <div className="mx-auto max-w-xs text-center">
            <p
              className="text-[15px] font-bold leading-relaxed"
              style={{ color: 'rgb(26, 26, 26)' }}
            >
              {t('aboutAppDesc')}
            </p>
          </div>
          <p className="mt-4 text-center text-[11px]" style={{ color: 'rgb(176, 176, 176)' }}>
            {t('appVersion')}
          </p>
        </div>
      </div>
    </div>
  );
}

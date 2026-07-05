'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { QRTemplateId } from '@/types/qr-design.types';
import type { OnboardingData } from '@/app/onboarding/page';
import { TemplateMiniPreview } from './TemplateMiniPreview';

const TEMPLATES: Array<{ id: QRTemplateId; labelKey: string }> = [
  { id: 'minimal', labelKey: 'qrTemplateMinimal' },
  { id: 'carte', labelKey: 'qrTemplateCarte' },
  { id: 'chevalet', labelKey: 'qrTemplateChevalet' },
];

const QR_STYLES: Array<{
  id: OnboardingData['qrStyle'];
  fg: string;
  bg: string;
}> = [
  { id: 'classic', fg: '#000000', bg: '#FFFFFF' },
  { id: 'branded', fg: 'primary', bg: '#FFFFFF' },
  { id: 'inverted', fg: '#FFFFFF', bg: '#000000' },
  { id: 'dark', fg: '#FFFFFF', bg: '#1a1a1a' },
];

interface LaunchStyleTabProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

export function LaunchStyleTab({ data, updateData }: LaunchStyleTabProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="space-y-6">
      {/* Templates */}
      <div>
        <p className="mb-2 block text-xs font-medium text-app-text-secondary">Template</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TEMPLATES.map((tmpl) => {
            const isSelected = data.qrTemplate === tmpl.id;
            return (
              <Button
                key={tmpl.id}
                type="button"
                variant="ghost"
                onClick={() => updateData({ qrTemplate: tmpl.id })}
                className={`flex h-auto flex-col overflow-hidden rounded-lg p-0 text-center transition-all duration-150 ${
                  isSelected
                    ? 'bg-app-hover shadow-sm ring-1 ring-accent hover:bg-app-hover'
                    : 'border border-app-border bg-app-elevated hover:bg-app-hover'
                }`}
              >
                <div className="px-2 pt-3">
                  <TemplateMiniPreview templateId={tmpl.id} data={data} />
                </div>
                <div className="border-t border-app-border py-2">
                  <span
                    className={`text-xs font-medium ${isSelected ? 'text-app-text' : 'text-app-text-secondary'}`}
                  >
                    {t(tmpl.labelKey)}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* QR Color Styles */}
      <div>
        <p className="mb-2 block text-xs font-medium text-app-text-secondary">{t('qrCodeTitle')}</p>
        <div className="flex gap-2.5">
          {QR_STYLES.map((style) => {
            const isActive = data.qrStyle === style.id;
            const previewFg = style.fg === 'primary' ? data.primaryColor || '#000' : style.fg;
            return (
              <Button
                key={style.id}
                type="button"
                variant="ghost"
                onClick={() => updateData({ qrStyle: style.id })}
                className={`flex h-12 w-12 items-center justify-center rounded-lg p-0 shadow-sm transition-all ${
                  isActive
                    ? 'ring-1 ring-accent'
                    : 'border border-app-border hover:border-app-border-hover'
                }`}
                style={{ backgroundColor: style.bg }}
              >
                <div className="h-5 w-5 rounded-md" style={{ backgroundColor: previewFg }} />
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

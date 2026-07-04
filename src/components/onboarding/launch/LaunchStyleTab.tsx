'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { QRTemplateId } from '@/types/qr-design.types';
import type { OnboardingData } from '@/app/onboarding/page';
import { TemplateMiniPreview } from './TemplateMiniPreview';

const TEMPLATES: Array<{ id: QRTemplateId; labelKey: string }> = [
  { id: 'standard', labelKey: 'qrTemplateStandard' },
  { id: 'chevalet', labelKey: 'qrTemplateChevalet' },
  { id: 'carte', labelKey: 'qrTemplateCarte' },
  { id: 'minimal', labelKey: 'qrTemplateMinimal' },
  { id: 'elegant', labelKey: 'qrTemplateElegant' },
  { id: 'neon', labelKey: 'qrTemplateNeon' },
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
        <p className="text-xs font-semibold text-app-text-secondary mb-3">Template</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((tmpl) => {
            const isSelected = data.qrTemplate === tmpl.id;
            return (
              <Button
                key={tmpl.id}
                type="button"
                variant="outline"
                onClick={() => updateData({ qrTemplate: tmpl.id })}
                className={`rounded-xl border text-center transition-all duration-200 overflow-hidden h-auto p-0 flex flex-col ${
                  isSelected
                    ? 'border-accent bg-accent/5 '
                    : 'border-app-border hover:border-app-border-hover'
                }`}
              >
                <div className="pt-3 px-2">
                  <TemplateMiniPreview templateId={tmpl.id} data={data} />
                </div>
                <div className="py-2 border-t border-app-border">
                  <span
                    className={`text-xs font-semibold ${isSelected ? 'text-accent' : 'text-app-text-secondary'}`}
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
        <p className="text-xs font-semibold text-app-text-secondary mb-3">{t('qrCodeTitle')}</p>
        <div className="flex gap-2.5">
          {QR_STYLES.map((style) => {
            const isActive = data.qrStyle === style.id;
            const previewFg = style.fg === 'primary' ? data.primaryColor || '#000' : style.fg;
            return (
              <Button
                key={style.id}
                type="button"
                variant="outline"
                onClick={() => updateData({ qrStyle: style.id })}
                className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all p-0 ${
                  isActive ? 'border-accent ' : 'border-app-border hover:border-app-border-hover'
                }`}
                style={{ backgroundColor: style.bg }}
              >
                <div className="w-5 h-5 rounded-md" style={{ backgroundColor: previewFg }} />
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

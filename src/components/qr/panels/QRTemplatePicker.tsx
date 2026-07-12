'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type QRDesignConfig, type QRTemplateId } from '@/types/qr-design.types';

const TEMPLATE_IDS: QRTemplateId[] = ['minimal', 'carte', 'chevalet'];

interface QRTemplatePickerProps {
  config: QRDesignConfig;
  setTemplate: (id: QRTemplateId) => void;
}

/** Three-template picker: name + one-line description, selected state. */
export function QRTemplatePicker({ config, setTemplate }: QRTemplatePickerProps) {
  const t = useTranslations('qrCodes');
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {TEMPLATE_IDS.map((id) => {
        const selected = config.templateId === id;
        return (
          <Button
            key={id}
            type="button"
            variant="outline"
            onClick={() => setTemplate(id)}
            className={`relative flex flex-col items-start gap-1 p-4 h-auto whitespace-normal text-left rounded-xl border ${
              selected
                ? 'border-accent bg-accent/5'
                : 'border-app-border hover:border-app-text-muted'
            }`}
          >
            {selected && (
              <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                <Check className="h-2.5 w-2.5 text-accent-text" />
              </span>
            )}
            <span className="text-sm font-medium text-app-text">{t(`template_${id}_name`)}</span>
            <span className="text-xs text-app-text-muted leading-snug">
              {t(`template_${id}_desc`)}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

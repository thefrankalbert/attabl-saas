'use client';

import { Check } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FeatureGate } from '@/components/qr/FeatureGate';
import type { QRDesignConfig, QRTemplateId } from '@/types/qr-design.types';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { TEMPLATE_IDS, FREE_TEMPLATES } from './constants';

interface TemplateTabProps {
  config: QRDesignConfig;
  setTemplate: (templateId: QRTemplateId) => void;
}

export function TemplateTab({ config, setTemplate }: TemplateTabProps) {
  return (
    <TabsContent value="template" className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {TEMPLATE_IDS.map((id) => {
          const defaults = TEMPLATE_DEFAULTS[id];
          const isSelected = config.templateId === id;
          const isFree = FREE_TEMPLATES.includes(id);

          const card = (
            <Button
              key={id}
              type="button"
              variant="outline"
              onClick={() => setTemplate(id)}
              className={`
                relative flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left
                h-auto whitespace-normal
                ${isSelected ? 'border-accent bg-app-bg' : 'border-app-border hover:border-app-text-muted bg-app-card'}
              `}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{
                  backgroundColor: isSelected ? '#111827' : '#9CA3AF',
                }}
              >
                {defaults.width}
              </div>
              <span className="text-sm font-semibold text-app-text">{defaults.name}</span>
              <span className="text-xs text-app-text-muted leading-tight">
                {defaults.description}
              </span>
            </Button>
          );

          if (isFree) {
            return card;
          }

          return (
            <FeatureGate key={id} feature="canAccessQrCustomization">
              {card}
            </FeatureGate>
          );
        })}
      </div>
    </TabsContent>
  );
}

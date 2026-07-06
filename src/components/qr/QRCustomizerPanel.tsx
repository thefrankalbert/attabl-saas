'use client';

import { useTranslations } from 'next-intl';
import { Layout, Palette, Type } from 'lucide-react';
import { QRTemplatePicker } from '@/components/qr/panels/QRTemplatePicker';
import { QRStyleControls } from '@/components/qr/panels/QRStyleControls';
import { QRContentControls } from '@/components/qr/panels/QRContentControls';
import type { QRDesignConfig, QRTemplateId } from '@/types/qr-design.types';

interface QRCustomizerPanelProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
  setTemplate: (templateId: QRTemplateId) => void;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-app-card rounded-xl border border-app-border p-4 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-app-text-secondary">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * QR customizer - a clean, Linear-style stack of three sections (template, QR
 * style, card content). Replaces the old 5-tab, gradient/background-image panel.
 */
export function QRCustomizerPanel({ config, updateField, setTemplate }: QRCustomizerPanelProps) {
  const t = useTranslations('qrCodes');

  return (
    <div className="space-y-4">
      <Section
        icon={<Layout className="h-4 w-4 text-app-text-muted" />}
        title={t('templateSection')}
      >
        <QRTemplatePicker config={config} setTemplate={setTemplate} />
      </Section>

      <Section icon={<Palette className="h-4 w-4 text-app-text-muted" />} title={t('styleSection')}>
        <QRStyleControls config={config} updateField={updateField} />
      </Section>

      <Section icon={<Type className="h-4 w-4 text-app-text-muted" />} title={t('cardSection')}>
        <QRContentControls config={config} updateField={updateField} />
      </Section>
    </div>
  );
}

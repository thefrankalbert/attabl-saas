'use client';

import { Layout, QrCode, Palette, Type, Settings2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { QRDesignConfig, QRTemplateId } from '@/types/qr-design.types';
import { TemplateTab } from '@/components/qr/qr-customizer/TemplateTab';
import { QrCodeTab } from '@/components/qr/qr-customizer/QrCodeTab';
import { DesignTab } from '@/components/qr/qr-customizer/DesignTab';
import { TextTab } from '@/components/qr/qr-customizer/TextTab';
import { AdvancedTab } from '@/components/qr/qr-customizer/AdvancedTab';

// --- Types ---------------------------------------------

interface QRCustomizerPanelProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
  setTemplate: (templateId: QRTemplateId) => void;
  tenantLogoUrl?: string;
}

// --- Component -----------------------------------------

export function QRCustomizerPanel({
  config,
  updateField,
  setTemplate,
  tenantLogoUrl,
}: QRCustomizerPanelProps) {
  return (
    <div className="bg-app-card rounded-xl border border-app-border p-4">
      <Tabs defaultValue="template">
        {/* Tab triggers */}
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="template" className="flex items-center gap-1.5 text-xs">
            <Layout className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Template</span>
          </TabsTrigger>
          <TabsTrigger value="qrcode" className="flex items-center gap-1.5 text-xs">
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">QR Code</span>
          </TabsTrigger>
          <TabsTrigger value="design" className="flex items-center gap-1.5 text-xs">
            <Palette className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Design</span>
          </TabsTrigger>
          <TabsTrigger value="text" className="flex items-center gap-1.5 text-xs">
            <Type className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Texte</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Avancé</span>
          </TabsTrigger>
        </TabsList>

        {/* -------------------------- Tab 1: Template -------------------------- */}
        <TemplateTab config={config} setTemplate={setTemplate} />

        {/* -------------------------- Tab 2: QR Code --------------------------- */}
        <QrCodeTab config={config} updateField={updateField} tenantLogoUrl={tenantLogoUrl} />

        {/* -------------------------- Tab 3: Design ---------------------------- */}
        <DesignTab config={config} updateField={updateField} />

        {/* -------------------------- Tab 4: Text ------------------------------ */}
        <TextTab config={config} updateField={updateField} />

        {/* -------------------------- Tab 5: Advanced -------------------------- */}
        <AdvancedTab config={config} updateField={updateField} />
      </Tabs>
    </div>
  );
}

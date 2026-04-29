'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UnitInput } from './UnitInput';
import { VersoOptions } from './VersoOptions';
import type { ChevaletConfig, UnitSystem } from '@/types/supports.types';

interface ChevaletControlsProps {
  config: ChevaletConfig;
  unit: UnitSystem;
  onUnitChange: (u: UnitSystem) => void;
  onChange: (patch: Partial<ChevaletConfig>) => void;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 pb-1.5 border-b border-app-border/50">
      {title}
    </p>
  );
}

export function ChevaletControls({ config, unit, onUnitChange, onChange }: ChevaletControlsProps) {
  const t = useTranslations('sidebar.supports');

  return (
    <div className="flex flex-col gap-5 px-4 py-4 overflow-y-auto h-full">
      {/* Selecteur d'unites */}
      <div className="flex items-center gap-1 p-1 bg-app-elevated rounded-xl self-start">
        {(['cm', 'mm', 'px'] as UnitSystem[]).map((u) => (
          <Button
            key={u}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onUnitChange(u)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors h-auto ${
              unit === u
                ? 'bg-app-card text-app-text shadow-sm'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            {u}
          </Button>
        ))}
      </div>

      {/* Fond */}
      <div>
        <SectionHeader title={t('sectionBackground')} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-app-text-secondary mb-1 block">
              {t('labelBackground')}
            </Label>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg border border-app-border shrink-0"
                style={{ backgroundColor: config.background }}
              />
              <Input
                value={config.background}
                onChange={(e) => onChange({ background: e.target.value })}
                className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-app-text-secondary mb-1 block">{t('labelAccent')}</Label>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg border border-app-border shrink-0"
                style={{ backgroundColor: config.accentColor }}
              />
              <Input
                value={config.accentColor}
                onChange={(e) => onChange({ accentColor: e.target.value })}
                className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logo */}
      <div>
        <SectionHeader title={t('sectionLogo')} />
        <div className="flex items-center gap-2 mb-3">
          <Switch
            checked={config.logo.visible}
            onCheckedChange={(v) => onChange({ logo: { ...config.logo, visible: v } })}
          />
          <Label className="text-xs text-app-text-secondary">{t('labelVisible')}</Label>
        </div>
        {config.logo.visible && (
          <div className="grid grid-cols-3 gap-2">
            <UnitInput
              label={t('labelX')}
              valueCm={config.logo.x}
              onChange={(v) => onChange({ logo: { ...config.logo, x: v } })}
              unit={unit}
              maxCm={21.7}
            />
            <UnitInput
              label={t('labelY')}
              valueCm={config.logo.y}
              onChange={(v) => onChange({ logo: { ...config.logo, y: v } })}
              unit={unit}
              maxCm={11}
            />
            <UnitInput
              label={t('labelWidth')}
              valueCm={config.logo.width}
              onChange={(v) => onChange({ logo: { ...config.logo, width: v } })}
              unit={unit}
              minCm={0.5}
              maxCm={10}
            />
          </div>
        )}
      </div>

      {/* Nom */}
      <div>
        <SectionHeader title={t('sectionName')} />
        <div className="flex items-center gap-2 mb-3">
          <Switch
            checked={config.name.visible}
            onCheckedChange={(v) => onChange({ name: { ...config.name, visible: v } })}
          />
          <Label className="text-xs text-app-text-secondary">{t('labelVisible')}</Label>
        </div>
        {config.name.visible && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-app-text-secondary mb-1 block">{t('labelText')}</Label>
              <Input
                value={config.name.text}
                onChange={(e) => onChange({ name: { ...config.name, text: e.target.value } })}
                maxLength={100}
                className="h-8 text-xs bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <UnitInput
                label={t('labelX')}
                valueCm={config.name.x}
                onChange={(v) => onChange({ name: { ...config.name, x: v } })}
                unit={unit}
              />
              <UnitInput
                label={t('labelY')}
                valueCm={config.name.y}
                onChange={(v) => onChange({ name: { ...config.name, y: v } })}
                unit={unit}
                maxCm={11}
              />
              <div>
                <Label className="text-xs text-app-text-secondary mb-1 block">
                  {t('labelFontSize')} (pt)
                </Label>
                <Input
                  type="number"
                  value={config.name.fontSize}
                  min={8}
                  max={72}
                  onChange={(e) =>
                    onChange({
                      name: { ...config.name, fontSize: parseInt(e.target.value, 10) || 18 },
                    })
                  }
                  className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tagline */}
      <div>
        <SectionHeader title={t('sectionTagline')} />
        <div className="flex items-center gap-2 mb-3">
          <Switch
            checked={config.tagline.visible}
            onCheckedChange={(v) => onChange({ tagline: { ...config.tagline, visible: v } })}
          />
          <Label className="text-xs text-app-text-secondary">{t('labelVisible')}</Label>
        </div>
        {config.tagline.visible && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-app-text-secondary mb-1 block">{t('labelText')}</Label>
              <Input
                value={config.tagline.text}
                onChange={(e) => onChange({ tagline: { ...config.tagline, text: e.target.value } })}
                maxLength={200}
                className="h-8 text-xs bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <UnitInput
                label={t('labelX')}
                valueCm={config.tagline.x}
                onChange={(v) => onChange({ tagline: { ...config.tagline, x: v } })}
                unit={unit}
              />
              <UnitInput
                label={t('labelY')}
                valueCm={config.tagline.y}
                onChange={(v) => onChange({ tagline: { ...config.tagline, y: v } })}
                unit={unit}
                maxCm={11}
              />
              <div>
                <Label className="text-xs text-app-text-secondary mb-1 block">
                  {t('labelFontSize')} (pt)
                </Label>
                <Input
                  type="number"
                  value={config.tagline.fontSize}
                  min={6}
                  max={36}
                  onChange={(e) =>
                    onChange({
                      tagline: { ...config.tagline, fontSize: parseInt(e.target.value, 10) || 10 },
                    })
                  }
                  className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* QR Code */}
      <div>
        <SectionHeader title={t('sectionQr')} />
        <div className="grid grid-cols-3 gap-2">
          <UnitInput
            label={t('labelX')}
            valueCm={config.qrCode.x}
            onChange={(v) => onChange({ qrCode: { ...config.qrCode, x: v } })}
            unit={unit}
          />
          <UnitInput
            label={t('labelY')}
            valueCm={config.qrCode.y}
            onChange={(v) => onChange({ qrCode: { ...config.qrCode, y: v } })}
            unit={unit}
            maxCm={11}
          />
          <UnitInput
            label={t('labelWidth')}
            valueCm={config.qrCode.width}
            onChange={(v) => onChange({ qrCode: { ...config.qrCode, width: v } })}
            unit={unit}
            minCm={2}
            maxCm={10}
          />
        </div>
      </div>

      {/* Verso */}
      <div>
        <SectionHeader title={t('sectionVerso')} />
        <VersoOptions value={config.verso} onChange={(v) => onChange({ verso: v })} />
      </div>
    </div>
  );
}

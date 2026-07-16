'use client';

import { useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { fileToResizedDataUrl } from '@/lib/qr/resize-image';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorPicker } from '@/components/qr/ColorPicker';
import {
  CTA_PRESETS,
  CTA_MAX_LENGTH,
  type QRDesignConfig,
  type QRCTAPreset,
} from '@/types/qr-design.types';

interface QRContentControlsProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
}

const CTA_PRESET_KEYS = (Object.keys(CTA_PRESETS) as QRCTAPreset[]).filter((k) => k !== 'custom');

/** Card content: accent + text colors, centered logo, call-to-action, Attabl mention. */
export function QRContentControls({ config, updateField }: QRContentControlsProps) {
  const t = useTranslations('qrCodes');
  const fileRef = useRef<HTMLInputElement>(null);

  const onLogoFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.error(t('logoInvalidType'));
        return;
      }
      // 5 MB raw cap before we even decode; the file is downscaled to a small
      // PNG so the stored data URL stays well under the schema size limit.
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('logoTooLarge'));
        return;
      }
      try {
        const src = await fileToResizedDataUrl(file);
        updateField('logo', { ...config.logo, src, enabled: true });
      } catch {
        toast.error(t('logoUploadError'));
      }
    },
    [config.logo, updateField, t],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Minimal has no accented element, so its accent control would be a
            no-op - only show it for templates that render the accent color. */}
        {config.templateId !== 'minimal' && (
          <ColorPicker
            label={t('accentColor')}
            value={config.templateAccentColor}
            onChange={(c) => updateField('templateAccentColor', c)}
          />
        )}
        <ColorPicker
          label={t('textColor')}
          value={config.templateTextColor}
          onChange={(c) => updateField('templateTextColor', c)}
        />
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="qr-logo" className="cursor-pointer">
              {t('logoLabel')}
            </Label>
            <p className="text-xs text-app-text-muted">{t('logoHint')}</p>
          </div>
          <Switch
            id="qr-logo"
            checked={config.logo.enabled}
            onCheckedChange={(v) => updateField('logo', { ...config.logo, enabled: v })}
          />
        </div>
        {config.logo.enabled && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              {t('uploadLogo')}
            </Button>
            {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onLogoFile}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* CTA */}
      <div className="space-y-1.5">
        <Label htmlFor="qr-cta-preset" className="text-xs text-app-text-secondary">
          {t('ctaLabel')}
        </Label>
        <Select
          value={config.ctaPreset}
          onValueChange={(v) => {
            const preset = v as QRCTAPreset;
            updateField('ctaPreset', preset);
            if (preset !== 'custom') updateField('ctaText', CTA_PRESETS[preset]);
          }}
        >
          <SelectTrigger id="qr-cta-preset" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CTA_PRESET_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {CTA_PRESETS[k]}
              </SelectItem>
            ))}
            <SelectItem value="custom">{t('ctaCustom')}</SelectItem>
          </SelectContent>
        </Select>
        {config.ctaPreset === 'custom' && (
          <Input
            value={config.ctaText}
            maxLength={CTA_MAX_LENGTH}
            placeholder={t('ctaCustom')}
            onChange={(e) => updateField('ctaText', e.target.value)}
          />
        )}
      </div>

      {/* Powered by */}
      <div className="flex items-center justify-between">
        <Label htmlFor="qr-powered" className="cursor-pointer">
          {t('poweredByLabel')}
        </Label>
        <Switch
          id="qr-powered"
          checked={config.showPoweredBy}
          onCheckedChange={(v) => updateField('showPoweredBy', v)}
        />
      </div>
    </div>
  );
}

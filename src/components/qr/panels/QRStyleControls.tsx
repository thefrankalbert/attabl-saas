'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorPicker } from '@/components/qr/ColorPicker';
import type {
  QRDesignConfig,
  QRDotStyle,
  QRCornerStyle,
  QRErrorCorrectionLevel,
} from '@/types/qr-design.types';

interface QRStyleControlsProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
}

const DOT_STYLES: QRDotStyle[] = ['square', 'rounded', 'dots', 'classy', 'extra-rounded'];
const CORNER_STYLES: QRCornerStyle[] = ['square', 'rounded', 'dot'];
const EC_LEVELS: QRErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

/** QR rendering style: dot shape, corner shape, foreground/background, error correction. */
export function QRStyleControls({ config, updateField }: QRStyleControlsProps) {
  const t = useTranslations('qrCodes');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-app-text-secondary">{t('dotStyleLabel')}</Label>
          <Select
            value={config.qrDotStyle}
            onValueChange={(v) => updateField('qrDotStyle', v as QRDotStyle)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOT_STYLES.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`dot_${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-app-text-secondary">{t('cornerStyleLabel')}</Label>
          <Select
            value={config.qrCornerStyle}
            onValueChange={(v) => updateField('qrCornerStyle', v as QRCornerStyle)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CORNER_STYLES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`corner_${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ColorPicker
          label={t('qrColor')}
          value={config.qrFgColor}
          onChange={(c) => updateField('qrFgColor', c)}
        />
        <ColorPicker
          label={t('qrBgColorLabel')}
          value={config.qrBgColor}
          onChange={(c) => updateField('qrBgColor', c)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-app-text-secondary">{t('errorCorrectionLabel')}</Label>
        <Select
          value={config.errorCorrection}
          onValueChange={(v) => updateField('errorCorrection', v as QRErrorCorrectionLevel)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EC_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {t(`ec_${l}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

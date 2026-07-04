import type {
  QRTemplateId,
  QRCTAPreset,
  QRErrorCorrectionLevel,
  QRShadowIntensity,
} from '@/types/qr-design.types';
import { CTA_PRESETS } from '@/types/qr-design.types';

// --- Constants -----------------------------------------

export const TEMPLATE_IDS: QRTemplateId[] = [
  'standard',
  'chevalet',
  'carte',
  'minimal',
  'elegant',
  'neon',
];

export const FREE_TEMPLATES: QRTemplateId[] = ['standard', 'chevalet', 'carte'];

export const ERROR_CORRECTION_LEVELS: {
  value: QRErrorCorrectionLevel;
  label: string;
}[] = [
  { value: 'L', label: 'Basse (7%)' },
  { value: 'M', label: 'Moyenne (15%)' },
  { value: 'Q', label: 'Haute (25%)' },
  { value: 'H', label: 'Max (30%)' },
];

export const SHADOW_OPTIONS: { value: QRShadowIntensity; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'light', label: 'Légère' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'strong', label: 'Forte' },
];

export const CTA_PRESET_ENTRIES = (Object.entries(CTA_PRESETS) as [QRCTAPreset, string][]).filter(
  ([key]) => key !== 'custom',
);

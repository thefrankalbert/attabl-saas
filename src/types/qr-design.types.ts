/**
 * QR Design Types & Constants
 *
 * All types, interfaces, constants, and factory functions for the QR Customizer.
 * This is the single source of truth for QR design configuration.
 */

// Base Types

export type QRTemplateId = 'standard' | 'chevalet' | 'carte' | 'minimal' | 'elegant' | 'neon';

export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export type QRShadowIntensity = 'none' | 'light' | 'medium' | 'strong';

export type QRExportFormat = 'pdf' | 'png' | 'svg';

export type QRCTAPreset =
  | 'scannez-commander'
  | 'scannez-menu'
  | 'scannez-decouvrir'
  | 'scannez-carte'
  | 'custom';

// Config Interfaces

export interface QRLogoConfig {
  enabled: boolean;
  src: string;
  width: number;
  height: number;
  excavate: boolean;
  opacity: number;
}

export interface QRGradientConfig {
  enabled: boolean;
  colorStart: string;
  colorEnd: string;
  angle: number;
}

export interface QRDesignConfig {
  templateId: QRTemplateId;
  qrFgColor: string;
  qrBgColor: string;
  errorCorrection: QRErrorCorrectionLevel;
  qrSize: number;
  marginSize: number;
  logo: QRLogoConfig;
  templateWidth: number;
  templateHeight: number;
  cornerRadius: number;
  padding: number;
  shadow: QRShadowIntensity;
  templateBgColor: string;
  templateAccentColor: string;
  templateTextColor: string;
  gradient: QRGradientConfig;
  backgroundImage: { enabled: boolean; src: string; opacity: number };
  ctaPreset: QRCTAPreset;
  ctaText: string;
  descriptionText: string;
  footerText: string;
  showPoweredBy: boolean;
  fontFamily: string;
  exportFormat: QRExportFormat;
}

// Template Props

export interface QRTemplateProps {
  config: QRDesignConfig;
  url: string;
  tenantName: string;
  tableName?: string;
  logoUrl?: string;
}

// Template Defaults

export interface QRTemplateDefault {
  width: number;
  height: number;
  qrSize: number;
  orientation: 'portrait' | 'landscape';
  name: string;
  description: string;
  planRequired: 'essentiel' | 'premium';
}

export const TEMPLATE_DEFAULTS: Record<QRTemplateId, QRTemplateDefault> = {
  standard: {
    width: 100,
    height: 100,
    qrSize: 200,
    orientation: 'landscape',
    name: 'Standard',
    description: 'Format carré 10×10 cm',
    planRequired: 'essentiel',
  },
  chevalet: {
    width: 105,
    height: 148,
    qrSize: 170,
    orientation: 'portrait',
    name: 'Chevalet',
    description: 'A6 vertical, pour les tables',
    planRequired: 'essentiel',
  },
  carte: {
    width: 85,
    height: 55,
    qrSize: 100,
    orientation: 'landscape',
    name: 'Carte',
    description: 'Format carte de visite',
    planRequired: 'essentiel',
  },
  minimal: {
    width: 100,
    height: 100,
    qrSize: 220,
    orientation: 'landscape',
    name: 'Minimal',
    description: 'Ultra-clean, sans fioritures',
    planRequired: 'premium',
  },
  elegant: {
    width: 105,
    height: 148,
    qrSize: 160,
    orientation: 'portrait',
    name: 'Élégant',
    description: 'Bordure ornementale, style serif',
    planRequired: 'premium',
  },
  neon: {
    width: 100,
    height: 120,
    qrSize: 180,
    orientation: 'portrait',
    name: 'Néon',
    description: 'Fond sombre, accent vif',
    planRequired: 'premium',
  },
} as const;

// CTA Presets

export const CTA_PRESETS: Record<QRCTAPreset, string> = {
  'scannez-commander': 'Scannez pour commander',
  'scannez-menu': 'Scannez pour voir le menu',
  'scannez-decouvrir': 'Scannez pour découvrir',
  'scannez-carte': 'Scannez notre carte',
  custom: '',
} as const;

// Shadow Classes

export const SHADOW_CLASSES: Record<QRShadowIntensity, string> = {
  none: '',
  light: 'shadow-md',
  medium: 'shadow-xl',
  strong: 'shadow-2xl',
} as const;

// Font Options

export interface FontOption {
  value: string;
  label: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: 'Geist', label: 'Geist' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Lora', label: 'Lora' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Raleway', label: 'Raleway' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Roboto Slab', label: 'Roboto Slab' },
] as const;

// Factory Function

export function createDefaultQRDesignConfig(
  primaryColor: string,
  secondaryColor: string,
): QRDesignConfig {
  return {
    templateId: 'standard',
    qrFgColor: '#000000',
    qrBgColor: '#FFFFFF',
    errorCorrection: 'M',
    qrSize: 200,
    marginSize: 4,
    logo: {
      enabled: false,
      src: '',
      width: 50,
      height: 50,
      excavate: true,
      opacity: 1,
    },
    templateWidth: 100,
    templateHeight: 100,
    cornerRadius: 12,
    padding: 24,
    shadow: 'medium',
    templateBgColor: '#FFFFFF',
    templateAccentColor: primaryColor,
    templateTextColor: '#1F2937',
    gradient: {
      enabled: false,
      colorStart: primaryColor,
      colorEnd: secondaryColor,
      angle: 135,
    },
    backgroundImage: {
      enabled: false,
      src: '',
      opacity: 0.1,
    },
    ctaPreset: 'scannez-commander',
    ctaText: CTA_PRESETS['scannez-commander'],
    descriptionText: '',
    footerText: '',
    showPoweredBy: true,
    fontFamily: 'Geist',
    exportFormat: 'pdf',
  };
}

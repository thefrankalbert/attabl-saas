/**
 * QR Design Types & Constants
 *
 * All types, interfaces, constants, and factory functions for the QR Customizer.
 * This is the single source of truth for QR design configuration.
 */

// Base Types

// Three refined, Linear-style templates. The old gimmicky set
// (standard/elegant/neon) was replaced by a tight professional set.
export type QRTemplateId = 'minimal' | 'carte' | 'chevalet';

export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

// qr-code-styling rendering options for a premium look (rounded dots, styled corners).
export type QRDotStyle = 'square' | 'rounded' | 'dots' | 'classy' | 'extra-rounded';
export type QRCornerStyle = 'square' | 'rounded' | 'dot';

type QRExportFormat = 'pdf' | 'png' | 'svg';

export type QRCTAPreset =
  | 'scannez-commander'
  | 'scannez-menu'
  | 'scannez-decouvrir'
  | 'scannez-carte'
  | 'custom';

// Print / card format

export type QRCardFormatId =
  | 'standard-25x13'
  | 'square-10'
  | 'a6-chevalet'
  | 'business-card'
  | 'bare'
  | 'custom';

// How many cards are placed on one A4 sheet. 'auto' fills the page.
export type QRPerPage = 1 | 2 | 4 | 'auto';

export interface QRPrintLayout {
  // Physical card format. Drives templateWidth/Height when not 'custom'.
  cardFormat: QRCardFormatId;
  // Tiling on A4 at export time (design format vs print format).
  perPage: QRPerPage;
  // Emit just the raw QR code with no card chrome.
  bareQr: boolean;
  // Optional short message printed under the code.
  message: { enabled: boolean; text: string };
}

export interface QRCardFormatPreset {
  width: number; // mm
  height: number; // mm
  label: string;
}

// Card presets in millimetres. The standard ATTABL card is 25x13 cm.
export const CARD_FORMAT_PRESETS: Record<QRCardFormatId, QRCardFormatPreset> = {
  'standard-25x13': { width: 250, height: 130, label: 'Standard 25x13 cm' },
  'square-10': { width: 100, height: 100, label: 'Carre 10x10 cm' },
  'a6-chevalet': { width: 105, height: 148, label: 'Chevalet A6' },
  'business-card': { width: 85, height: 55, label: 'Carte de visite' },
  bare: { width: 60, height: 60, label: 'QR nu' },
  custom: { width: 100, height: 100, label: 'Personnalise' },
} as const;

export const QR_MESSAGE_MAX_LENGTH = 280;

// Config Interfaces

interface QRLogoConfig {
  enabled: boolean;
  src: string;
  width: number;
  height: number;
  excavate: boolean;
  opacity: number;
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
  templateBgColor: string;
  templateAccentColor: string;
  templateTextColor: string;
  ctaPreset: QRCTAPreset;
  ctaText: string;
  showPoweredBy: boolean;
  fontFamily: string;
  exportFormat: QRExportFormat;
  printLayout: QRPrintLayout;
  qrDotStyle: QRDotStyle;
  qrCornerStyle: QRCornerStyle;
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
  planRequired: 'starter' | 'pro';
}

// Display name/description live in i18n (qrCodes.template_<id>_name/_desc),
// resolved by QRTemplatePicker - not here, so they translate.
export const TEMPLATE_DEFAULTS: Record<QRTemplateId, QRTemplateDefault> = {
  minimal: {
    width: 100,
    height: 100,
    qrSize: 220,
    orientation: 'portrait',
    planRequired: 'starter',
  },
  carte: {
    width: 100,
    height: 130,
    qrSize: 200,
    orientation: 'portrait',
    planRequired: 'starter',
  },
  chevalet: {
    width: 105,
    height: 148,
    qrSize: 180,
    orientation: 'portrait',
    planRequired: 'starter',
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

// Factory Function

export function createDefaultQRDesignConfig(primaryColor: string): QRDesignConfig {
  return {
    templateId: 'minimal',
    qrFgColor: '#000000',
    qrBgColor: '#FFFFFF',
    errorCorrection: 'M',
    qrSize: 220,
    marginSize: 2,
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
    cornerRadius: 10,
    padding: 24,
    templateBgColor: '#FFFFFF',
    templateAccentColor: primaryColor,
    templateTextColor: '#111111',
    ctaPreset: 'scannez-commander',
    ctaText: CTA_PRESETS['scannez-commander'],
    showPoweredBy: true,
    fontFamily: 'Geist',
    exportFormat: 'pdf',
    printLayout: {
      cardFormat: 'square-10',
      perPage: 'auto',
      bareQr: false,
      message: { enabled: false, text: '' },
    },
    qrDotStyle: 'rounded',
    qrCornerStyle: 'rounded',
  };
}

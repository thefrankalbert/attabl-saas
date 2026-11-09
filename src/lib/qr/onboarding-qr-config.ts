import type { QRDesignConfig, QRTemplateId } from '@/types/qr-design.types';
import {
  createDefaultQRDesignConfig,
  QR_MESSAGE_MAX_LENGTH,
  TEMPLATE_DEFAULTS,
} from '@/types/qr-design.types';

/**
 * The onboarding fields this conversion reads. A structural subset, so the
 * client preview (OnboardingData) and the server completion
 * (OnboardingCompleteData) feed the SAME function: what the restaurateur sees
 * in the preview is exactly what gets saved as their QR design.
 */
export interface OnboardingQrInput {
  qrTemplate?: string;
  qrStyle?: string;
  qrCta?: string;
  qrDescription?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
}

/** QR style → fg/bg color mapping */
const QR_STYLE_COLORS: Record<string, { fg: string; bg: string }> = {
  classic: { fg: '#000000', bg: '#FFFFFF' },
  branded: { fg: 'primary', bg: '#FFFFFF' },
  inverted: { fg: '#FFFFFF', bg: '#000000' },
  dark: { fg: '#FFFFFF', bg: '#1a1a1a' },
};

// Map any legacy onboarding template id (from an old saved draft) onto the
// current three-template set so TEMPLATE_DEFAULTS lookups never miss.
export function coerceTemplateId(id: string): QRTemplateId {
  if (id === 'minimal' || id === 'carte' || id === 'chevalet') return id;
  if (id === 'elegant') return 'chevalet';
  return 'minimal';
}

/**
 * Converts the onboarding QR choices into a QRDesignConfig that can be passed
 * to real template components from the TEMPLATE_REGISTRY, and saved as the
 * tenant's default qr_designs row.
 */
export function onboardingDataToQRConfig(
  data: OnboardingQrInput,
  templateOverride?: QRTemplateId,
): QRDesignConfig {
  const templateId: QRTemplateId = templateOverride ?? coerceTemplateId(String(data.qrTemplate));
  const primary = data.primaryColor || '#CCFF00';
  const secondary = data.secondaryColor || '#000000';

  const base = createDefaultQRDesignConfig(primary);
  const defaults = TEMPLATE_DEFAULTS[templateId];

  // Resolve QR fg/bg colors
  const styleKey = data.qrStyle || 'branded';
  const styleColors = QR_STYLE_COLORS[styleKey] ?? QR_STYLE_COLORS.branded;
  const qrFg = styleColors.fg === 'primary' ? primary : styleColors.fg;
  const qrBg = styleColors.bg;

  // Same scheme rule as the saved design (qr-design.schema.ts logo.src): a logo
  // the save would refuse is left out instead of failing the whole design.
  const rawLogo = data.logoUrl || '';
  const logoSrc = rawLogo.startsWith('https://') || /^data:image\//.test(rawLogo) ? rawLogo : '';
  const logoEnabled = logoSrc !== '';
  // The onboarding "description" is the short message printed under the code
  // (printLayout.message). It used to be typed and then dropped.
  const message = (data.qrDescription || '').trim().slice(0, QR_MESSAGE_MAX_LENGTH);

  return {
    ...base,
    templateId,
    errorCorrection: logoEnabled ? 'H' : base.errorCorrection,
    qrFgColor: qrFg,
    qrBgColor: qrBg,
    qrSize: defaults.qrSize,
    templateWidth: defaults.width,
    templateHeight: defaults.height,
    templateAccentColor: primary,
    templateBgColor: secondary,
    templateTextColor: '#FFFFFF',
    ctaText: data.qrCta || '',
    logo: {
      enabled: logoEnabled,
      src: logoSrc,
      width: 50,
      height: 50,
      excavate: true,
      opacity: 1,
    },
    showPoweredBy: true,
    fontFamily: 'Geist',
    printLayout: {
      ...base.printLayout,
      message: { enabled: message.length > 0, text: message },
    },
  };
}

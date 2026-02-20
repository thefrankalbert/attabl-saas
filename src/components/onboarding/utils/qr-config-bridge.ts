import type { QRDesignConfig, QRTemplateId } from '@/types/qr-design.types';
import { createDefaultQRDesignConfig, TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import type { OnboardingData } from '@/app/onboarding/page';

/** QR style → fg/bg color mapping */
const QR_STYLE_COLORS: Record<string, { fg: string; bg: string }> = {
  classic: { fg: '#000000', bg: '#FFFFFF' },
  branded: { fg: 'primary', bg: '#FFFFFF' },
  inverted: { fg: '#FFFFFF', bg: '#000000' },
  dark: { fg: '#FFFFFF', bg: '#1a1a1a' },
};

/**
 * Converts OnboardingData into a QRDesignConfig that can be
 * passed to real template components from the TEMPLATE_REGISTRY.
 */
export function onboardingDataToQRConfig(
  data: OnboardingData,
  templateOverride?: QRTemplateId,
): QRDesignConfig {
  const templateId: QRTemplateId = templateOverride ?? (data.qrTemplate as QRTemplateId);
  const primary = data.primaryColor || '#CCFF00';
  const secondary = data.secondaryColor || '#000000';

  const base = createDefaultQRDesignConfig(primary, secondary);
  const defaults = TEMPLATE_DEFAULTS[templateId];

  // Resolve QR fg/bg colors
  const styleKey = data.qrStyle || 'branded';
  const styleColors = QR_STYLE_COLORS[styleKey] ?? QR_STYLE_COLORS.branded;
  const qrFg = styleColors.fg === 'primary' ? primary : styleColors.fg;
  const qrBg = styleColors.bg;

  return {
    ...base,
    templateId,
    qrFgColor: qrFg,
    qrBgColor: qrBg,
    qrSize: defaults.qrSize,
    templateWidth: defaults.width,
    templateHeight: defaults.height,
    templateAccentColor: primary,
    templateBgColor: secondary,
    templateTextColor: '#FFFFFF',
    ctaText: data.qrCta || '',
    descriptionText: data.qrDescription || '',
    logo: {
      enabled: !!data.logoUrl,
      src: data.logoUrl || '',
      width: 50,
      height: 50,
      excavate: true,
      opacity: 1,
    },
    shadow: 'none',
    showPoweredBy: true,
    fontFamily: 'Geist',
  };
}

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
  // Custom colors (qrCustomFgColor, qrCustomBgColor) take precedence over qrStyle preset.
  // Use `||` (not `??`) so an empty string from a cleared input falls back to the preset.
  const styleKey = data.qrStyle || 'branded';
  const styleColors = QR_STYLE_COLORS[styleKey] ?? QR_STYLE_COLORS.branded;
  const qrFg = data.qrCustomFgColor || (styleColors.fg === 'primary' ? primary : styleColors.fg);
  const qrBg = data.qrCustomBgColor || styleColors.bg;

  // Resolve dimensions: custom support dimensions take precedence over template defaults.
  // Use `||` to also fallback when a user clears the input (NaN/0 -> default).
  const supportWidth = data.qrSupportWidth || defaults.width;
  const supportHeight = data.qrSupportHeight || defaults.height;

  // Card background: user choice > white default. NEVER force the brand secondary color.
  // Templates would impose dark/colored cards otherwise (most users want a clean white card).
  const cardBg = data.qrCustomCardBgColor || '#FFFFFF';

  // Logo on QR: explicit toggle. Default ON only if user has uploaded a logo.
  // Once user has explicitly set qrShowLogo=false, respect that choice.
  const logoEnabled = data.qrShowLogo === false ? false : !!data.logoUrl;

  // Text color auto-adapts to card background for readability
  const textColor = isLightColor(cardBg) ? '#1A1A1A' : '#FFFFFF';

  return {
    ...base,
    templateId,
    qrFgColor: qrFg,
    qrBgColor: qrBg,
    qrSize: defaults.qrSize,
    templateWidth: supportWidth,
    templateHeight: supportHeight,
    templateAccentColor: primary,
    templateBgColor: cardBg,
    templateTextColor: textColor,
    ctaText: data.qrCta || '',
    descriptionText: data.qrDescription || '',
    logo: {
      enabled: logoEnabled,
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

/**
 * Returns true if a hex color is light (luminance > 0.6).
 * Used to pick contrasting text color on the card.
 * Returns true for 'transparent' (assume light backdrop).
 */
function isLightColor(hex: string): boolean {
  if (hex === 'transparent' || !hex.startsWith('#')) return true;
  const clean = hex.replace('#', '');
  if (clean.length !== 3 && clean.length !== 6) return true;
  const expanded =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6;
}

import { describe, it, expect } from 'vitest';
import { onboardingDataToQRConfig } from '../qr-config-bridge';
import type { OnboardingData } from '@/app/onboarding/page';

// Minimal OnboardingData; the bridge only reads QR-related fields. Overrides is
// a loose record so tests can pass legacy/invalid qrTemplate ids (the bridge's
// coerceTemplateId is explicitly meant to handle strings outside the union).
function data(overrides: Record<string, unknown> = {}): OnboardingData {
  return { primaryColor: '#CCFF00', secondaryColor: '#111111', ...overrides } as OnboardingData;
}

describe('onboardingDataToQRConfig', () => {
  it('maps the legacy "elegant" template id onto chevalet', () => {
    expect(onboardingDataToQRConfig(data({ qrTemplate: 'elegant' })).templateId).toBe('chevalet');
  });

  it('falls back to minimal for an unknown template id', () => {
    expect(onboardingDataToQRConfig(data({ qrTemplate: 'whatever' })).templateId).toBe('minimal');
  });

  it('keeps a valid template id as-is', () => {
    expect(onboardingDataToQRConfig(data({ qrTemplate: 'carte' })).templateId).toBe('carte');
  });

  it('templateOverride wins over the data template id', () => {
    expect(onboardingDataToQRConfig(data({ qrTemplate: 'carte' }), 'minimal').templateId).toBe(
      'minimal',
    );
  });

  it('branded style resolves the QR foreground to the primary color', () => {
    const cfg = onboardingDataToQRConfig(data({ qrStyle: 'branded', primaryColor: '#123456' }));
    expect(cfg.qrFgColor).toBe('#123456');
  });

  it('classic style uses black on white', () => {
    const cfg = onboardingDataToQRConfig(data({ qrStyle: 'classic' }));
    expect(cfg.qrFgColor).toBe('#000000');
    expect(cfg.qrBgColor).toBe('#FFFFFF');
  });
});

import { describe, it, expect } from 'vitest';
import { onboardingDataToQRConfig } from '../onboarding-qr-config';
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

describe('onboardingDataToQRConfig - ce qui est enregistre comme design', () => {
  it('reporte la description sous le code (printLayout.message)', () => {
    // Saisie dans l'onboarding puis jetee: elle n'arrivait nulle part.
    const cfg = onboardingDataToQRConfig(data({ qrDescription: '  Wifi: attabl  ' }));
    expect(cfg.printLayout.message).toEqual({ enabled: true, text: 'Wifi: attabl' });
  });

  it('laisse le message desactive sans description', () => {
    expect(onboardingDataToQRConfig(data()).printLayout.message).toEqual({
      enabled: false,
      text: '',
    });
  });

  it('garde un logo https', () => {
    const cfg = onboardingDataToQRConfig(data({ logoUrl: 'https://cdn.example/logo.png' }));
    expect(cfg.logo).toMatchObject({ enabled: true, src: 'https://cdn.example/logo.png' });
  });

  it('ecarte un logo que la sauvegarde du design refuserait (http)', () => {
    const cfg = onboardingDataToQRConfig(data({ logoUrl: 'http://127.0.0.1/logo.png' }));
    expect(cfg.logo).toMatchObject({ enabled: false, src: '' });
  });

  it('produit une forme acceptee par le schema du design QR', async () => {
    const { qrDesignConfigSchema } = await import('@/lib/validations/qr-design.schema');
    const cfg = onboardingDataToQRConfig(
      data({ qrTemplate: 'chevalet', qrStyle: 'inverted', qrCta: 'Scannez', qrDescription: 'x' }),
    );
    expect(qrDesignConfigSchema.safeParse(cfg).success).toBe(true);
  });
});

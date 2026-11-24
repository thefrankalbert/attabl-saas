import { describe, it, expect, vi } from 'vitest';

// B11 (revue ligne par ligne, lot B2b-2): l'export PDF du chevalet repondait 400
// pour une couleur au format court (#RGB) ou une description de plus de 200
// caracteres, deux valeurs que les reglages du restaurant acceptent.

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));

import { buildDefaultConfig } from '../ChevaletEditor';
import { exportRequestSchema } from '@/lib/validations/supports.schema';

const tenant = {
  id: 't1',
  slug: 'resto',
  name: 'Chez Awa',
  description: 'x'.repeat(450),
  logoUrl: null,
  primaryColor: '#F80',
  secondaryColor: '#FFF',
  menuUrl: 'https://resto.attabl.com',
};

function exportOf(config: unknown) {
  return exportRequestSchema.safeParse({ config });
}

describe('chevalet: configuration par defaut exportable (B11)', () => {
  it('la configuration par defaut d un restaurant en #RGB et description longue passe l export', () => {
    const parsed = exportOf(buildDefaultConfig(tenant));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.config.background).toBe('#FF8800');
      expect(parsed.data.config.accentColor).toBe('#FFFFFF');
      expect(parsed.data.config.tagline.text).toHaveLength(200);
    }
  });

  it('une configuration deja en #RGB est convertie, pas refusee', () => {
    const cfg = { ...buildDefaultConfig({ ...tenant, description: null }), background: '#abc' };
    const parsed = exportOf(cfg);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.config.background).toBe('#AABBCC');
  });

  it('temoin: une couleur invalide reste refusee, avec le champ fautif', () => {
    const cfg = { ...buildDefaultConfig(tenant), background: '#12' };
    const parsed = exportOf(cfg);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toEqual(['config', 'background']);
  });
});

describe('chevalet: demande d export (B29)', () => {
  it('ne porte que la configuration: format, menuUrl et tenantSlug ne sont plus lus', () => {
    const parsed = exportRequestSchema.safeParse({
      config: buildDefaultConfig(tenant),
      format: 'png',
      tenantSlug: 'autre-resto',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data)).toEqual(['config']);
  });
});

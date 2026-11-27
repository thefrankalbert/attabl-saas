import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import frFR from '@/messages/fr-FR.json';
import enUS from '@/messages/en-US.json';
import { RETENTION } from '@/lib/legal/retention';

/**
 * Les textes de confidentialite doivent dire ce que fait le code (retention.ts),
 * sans promesse de conformite ni affirmation fausse (audit verif-prod 2026-11-23).
 */
const LANGS = { 'fr-FR': frFR, 'en-US': enUS };

describe.each(Object.entries(LANGS))('fenetre de confidentialite (%s)', (_lang, m) => {
  const tenantTexts = [
    m.tenant.dataCollectionDesc,
    m.tenant.usageDesc,
    m.tenant.storageDesc,
    m.tenant.rightsDesc,
  ].join(' ');

  it('ne promet ni conformite, ni absence de tiers, ni suppression a 12 mois', () => {
    expect(tenantTexts).not.toMatch(/RGPD|GDPR|12 mois|12 months|tiers|third part/i);
  });

  it('prend la duree de purge dans retention.ts (parametre, pas un nombre ecrit)', () => {
    expect(m.tenant.storageDesc).toContain('{days}');
    expect(RETENTION.guestDataDays).toBe(90);
  });
});

describe.each(Object.entries(LANGS))('politique /privacy (%s)', (_lang, m) => {
  const p = m.marketing.privacy;

  it('liste les prestataires reels ajoutes', () => {
    expect(Object.keys(p.processors)).toEqual(
      expect.arrayContaining(['anthropic', 'exchangerate', 'flutterwave']),
    );
  });

  it("ne parle plus d'une relecture de session ni d'une lettre d'information", () => {
    const all = JSON.stringify(p);
    expect(all).not.toMatch(/retentionNewsletter|newsletter|lettre d'information/i);
    expect(p.processors.sentry.role).toMatch(/replay|relecture/i);
    expect(p.processors.sentry.role).toMatch(/No session replay|Pas de relecture/);
    expect(p.cookieSentry).toMatch(/not recorded|pas enregistr/i);
  });
});

describe('champs de mot de passe', () => {
  const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

  it.each([
    ['src/app/reset-password/page.tsx', 2, 'new-password'],
    ['src/app/auth/accept-invite/page.tsx', 2, 'new-password'],
    ['src/components/admin/ScreenLock.tsx', 1, 'current-password'],
  ])('%s declare autoComplete', (f, n, valeur) => {
    const src = lire(f);
    expect(src.split(`autoComplete="${valeur}"`).length - 1).toBe(n);
  });
});

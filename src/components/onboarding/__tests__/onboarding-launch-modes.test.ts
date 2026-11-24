import { describe, it, expect } from 'vitest';
import { findZoneIssues, onboardingCompleteSchema } from '@/lib/validations/onboarding.schema';
import { derivePrefix, withUniquePrefixes, zonesForDraft } from '../tables/types';
import { describeLaunchIssues } from '../launch-issues';

/**
 * B28 (contre-audit 1): la regle du prefixe de zone ne doit s'appliquer qu'aux
 * zones que le serveur cree. Charge de lancement telle que le client l'envoie
 * (use-onboarding: tout `data`), pour chacun des trois modes.
 */
// Nom de zone en arabe ("bar"), sans aucune lettre latine.
const BAR_AR = String.fromCharCode(0x0628, 0x0627, 0x0631);
// Deux autres noms arabes ("salle", "jardin"): des noms distincts, sans lettre latine.
const SALLE_AR = String.fromCharCode(0x0642, 0x0627, 0x0639, 0x0629);
const JARDIN_AR = String.fromCharCode(0x062d, 0x062f, 0x064a, 0x0642, 0x0629);

function launch(tableConfigMode: 'complete' | 'minimum' | 'skip', tableZones: unknown[]) {
  return onboardingCompleteSchema.safeParse({
    data: {
      tenantName: 'Chez Awa',
      establishmentType: 'restaurant',
      address: '',
      city: 'Ouagadougou',
      country: 'BF',
      phone: '',
      tableCount: 10,
      language: 'fr-FR',
      currency: 'XOF',
      tableConfigMode,
      tableZones,
      logoUrl: '',
      primaryColor: '#4d7c0f',
      secondaryColor: '#000000',
      description: '',
      menuItems: [],
      qrTemplate: 'minimal',
      qrStyle: 'branded',
      qrCta: 'Scannez pour commander',
      qrDescription: '',
      tenantSlug: 'chez-awa',
    },
  });
}

const blankZone = { name: '', prefix: '', tableCount: 10, defaultCapacity: 2 };

describe('derivePrefix (B28)', () => {
  it('un nom sans lettre latine prend un prefixe de secours unique par position', () => {
    expect(derivePrefix(BAR_AR, 0)).toBe('Z1');
    expect(derivePrefix(BAR_AR, 2)).toBe('Z3');
    expect(derivePrefix('', 0)).toBe('Z1');
  });

  it('temoin: un nom latin garde ses trois premieres lettres', () => {
    expect(derivePrefix('Terrasse', 4)).toBe('TER');
    expect(derivePrefix('Etage 2', 0)).toBe('ETA');
  });
});

describe('lancement de l onboarding, schema de bout en bout, par mode (B28)', () => {
  it('passer: une zone vide restee du mode "complet" ne bloque pas le lancement', () => {
    expect(launch('skip', [blankZone]).success).toBe(true);
  });

  it('minimum: un nom de zone sans lettre latine passe grace au prefixe de secours', () => {
    const zone = { name: BAR_AR, prefix: derivePrefix(BAR_AR, 0), tableCount: 6 };
    expect(launch('minimum', [zone]).success).toBe(true);
  });

  it('minimum: des zones nommees normalement passent', () => {
    const zones = ['Salle', 'Terrasse'].map((name, i) => ({
      name,
      prefix: derivePrefix(name, i),
      tableCount: 5,
    }));
    expect(launch('minimum', zones).success).toBe(true);
  });

  it('complet: des prefixes saisis valides passent', () => {
    expect(
      launch('complete', [{ name: 'Salle', prefix: 'SAL', tableCount: 8, defaultCapacity: 4 }])
        .success,
    ).toBe(true);
  });

  it('temoin: en mode complet ou minimum, un prefixe vide reste refuse, sur le bon champ', () => {
    for (const mode of ['complete', 'minimum'] as const) {
      const result = launch(mode, [blankZone]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['data', 'tableZones', 0, 'prefix']);
      }
    }
  });
});

describe('prefixes uniques et noms par defaut (contre-audits 2 et 3, B28)', () => {
  const zone = (name: string, prefix = '', prefixManual?: boolean) => ({
    name,
    prefix,
    tableCount: 4,
    ...(prefixManual === undefined ? {} : { prefixManual }),
  });
  const prefixes = (zones: { prefix: string }[]) => zones.map((z) => z.prefix);
  const salle = (n: number) => `Salle ${n}`;

  it('deux noms arabes, suppression de la premiere puis ajout: plus de Z2 en double', () => {
    let zones = withUniquePrefixes([zone(BAR_AR), zone(SALLE_AR)], 'minimum');
    expect(prefixes(zones)).toEqual(['Z1', 'Z2']);
    zones = withUniquePrefixes(zones.slice(1), 'minimum');
    zones = withUniquePrefixes([...zones, zone(JARDIN_AR)], 'minimum');
    expect(new Set(prefixes(zones)).size).toBe(2);
    expect(launch('minimum', zonesForDraft(zones, 'minimum', salle)).success).toBe(true);
  });

  it('"Salle", "Salon", "Salle VIP": SAL, SAL2, SAL3, accepte au lancement', () => {
    const zones = withUniquePrefixes([zone('Salle'), zone('Salon'), zone('Salle VIP')], 'minimum');
    expect(prefixes(zones)).toEqual(['SAL', 'SAL2', 'SAL3']);
    expect(launch('minimum', zones).success).toBe(true);
  });

  it('contre-audit 3: SAL saisi en zone 3 puis remis a VIP, les prefixes automatiques reviennent', () => {
    const base = [zone('Salle'), zone('Salon'), zone('Terrasse')];
    let zones = withUniquePrefixes(base, 'complete');
    expect(prefixes(zones)).toEqual(['SAL', 'SAL2', 'TER']);

    zones = withUniquePrefixes(
      zones.map((z, i) => (i === 2 ? { ...z, prefix: 'SAL', prefixManual: true } : z)),
      'complete',
    );
    expect(prefixes(zones)).toEqual(['SAL2', 'SAL3', 'SAL']);

    zones = withUniquePrefixes(
      zones.map((z, i) => (i === 2 ? { ...z, prefix: 'VIP', prefixManual: true } : z)),
      'complete',
    );
    expect(prefixes(zones)).toEqual(['SAL', 'SAL2', 'VIP']);
  });

  it('contre-audit 3: un doublon saisi en mode complet est recalcule en mode rapide', () => {
    const fromComplete = [zone('Salle', 'VIP', true), zone('Terrasse', 'VIP', true)];
    expect(findZoneIssues(withUniquePrefixes(fromComplete, 'complete'))).toEqual([
      { index: 1, field: 'prefix', code: 'ZONE_PREFIX_DUPLICATE' },
    ]);
    const quick = withUniquePrefixes(fromComplete, 'minimum');
    expect(prefixes(quick)).toEqual(['SAL', 'TER']);
    expect(launch('minimum', quick).success).toBe(true);
  });

  it('temoin: un doublon de prefixe saisi est refuse au lancement, sur le champ de la seconde zone', () => {
    const result = launch('complete', [zone('Salle', 'VIP'), zone('Terrasse', 'VIP')]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['data', 'tableZones', 1, 'prefix']);
      expect(result.error.issues[0]?.message).toBe('ZONE_PREFIX_DUPLICATE');
    }
  });

  it('contre-audit 3: deux zones "Terrasse" sont refusees, sur le nom de la seconde', () => {
    const result = launch('minimum', [zone('Terrasse', 'TER'), zone(' terrasse ', 'TER2')]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => [i.path, i.message])).toEqual([
        [['data', 'tableZones', 1, 'name'], 'ZONE_NAME_DUPLICATE'],
      ]);
    }
  });

  it('une zone sans nom prend le premier "Salle n" libre, meme si "Salle 1" est saisi ailleurs', () => {
    const zones = zonesForDraft([zone(''), zone('Salle 1'), zone(' ')], 'minimum', salle);
    expect(zones.map((z) => z.name)).toEqual(['Salle 2', 'Salle 1', 'Salle 3']);
    expect(findZoneIssues(zones)).toEqual([]);
    expect(launch('minimum', zones).success).toBe(true);
  });
});

describe('message du lancement refuse (contre-audit 3)', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    `${key}${values ? JSON.stringify(values) : ''}`;

  it('nomme la zone par son numero AFFICHE et son nom, sans chemin technique', () => {
    const zones = [
      { name: 'Salle', prefix: 'SAL' },
      { name: 'Terrasse', prefix: 'TER' },
      { name: 'Bar', prefix: 'VIP' },
      { name: 'Jardin', prefix: 'VIP' },
    ];
    const [line] = describeLaunchIssues(
      [{ path: ['data', 'tableZones', '3', 'prefix'], message: 'ZONE_PREFIX_DUPLICATE' }],
      zones,
      t,
    );
    expect(line).not.toContain('tableZones');
    expect(line).toContain('zoneIssue.ZONE_PREFIX_DUPLICATE');
    expect(line).toContain('"prefix":"VIP"');
    expect(line).toContain('zoneLabelNamed{\\"number\\":4,\\"name\\":\\"Jardin\\"}');
  });

  it('temoin: un autre refus garde son message, sans chemin', () => {
    expect(
      describeLaunchIssues([{ path: ['data', 'currency'], message: 'Devise invalide' }], [], t),
    ).toEqual(['Devise invalide']);
  });
});

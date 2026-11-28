import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMING_SOON_PERMISSIONS, nextOverride, posteLabelKey } from '../permission-catalogue-ui';
import frMessages from '@/messages/fr-FR.json';
import enMessages from '@/messages/en-US.json';
import { PERMISSION_CODES, POSTE_CODES } from '@/types/permission.types';

describe('nextOverride : reglage ecrit quand on bascule un interrupteur', () => {
  it('droit entier par defaut : eteindre ecrit false, rallumer retire le reglage', () => {
    expect(nextOverride('full', undefined)).toBe(false);
    expect(nextOverride('full', false)).toBeUndefined();
  });

  it('aucun droit par defaut : allumer ecrit true, eteindre retire le reglage', () => {
    expect(nextOverride(null, undefined)).toBe(true);
    expect(nextOverride(null, true)).toBeUndefined();
  });

  // Audit de conformite M1 : la case bornee s'affiche eteinte. L'eteindre
  // "revenait au defaut" (le niveau borne) : le droit ne se retirait jamais.
  // Contre-audit N4 (decision du responsable) : depuis le niveau borne, UN clic
  // retire le droit. Il ne passe jamais par le droit entier.
  it('droit BORNE par defaut : le premier clic ecrit FALSE, jamais true', () => {
    expect(nextOverride('limited', undefined)).toBe(false);
  });

  it('droit BORNE : retire puis entier puis retire, jamais de retour silencieux au niveau borne', () => {
    expect(nextOverride('limited', false)).toBe(true);
    expect(nextOverride('limited', true)).toBe(false);
  });
});

describe('libelles des postes : une seule source (users.role<Poste>)', () => {
  it.each([...POSTE_CODES])('le poste %s a son libelle en francais et en anglais', (poste) => {
    const key = posteLabelKey(poste) as keyof typeof frMessages.users;
    expect(typeof frMessages.users[key]).toBe('string');
    expect(typeof (enMessages.users as Record<string, unknown>)[key]).toBe('string');
  });

  it('les anciennes copies ont disparu (permissions.poste)', () => {
    expect('poste' in frMessages.permissions).toBe(false);
    expect('poste' in enMessages.permissions).toBe(false);
  });
});

/**
 * Les droits affiches "a venir" ne doivent etre lus NULLE PART dans le code de
 * l'application. Le jour ou l'un d'eux commence a servir (lots 2 et 3), ce test
 * echoue : il faut alors le retirer de la liste, sinon l'ecran dirait "a venir"
 * d'un droit qui agit deja, avec un interrupteur inactif.
 */
describe('droits "a venir" : rien ne les consomme encore', () => {
  const ALLOWED = [
    'src/types/permission.types.ts', // le catalogue et la matrice
    'src/lib/permission-catalogue-ui.ts', // l'affichage
    'src/types/database.generated.ts',
  ];

  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name === '__tests__' || name === 'messages') continue;
        sources(path, out);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push(path);
      }
    }
    return out;
  }
  const files = sources('src').filter((f) => !ALLOWED.includes(f.split('\\').join('/')));

  it('temoin : le balayage lit bien le code (un droit consomme y est trouve)', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => readFileSync(f, 'utf8').includes("'reports.money'"))).toBe(true);
  });

  it.each([...COMING_SOON_PERMISSIONS])('%s n est lu par aucun fichier de src', (code) => {
    expect(PERMISSION_CODES).toContain(code);
    const users = files.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return text.includes(`'${code}'`) || text.includes(`"${code}"`);
    });
    expect(users).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PERMISSION_CODES,
  POSTE_CODES,
  POSTE_MATRIX,
  STAFF_POSTES,
} from '@/types/permission.types';

/**
 * PARITE EXACTE entre le TypeScript et la base (conception B.3).
 *
 * Le TypeScript est la source ecrite a la main (`PERMISSION_CODES`,
 * `POSTE_MATRIX`) ; `private.codes_droits()` et `private.matrice_postes()` en
 * sont la copie SQL. Deux tables de verite divergent au premier changement :
 * l'ecran dirait "autorise" et la base refuserait, ou l'inverse.
 *
 * Sans base reelle : on lit la DERNIERE migration qui definit chaque fonction
 * (celle qui s'applique) et on exige l'egalite d'ensembles, dans les deux sens.
 * L'etat effectif de la base, lui, est verrouille par pgTAP
 * (`postes_matrice_par_poste`, `postes_cas_partages`).
 */
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** Corps de la derniere definition de `nom` (entre ses deux `$function$`). */
function latestBody(nom: string): string {
  const nomEchappe = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // nosemgrep: detect-non-literal-regexp -- test, nom constant du depot entierement echappe ci-dessus
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+${nomEchappe}\\s*\\(`, 'i');
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => pattern.test(readFileSync(join(MIGRATIONS, f), 'utf8')));
  expect(files.length, `aucune migration ne definit ${nom}`).toBeGreaterThan(0);
  const sql = readFileSync(join(MIGRATIONS, files[files.length - 1]), 'utf8');
  // La derniere definition DANS le fichier, au cas ou il la redefinirait.
  // nosemgrep: detect-non-literal-regexp -- test, source deja echappee (pattern ci-dessus)
  const starts = [...sql.matchAll(new RegExp(pattern.source, 'gi'))].map((m) => m.index);
  const start = starts[starts.length - 1];
  const open = sql.indexOf('$function$', start);
  return sql.slice(open, sql.indexOf('$function$', open + 1));
}

const sqlCodes = (): string[] =>
  [...latestBody('private.codes_droits').matchAll(/'([a-z]+\.[a-z]+)'/g)].map((m) => m[1]);

const sqlTriplets = (): string[] =>
  [...latestBody('private.matrice_postes').matchAll(/\('([a-z]+)','([a-z.]+)','([a-z]+)'\)/g)].map(
    (m) => `${m[1]}|${m[2]}|${m[3]}`,
  );

const tsTriplets = (): string[] =>
  STAFF_POSTES.flatMap((poste) =>
    Object.entries(POSTE_MATRIX[poste]).map(([code, level]) => `${poste}|${code}|${level}`),
  );

describe('catalogue des droits : TypeScript = SQL', () => {
  it('temoin : la lecture trouve bien 22 codes et 86 cases', () => {
    // Si l'extraction ne trouvait rien, les egalites ci-dessous compareraient
    // deux ensembles vides et passeraient a tort.
    expect(sqlCodes()).toHaveLength(22);
    expect(sqlTriplets()).toHaveLength(86);
    expect(tsTriplets()).toHaveLength(86);
  });

  it('memes 22 codes, dans le meme ordre', () => {
    expect(sqlCodes()).toEqual([...PERMISSION_CODES]);
  });

  it('aucune case SQL absente du TypeScript', () => {
    const ts = new Set(tsTriplets());
    expect(sqlTriplets().filter((t) => !ts.has(t))).toEqual([]);
  });

  it('aucune case TypeScript absente du SQL', () => {
    const sql = new Set(sqlTriplets());
    expect(tsTriplets().filter((t) => !sql.has(t))).toEqual([]);
  });

  it('aucune case en double cote SQL', () => {
    const triplets = sqlTriplets();
    expect(new Set(triplets.map((t) => t.split('|').slice(0, 2).join('|'))).size).toBe(
      triplets.length,
    );
  });

  it('la matrice SQL ne porte ni le proprietaire ni un poste ou un droit inconnu', () => {
    for (const triplet of sqlTriplets()) {
      const [poste, code, level] = triplet.split('|');
      expect(poste, triplet).not.toBe('owner');
      expect(POSTE_CODES as readonly string[], triplet).toContain(poste);
      expect(PERMISSION_CODES as readonly string[], triplet).toContain(code);
      expect(['full', 'limited'], triplet).toContain(level);
    }
  });
});

describe('garde SQL : plus de repli par role, code inconnu refuse', () => {
  it('has_tenant_write_permission ne lit plus aucun role', () => {
    const body = latestBody('public.has_tenant_write_permission');
    // L'ancienne garde finissait par `ELSE au.role = ANY (...)` : tout code non
    // liste, ou mal orthographie, etait accorde au gerant.
    expect(body).not.toMatch(/au\.role/);
    expect(body).toMatch(/tenant_permission_level/);
  });

  it('tenant_permission_level refuse d abord tout code hors catalogue', () => {
    const body = latestBody('public.tenant_permission_level');
    expect(body).not.toMatch(/au\.role/);
    const guard = body.search(
      /NOT \(p_perm = ANY \(private\.codes_droits\(\)\)\) THEN (RETURN )?NULL/,
    );
    const read = body.search(/FROM public\.admin_users/);
    expect(guard, 'la garde du catalogue a disparu').toBeGreaterThan(-1);
    // Avant toute lecture de membre : le proprietaire est refuse lui aussi.
    expect(guard).toBeLessThan(read);
  });
});

describe('retour arriere de la resolution plus rapide : copies des corps d origine', () => {
  const RETOUR = join(
    process.cwd(),
    'supabase',
    'retour-arriere',
    '20261128100300_retour_resolution_plus_rapide.sql',
  );
  const fonction = (sql: string, nom: string): string => {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${nom}`);
    expect(start, nom).toBeGreaterThan(-1);
    return sql.slice(start, sql.indexOf('$function$;', start));
  };

  it.each([
    ['private.matrice_postes()', '20261128100000_postes_colonnes_et_reprise.sql'],
    ['public.tenant_permission_level(', '20261128100100_resolution_par_postes_et_politiques.sql'],
  ])('%s est identique a sa definition d origine', (nom, migration) => {
    const origine = fonction(readFileSync(join(MIGRATIONS, migration), 'utf8'), nom);
    expect(fonction(readFileSync(RETOUR, 'utf8'), nom)).toBe(origine);
    // Temoin : la definition en vigueur, elle, differe (sinon le retour ne
    // retablirait rien et la comparaison ne prouverait rien).
    const enVigueur = readFileSync(
      join(MIGRATIONS, '20261128100300_resolution_plus_rapide.sql'),
      'utf8',
    );
    expect(fonction(enVigueur, nom)).not.toBe(origine);
  });
});

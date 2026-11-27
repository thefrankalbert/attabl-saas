import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Garde-fou durable de la double authentification (K6.13).
 *
 * Un compte qui a un facteur verifie ne doit agir qu'en session aal2. Les
 * gabarits de pages le font respecter (enforceMfa); les routes d'API et les
 * Server Actions passent par la regle unique `isMfaSatisfied` /
 * `assertMfaSatisfied` (src/lib/auth/mfa-assurance.ts, get-session.ts).
 *
 * Ce test echoue si un fichier de src/app/api ou src/app/actions appelle
 * `auth.getUser()` plus de fois qu'il n'appelle la regle (une session lue sans
 * verifier le niveau), ou si une fonction commune de src/lib ou src/services
 * appelle `auth.getUser()` sans figurer dans la liste commentee ci-dessous.
 */
const SRC = join(__dirname, '..');

/** Points d'entree qui servent a ATTEINDRE aal2: ils ne peuvent pas l'exiger. */
const ENTRYPOINT_EXCEPTIONS: Record<string, string> = {
  // Statut, activation et verification du code de la page /auth/mfa. La
  // desactivation exige deja un code valide (voir mfa.service.ts).
  'app/actions/mfa.ts': 'actions de la page /auth/mfa (atteindre aal2)',
};

/**
 * Fonctions communes hors api/actions qui appellent `auth.getUser()`. Chacune
 * est soit gardee (elle appelle la regle: verifie plus bas), soit hors du
 * perimetre des operations, pour la raison ecrite.
 */
const GUARDED_HELPERS = [
  'lib/auth/get-session.ts', // getAuthenticatedUser -> assertMfaSatisfied
  'lib/auth/session-admin-user.ts', // resolveSessionAdminUser (onboarding, upload)
  'lib/billing/checkout-tenant.ts', // resolveCheckoutTenant (paiements)
];
const HELPER_EXCEPTIONS: Record<string, string> = {
  // Rafraichit la session pour TOUTES les requetes, y compris /auth/mfa.
  'lib/supabase/middleware.ts': 'rafraichissement de session, aucune operation',
  // Gardes de PAGES admin: rendues sous le layout tenant, qui appelle enforceMfa.
  'lib/auth/require-admin-permission.ts': 'pages sous le layout admin (enforceMfa)',
  // Super administrateur: exige deja une session renforcee (hasStrongSession).
  'lib/auth/require-super-admin.ts': 'exige facteur + aal2 (hasStrongSession)',
  // Redirection vers l'espace du compte, ne lit ni n'ecrit rien d'autre.
  'lib/tenant-routing.ts': 'redirection seulement',
  // Lit l'identifiant de l'auteur sur le client deja authentifie de l'action
  // appelante (getAuthenticatedUserForTenant, donc gardee en amont).
  'services/inventory.service.ts': 'client fourni par une action deja gardee',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Retire les commentaires: une phrase qui cite `auth.getUser()` n'est pas un appel. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function count(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

const GET_USER = /\.auth\.getUser\(/g;
const RULE = /\b(?:isMfaSatisfied|assertMfaSatisfied)\(/g;

function unguardedEntrypoints(files: ReadonlyArray<{ path: string; source: string }>) {
  return files
    .filter(({ path }) => !(path in ENTRYPOINT_EXCEPTIONS))
    .filter(({ source }) => {
      const code = stripComments(source);
      const reads = count(code, GET_USER);
      return reads > 0 && count(code, RULE) < reads;
    })
    .map(({ path }) => path);
}

function load(dirs: string[]) {
  return dirs.flatMap((dir) =>
    sourceFiles(join(SRC, dir)).map((full) => ({
      path: relative(SRC, full).split(sep).join('/'),
      source: readFileSync(full, 'utf8'),
    })),
  );
}

describe('double authentification des points d entree authentifies', () => {
  it('chaque appel direct a auth.getUser() dans api/actions passe par la regle', () => {
    expect(unguardedEntrypoints(load(['app/api', 'app/actions']))).toEqual([]);
  });

  it('temoin: un fichier factice sans la regle est detecte', () => {
    const fake = {
      path: 'app/api/factice/route.ts',
      source: [
        '// commentaire qui cite auth.getUser() sans compter',
        'const { data } = await supabase.auth.getUser();',
      ].join('\n'),
    };
    const guarded = {
      path: 'app/api/garde/route.ts',
      source: [
        'const { data } = await supabase.auth.getUser();',
        'if (!(await isMfaSatisfied(supabase, data.user))) return refus;',
      ].join('\n'),
    };
    const twice = {
      path: 'app/api/deux/route.ts',
      source: [
        'await supabase.auth.getUser();',
        'await isMfaSatisfied(supabase, user);',
        'await supabase.auth.getUser();',
      ].join('\n'),
    };
    expect(unguardedEntrypoints([fake, guarded, twice])).toEqual([
      'app/api/factice/route.ts',
      'app/api/deux/route.ts',
    ]);
  });

  it('les exceptions existent encore (une exception morte serait un trou silencieux)', () => {
    const paths = new Set(load(['app/api', 'app/actions']).map((f) => f.path));
    for (const path of Object.keys(ENTRYPOINT_EXCEPTIONS)) expect(paths).toContain(path);
  });

  it('les fonctions communes de src/lib et src/services sont gardees ou listees', () => {
    const files = load(['lib', 'services']);
    const readers = files
      .filter(({ source }) => count(stripComments(source), GET_USER) > 0)
      .map(({ path }) => path);
    const unknown = readers.filter(
      (p) => !GUARDED_HELPERS.includes(p) && !(p in HELPER_EXCEPTIONS),
    );
    expect(unknown).toEqual([]);

    for (const path of GUARDED_HELPERS) {
      const file = files.find((f) => f.path === path);
      expect(file, path).toBeDefined();
      expect(count(stripComments(file!.source), RULE), path).toBeGreaterThan(0);
    }
  });
});

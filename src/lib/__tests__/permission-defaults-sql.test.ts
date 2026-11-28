import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';

/**
 * B107: la garde SQL `has_tenant_write_permission` recopie DEFAULT_PERMISSIONS
 * pour les cas sans surcharge. Deux tables de verite divergent au premier
 * changement: l'ecran dirait "autorise" et la base refuserait (ou l'inverse).
 *
 * Sans base reelle: on lit la DERNIERE migration qui definit la fonction (celle
 * qui s'applique) et chaque permission avec laquelle une migration appelle la
 * garde. Pour chacune, les roles autorises par defaut cote SQL doivent etre
 * exactement ceux de DEFAULT_PERMISSIONS (le proprietaire passe toujours).
 */
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const ROLES = ['admin', 'manager', 'cashier', 'chef', 'waiter'] as const;

/**
 * Lot 1 des roles du personnel, phase A (base de donnees seule). Les migrations
 * 20261128100000 et suivantes remplacent la resolution par ROLES par une
 * resolution par POSTES, avec un catalogue de 22 droits. Le TypeScript, lui,
 * porte encore DEFAULT_PERMISSIONS (13 droits, 5 roles) jusqu'a la phase B, qui
 * reecrit ce test en parite exacte entre POSTE_MATRIX et
 * private.matrice_postes() (docs/roles-personnel/conception-lot1.md, B.3 et
 * F.2). D'ici la, ce test continue de verrouiller ce qu'il verrouillait : la
 * derniere garde PAR ROLES contre DEFAULT_PERMISSIONS. Cote base, la nouvelle
 * matrice est verrouillee case par case par pgTAP
 * (supabase/tests/rls/postes_matrice_par_poste.test.sql).
 */
const PREMIERE_MIGRATION_PAR_POSTES = '20261128100000';

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => f.split('_')[0] < PREMIERE_MIGRATION_PAR_POSTES)
    .sort();
}

function latestGuardBody(): string {
  const files = migrationFiles().filter((f) =>
    /FUNCTION\s+public\.has_tenant_write_permission\s*\(/i.test(
      readFileSync(join(MIGRATIONS, f), 'utf8'),
    ),
  );
  const last = files[files.length - 1];
  const sql = readFileSync(join(MIGRATIONS, last), 'utf8');
  const start = sql.search(/FUNCTION\s+public\.has_tenant_write_permission\s*\(/i);
  return sql.slice(start, sql.indexOf('$function$', sql.indexOf('$function$', start) + 1));
}

/** Roles d'une expression `au.role = 'x'` ou `au.role = ANY (ARRAY['x', 'y'])`. */
function rolesOf(expr: string): string[] {
  const list = /ARRAY\[([^\]]*)\]/.exec(expr);
  const raw = list ? list[1] : (/au\.role\s*=\s*('[^']+')/.exec(expr)?.[1] ?? '');
  return [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

function sqlDefaults(): { byPerm: Map<string, string[]>; otherwise: string[] } {
  const body = latestGuardBody();
  const block = body.slice(body.search(/ELSE\s+CASE\s+p_perm/i));
  const byPerm = new Map<string, string[]>();
  for (const m of block.matchAll(/WHEN\s+'([a-z._]+)'\s+THEN\s+(au\.role[^\n]*)/gi)) {
    byPerm.set(m[1], rolesOf(m[2]));
  }
  const otherwise = /\n\s*ELSE\s+(au\.role[^\n]*)/i.exec(block.replace(/^ELSE\s+CASE/i, ''));
  return { byPerm, otherwise: rolesOf(otherwise?.[1] ?? '') };
}

function permissionsCalledBySql(): string[] {
  const all = migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');
  const perms = [...all.matchAll(/has_tenant_write_permission\([^,()]+,\s*'([a-z._]+)'/g)].map(
    (m) => m[1],
  );
  return [...new Set(perms)].sort();
}

describe('DEFAULT_PERMISSIONS = valeurs par defaut de la garde SQL (B107)', () => {
  const { byPerm, otherwise } = sqlDefaults();
  const called = permissionsCalledBySql();

  it('la garde et ses appels sont bien lus (temoin)', () => {
    expect(byPerm.size).toBeGreaterThan(0);
    expect(otherwise.length).toBeGreaterThan(0);
    expect(called).toContain('orders.pay');
  });

  it('les migrations du lot 1 des roles existent et sont bien ecartees (temoin)', () => {
    const toutes = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    expect(toutes.some((f) => f.split('_')[0] >= PREMIERE_MIGRATION_PAR_POSTES)).toBe(true);
    expect(migrationFiles().every((f) => f.split('_')[0] < PREMIERE_MIGRATION_PAR_POSTES)).toBe(
      true,
    );
    expect(latestGuardBody()).toMatch(/ELSE\s+CASE\s+p_perm/i);
  });

  it.each(permissionsCalledBySql())('%s: memes roles autorises par defaut', (perm) => {
    const sqlRoles = byPerm.get(perm) ?? otherwise;
    const tsRoles = ROLES.filter(
      (role) => DEFAULT_PERMISSIONS[role]?.[perm as PermissionCode] === true,
    ).sort();
    expect(sqlRoles).toEqual(tsRoles);
  });
});

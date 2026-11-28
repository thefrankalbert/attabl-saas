// Resolution des droits d'un membre d'un restaurant (ATTABL SaaS).
//
// MIROIR de `public.tenant_permission_level` (migration 20261128100100). Meme
// ordre de decision, dans cet ordre :
//   1. code hors catalogue : refus, pour tout le monde ;
//   2. poste `owner` : droit entier ;
//   3. reglage par personne (`permission_overrides`) : il tranche, dans les deux sens ;
//   4. sinon, pour chaque poste : le reglage du restaurant pour ce poste
//      (`poste_permissions`) s'il existe pour ce code, sinon la case de la
//      matrice ; puis on garde le niveau le plus haut entre les postes (cumul).
// (La double authentification, etape 2 cote base, est verifiee a l'entree de la
// session par `getAuthenticatedUser`.)
//
// Le serveur, le middleware et l'interface lisent tous cette resolution. La
// parite avec la base est verrouillee par `tests/fixtures/permission-cases.json`,
// lu par Vitest ET par pgTAP.

import {
  PERMISSION_CODES,
  POSTE_CODES,
  POSTE_MATRIX,
  type PermissionCode,
  type PermissionLevel,
  type PermissionMap,
  type Poste,
  type StaffPoste,
} from '@/types/permission.types';

/** Ce que la resolution lit d'une ligne `admin_users`. */
export interface MemberRights {
  postes: readonly Poste[];
  permission_overrides?: PermissionMap | null;
}

/** Reglages du restaurant, par poste (`poste_permissions`). */
export type PosteOverrides = Partial<Record<StaffPoste, PermissionMap>>;

/** Niveau effectif de chacun des 22 droits. `null` = aucun droit. */
export type PermissionLevels = Record<PermissionCode, PermissionLevel | null>;

/**
 * Exigence d'une garde. Un code seul ou un tableau : TOUS exiges en entier.
 * `anyOf` : au moins un en entier. `atLeastLimited` : le niveau borne suffit.
 */
export type PermissionRequirement =
  | PermissionCode
  | readonly PermissionCode[]
  | { readonly anyOf: readonly PermissionCode[] }
  | { readonly atLeastLimited: PermissionCode };

const isCode = (value: unknown): value is PermissionCode =>
  typeof value === 'string' && (PERMISSION_CODES as readonly string[]).includes(value);

/** Postes lus en base : toute valeur hors des 11 codes est ecartee. */
export function toPostes(raw: unknown): Poste[] {
  if (!Array.isArray(raw)) return [];
  return POSTE_CODES.filter((poste) => raw.includes(poste));
}

/** Reglage lu en base : seules les cles du catalogue a valeur booleenne comptent. */
export function toPermissionMap(raw: unknown): PermissionMap | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: PermissionMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>))
    if (isCode(key) && typeof value === 'boolean') out[key] = value;
  return out;
}

export const isOwner = (member: Pick<MemberRights, 'postes'>): boolean =>
  member.postes.includes('owner');

export function permissionLevel(
  member: MemberRights,
  perm: PermissionCode,
  posteOverrides?: PosteOverrides | null,
): PermissionLevel | null {
  if (!isCode(perm)) return null;
  if (isOwner(member)) return 'full';
  const own = member.permission_overrides?.[perm];
  if (own !== undefined) return own ? 'full' : null;
  let best: PermissionLevel | null = null;
  for (const poste of member.postes) {
    if (poste === 'owner') continue;
    const tenant = posteOverrides?.[poste]?.[perm];
    const level =
      tenant !== undefined ? (tenant ? 'full' : null) : (POSTE_MATRIX[poste]?.[perm] ?? null);
    if (level === 'full') return 'full';
    if (level === 'limited') best = 'limited';
  }
  return best;
}

export const hasPermission = (
  member: MemberRights,
  perm: PermissionCode,
  posteOverrides?: PosteOverrides | null,
): boolean => permissionLevel(member, perm, posteOverrides) === 'full';

export function getEffectiveLevels(
  member: MemberRights,
  posteOverrides?: PosteOverrides | null,
): PermissionLevels {
  return Object.fromEntries(
    PERMISSION_CODES.map((code) => [code, permissionLevel(member, code, posteOverrides)]),
  ) as PermissionLevels;
}

/**
 * Niveaux quand la lecture de `poste_permissions` a ECHOUE (echec ferme) : seuls
 * le proprietaire et les reglages par personne decident, tout le reste est
 * refuse. Une panne ne doit jamais rendre un droit que le restaurant a retire.
 */
export function getFailClosedLevels(member: MemberRights): PermissionLevels {
  const owner = isOwner(member);
  return Object.fromEntries(
    PERMISSION_CODES.map((code) => [
      code,
      owner || member.permission_overrides?.[code] === true ? 'full' : null,
    ]),
  ) as PermissionLevels;
}

/** Aucun droit : visiteur sans ligne de membre. */
export const NO_LEVELS: PermissionLevels = getEffectiveLevels({ postes: [] });

/** Une seule regle de garde, partagee par le serveur, le middleware et l'interface. */
export function meetsRequirement(
  levels: PermissionLevels,
  requirement: PermissionRequirement,
): boolean {
  if (typeof requirement === 'string') return levels[requirement] === 'full';
  if ('anyOf' in requirement) return requirement.anyOf.some((code) => levels[code] === 'full');
  if ('atLeastLimited' in requirement) return levels[requirement.atLeastLimited] != null;
  return requirement.every((code) => levels[code] === 'full');
}

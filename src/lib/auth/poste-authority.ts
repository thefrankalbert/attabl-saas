import { getEffectiveLevels, type PermissionLevels, type PosteOverrides } from '@/lib/permissions';
import { PERMISSION_CODES, type PermissionLevel, type Poste } from '@/types/permission.types';

/**
 * Autorite sur l'equipe. Remplace l'ancien rang lineaire des roles, qui n'a
 * plus de sens quand les postes se cumulent (un caissier n'est ni au-dessus ni
 * en dessous d'un chef). Deux regles, les memes dans l'action d'equipe, les
 * routes d'invitation et le changement d'email :
 *
 *   - on ne donne pas un droit qu'on n'a pas ;
 *   - on n'agit que sur un membre dont les droits sont STRICTEMENT inclus dans
 *     les siens. Un gerant n'agit donc pas sur un autre gerant : pas de prise
 *     de controle d'un compte de meme niveau.
 *
 * Le proprietaire n'est jamais une cible, et son poste ne se donne pas.
 */
const RANK = (level: PermissionLevel | null): number =>
  level === 'full' ? 2 : level === 'limited' ? 1 : 0;

export interface TeamActor {
  /** `admin_users.id` de l'acteur. */
  id: string;
  isOwner: boolean;
  levels: PermissionLevels;
}

export interface TeamTarget {
  /** `admin_users.id` de la cible. */
  id: string;
  postes: readonly Poste[];
  levels: PermissionLevels;
}

/** Les postes demandes donnent-ils seulement des droits que l'acteur detient ? */
export function canGrantPostes(
  actorLevels: PermissionLevels,
  postes: readonly Poste[],
  posteOverrides?: PosteOverrides | null,
): boolean {
  if (postes.length === 0 || postes.includes('owner')) return false;
  const granted = getEffectiveLevels({ postes }, posteOverrides);
  return PERMISSION_CODES.every((code) => RANK(granted[code]) <= RANK(actorLevels[code]));
}

/** Modifier, desactiver, retirer, reinitialiser le mot de passe, changer l'email. */
export function canActOnMember(actor: TeamActor, target: TeamTarget): boolean {
  if (target.postes.includes('owner')) return false;
  if (target.id === actor.id) return false;
  if (actor.isOwner) return true;
  let strictlyBelow = false;
  for (const code of PERMISSION_CODES) {
    const mine = RANK(actor.levels[code]);
    const theirs = RANK(target.levels[code]);
    if (theirs > mine) return false;
    if (theirs < mine) strictlyBelow = true;
  }
  return strictlyBelow;
}

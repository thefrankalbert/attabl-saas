import { getEffectiveLevels, type PermissionLevels, type PosteOverrides } from '@/lib/permissions';
import { PERMISSION_CODES, type PermissionLevel, type Poste } from '@/types/permission.types';

/**
 * Autorite sur l'equipe. Remplace l'ancien rang lineaire des roles, qui n'a
 * plus de sens quand les postes se cumulent (un caissier n'est ni au-dessus ni
 * en dessous d'un chef). Deux regles, les memes dans l'action d'equipe, les
 * routes d'invitation et le changement d'email :
 *
 *   - on ne donne pas un droit qu'on n'a pas (inclus OU egal : un gerant peut
 *     creer un gerant, cahier des charges 3.6) ;
 *   - on n'agit que sur un membre dont les droits sont STRICTEMENT inclus dans
 *     les siens. Un gerant n'agit donc pas sur un autre gerant : pas de prise
 *     de controle d'un compte de meme niveau.
 *
 * Une invitation n'est pas encore un compte : l'annuler ou la renvoyer suit la
 * regle pour DONNER (`canManageInvitationRights`), sinon un gerant ne pourrait
 * pas defaire l'invitation de gerant qu'il vient d'envoyer.
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
  return within(actorLevels, getEffectiveLevels({ postes }, posteOverrides));
}

/** Aucun des niveaux donnes ne depasse celui de l'acteur (inclus ou egal). */
const within = (actorLevels: PermissionLevels, granted: PermissionLevels): boolean =>
  PERMISSION_CODES.every((code) => RANK(granted[code]) <= RANK(actorLevels[code]));

/**
 * Annuler ou renvoyer une invitation : il faut `team.manage`, et les droits que
 * l'invitation donnerait (postes ET reglage par personne) ne doivent pas
 * depasser ceux de l'acteur. C'est la regle pour donner : qui pouvait envoyer
 * cette invitation peut la defaire. Le proprietaire agit sur toutes. Partagee
 * par les deux routes et par la liste des invitations (boutons par ligne).
 */
export function canManageInvitationRights(
  actor: Pick<TeamActor, 'isOwner' | 'levels'>,
  invitedLevels: PermissionLevels,
): boolean {
  if (actor.levels['team.manage'] !== 'full') return false;
  return actor.isOwner || within(actor.levels, invitedLevels);
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

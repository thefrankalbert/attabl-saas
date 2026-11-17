/**
 * Nom d'un membre de l'equipe dans un historique (commande, note, ticket).
 *
 * Un membre peut ne pas avoir de nom: compte sans nom saisi, ou compte supprime
 * dont le nom a ete efface (suppression de compte, purge de conservation). Sans
 * repli, l'historique affichait une case vide - ou pire "Non assigne" alors
 * qu'un serveur avait bien pris la commande.
 *
 * @returns `null` quand il n'y a AUCUN membre (rien d'assigne), le nom quand il
 *   existe, sinon `fallback` (libelle traduit, ex. "Membre de l'equipe").
 */
export function memberDisplayName(
  member: { full_name?: string | null } | null | undefined,
  fallback: string,
): string | null {
  if (!member) return null;
  return member.full_name?.trim() || fallback;
}

/**
 * A-06: un lien de reinitialisation ouvre une session sur le compte qui l'a
 * demande. Un attaquant peut demander le lien pour SON compte et l'envoyer a une
 * victime: la victime choisirait alors un mot de passe pour le compte de
 * l'attaquant, puis y saisirait ses donnees. La page de reinitialisation exige
 * donc que la personne retape l'adresse du compte: elle ne la connait que si le
 * lien est bien le sien.
 *
 * `accountEmail` vient de `auth.getUser()` (verifie cote serveur), jamais de
 * l'URL. Une adresse de compte absente ne correspond a rien.
 */
export function recoveryEmailMatches(entered: string, accountEmail: string | null | undefined) {
  if (!accountEmail || !entered.trim()) return false;
  return entered.trim().toLowerCase() === accountEmail.trim().toLowerCase();
}

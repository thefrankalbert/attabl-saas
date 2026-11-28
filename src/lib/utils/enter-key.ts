/**
 * Vrai quand la touche Entree doit declencher l'action du champ (enregistrer,
 * valider un code...), faux quand elle sert a confirmer un mot en cours de
 * composition (clavier de saisie IME, prediction du clavier Android).
 *
 * `isComposing` suffit dans Chrome et Firefox ; Safari le remet a faux avant
 * le keydown d'Entree (bug WebKit 165004), d'ou le test `keyCode === 229`,
 * que tous les navigateurs envoient pendant une composition. Source : fiche
 * `ime-safe-enter-submit` de modern-web-guidance (equipe Chrome).
 */
export function isEnterToSubmit(e: {
  key: string;
  keyCode: number;
  nativeEvent: { isComposing: boolean };
}): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229;
}

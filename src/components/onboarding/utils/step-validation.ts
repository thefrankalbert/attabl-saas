import type { OnboardingData } from '../types';
import type { ScreenKey } from '../onboarding-steps';

/**
 * Ce qui empeche de quitter un ecran de l'onboarding, ou `null`.
 * Renvoie une cle de traduction de l'espace `onboarding`.
 *
 * Pourquoi: une saisie invalide n'etait refusee qu'au tout dernier ecran, par
 * un message technique ("data.menuItems.1.price: Too small"), sans dire quel
 * plat ni ou corriger. Et une zone sans nom passait, creant des tables nommees
 * "-1", "-2"... (audit 2026-11-10, C-008 et C-010). On refuse sur l'ecran
 * fautif, avec les memes bornes que le schema serveur.
 */
export function stepBlockingError(
  screen: ScreenKey,
  data: Pick<OnboardingData, 'tableConfigMode' | 'tableZones' | 'menuItems'>,
): 'zoneNameRequired' | 'priceInvalid' | null {
  if (screen === 'tables' && data.tableConfigMode !== 'skip') {
    if (data.tableZones.some((zone) => !zone.name.trim())) return 'zoneNameRequired';
  }

  if (screen === 'menu') {
    // Une ligne sans nom est une ligne vide: elle n'est pas enregistree.
    const invalide = data.menuItems.some(
      (item) => item.name.trim() && !(Number.isFinite(item.price) && item.price >= 0),
    );
    if (invalide) return 'priceInvalid';
  }

  return null;
}

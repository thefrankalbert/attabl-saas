/**
 * Global setup Playwright du harnais "journee complete".
 *
 * S'execute UNE fois avant tous les parcours. S'il throw, Playwright avorte tout
 * le run -> garde-fou fail-closed qui couvre AUSSI les parcours qui ecrivent via
 * l'app (signup, commandes), pas seulement le seed direct.
 */
import { assertNotProduction, assertAppTargetIsTest } from './env';

export default function globalSetup(): void {
  // 1. seed direct (service_role) ne doit jamais viser la prod.
  assertNotProduction();
  // 2. l'app pilotee ne doit pas etre la prod + confirmation explicite requise.
  assertAppTargetIsTest();
}

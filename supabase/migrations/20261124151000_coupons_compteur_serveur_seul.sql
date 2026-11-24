-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: partie BASE de B67 (contre-audit 1,
-- defaut 4). Le compteur d'utilisation d'un coupon ne se touche plus depuis
-- une session d'employe.
--
-- CE QUI NE TENAIT PAS. `unclaim_coupon_usage` (SECURITY DEFINER) decremente
-- `coupons.current_uses` sans condition, et restait executable par
-- `authenticated`: tout membre qui a `orders.pay` pouvait l'appeler seul, N
-- fois, et rendre N utilisations d'un coupon sans aucune annulation
-- (reproduit au contre-audit 1). `claim_coupon_usage` (meme forme) laissait
-- symetriquement bruler le budget d'un code promo par appel direct.
--
-- APPELANTS (recherche dans src/, 2026-11-24):
-- - `claim_coupon_usage`: `coupon.service.ts` `claimUsage`, appele seulement
--   par `api/orders/route.ts` et `api/orders/pos/route.ts`, avec
--   `createAdminClient()` (service_role).
-- - `unclaim_coupon_usage`: `unclaimUsage` (memes routes, service_role) et,
--   jusqu'a ce lot, `cancelOrder` sous la session de l'employe. Le nouveau
--   code ne rend plus le coupon depuis `cancelOrder`: l'action
--   (`actionUpdateOrderStatus`) appelle en service_role
--   `rendre_coupon_commande` (20261124151500), qui part de la COMMANDE
--   annulee, verifie le restaurant du coupon et ne rend qu'une fois.
--
-- LA CORRECTION, la plus petite: retrait du droit EXECUTE a `authenticated`
-- (et PUBLIC, anon) sur les deux fonctions. Corps inchanges (pas de
-- condition ajoutee: le rendu apres l'echec d'une creation de commande, cote
-- serveur, n'a pas de commande annulee a laquelle se rattacher).
--
-- ORDRE DE DEPLOIEMENT: STRICTEMENT APRES le code en ligne. Le code
-- actuellement servi appelle `unclaim_coupon_usage` depuis la session de
-- l'employe dans `cancelOrder`: si ce retrait passait avant, chaque
-- annulation d'une commande avec coupon echouerait (42501) tant que l'ancien
-- code est servi.
--
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.unclaim_coupon_usage(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.claim_coupon_usage(uuid) TO authenticated;
-- ============================================================================

REVOKE ALL ON FUNCTION public.unclaim_coupon_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unclaim_coupon_usage(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_coupon_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_coupon_usage(uuid) TO service_role;

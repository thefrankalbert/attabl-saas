# Plan correctif #2 pour Claude Code - finir les 5 ecarts du harnais

A donner tel quel a Claude Code. Le harnais "journee complete" est a ~80%: seed, commande, prix, permissions, encaissement cash tournent et la suite passe (`test-results/.last-run.json` = passed). Il reste 5 ecarts. Ne pas retoucher ce qui marche deja.

## Regles imposees (inchangees)

- Lecture/ecriture uniquement dans `tests/journeys/`, `scripts/`, et nouvelles migrations. Ne pas modifier les fichiers proteges (`src/proxy.ts`, `next.config.mjs`, `src/lib/supabase/*`, `src/services/order.service.ts`, webhooks Stripe).
- Jamais la prod. Le runner local (`scripts/run-journeys-local.sh`) reste la cible par defaut.
- Apres CHAQUE tache: `pnpm typecheck && pnpm lint --max-warnings 0 && pnpm test && pnpm build`, plus `bash scripts/run-journeys-local.sh` doit rester vert.
- ASCII uniquement dans le code.

## C1 - Integrer le test BOLA dans le harnais (priorite 1, securite)

- Creer `tests/journeys/08-bola.spec.ts` a partir de `security/generated-tests/security-bola.spec.ts`.
- Seeder DEUX tenants via `seedTenantWithMenu()` (tenant A et tenant B) + un staff par tenant.
- Creer une commande dans le tenant B (POS ou QR). Recuperer son id.
- Avec la session d'un membre du tenant A, tenter sur l'id de B: `GET/PATCH/DELETE` des routes commandes, `pay-wave`/`pay-orange-money` retires donc ignorer, `invitations/[id]`, `assignments/[id]`.
- Assertion: chaque tentative cross-tenant renvoie 401/403/404 OU ne renvoie aucune donnee de B. Jamais la donnee de B.
- Retirer le `test.skip` BOLA de `07-edge-cases-security.spec.ts` (ou le faire pointer vers `08`).
- Acceptance: `08-bola.spec.ts` passe; aucune fuite cross-tenant.

## C2 - Finir T3: creation tables/zones + coupon

Fichier: `tests/journeys/02-restaurant-config.spec.ts`.

- Identifier le vrai chemin de creation (Server Action dans `src/app/actions/` ou page admin). Si Server Action: utiliser un browser context Playwright authentifie (persona owner) et declencher l'action via l'UI. Si endpoint: appel API direct.
- Creer: 1 zone, 1 table (avec token QR), 1 coupon valide.
- Asserter leur presence (lecture API publique, ou via le client service_role de test).
- Bonus: une fois le coupon cree, ajouter dans `07` un test "coupon valide applique reduit le total" (complement du test coupon invalide existant).
- Retirer les `test.skip` correspondants.
- Acceptance: zone+table+coupon crees et verifies; coupon valide applique.

## C3 - Finir T5: cycle de vie abonnement reel (Stripe Test Clock)

Fichiers: `tests/journeys/01-signup-and-billing.spec.ts`, `06-subscription-lifecycle.spec.ts`, `fixtures/stripe.ts`.

- Au checkout (`create-checkout-session` en mode test), creer le customer AVEC une Test Clock (`createTestClock`), passer `test_clock` a la creation du customer/subscription cote Stripe (helper a etendre dans `fixtures/stripe.ts`).
- 01: apres `checkout.session.completed` (via `stripe listen` + `stripe trigger`, ou en simulant l'event signe vers `/api/webhooks/stripe`), asserter que l'abonnement passe ACTIF en base de test.
- 06: `advanceTestClock` d'un mois -> asserter le renouvellement (invoice payee, abonnement toujours actif). Puis carte qui echoue -> `past_due`. Puis annulation -> perte d'acces en fin de periode.
- Garder ces tests gated par `hasStripeTestEnv()` (skip propre si pas de cle test).
- Acceptance: avec `sk_test_`, abonnement actif apres webhook + renouvellement/echec/annulation asseres.

## C4 - Finir T7: assertion KDS temps reel (broadcast)

Fichier: `tests/journeys/04-service-and-ordering.spec.ts`.

- Ouvrir le KDS dans un browser context authentifie (persona kitchen) sur la page cuisine.
- Creer une commande (POS ou QR). Asserter qu'elle APPARAIT cote cuisine via le broadcast realtime (scope par commande, cf. fix #127), en quelques secondes.
- Changer le statut (ex: en preparation) et verifier la propagation.
- Retirer/upgrader le test de routage actuel (qui ne verifie que l'API) vers une vraie assertion realtime.
- Acceptance: la commande s'affiche cote cuisine en live; le changement de statut se propage.

## C5 - Nettoyage des doublons (rapide)

- `07-edge-cases-security.spec.ts`: le test "manipulation de prix" fait doublon avec `04` -> le retirer ou le faire pointer vers `04`.
- `05-payments.spec.ts`: le test cash fait doublon avec le POS cash de `04` -> le retirer ou le transformer en reference.
- Acceptance: plus de `test.skip` "doublon" trompeur; chaque capacite testee une seule fois.

## Optionnel (defense en profondeur, non bloquant)

- Nouvelle migration: revalider `price_at_order` DANS `create_order_with_items` (comparer au prix `menu_items`/`item_price_variants`, lever `price_mismatch`). EXECUTE deja limite a service_role, donc faible priorite.
- `.husky/pre-commit`: ajouter `gitleaks protect --staged --redact -v` (la CI couvre deja les secrets).

## Definition de "termine"

- `08-bola.spec.ts` present et vert; aucun `test.skip` "doublon" restant.
- T3 (tables/zones/coupon), T5 (cycle abonnement), T7 (KDS realtime) implementes et verts via le runner local (et Stripe pour T5).
- `bash scripts/run-journeys-local.sh` vert de bout en bout; `test-results/.last-run.json` = passed.
- 5 portes CI vertes, suite `tests/e2e/` existante intacte.

## Apres ce plan

Le harnais couvre la journee complete de bout en bout. On pourra alors passer au TEST LIVE (execution observable, et eventuellement monitoring prod Checkly sur les parcours non destructifs).

# Plan d'execution pour Claude Code - finir la simulation "journee complete"

A donner tel quel a Claude Code. Objectif: rendre la simulation de bout en bout REELLEMENT executable (retirer les `test.skip`), sans rien casser. Ce qui touche a la securite (finding 4.1) et aux portes CI est deja fait: ne pas y revenir.

## Regles imposees (a respecter pour chaque tache)

- Ne jamais cibler la prod. Le harnais tourne sur dev/staging avec une base Supabase de TEST. `globalSetup` (`tests/journeys/fixtures/global-setup.ts`) doit rester fail-closed.
- Apres CHAQUE tache: `pnpm typecheck && pnpm lint --max-warnings 0 && pnpm test && pnpm build`. Zero warning.
- Ne pas modifier les fichiers proteges (`src/proxy.ts`, `next.config.mjs`, `src/lib/supabase/*`, `src/services/order.service.ts`, webhooks Stripe, etc.) sauf demande explicite.
- Typographie ASCII partout dans le code (pas d'em dash, pas de smart quotes).
- Un parcours est "fait" seulement quand son `test.skip` est retire ET qu'il passe en vert sur staging.

## Pre-requis (a confirmer, sinon bloquer et le dire)

1. Une base Supabase de TEST (branche du projet `nqufpobuozrzwpeijkxt` ou projet staging dedie). Renseigner `JOURNEY_SUPABASE_URL` + `JOURNEY_SUPABASE_SERVICE_ROLE_KEY` dans `tests/journeys/.env.journeys`.
2. `pnpm dev` lance avec cet env de TEST (PAS le `.env.local` de prod).
3. Cle Stripe `sk_test_...` dans `JOURNEY_STRIPE_SECRET_KEY` pour les parcours 1 et 6.
4. `JOURNEY_CONFIRM_TEST_DB=yes` une fois (1)-(2) verifies.

## Taches, dans l'ordre

### T1 - Seed des donnees de service (debloque tout le reste)

Fichier: `tests/journeys/fixtures/seed.ts`.

- Implementer `createTestRestaurant()`: cree (via le client service_role deja present) le tenant `JOURNEY_TENANT_SLUG`, un venue, 2-3 tables (avec leur token QR), 1 menu, 1 categorie, et 3 `menu_items` avec prix connus (+ 1 `item_price_variant`).
- Utiliser les VRAIS noms de colonnes du schema (lire `supabase/migrations/` et `src/types/database.generated.ts`). Ne pas deviner.
- Ecrire les IDs crees dans `tests/journeys/.state/seed.json` (creer le dossier, l'ajouter a `.gitignore`).
- Brancher l'appel dans `00-preflight.spec.ts` apres le teardown.
- Acceptance: lancer le preflight cree le tenant et `.state/seed.json` contient `menuItemIds`, `tableTokens`, `tenantId`.

### T2 - Parcours 04 happy-path commande (+ 07 manipulation de prix)

Fichier: `tests/journeys/04-service-and-ordering.spec.ts` et `07-edge-cases-security.spec.ts`.

- 04 "commande valide (QR)": lire `.state/seed.json`, `POST /api/orders` avec `x-tenant-slug` et des `items` `{menu_item_id, name, price (prix DB correct), quantity}` + `table_number`. Attendu: 200/201, un id de commande. Retirer le `test.skip`.
- 07 "manipulation de prix": meme appel mais avec un `price` plus bas que le prix DB. Attendu: rejet (400 / message de validation / `price_mismatch`). Retirer le `test.skip`.
- Acceptance: les deux tests passent sur staging.

### T3 - Parcours 02 configuration

Fichier: `tests/journeys/02-restaurant-config.spec.ts`.

- Identifier comment l'admin cree menu/items/tables/coupons (Server Actions dans `src/app/actions/` ou pages admin). Si Server Action: l'appeler via une page authentifiee Playwright (browser context du persona owner). Si endpoint REST: l'appeler en API.
- Creer 1 categorie, 1 item, 1 table, 1 coupon valide. Asserter leur presence (lecture API ou DB de test).
- Retirer les 3 `test.skip`.
- Acceptance: les objets sont crees et verifies.

### T4 - Parcours 03 permissions par rôle

Fichier: `tests/journeys/03-staff-permissions.spec.ts`.

- `ensureAuthUser` pour manager/server/kitchen/cashier (deja code). Rattacher chacun au tenant avec son rôle via le flux d'invitation (`/api/invitations` + `invitations/accept`) ou directement en base de test (table `admin_users` avec `role`).
- Se connecter en manager: asserter le refus (401/403) sur une action super_admin (ex: console plateforme `/api/admin/*` ou suppression de tenant). Se connecter en owner: asserter l'acces autorise.
- Retirer les 2 `test.skip`.
- Acceptance: matrice rôle x action verifiee (au moins manager refuse / owner autorise).

### T5 - Parcours 01 activation abonnement + 06 cycle de vie (Stripe test)

Fichiers: `01-signup-and-billing.spec.ts`, `06-subscription-lifecycle.spec.ts`, `fixtures/stripe.ts`.

- 01: apres `create-checkout-session`, completer le paiement en mode test, puis declencher le webhook (`stripe listen --forward-to localhost:3000/api/webhooks/stripe` + `stripe trigger checkout.session.completed`). Asserter que l'abonnement passe actif (lecture etat via endpoint ou DB de test). Retirer le `test.skip`.
- 06: au checkout, attacher le `test_clock` (createTestClock existe). Avancer l'horloge (advanceTestClock) d'un mois: asserter le renouvellement. Tester aussi echec de paiement (carte de test qui echoue) -> statut past_due, et annulation -> perte d'acces en fin de periode. Retirer les `test.skip`.
- Acceptance: abonnement actif apres webhook; renouvellement/echec/annulation asseres via Test Clock.

### T6 - Parcours 05 paiements (cash, Wave, Orange Money)

Fichier: `tests/journeys/05-payments.spec.ts`.

- Cash (POS): depuis une commande creee (T2), passer payee via le chemin POS; asserter le statut.
- Wave / Orange Money: si sandbox dispo, `POST /api/orders/<id>/pay-wave` et `/pay-orange-money`; sinon mocker le provider et tester le callback (`/api/wave/webhook`, `/api/orange-money/callback`). Verifier qu'un echec laisse la commande NON payee.
- Retirer les 4 `test.skip`.
- Acceptance: succes -> payee; echec -> impayee.

### T7 - Parcours 04 KDS temps reel

Fichier: `tests/journeys/04-service-and-ordering.spec.ts`.

- Ouvrir le KDS dans un browser context authentifie (persona kitchen). Creer une commande (T2). Asserter qu'elle apparait via le broadcast realtime (scope par commande, cf. #127). Changer le statut, verifier la propagation.
- Acceptance: la commande apparait cote cuisine en < quelques secondes.

### T8 - Integrer le test BOLA

Fichier source: `security/generated-tests/security-bola.spec.ts`.

- Le deplacer dans `tests/journeys/08-bola.spec.ts` (ou `tests/e2e/security/`). Renseigner deux tenants de test (A et B via seed) et de vrais ids cross-tenant. Retirer le `test.skip`.
- Acceptance: chaque acces cross-tenant est refuse (401/403/404) ou ne renvoie aucune donnee de l'autre tenant.

### T9 - Optionnel (defense en profondeur)

- Revalider le prix DANS `create_order_with_items` (comparer `price_at_order` au prix `menu_items`/`item_price_variants`, lever `price_mismatch`) via une nouvelle migration. Non urgent (EXECUTE deja limite a service_role).
- Ajouter un hook gitleaks en pre-commit (`.husky/pre-commit`): `gitleaks protect --staged --redact -v`.

## Definition de "termine" pour ce plan

- Aucun `test.skip` restant dans `tests/journeys/0*.spec.ts` (hors cas explicitement justifies par manque de sandbox provider).
- `pnpm test:journey` vert sur staging, `JOURNEY_CONFIRM_TEST_DB=yes`.
- `k6 run tests/journeys/load/order-rush.k6.js` sous les seuils (p95 < 1,5 s, < 1% erreurs) sur staging.
- Les 5 portes CI vertes. Aucune regression sur la suite existante (`tests/e2e/`).
- Les actions dashboard (advisors live, leaked password protection, MFA) confirmees hors-code.

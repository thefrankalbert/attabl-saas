# Harnais E2E "journee complete" (journey-harness) - Guide technique

> Genere le 2026-06-29. Documente le travail de la branche `feat/journey-harness`.

## Vue d'ensemble

La branche `feat/journey-harness` ajoute un harnais de tests de bout en bout (E2E) qui rejoue **une journee de travail Attabl complete** : creation de compte restaurateur, paiement du plan, configuration, equipe et roles, service et commandes, encaissement, cycle de vie de l'abonnement dans le temps, cas limites de securite, plus un test de charge "coup de feu" (100 convives simultanes).

Tout vit sous `tests/journeys/` avec sa **propre config Playwright** (`tests/journeys/playwright.config.ts`), totalement **isolee** de la suite E2E existante (`tests/e2e/`). La config racine ne scanne que `tests/e2e`, donc rien de l'existant n'est touche ni declenche par ce harnais.

Point important sur le perimetre de la branche : sur les 7 commits entre `main` et `feat/journey-harness`, **seuls 5 concernent le harnais** (`1d614b9`, `2338360`, `40a2a08`, `9e6a400`, `2e0c26c`). Les 2 premiers (`f5d196c`, `ea09f62`) appartiennent au travail offline-first (idempotence des commandes + outbox client) qui a ete merge par ailleurs (PR #140) et se retrouve ici parce que la branche en derive. Les modifications de `src/app/api/orders/pos/route.ts`, `src/app/api/orders/route.ts`, `src/lib/offline/*`, `src/hooks/*`, les migrations `20260628*` et les fichiers `security/*` (sauf les retouches ASCII) **ne font pas partie du harnais** proprement dit. Le harnais lui-meme ne touche que : `tests/journeys/`, `scripts/run-journeys-local.sh`, `package.json` (3 scripts + `@types/ws`), `.prettierignore`, et 2 retouches ASCII dans `security/scripts/`.

## Ce qui a ete construit

Fichiers du harnais :

- **Specs (8)** : `tests/journeys/00-preflight.spec.ts` a `tests/journeys/07-edge-cases-security.spec.ts`
- **Fixtures** :
  - `tests/journeys/fixtures/env.ts` - config env + garde-fous anti-prod
  - `tests/journeys/fixtures/global-setup.ts` - garde-fou fail-closed global
  - `tests/journeys/fixtures/seed.ts` - seed/teardown via service_role
  - `tests/journeys/fixtures/personas.ts` - l'equipe + clients, sessions isolees
  - `tests/journeys/fixtures/stripe.ts` - helper Stripe Test Clocks
  - `tests/journeys/fixtures/schema.sql` - snapshot du schema prod (4853 lignes, 42 tables)
- **Charge** : `tests/journeys/load/order-rush.k6.js` - test k6
- **Config** : `tests/journeys/playwright.config.ts`, `tests/journeys/.env.journeys.example`, `tests/journeys/.gitignore`
- **Doc** : `tests/journeys/README.md`
- **Runner local** : `scripts/run-journeys-local.sh`
- **Scripts package.json** : `test:journey`, `test:journey:ui`, `load:k6`

La config Playwright force `workers: 1` et `fullyParallel: false` : une journee de travail est **ordonnee** et partage un meme tenant seede, donc deroule sequentiel voulu. `retries: 0`, `timeout: 60s`, reporters `list` + `html` (sortie `playwright-report-journeys/`, gitignoree).

## Detail par journey

Convention : tous les `describe` sont `.serial`. "REEL" = tourne reellement ; "SKIP" = `test.skip(...)`. Le seed direct (tenant/menu/equipe) est conditionne par `hasSeedEnv()` (presence de `JOURNEY_SUPABASE_URL` + `JOURNEY_SUPABASE_SERVICE_ROLE_KEY`).

| Journey                       | Test                                  | Etat                | Detail / raison du skip                                                                                                                                                                           |
| ----------------------------- | ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **00 preflight**              | garde-fou pas de prod                 | REEL                | `assertNotProduction()` ne throw pas                                                                                                                                                              |
|                               | serveur cible repond                  | REEL                | `GET /api/health` < 500                                                                                                                                                                           |
|                               | etat de la config (info)              | REEL                | log informatif (baseURL, seedDB, stripeTest, tenant)                                                                                                                                              |
|                               | base propre                           | REEL si seed        | `test.skip(!hasSeedEnv())` ; sinon `teardownTenantBySlug()`                                                                                                                                       |
| **01 signup & billing**       | signup proprietaire                   | REEL                | `POST /api/signup`, accepte 200/201/400/409 (re-run-safe). NB: les champs `restaurantName`/`ownerName` sont commentes "a confirmer selon le schema" -> dette potentielle si le schema Zod differe |
|                               | login proprietaire                    | REEL si seed        | confirme l'email via client admin (`ensureAuthUser`) avant `/api/login`, sinon 403. Verifie `/api/onboarding/state` < 400                                                                         |
|                               | checkout Stripe                       | REEL si Stripe test | `test.skip(!hasStripeTestEnv())` : `POST /api/create-checkout-session` (plan starter mensuel), attend url/sessionId/client_secret                                                                 |
|                               | abonnement actif apres webhook        | **SKIP dur**        | necessite `stripe listen` + `stripe trigger`, non automatise                                                                                                                                      |
| **02 restaurant-config**      | acces espace (onboarding/state)       | REEL si seed        | `beforeAll` seede tenant+menu+OWNER ; sinon tout le bloc skip                                                                                                                                     |
|                               | menu seede visible                    | REEL si seed        | `GET /api/menu-search` 200, l'item "Poulet braise" doit apparaitre                                                                                                                                |
|                               | creer tables et zones (QR)            | **SKIP dur**        | creation via UI admin / Server Action, pas de route REST                                                                                                                                          |
|                               | creer un coupon                       | **SKIP dur**        | pas de route REST POST ; la VALIDATION est testee en 07                                                                                                                                           |
| **03 staff-permissions**      | route sensible refuse anonyme         | REEL                | `POST /api/admin/reset` non authentifie : 401/403/400/404, jamais 200                                                                                                                             |
|                               | manager ne peut pas reset             | REEL si seed        | `MANAGER` connecte -> `/api/admin/reset` doit etre 401/403, jamais 200                                                                                                                            |
| **04 service-and-ordering**   | commande vide rejetee                 | REEL                | `POST /api/orders` items vides : 400/422/429, jamais 2xx                                                                                                                                          |
|                               | convive commande valide (QR)          | REEL si seed        | prix correct -> 200/201 (429 tolere)                                                                                                                                                              |
|                               | manipulation de prix rejetee          | REEL si seed        | prix falsifie -> >= 400 (revalidation serveur `order.service.validateOrderItems`)                                                                                                                 |
|                               | caissier encaisse POS cash            | REEL si seed        | `POST /api/orders/pos` (cash) -> 200, `payment_status === 'paid'`                                                                                                                                 |
|                               | commande POS routee cuisine (KDS)     | REEL si seed        | `preparation_zone` in {kitchen,bar,both,mixed}. NB: le push temps reel n'est PAS asserte                                                                                                          |
| **05 payments**               | encaissement cash (POS)               | **SKIP (doc)**      | cash uniquement; couvert EN REEL par 04 (POS cash -> paid). Tests Wave/Orange Money/echec RETIRES (mobile money retire du produit, routes supprimees)                                             |
| **06 subscription-lifecycle** | creer Test Clock + avancer temps      | REEL si Stripe test | cree une horloge, avance ~1 mois. NE rattache PAS de subscription a l'horloge (TODO) -> n'asserte aucun renouvellement                                                                            |
|                               | echec paiement -> past_due            | **SKIP dur**        | carte qui echoue + Test Clock, non cable                                                                                                                                                          |
|                               | annulation -> acces retire            | **SKIP dur**        | annuler + avancer horloge, non cable                                                                                                                                                              |
| **07 edge-cases-security**    | coupon invalide refuse                | REEL                | `POST /api/coupons/validate` : jamais valid:true                                                                                                                                                  |
|                               | rate limiting                         | REEL                | 25 POST : aucun 5xx ; 429 attendu mais NON exige (log informatif)                                                                                                                                 |
|                               | action sensible refuse anonyme        | REEL                | `POST /api/admin/reset` jamais 200                                                                                                                                                                |
|                               | manipulation de prix (price_mismatch) | **SKIP dur**        | doublon couvert en 04                                                                                                                                                                             |
|                               | isolation cross-tenant (BOLA)         | **SKIP dur**        | renvoie vers `security/generated-tests/security-bola.spec.ts`                                                                                                                                     |

**Bilan reel vs skip** : tournent sans seed -> preflight, signup, login refus anonyme, commande vide, coupon invalide, rate limit, refus action sensible. Avec base de test seedee -> 02/03/04 happy-path (menu visible, permissions, commande valide, anti-fraude prix, POS cash, routage KDS). Avec cle Stripe test -> checkout (01) + creation Test Clock (06). En SKIP dur (TODO documentes) : webhook abonnement, creation tables/zones/coupons, scenarios de renouvellement/annulation Stripe, BOLA. Le parcours 05 est reduit a une note (cash couvert en 04) : les tests paiement Wave/Orange Money ont ete retires (mobile money retire du produit).

## Infrastructure et securite du harnais

### Garde-fous anti-prod (fail-closed) - le coeur de la securite

`tests/journeys/fixtures/env.ts` definit deux denylists et trois assertions :

- `PROD_SUPABASE_REFS = ['nqufpobuozrzwpeijkxt']` (ref Supabase prod)
- `PROD_APP_HOSTS = ['attabl.com', 'attabl-saas.vercel.app']`
- `assertNotProduction()` : throw si `JOURNEY_SUPABASE_URL` contient le ref prod, OU si la cle Stripe ne commence pas par `sk_test_`. Protege le **chemin seed direct** (service_role).
- `assertAppTargetIsTest()` : throw si `JOURNEY_BASE_URL` est un hote prod, OU si `JOURNEY_CONFIRM_TEST_DB !== 'yes'`. Ferme le **trou du chemin app** : en local, `pnpm dev` lit `.env.local` qui pointe sur la PROD ; un signup/commande ecrirait donc en prod via l'app meme si le seed direct est protege. Comme on ne peut pas lire a distance la DB ciblee par l'app, on exige une confirmation explicite de l'operateur.

`tests/journeys/fixtures/global-setup.ts` appelle les deux assertions **une fois avant tous les parcours** (via `globalSetup`). S'il throw, Playwright avorte tout le run. C'est le verrou central.

Cote k6 (`load/order-rush.k6.js`) : `setup()` refuse de tourner sans `K6_CONFIRM=yes`, ET applique sa propre denylist d'hotes prod meme si `K6_CONFIRM=yes`.

### Seed / teardown (`fixtures/seed.ts`)

- Client `getAdmin()` : `createClient(service_role)` avec `autoRefreshToken:false`, `persistSession:false`, et **polyfill `WebSocket` depuis `ws`** (le worker Playwright Node n'a pas de WebSocket global que supabase-js realtime sonde a l'instanciation). D'ou l'ajout de `@types/ws`.
- `assertNotProduction()` est appele dans **chaque** fonction d'ecriture avant toute requete.
- `teardownTenantBySlug()` : purge d'abord `orders` (FK RESTRICT order_items -> menu_items empeche le cascade tenant tant que des commandes existent), puis delete le tenant en cascade. Idempotent.
- `ensureAuthUser()` : cree un user auth `email_confirm:true` ; s'il existe deja, force `email_confirm` + password (sinon `/api/login` renvoie 403).
- `seedTenantWithMenu()` : insere tenant(`is_active:true`) + menu + categorie + menu_item ("Poulet braise", prix 2500).
- `seedStaffForTenant()` : mappe les roles personas vers l'enum DB (`server->waiter`, `kitchen->chef`).
- `getOrderState()` : lit `payment_status, status, preparation_zone, server_id`.

### Personas (`fixtures/personas.ts`)

Restaurant : owner(super_admin), manager, server(POS/waiter), kitchen(KDS/chef), cashier. Client : convive QR anonyme, client a emporter. Chaque persona authentifie obtient son propre `APIRequestContext`.

- `newApiContext()` : contexte anonyme avec deux en-tetes critiques : `origin: baseURL` (sans Origin autorise, `verifyOrigin` CSRF renvoie 403) et `referer: <baseURL>/sites/<slug>/` (en local le middleware `proxy.ts` supprime tout `x-tenant-slug` client et derive le tenant du Referer).
- `loginPersona()` : `POST /api/login` avec `cfToken: 'dev-bypass'` (Turnstile desactive via `ALLOW_DEV_AUTH_BYPASS=true`).

### Stripe (`fixtures/stripe.ts`)

Appelle directement l'API REST `api.stripe.com` (pas de dependance ajoutee). `createTestClock()` et `advanceTestClock()` pour le parcours 06.

### k6 (`load/order-rush.k6.js`)

Scenario `ramping-vus` : montee 30s -> pic `K6_PEAK_VUS` (defaut 100) 1m -> plateau 1m -> reflux 30s. Seuils : `http_req_failed < 1%`, `p95 < 1500ms`, `errors < 5%`. **Non destructif** : tape `/api/coupons/validate` (exerce resolution tenant + rate limit + DB sans creer de commande).

### Runner local reproductible (`scripts/run-journeys-local.sh`)

Debloque l'execution complete en local, en contournant le probleme connu (chaine de migrations du repo pas auto-suffisante). Demarche :

1. `supabase init` + ecarte les migrations repo dans un tmp (sinon `supabase start` rejoue une chaine cassee).
2. Desactive `enable_confirmations` dans `config.toml` (signup->login local sans email).
3. `supabase start` (stack local vierge).
4. Charge le **snapshot schema prod** (`fixtures/schema.sql`, 42 tables) via psql.
5. Rejoue **uniquement les migrations dont le timestamp > `FIXTURE_MARKER=20260628000000`** (deltas de branche pas encore en prod).
6. Lance `pnpm dev` sur le port 3100 avec un env Supabase local inline (ne touche pas `.env.local`), `ALLOW_DEV_AUTH_BYPASS=true`, et **`UPSTASH_REDIS_REST_URL/TOKEN` vides** (isole le rate limiting de la prod).
7. Attend `/api/health`, puis lance Playwright avec l'URL+cle service_role locales, `JOURNEY_CONFIRM_TEST_DB=yes`, et `JOURNEY_STRIPE_SECRET_KEY` si fournie.
8. `cleanup()` (trap EXIT) : kill dev server, `supabase stop`, restaure les migrations, supprime les artefacts. Interrupt-safe.

Usage : `bash scripts/run-journeys-local.sh` (tout) ou `bash scripts/run-journeys-local.sh 04-service` (filtre).

## Comment lancer

**Voie recommandee - tout local, zero risque prod** (Docker lance, supabase CLI, `pnpm install`) :

```bash
bash scripts/run-journeys-local.sh                 # tous les parcours
bash scripts/run-journeys-local.sh 04-service      # un seul
JOURNEY_STRIPE_SECRET_KEY=sk_test_xxx bash scripts/run-journeys-local.sh   # avec Stripe
```

**Voie manuelle (dev/staging)** :

```bash
ALLOW_DEV_AUTH_BYPASS=true pnpm dev                 # SUR UNE BASE DE TEST, pas .env.local prod
cp tests/journeys/.env.journeys.example tests/journeys/.env.journeys   # remplir
set -a && source tests/journeys/.env.journeys && set +a
JOURNEY_CONFIRM_TEST_DB=yes pnpm test:journey
```

**Charge k6** : `K6_CONFIRM=yes BASE_URL=http://localhost:3000 TENANT_SLUG=journey-test k6 run tests/journeys/load/order-rush.k6.js`.

**Ce qui bloque un run live local** :

- Sans `JOURNEY_CONFIRM_TEST_DB=yes` -> `globalSetup` avorte (fail-closed).
- `JOURNEY_BASE_URL` vers un hote prod -> avorte.
- Sans `JOURNEY_SUPABASE_URL`/`SERVICE_ROLE_KEY` -> blocs "seede" skippes (les tests sans seed tournent).
- Sans `JOURNEY_STRIPE_SECRET_KEY` (sk*test*) -> checkout (01) et Test Clock (06) skippes ; une `sk_live_` fait avorter.

## Limites connues, skips et dette technique

1. **Beaucoup de parcours sont des squelettes `test.skip(true)`** avec TODO inline : webhook abonnement (01), creation tables/zones/coupons (02), renouvellement/echec/annulation Stripe (06), price_mismatch et BOLA (07). Couverture annoncee mais non livree.
2. **Le parcours 06 ne teste pas reellement le cycle de vie abonnement** : il cree une Test Clock et avance le temps, mais ne rattache aucune subscription a l'horloge ni n'asserte de mise a jour en base.
3. **Champs signup non confirmes** (01) : la tolerance `[200,201,400,409]` peut masquer un signup casse en validant un 400.
4. **Le test rate limit (07) n'exige pas de 429** ; de plus, le runner local desactive le rate limiting (Upstash vide), donc cet aspect n'est jamais reellement exerce en local.
5. **Routage KDS partiellement asserte** (04) : la `preparation_zone` est verifiee, mais le push temps reel (broadcast) ne l'est pas.
6. **BOLA pointe vers un fichier hors harnais** (`security/generated-tests/security-bola.spec.ts`, "a deplacer dans tests/").
7. **Le snapshot `schema.sql` est un artefact a maintenir a la main** : il fige le schema prod a `FIXTURE_MARKER=20260628000000`. Toute migration future doit garder ce marqueur coherent.
8. **Confusion de perimetre de branche** : la branche embarque aussi le travail offline-first. Pour une PR "harnais seule", il faudrait isoler les 5 commits journeys.

## Note 2026-06-29 - retrait du mobile money

Les parcours 05 (Wave / Orange Money) restent en SKIP : ces moyens de paiement ont ete **retires du produit** (cash uniquement pour l'instant). Voir `docs/MOBILE-MONEY-RETRAIT.md`. Les squelettes de test sont conserves comme reference pour une re-activation future ; ils ne couvrent rien tant que les providers ne sont pas reactives.

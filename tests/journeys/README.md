# Harnais "journee complete" - simulation et tests temps reel

Rejoue une journee de travail Attabl de bout en bout: creation de compte, paiement du plan, configuration, equipe (rôles), service, commandes, encaissement, cycle d'abonnement dans le temps, cas limites de securite, et charge (100 convives). Objectif: prouver que le SaaS est pret pour la prod, sans surprise.

Isole de la suite existante (`tests/e2e/`): rien de ton setup actuel n'est touche. Tout vit dans `tests/journeys/` avec sa propre config.

## Securite d'abord

- Le harnais refuse de seed/teardown la PROD: le ref Supabase de prod (`nqufpobuozrzwpeijkxt`) est en denylist (`fixtures/env.ts`).
- Stripe: cle `sk_test_` exigee, une cle `sk_live_` est refusee.
- k6: ne tourne que si `K6_CONFIRM=yes`.
- Cible local ou staging. Ne lance pas les parcours destructifs contre la prod.

## Pre-requis

```bash
# Playwright (deja dans le repo)
npx playwright install chromium
# k6 pour le test de charge
brew install k6      # ou https://k6.io/docs/get-started/installation/
# Stripe CLI pour les webhooks (parcours 1 et 6)
brew install stripe/stripe-cli/stripe
```

Copier la config: `cp tests/journeys/.env.journeys.example tests/journeys/.env.journeys` puis remplir.

## Lancer

Phase 1 - local / staging (recommande d'abord):

> GARDE-FOU PROD (fail-closed). Le harnais pilote l'app sur `JOURNEY_BASE_URL`.
> Or `pnpm dev` lit `.env.local` dont `NEXT_PUBLIC_SUPABASE_URL` pointe sur la
> PROD: lance donc le dev server avec un env Supabase de TEST, puis confirme avec
> `JOURNEY_CONFIRM_TEST_DB=yes`. Sans cette variable - ou si `JOURNEY_BASE_URL`
> vise un hote de prod (attabl.com) - le `globalSetup` Playwright avorte tout le
> run (aucun signup/commande n'atteint la prod).

```bash
# 1. Lancer l'app en dev SUR UNE BASE DE TEST (Turnstile off, auth bypass localhost)
#    -> fournis un env Supabase de test au dev server (pas le .env.local de prod)
ALLOW_DEV_AUTH_BYPASS=true pnpm dev

# 2. Dans un autre terminal, charger l'env et jouer la journee
set -a && source tests/journeys/.env.journeys && set +a
JOURNEY_CONFIRM_TEST_DB=yes npx playwright test --config tests/journeys/playwright.config.ts

# UI interactive
JOURNEY_CONFIRM_TEST_DB=yes npx playwright test --config tests/journeys/playwright.config.ts --ui
```

Webhooks Stripe (parcours 1 et 6), dans un terminal dedie:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
```

Test de charge (100 convives):

```bash
K6_CONFIRM=yes BASE_URL=http://localhost:3000 TENANT_SLUG=journey-test \
  k6 run tests/journeys/load/order-rush.k6.js
```

## Ce qui tourne deja vs ce qui reste a cabler

Reel et runnable maintenant: preflight, signup+login, validation de commande vide, coupon invalide, rate limiting, refus d'action sensible non authentifiee, checkout Stripe (si cle test), Test Clocks (si cle test), charge k6.

A cabler (marque TODO/skip dans les specs, car depend de l'UI admin, de Server Actions, ou de donnees seedees): creation tables/coupons, push KDS temps reel, webhook abonnement Stripe, scenarios renouvellement/annulation. Chaque TODO indique precisement quoi brancher.

Note paiements: cash uniquement. Le mobile money (Wave, Orange Money, MTN MoMo, Free Money) a ete retire du produit (cf. `docs/MOBILE-MONEY-RETRAIT.md`); les tests fournisseurs du parcours 05 ont ete retires.

Conseil: confie chaque TODO a Claude Code un par un (ex: "cable le parcours 04 happy-path avec les menu_item_id du tenant seede"). La structure, les personas et les garde-fous sont deja en place.

## Personas (l'equipe)

Cote restaurant: owner/super_admin, manager, serveur (POS), cuisine (KDS), caissier. Cote client: convive QR (token anonyme), emporter. Definis dans `fixtures/personas.ts`, chacun avec sa session isolee.

## Phase 2 - monitoring temps reel en prod (Checkly)

Une fois la phase 1 verte, promouvoir les parcours NON destructifs (preflight, login, coupon invalide, health) en monitoring planifie:

1. `npm i -g checkly` puis `checkly login`.
2. Reutiliser les memes fichiers Playwright (Checkly execute du Playwright natif).
3. Planifier toutes les 5-10 min depuis plusieurs regions, alertes email/Slack.
4. Ne JAMAIS mettre en monitoring prod les parcours qui creent des commandes ou des comptes: garder ceux-la sur staging.

Reference: Checkly (monitoring-as-code base sur Playwright) ou Datadog Synthetics.

## Definition de "pret pour la prod"

Les parcours critiques (signup-paiement, commande-encaissement) au vert sur staging, le test de charge sous les seuils (p95 < 1,5 s, < 1% d'erreurs), et les parcours non destructifs surveilles en continu sur la prod sans alerte.

# ATTABL SaaS — Contexte technique & outils

Ce fichier liste **tous les services et outils tiers** utilisés par le projet
ATTABL SaaS, leur rôle, les variables d'environnement associées, et les
fichiers/dossiers où ils sont câblés. Source de vérité pour onboarder un
nouveau dev (ou un agent IA) en 2 minutes.

> Pour les conventions de code, l'architecture en couches, les règles de
> sécurité multi-tenant et les patterns Server/Client Components, voir
> `CLAUDE.md` à la racine. Ce fichier-ci se concentre uniquement sur le
> **catalogue des dépendances externes**.

---

## 1. Stack technique principale

| Outil                     | Version         | Rôle                                             | Fichiers clés                                     |
| ------------------------- | --------------- | ------------------------------------------------ | ------------------------------------------------- |
| **Next.js**               | 16 (App Router) | Framework full-stack                             | `next.config.mjs`, `src/app/**`                   |
| **React**                 | 19              | UI library                                       | partout dans `src/components/**`                  |
| **TypeScript**            | 5 (strict)      | Typage statique                                  | `tsconfig.json`                                   |
| **Tailwind CSS**          | v4              | Styles utilitaires                               | `src/app/globals.css`, `@tailwindcss/postcss`     |
| **Radix UI**              | latest          | Composants headless (Dialog, Select, Tabs, etc.) | `src/components/ui/**` (shadcn/ui wrappers)       |
| **Framer Motion**         | 12              | Animations (sheets, transitions)                 | `src/components/tenant/ItemDetailSheet.tsx`, etc. |
| **Lucide React**          | latest          | Icônes                                           | partout                                           |
| **next-intl**             | 4               | i18n FR/EN, locale per-tenant                    | `src/i18n/**`, `src/messages/{fr-FR,en-US}.json`  |
| **React Hook Form + Zod** | latest          | Formulaires + validation                         | `src/lib/validations/*.schema.ts`                 |
| **TanStack Query**        | 5               | Data fetching client + cache                     | `src/hooks/queries/**`, `src/hooks/mutations/**`  |
| **TanStack Table**        | 8               | Tableaux admin                                   | `src/components/admin/ResponsiveDataTable.tsx`    |
| **sonner**                | 2               | Toasts                                           | partout                                           |

---

## 2. Services externes — Catalogue complet

### 🗄️ Supabase — Base de données + Auth + Storage + Realtime

**Rôle** : Postgres managé, auth (email/password + OAuth Google/Azure), storage (logos, images plats), realtime subscriptions (KDS, orders en direct), RLS multi-tenant.

**Env vars** :

- `NEXT_PUBLIC_SUPABASE_URL` — URL projet
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — clé publique anon (RLS-protected)
- `SUPABASE_SERVICE_ROLE_KEY` — **CRITIQUE** : bypass RLS, JAMAIS côté client
- `DATABASE_URL` — connexion Postgres directe (port 5432)
- `DATABASE_URL_POOLED` — pooler Supavisor (port 6543, pour serverless)

**Fichiers clés** :

- `src/lib/supabase/client.ts` — browser client (anon)
- `src/lib/supabase/server.ts` — server components (anon + cookies)
- `src/lib/supabase/admin.ts` — service_role (signup, webhooks, super admin uniquement)
- `src/lib/supabase/middleware.ts` — refresh session
- `supabase/migrations/**` — toutes les migrations SQL (format `YYYYMMDDHHMMSS_name.sql`)
- `supabase/config.toml` — config locale CLI

**Règles d'usage** : voir `.claude/rules/01-security.md` et `.claude/rules/07-multi-tenant.md`. CHAQUE requête multi-tenant DOIT inclure `.eq('tenant_id', ...)` (belt & suspenders avec le RLS).

---

### 💳 Stripe — Paiements & abonnements

**Rôle** : abonnements mensuels/semestriels/annuels (plans Starter, Pro, Business, Enterprise), checkout sessions, customer portal, webhooks pour sync `subscription_status`.

**Env vars** :

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — clé publique
- `STRIPE_SECRET_KEY` — clé serveur (CRITIQUE)
- `STRIPE_WEBHOOK_SECRET` — vérification signature webhook
- `NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY` / `_SEMIANNUAL` / `_YEARLY` — IDs prix Stripe plan Starter
- `NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY` / `_SEMIANNUAL` / `_YEARLY` — IDs prix Stripe plan Pro
- `NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY` / `_SEMIANNUAL` / `_YEARLY` — IDs prix Stripe plan Business

**Fichiers clés** :

- `src/lib/stripe/**` — client + helpers
- `src/app/api/stripe/**` — checkout, webhook, customer portal routes
- `src/app/checkout/**` — pages success/cancel
- Plans gating : `src/lib/plans/features.ts` → `canAccessFeature()`

**Modèle** : `tenants.stripe_customer_id`, `tenants.stripe_subscription_id`, `tenants.subscription_plan`, `tenants.subscription_status`, `tenants.billing_interval`.

---

### 📧 Resend — Email transactionnel

**Rôle** : envoi des emails (confirmation signup, reset password, invitations admin, notifications commande, etc.)

**Env vars** :

- `RESEND_API_KEY` — clé API
- `RESEND_FROM_EMAIL` — adresse expéditeur (`noreply@attabl.com` par défaut)

**Dépendance** : `resend ^6.9.2`

**Fichiers clés** : recherche `from 'resend'` dans `src/services/**` et `src/app/api/**`.

---

### 🚨 Sentry — Monitoring d'erreurs

**Rôle** : capture automatique des erreurs (client + serveur + edge), source maps, performance monitoring.

**Env vars** :

- `SENTRY_DSN` — DSN serveur
- `NEXT_PUBLIC_SENTRY_DSN` — DSN client

**Dépendance** : `@sentry/nextjs ^10.38.0`

**Fichiers clés** :

- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `src/lib/logger.ts` — wrapper centralisé. **JAMAIS utiliser `console.*`**, toujours `logger.error/warn/info`

---

### ⚡ Upstash Redis — Rate limiting

**Rôle** : rate limiting fail-closed sur les routes API publiques (auth, signup, orders, coupons), sliding window.

**Env vars** :

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Dépendances** : `@upstash/redis ^1.36.2`, `@upstash/ratelimit ^2.0.8`

**Fichiers clés** :

- `src/lib/rate-limit.ts` — `orderLimiter`, `authLimiter`, `getClientIp()`
- Appliqué dans presque chaque route `src/app/api/**` en première étape

---

### ▲ Vercel — Hosting & déploiement

**Rôle** : hosting Next.js, preview branches, edge runtime, serverless functions, auto-deploy depuis GitHub.

**Config** :

- `vercel.json` — schéma `https://openapi.vercel.sh/vercel.json` (régions, headers, redirects)
- `next.config.mjs` — config Next (turbopack, image domains, etc.)

**Env vars** : configurées dans le dashboard Vercel (mêmes que `.env.local` localement). À chaque push, Vercel rebuild et propage.

**Domaines** :

- `attabl.com` — landing marketing (main domain)
- `*.attabl.com` — sous-domaines tenants (résolu par `proxy.ts`)
- Custom domains tenants (ex: `theblutable.com`) — résolus via `getCachedTenantByDomain()` dans `src/lib/cache.ts`

---

### 🐙 GitHub — Repo & CI/CD

**Rôle** : repo source, pull requests, GitHub Actions pour CI (5 portes de qualité avant merge sur main).

**Repo** : `github.com/thefrankalbert/attabl-saas`

**Workflows** : `.github/workflows/**`

- Gates: `pnpm typecheck` → `pnpm lint` → `pnpm format:check` → `pnpm test` → `pnpm build`
- Husky pre-commit local : critical files check + typecheck + tests + lint-staged

**Pre-commit hook** : `.husky/pre-commit` — bloque le commit si fichiers critiques (proxy.ts, supabase/\*.ts, rate-limit.ts) sont supprimés.

---

### 🌐 Cloudflare — DNS / CDN (optionnel)

**Rôle (planifié/optionnel)** : DNS pour `attabl.com` et les domaines custom des tenants, protection DDoS, CDN edge cache pour les assets statiques. **Pas de SDK ni d'env var dans le code aujourd'hui** — la couche Cloudflare est invisible côté app et se configure via le dashboard CF.

Si besoin d'API CF (ex: provisioning automatique de domaines tenants), envisager `@cloudflare/api` côté server actions admin.

---

### 🧠 Anthropic Claude API — IA / agents

**Rôle** : développement assisté par IA (Claude Code) pour cette session et les futures. Aussi potentiellement utilisé pour des features produit (ex: génération de descriptions plats, traduction auto, suggestions de menu).

**Env vars** :

- `ANTHROPIC_API_KEY` — clé API Claude

**Usage actuel** : tooling dev. Si on ajoute des features produit IA, créer un wrapper `src/lib/anthropic/` avec rate limiting + caching.

---

## 3. Outils de dev & CI

| Outil                   | Usage                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **pnpm**                | Package manager (lockfile `pnpm-lock.yaml`)                                                    |
| **TypeScript strict**   | `pnpm typecheck` (= `tsc --noEmit`)                                                            |
| **ESLint**              | `pnpm lint` (config `eslint.config.mjs`, 0 erreurs/0 warnings requis)                          |
| **Prettier**            | `pnpm format` / `pnpm format:check`                                                            |
| **Vitest**              | `pnpm test` (518 tests, ~3s) — services + schemas Zod + composants                             |
| **Playwright**          | `pnpm test:e2e` — E2E (nécessite serveur dev lancé)                                            |
| **Husky + lint-staged** | Pre-commit hook (auto-format + tests)                                                          |
| **Supabase CLI**        | `supabase migration new`, `supabase db push` (l'historique local doit être en format 14-digit) |

---

## 4. Variables d'environnement — checklist `.env.local`

Pour bootstrap un dev local, copier `.env.local.example` vers `.env.local` et remplir :

```bash
# Supabase (obligatoire)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>  # ⚠️ NE JAMAIS COMMIT
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
DATABASE_URL_POOLED=postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Stripe (optionnel en dev sans paiements)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...                  # ⚠️ NE JAMAIS COMMIT
STRIPE_WEBHOOK_SECRET=whsec_...                 # ⚠️ NE JAMAIS COMMIT
NEXT_PUBLIC_STRIPE_PRICE_ESSENTIEL=price_...
NEXT_PUBLIC_STRIPE_PRICE_ESSENTIEL_YEARLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_PREMIUM=price_...
NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_YEARLY=price_...

# Resend (obligatoire pour tester signup/invitations)
RESEND_API_KEY=re_...                           # ⚠️ NE JAMAIS COMMIT
RESEND_FROM_EMAIL=noreply@attabl.com

# Sentry (optionnel)
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# Upstash Redis (optionnel — fail-closed en prod, fail-open en dev si manquant)
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...                    # ⚠️ NE JAMAIS COMMIT

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_DOMAIN=localhost:3000
ALLOW_DEV_AUTH_BYPASS=true                      # dev only, bypass auth sur /admin

# Anthropic (uniquement si features IA produit)
ANTHROPIC_API_KEY=sk-ant-...                    # ⚠️ NE JAMAIS COMMIT
```

**Règles secrets** :

- `.env.local`, `.env.production`, `.env*` sont dans `.gitignore` — vérifier `.env.local.example` reste à jour
- JAMAIS commiter les clés `*_SECRET`, `*_SERVICE_ROLE_KEY`, `*_API_KEY`
- En prod (Vercel) : configurer via le dashboard Project Settings → Environment Variables

---

## 5. Architecture multi-tenant — rappel express

```
attabl.com                   → landing marketing
restaurant.attabl.com        → tenant via subdomain (proxy.ts rewrite)
theblutable.com              → tenant via custom domain (cache.ts lookup)
restaurant.attabl.com/admin  → dashboard admin (auth required)
restaurant.attabl.com/cart   → panier client
```

Le `proxy.ts` (middleware) :

1. Strip `x-tenant-slug` envoyé par le client (anti-spoof)
2. Extrait le subdomain ou résout le custom domain
3. Réécrit vers `/sites/[slug]/...`
4. Injecte `x-tenant-slug` dans les headers de la requête (server-trusted)

Voir `src/proxy.ts` pour le détail.

---

## 6. Liens utiles

- **Repo GitHub** : https://github.com/thefrankalbert/attabl-saas
- **Supabase project** : voir le dashboard Supabase (URL projet dans `.env.local`)
- **Vercel project** : https://vercel.com/<team>/attabl-saas
- **Stripe dashboard** : https://dashboard.stripe.com (test + live)
- **Sentry project** : https://sentry.io/organizations/<org>/projects/attabl-saas
- **Upstash console** : https://console.upstash.com — instance Redis `attabl-ratelimit` sur `amusing-quetzal-78385.upstash.io` (Free Tier, AWS Frankfurt). Compte lie au GitHub `thefrankalbert`. Utilise pour le rate limiting de toutes les API routes en production (fail-closed sur les endpoints auth/signup/checkout).
- **Resend dashboard** : https://resend.com

Documentation interne :

- `CLAUDE.md` — instructions IA + conventions de code
- `.claude/rules/**` — règles détaillées (security, multi-tenant, responsive, testing, etc.)
- `agent_docs/architecture.md` — architecture en couches détaillée
- `agent_docs/database-conventions.md` — conventions DB et migrations
- `agent_docs/security-patterns.md` — patterns de sécurité

---

## 7. Regles de developpement — OBLIGATOIRES

Ces regles ont ete etablies apres un audit complet (16 fixes). Elles empechent
les memes problemes de revenir. **Toute PR qui viole ces regles doit etre
bloquee.**

### 7.1 Responsive & CSS

- **JAMAIS de `w-[Xpx]`** sur un conteneur layout (> 64px). Utiliser `w-full max-w-[Xpx]` a la place. Les largeurs fixes sont OK uniquement pour les icones (< 64px), avatars, et la sidebar.
- **JAMAIS de `style={{}}` avec des valeurs statiques** dans les composants. Convertir en classes Tailwind. Les styles inline sont autorises UNIQUEMENT pour les valeurs dynamiques (variables, props, tokens `C.*`).
- **Les composants admin** (rendus dans la zone de contenu a droite de la sidebar) doivent utiliser des **`@container` queries** (`@sm:`, `@md:`, `@lg:`) et NON des media queries (`sm:`, `md:`, `lg:`). Les media queries reagissent au viewport, pas a l'espace disponible du conteneur.
- **Toujours tester** aux 3 viewports : 375px (mobile), 768px (tablette), 1024px+ (desktop).
- **La sidebar admin** est visible uniquement a partir de `lg:` (1024px). En dessous, c'est le `AdminBottomNav` qui prend le relais.

### 7.2 Securite

- **CSP dynamique** avec nonce par requete (genere dans `proxy.ts`, construit via `src/lib/csp.ts`). JAMAIS de `'unsafe-inline'` dans `script-src`.
- **CSRF** : toute route POST publique (sans auth) doit appeler `verifyOrigin(request)` de `src/lib/csrf.ts` en premier.
- **Rate limiting** : chaque route API doit avoir un limiter. Les endpoints auth/checkout sont `fail-closed`.
- **Sentry** : le `beforeSend` filtre les `request.data`, `cookies`, et `query_string` avant envoi. JAMAIS de PII dans les events Sentry.
- **Invitation tokens** : TTL = 24h (pas 72h). One-time consumption via status `accepted`.
- **SameSite=strict** sur tous les cookies de session Supabase.
- **RLS WITH CHECK** obligatoire sur TOUTES les policies UPDATE et INSERT.
- **CHECK constraint** sur `orders.status` : seuls `pending/confirmed/preparing/ready/delivered/served/cancelled` sont autorises.

### 7.3 Currency & i18n

- **Devise par defaut = XOF (FCFA)** pour les tenants Burkina Faso. XAF et XOF s'affichent tous les deux comme "FCFA". Le `CurrencyContext.readStored()` normalise XAF → XOF automatiquement.
- **3 options de devise** dans le selector client : FCFA, Euro, Dollar. Pas de "FCFA (BEAC)".
- **`translate="no"`** + `<meta google notranslate>` sur `<html>` pour empecher Chrome de traduire automatiquement (produit "Maison" au lieu de "Home").
- La fonction `getTranslatedContent()` est dans `src/lib/utils/translate.ts` — NE PAS la redefinir dans chaque fichier.

### 7.4 Composants client (tenant)

- **Pas de vert `#06C167`** dans l'espace client. La couleur primaire des CTAs est `#1A1A1A` (noir). Le vert est reserve au dashboard admin si le tenant le configure via `primary_color`.
- **Pas de toast** sur "ajout au panier". Le sheet ferme directement avec un check anime.
- **Pas de `disabled:opacity-50`** sur le bouton "Passer la commande". Le spinner suffit comme indicateur de chargement.
- **Sections collapsibles** (code promo, pourboire, notes cuisine) : fermees par defaut, ouvrent au clic avec une icone contextuelle.
- **Barre flottante panier** : format `[icon] Voir le panier N • Prix`. Point blanc 5x5 comme separateur, pas de barre verticale, pas de parentheses.
- **Recommandations** : titre fixe "Vous aimerez aussi", co-occurrence RPC `get_co_ordered_items` en priorite, ne jamais cacher la section quand le panier a des items.
- **Venue/Carte UI rule (ClientMenuDetailPage)** : si chaque carte est liee a une venue (`menus.venue_id IS NOT NULL` pour toutes les cartes actives), la rangee "Venue tabs" doit etre masquee. Raison : les noms venue/carte sont souvent identiques en 1:1, ce qui empile deux rangees doublonnees et cree une confusion visuelle sur mobile 375px. Cliquer une carte-tab doit auto-synchroniser `activeVenueId` via `handleMenuChange`. Voir `ClientMenuDetailPage.tsx` flag `hideVenueRow`. Ne jamais re-afficher la rangee venue tant que toutes les cartes ont un `venue_id`.
- **Menu tabs single-row rule (ClientMenuDetailPage)** : quand l'utilisateur entre dans une carte via `?menu=<slug>`, la rangee "Menu tabs" (liste de toutes les cartes) doit etre masquee. Raison : l'utilisateur a deja choisi une carte, re-afficher toutes les autres cartes est du bruit de navigation. Le bouton retour du header sert de sortie vers la liste des cartes. Voir flag `hideMenuTabsRow`. La cible UX est UNE SEULE rangee de navigation au-dessus des items : la CategoryNav de la carte active.

### 7.5 Orders

- **`/orders`** = commandes ACTIVES uniquement (pending/confirmed/preparing/ready)
- **`/orders?history=true`** = commandes TERMINEES (delivered/served/cancelled), accessible depuis Compte > Historique
- **Pas de ActiveOrderBanner** separee. Toutes les commandes actives sont des cartes depliables avec OrderTracker.
- **Realtime** : channel name stable (`order-status-${tenantId}`), subscribe uniquement quand il y a des commandes actives.

### 7.6 PWA & Service Worker

- `skipWaiting: false` — les mises a jour du SW ne forcent pas le rechargement pendant l'utilisation.
- Le manifest dynamique per-tenant (`app/sites/[site]/manifest.ts`) n'est PAS servi par Next.js. Le manifest global `/manifest.json` est utilise.

---

## 8. Setup express pour un nouveau dev

```bash
git clone https://github.com/thefrankalbert/attabl-saas.git
cd attabl-saas
pnpm install
cp .env.local.example .env.local
# remplir .env.local avec les clés (voir section 4)
pnpm dev
# ouvrir http://localhost:3000
```

Pour tester le tenant Blutable en local : `http://localhost:3000/sites/blutable`.

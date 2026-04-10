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

**Rôle** : abonnements mensuels/annuels (plans Essentiel et Premium), checkout sessions, customer portal, webhooks pour sync `subscription_status`.

**Env vars** :

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — clé publique
- `STRIPE_SECRET_KEY` — clé serveur (CRITIQUE)
- `STRIPE_WEBHOOK_SECRET` — vérification signature webhook
- `NEXT_PUBLIC_STRIPE_PRICE_ESSENTIEL` / `_YEARLY` — IDs prix Stripe
- `NEXT_PUBLIC_STRIPE_PRICE_PREMIUM` / `_YEARLY` — idem

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
- **Upstash console** : https://console.upstash.com
- **Resend dashboard** : https://resend.com

Documentation interne :

- `CLAUDE.md` — instructions IA + conventions de code
- `.claude/rules/**` — règles détaillées (security, multi-tenant, responsive, testing, etc.)
- `agent_docs/architecture.md` — architecture en couches détaillée
- `agent_docs/database-conventions.md` — conventions DB et migrations
- `agent_docs/security-patterns.md` — patterns de sécurité

---

## 7. Setup express pour un nouveau dev

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

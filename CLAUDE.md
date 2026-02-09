# ATTABL SaaS - Instructions IA

## Description du projet

ATTABL est un SaaS multi-tenant B2B permettant aux restaurants et hotels de creer et gerer leurs menus digitaux, recevoir des commandes et generer des QR codes. Chaque tenant a son propre sous-domaine (ex: radisson.attabl.com).

## Stack Technique

- **Framework** : Next.js 16 (App Router) + React 19
- **Langage** : TypeScript 5 (mode strict active)
- **Base de donnees** : Supabase (PostgreSQL) - requetes directes via SDK
- **Auth** : Supabase Auth (email/password + OAuth Google/Azure)
- **Paiements** : Stripe (abonnements mensuels/annuels, plans Essentiel et Premium)
- **UI** : Tailwind CSS v4 + Radix UI + shadcn/ui
- **Formulaires** : React Hook Form + Zod
- **Deploiement** : Vercel

## Architecture

### Structure des dossiers

```
src/
  app/                    # Routes Next.js App Router
    (marketing)/          # Pages marketing (landing, features)
    actions/              # Server Actions (mutations)
    api/                  # API Routes (endpoints REST)
    sites/[site]/         # Routes dynamiques par tenant (sous-domaine)
      admin/              # Dashboard admin du tenant
      cart/               # Panier client
    admin/                # Super admin (gestion plateforme)
    auth/, login/, signup/, onboarding/, checkout/
  components/             # Composants React
    ui/                   # Composants shadcn/ui (ne pas modifier manuellement)
    admin/                # Composants admin
    tenant/               # Composants tenant (menu, cart)
    shared/               # Composants partages
  contexts/               # React Context (Cart, Tenant, Language)
  services/               # Logique metier (service layer)
  lib/                    # Utilitaires et configurations
    supabase/             # Clients Supabase (client, server, admin, middleware)
    stripe/               # Configuration Stripe
    auth/                 # Utilitaires d'authentification
    validations/          # Schemas Zod de validation
  types/                  # Types TypeScript
  middleware.ts           # Auth guard + routage sous-domaines
```

### Principes d'architecture

1. **Server Components par defaut** : Client Components uniquement pour l'interactivite (useState, onClick, etc.)
2. **Logique metier dans /services/** : Jamais de requetes DB ou logique complexe dans les composants React
3. **Validation Zod obligatoire** : Toute entree utilisateur (API, Server Actions) doit etre validee avec un schema Zod
4. **Multi-tenant** : Toujours filtrer par tenant_id. Le middleware injecte `x-tenant-slug` dans les headers
5. **3 clients Supabase** :
   - `client.ts` : navigateur (anon key) - composants client
   - `server.ts` : serveur (anon key + cookies) - Server Components, Server Actions, API routes
   - `admin.ts` : admin (service_role key) - uniquement pour signup, webhooks, operations admin

### Conventions de code

- Jamais de type `any` - utiliser des types explicites ou `unknown`
- Prefixer les Server Actions avec `action` (ex: `actionCreateOrder`)
- Un fichier = une responsabilite
- Nommer les fichiers en kebab-case (ex: `order.service.ts`)
- Nommer les composants en PascalCase (ex: `MenuItemCard.tsx`)
- Les schemas Zod dans `src/lib/validations/` nommes `[domaine].schema.ts`
- Les services dans `src/services/` nommes `[domaine].service.ts`

## Commandes

```bash
# Developpement
pnpm dev              # Lancer le serveur de dev
pnpm build            # Build production
pnpm start            # Demarrer en production

# Qualite du code
pnpm lint             # Verifier ESLint (0 erreurs, 0 warnings requis)
pnpm format           # Formater avec Prettier
pnpm format:check     # Verifier le formatage sans modifier
pnpm typecheck        # Verifier les types TypeScript (mode strict)

# Tests
pnpm test             # Lancer les tests unitaires (Vitest)
pnpm test:watch       # Tests en mode watch
pnpm test:coverage    # Tests avec rapport de couverture
pnpm test:e2e         # Tests E2E (Playwright — necessite le serveur dev)
pnpm test:e2e:ui      # Tests E2E avec UI interactive

# Base de donnees
pnpm db:migrate       # Appliquer les migrations Supabase (supabase db push)
```

### Pipeline CI/CD (GitHub Actions)

5 portes de qualite automatiques sur chaque PR vers `main` :

1. `pnpm typecheck` — Types TypeScript
2. `pnpm lint` — ESLint
3. `pnpm format:check` — Prettier
4. `pnpm test` — Tests unitaires (99 tests Vitest)
5. `pnpm build` — Build Next.js

## Multi-tenant : Flux de donnees

1. L'utilisateur accede a `radisson.attabl.com`
2. Le middleware extrait le sous-domaine `radisson`
3. L'URL est reecrite vers `/sites/radisson/...`
4. Le header `x-tenant-slug` est injecte
5. Les pages/API recuperent le tenant via ce header ou le parametre `[site]`
6. Toutes les requetes DB filtrent par `tenant_id`
7. Le RLS Supabase ajoute une couche de securite supplementaire

## Service Layer

### Pattern d'injection de dependances

Les services recoivent un client Supabase en parametre (testable, pas de couplage) :

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export function createOrderService(supabase: SupabaseClient) {
  return {
    async validateTenant(slug: string) { ... },
    async validateOrderItems(tenantId: string, items: OrderItemInput[]) { ... },
    async createOrderWithItems(input: CreateOrderInput) { ... },
  };
}
```

### Services disponibles (`src/services/`)

| Service                 | Responsabilite                                   |
| ----------------------- | ------------------------------------------------ |
| `errors.ts`             | Classe ServiceError + mapping code → HTTP status |
| `slug.service.ts`       | Generation de slugs uniques URL-safe             |
| `signup.service.ts`     | Inscription email + OAuth (avec rollback)        |
| `order.service.ts`      | Validation commandes + verification prix serveur |
| `tenant.service.ts`     | Mise a jour parametres tenant                    |
| `onboarding.service.ts` | Flux onboarding multi-etapes                     |

### Pattern des routes API (controleurs fins)

```
Rate limiting → Zod validation → Service call → JSON response
```

Les routes attrapent `ServiceError` et le convertissent en reponse HTTP via `serviceErrorToStatus()`.

## Monitoring et Logging

- **Sentry** : Capture automatique des erreurs client + serveur + edge
- **Logger centralise** (`src/lib/logger.ts`) : Utiliser `logger.error()`, `logger.warn()`, `logger.info()` — jamais `console.*`
- **Rate limiting** : Upstash Redis (sliding window) sur toutes les routes publiques

## Tests

- **Vitest** : Tests unitaires des services et schemas Zod (99 tests)
- **Playwright** : Tests E2E (configuration de base)
- Les tests des services utilisent des mocks Supabase injectes
- Les tests Zod verifient les cas limites de validation

## Securite

- Ne JAMAIS exposer `SUPABASE_SERVICE_ROLE_KEY` cote client
- Toujours utiliser `auth.getUser()` (pas `getSession()`) pour verifier l'authentification
- Valider les entrees avec Zod AVANT toute operation en base
- Le RLS est active sur toutes les tables multi-tenant
- Les Server Actions protegees doivent deriver le tenant_id de la session, pas l'accepter en parametre
- Rate limiting sur TOUS les endpoints publics (anti brute-force, anti spam)

## Documentation supplementaire

- `agent_docs/architecture.md` : Details sur l'architecture en couches
- `agent_docs/database-conventions.md` : Conventions base de donnees et migrations
- `agent_docs/security-patterns.md` : Patterns de securite detailles

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

## Typographie dans le code

REGLE STRICTE : Ne JAMAIS utiliser de caracteres Unicode speciaux dans le code, les fichiers i18n, ou les textes affiches a l'utilisateur. Utiliser uniquement des caracteres ASCII standards :

- INTERDIT : `—` (em dash U+2014) → UTILISER : `-` ou `-`
- INTERDIT : `–` (en dash U+2013) → UTILISER : `-`
- INTERDIT : `…` (ellipsis U+2026) → UTILISER : `...`
- INTERDIT : `'` `'` (smart quotes U+2018/U+2019) → UTILISER : `'`
- INTERDIT : `"` `"` (smart quotes U+201C/U+201D) → UTILISER : `"`
- INTERDIT : `«` `»` (guillemets francais U+00AB/U+00BB) → UTILISER : `"`

Cette regle s'applique a :

- Tous les fichiers src/messages/\*.json (i18n)
- Tous les textes dans les composants React (JSX)
- Tous les schemas Zod (messages d'erreur)
- Tous les commentaires dans le code

SEULE EXCEPTION : les fichiers Markdown (\*.md) et les documents generes (.docx, .pdf) peuvent utiliser la typographie riche.

## Regles d'integration de code externe

- Lorsqu'un fichier ou snippet de code est fourni comme reference, il doit etre integre TEL QUEL sans modification de structure, de noms de classes, ni de logique.
- Ne jamais renommer les composants, variables ou fonctions du code source fourni.
- Ne jamais remplacer les classes Tailwind par des equivalents "preferes".
- Ne jamais reorganiser l'ordre des elements JSX/TSX.
- Si une adaptation est necessaire (typage TS, imports manquants), la faire a la marge sans toucher au rendu visuel.
- En cas de doute, demander confirmation AVANT de modifier.

## Design

Pour toute tache frontend/design, voir .claude/skills/design-fidelity/SKILL.md

## Regles de securite - OBLIGATOIRES

### Secrets & Cles API

- JAMAIS de cle API, token, ou mot de passe en dur dans le code
- TOUS les secrets vont dans un fichier .env.local (jamais commite)
- Le fichier .env doit etre dans le .gitignore AVANT le premier commit
- Cote client (React, Next, etc.) : utiliser UNIQUEMENT les variables prefixees correctement (NEXT*PUBLIC*, VITE\_, etc.)
- Cote serveur : les cles sensibles (Stripe secret, Supabase service key) ne sont JAMAIS exposees au frontend

### Base de donnees (Supabase / Firebase)

- Row Level Security (RLS) ACTIVE sur TOUTES les tables sans exception
- Chaque table a au minimum 1 policy SELECT, 1 UPDATE, 1 DELETE
- Policy par defaut = RESTRICTIVE (tout est bloque sauf ce qui est explicitement autorise)
- Utiliser UNIQUEMENT auth.uid() dans les policies (JAMAIS user_metadata, l'utilisateur peut le modifier)
- La service key Supabase = BACKEND UNIQUEMENT, jamais dans le code client
- En client-side, utiliser UNIQUEMENT la anon key
- Ajouter WITH CHECK sur toutes les policies UPDATE et INSERT
- Creer un index sur user_id pour chaque table avec RLS

### Authentification

- Toute page protegee redirige vers /login si l'utilisateur n'est pas connecte
- Les tokens JWT sont valides cote serveur, pas uniquement cote client
- Le logout invalide la session completement (pas juste un redirect)
- Les cookies de session : Secure, HttpOnly, SameSite=Strict
- Implementer un refresh token avec expiration courte (15 min access, 7 jours refresh)

### Inputs utilisateur (injections)

- JAMAIS de concatenation directe dans les requetes SQL -> parameterized queries
  - INTERDIT : `db.query("SELECT * FROM users WHERE id = " + userId)`
  - CORRECT : `db.query("SELECT * FROM users WHERE id = $1", [userId])`
- JAMAIS de innerHTML ou dangerouslySetInnerHTML avec du contenu utilisateur
- Valider ET sanitizer chaque input cote serveur (pas seulement cote client)
- Echapper tout output affiche dans le HTML

### API & Reseau

- HTTPS obligatoire en production (jamais HTTP)
- CORS restreint : lister les domaines autorises explicitement
  - INTERDIT : `Access-Control-Allow-Origin: *`
  - CORRECT : `Access-Control-Allow-Origin: https://monapp.com`
- Rate limiting sur les endpoints sensibles (login, signup, paiement)
- Pas de secrets dans les URLs (`?apiKey=xxx` -> interdit)

### Dependances & Packages

- Verifier chaque package ajoute par l'IA dans package.json AVANT de commit
- Lancer `npm audit` (ou `pip audit`) regulierement
- Se mefier des packages peu connus ou recents suggeres par l'IA
- Pas de `eval()`, pas de `Function()`, pas d'execution dynamique de code

### Deploiement

- Variables d'environnement configurees dans le dashboard d'hebergement
- Le fichier .env n'est PAS dans le repo Git
- Tester le parcours complet en staging avant production
- Verifier qu'aucune erreur n'affiche de stack trace en production
- Headers de securite : Content-Security-Policy, X-Frame-Options, Strict-Transport-Security

## Documentation supplementaire

- `agent_docs/architecture.md` : Details sur l'architecture en couches
- `agent_docs/database-conventions.md` : Conventions base de donnees et migrations
- `agent_docs/security-patterns.md` : Patterns de securite detailles

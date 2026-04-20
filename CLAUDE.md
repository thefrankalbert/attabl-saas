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

## ZERO DETTE TECHNIQUE - REGLE ABSOLUE

REGLE : aucune tache, refonte, fix, ou feature n'est consideree TERMINEE tant que 100 % des problemes identifies sont corriges. Laisser des items "non bloquants" pour plus tard = dette technique = INTERDIT.

### Definition d'une tache "terminee"

Une tache est terminee si et seulement si :

1. **Les 5 portes CI passent** : typecheck, lint (`--max-warnings 0`), prettier, tests, build. Un seul warning laisse la tache non terminee.
2. **Aucun item d'audit n'est reporte** : chaque finding d'un audit (critical, high, medium, low, info) est soit corrige, soit explicitement marque "N/A" avec justification ecrite dans le PR/commit.
3. **Aucun fichier mort** : aucun composant, fonction, import, hook, ou asset non reference. Si quelque chose n'est plus utilise, il est SUPPRIME dans le meme commit.
4. **Aucun placeholder** : pas de `// TODO`, `// FIXME`, `// XXX`, `throw new Error('not implemented')`, `return null` fake, ni console.log de debug. Si la feature n'est pas finie, elle n'est pas shippee.
5. **Aucun `eslint-disable`** non justifie en commentaire (pourquoi + date + issue) - voir section ESLint ci-dessus.
6. **Aucune regression** : la tache DOIT preserver toutes les features pre-existantes. Si la refonte enleve une feature, c'est documente ET justifie en amont avec l'utilisateur.
7. **Aucune race condition / fuite de memoire / listener non nettoye** : chaque `addEventListener`, `setInterval`, `setTimeout`, abonnement Supabase/TanStack a sa fonction de cleanup.
8. **Typographie ASCII respectee partout** (code, i18n, commentaires) - pas d'em-dash `—`, smart quotes `"` `"`, ellipsis `...`, guillemets francais `«` `»`.
9. **Aucune inclusion silencieuse de donnees cross-tenant** : chaque requete DB sur une table multi-tenant filtre par `tenant_id`.
10. **Zero nested interactive** : pas de `<button>` dans un `<button>`, pas d'`<a>` dans un `<a>`, pas de `<Button>` dans un `<Button>`.

### Procedure post-modification OBLIGATOIRE

Apres CHAQUE tache, executer systematiquement :

```bash
pnpm typecheck                                  # 0 erreur
pnpm lint --max-warnings 0                      # 0 warning
pnpm format:check                               # pas de diff
pnpm test                                       # tous passent
pnpm build                                      # build clean
```

Si l'un de ces checks echoue : corriger, ne pas considerer la tache terminee, ne pas reporter "pour plus tard". La CI enforcera ces portes de toute facon - autant les corriger avant de commiter.

### Interdiction absolue d'accepter la dette

Les formulations suivantes sont BANNIES comme excuses pour laisser du code dans un etat non termine :

- "non bloquant pour prod"
- "follow-up dans un autre PR"
- "on verra plus tard"
- "scope out pour ce sprint"
- "acceptable pour le MVP"
- "assez bon pour l'instant"

Si un probleme est identifie il est corrige maintenant, ou il est explicitement retire de la tache (scope reel, demande utilisateur ecrite, justification de regression assumee).

### Exceptions documentees

Les seules exceptions tolerees sont :

- Limitations de la plateforme (Supabase, Next.js) documentees avec le numero d'issue upstream.
- Blocages exterieurs (waiting for design validation, waiting for DB migration review) mais dans ce cas la tache est marquee BLOQUEE, pas terminee.
- Decisions produit explicites de l'utilisateur, ecrites dans le commit ou le PR.

Dans tous les autres cas : zero dette technique, point.

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

---

## REGLES ANTI-REGRESSION - OBLIGATOIRES

REGLE ABSOLUE : Toute modification de code doit respecter les contraintes ci-dessous. Ces regles existent parce que des regressions ont ete introduites a plusieurs reprises par des agents IA qui modifiaient du code fonctionnel sans le vouloir.

### Principe fondamental

AVANT de modifier un fichier, lire le fichier EN ENTIER. Ne JAMAIS modifier un fichier sans l'avoir lu completement. Ne JAMAIS modifier une partie du fichier qui n'est pas directement liee a la tache demandee.

### Checklist pre-modification (OBLIGATOIRE avant chaque edit)

Avant de modifier un fichier, se poser ces questions :

1. Est-ce que cette modification est DIRECTEMENT demandee par l'utilisateur ?
2. Est-ce que je modifie UNIQUEMENT les lignes necessaires, sans toucher au reste ?
3. Est-ce que les imports existants sont preserves ?
4. Est-ce que les classes Tailwind existantes sont preservees (pas de remplacement "equivalent") ?
5. Est-ce que la structure JSX existante est preservee (pas de reorganisation) ?
6. Est-ce que les handlers existants (onClick, onChange, etc.) sont preserves ?

Si la reponse a l'une de ces questions est NON, demander confirmation a l'utilisateur AVANT de modifier.

### Fichiers proteges — NE JAMAIS MODIFIER sans demande explicite

Ces fichiers contiennent des logiques critiques qui ont ete debuggees et stabilisees. Ne les modifier QUE si l'utilisateur le demande explicitement :

| Fichier                                | Raison de la protection                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `src/proxy.ts`                         | Middleware central : routing multi-tenant, auth guards, anti-spoofing header   |
| `src/app/globals.css`                  | Theme Tailwind v4, contrat viewport (html/body overflow:hidden), design tokens |
| `src/lib/supabase/admin.ts`            | Client service_role, desactive autoRefresh et persistSession                   |
| `src/lib/supabase/middleware.ts`       | Refresh session, cookies auth                                                  |
| `src/lib/rate-limit.ts`                | 24 limiters, fail-closed/fail-open, protection anti-brute-force                |
| `src/app/api/webhooks/stripe/route.ts` | Webhook Stripe avec signature verification et idempotency                      |
| `src/services/order.service.ts`        | Verification prix serveur, validation commandes                                |
| `src/services/signup.service.ts`       | Signup avec rollback, creation tenant/user/venue                               |
| `src/contexts/CartContext.tsx`         | Logique panier, cle items avec modifiers, localStorage                         |
| `next.config.mjs`                      | CSP headers, Sentry, PWA, security headers                                     |

### Patterns critiques — NE JAMAIS CASSER

#### 1. Viewport & Scroll Chain

```
html (height: 100%, overflow: hidden)  -- globals.css
  body (height: 100%, overflow: hidden)  -- globals.css
    AdminLayoutClient (h-dvh overflow-hidden flex)
      Sidebar + Main (h-full, flex-1)
        <main#main-content> (flex-1 overflow-y-auto)  <-- SEUL element scrollable
```

- INTERDIT : `h-screen`, `100vh`, `min-h-screen` sur tout element
- INTERDIT : `overflow-y-auto` ou `overflow-y-scroll` en dehors de `main#main-content` ou listes scrollables explicites
- INTERDIT : Retirer `overflow: hidden` de html ou body
- INTERDIT : Ajouter `overflow: auto/scroll` sur des conteneurs intermediaires
- h-dvh est reserve UNIQUEMENT a AdminLayoutClient
- Les pages enfants utilisent `h-full` pour remplir leur parent

#### 2. Design System shadcn/ui

- INTERDIT : Utiliser `<button>` natif — utiliser `<Button>` de `@/components/ui/button`
- INTERDIT : Utiliser `<input>` natif — utiliser `<Input>` de `@/components/ui/input`
- INTERDIT : Utiliser `<select>` natif — utiliser `<Select>` de `@/components/ui/select`
- INTERDIT : Utiliser `<textarea>` natif — utiliser `<Textarea>` de `@/components/ui/textarea`
- INTERDIT : Utiliser `<table>` natif — utiliser `<Table>` de `@/components/ui/table`
- INTERDIT : Utiliser `<label>` natif — utiliser `<Label>` de `@/components/ui/label`
- EXCEPTION : `<input type="file">` et `<input type="color">` (pas d'equivalent shadcn direct)
- EXCEPTION : `<a href="tel:">`, `<a href="mailto:">`, `<a download>` (pas d'equivalent Link)
- Ne JAMAIS modifier les fichiers dans `src/components/ui/` — ce sont les composants shadcn/ui generes

#### 3. Securite

- INTERDIT : Retirer ou affaiblir les headers CSP dans `next.config.mjs`
- INTERDIT : Utiliser `getSession()` au lieu de `getUser()` pour l'authentification
- INTERDIT : Accepter `tenant_id` comme parametre dans une Server Action protegee (le deriver de la session)
- INTERDIT : Exposer `SUPABASE_SERVICE_ROLE_KEY` cote client
- INTERDIT : Retirer le rate limiting d'un endpoint public
- INTERDIT : Utiliser `supabaseAdmin` en dehors de signup, webhooks, ou operations admin
- INTERDIT : Desactiver ou supprimer des policies RLS

#### 4. Multi-tenant

- INTERDIT : Requete DB sans filtre `tenant_id` (sauf tables globales comme `plans`)
- INTERDIT : Faire confiance au header `x-tenant-slug` sans que le middleware l'ait injecte
- INTERDIT : Passer `tenant_id` depuis le client dans une requete authentifiee

#### 5. Tailwind v4

- INTERDIT : Construction dynamique de classes Tailwind : `` `text-${size}` `` — utiliser des noms complets `text-sm`, `text-lg`
- INTERDIT : Remplacer les classes Tailwind existantes par des "equivalents preferes"
- INTERDIT : Ajouter des breakpoints custom dans `@theme` sans justification
- OBLIGATOIRE : Tester avec `pnpm build && pnpm start` apres toute modification responsive

### Checklist post-modification (OBLIGATOIRE apres chaque tache)

Apres avoir termine une tache, executer systematiquement :

```bash
pnpm typecheck    # Types TypeScript
pnpm lint         # ESLint
pnpm test         # Tests unitaires
pnpm build        # Build production (detecte les erreurs Turbopack vs Webpack)
```

Si l'un de ces checks echoue, corriger AVANT de considerer la tache terminee.

### En cas de doute

Si une tache necessite de modifier un fichier protege ou de casser un pattern critique, demander confirmation a l'utilisateur AVANT de proceder. Ne JAMAIS prendre l'initiative de "refactorer", "nettoyer", ou "ameliorer" du code qui n'est pas directement lie a la tache demandee.

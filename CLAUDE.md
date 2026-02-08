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
pnpm dev          # Lancer le serveur de dev
pnpm build        # Build production
pnpm start        # Demarrer en production
pnpm lint         # Verifier ESLint
pnpm format       # Formater avec Prettier
pnpm format:check # Verifier le formatage sans modifier
pnpm typecheck    # Verifier les types TypeScript
pnpm test         # Lancer les tests Vitest
```

## Multi-tenant : Flux de donnees

1. L'utilisateur accede a `radisson.attabl.com`
2. Le middleware extrait le sous-domaine `radisson`
3. L'URL est reecrite vers `/sites/radisson/...`
4. Le header `x-tenant-slug` est injecte
5. Les pages/API recuperent le tenant via ce header ou le parametre `[site]`
6. Toutes les requetes DB filtrent par `tenant_id`
7. Le RLS Supabase ajoute une couche de securite supplementaire

## Securite

- Ne JAMAIS exposer `SUPABASE_SERVICE_ROLE_KEY` cote client
- Toujours utiliser `auth.getUser()` (pas `getSession()`) pour verifier l'authentification
- Valider les entrees avec Zod AVANT toute operation en base
- Le RLS est active sur toutes les tables multi-tenant
- Les Server Actions protegees doivent deriver le tenant_id de la session, pas l'accepter en parametre

## Documentation supplementaire

- `agent_docs/architecture.md` : Details sur l'architecture en couches
- `agent_docs/database-conventions.md` : Conventions base de donnees et migrations
- `agent_docs/security-patterns.md` : Patterns de securite detailles

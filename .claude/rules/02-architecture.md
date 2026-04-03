---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Architecture Rules - ATTABL SaaS

## Architecture en 3 Couches (STRICTE)

### Presentation (Next.js)
- Server Components par defaut
- Client Components (`'use client'`) UNIQUEMENT pour l'interactivite (useState, onClick, useEffect)
- Les pages ne contiennent PAS de logique metier complexe
- Les pages appellent les services ou Supabase directement pour le data fetching

### Service Layer (`src/services/`)
- TypeScript pur — JAMAIS d'imports Next.js (`next/navigation`, `next/headers`, etc.)
- Recoit le client Supabase par injection de dependances (testable, pas de singleton)
- Pattern factory : `createXXXService(supabase)` retourne un objet avec methodes
- Gere : validation, calculs, orchestration, regles metier
- Retourne des objets types, JAMAIS de reponses HTTP
- Lance `ServiceError` avec codes types (NOT_FOUND, VALIDATION, INTERNAL, AUTH, UNAUTHORIZED)

### Persistence (Supabase)
- 3 clients (browser, server, admin) avec regles d'usage strictes
- RLS comme filet de securite sur toutes les tables multi-tenant

## Structure des Dossiers (RESPECTER)

```
src/
  app/                    # Routes Next.js App Router UNIQUEMENT
    (marketing)/          # Pages marketing (landing, features)
    actions/              # Server Actions (prefixes "action")
    api/                  # API Routes REST
    sites/[site]/         # Routes dynamiques par tenant
      admin/              # Dashboard admin tenant
      cart/               # Panier client
    admin/                # Super admin plateforme
  components/             # Composants React
    ui/                   # shadcn/ui — NE PAS MODIFIER MANUELLEMENT
    admin/                # Composants admin dashboard
    tenant/               # Composants tenant (menu, cart)
    shared/               # Composants partages entre contextes
    marketing/            # Composants landing pages
  contexts/               # React Context (Cart, Tenant, Language, Device)
  hooks/                  # Custom hooks React
    mutations/            # Hooks de mutation (TanStack Query)
    queries/              # Hooks de query (TanStack Query)
  services/               # Logique metier (service layer)
  lib/                    # Utilitaires et configurations
    supabase/             # Clients Supabase
    stripe/               # Configuration Stripe
    auth/                 # Utilitaires auth
    validations/          # Schemas Zod
    config/               # Configuration app
  types/                  # Types TypeScript globaux
  messages/               # Fichiers i18n (fr.json, en.json)
  i18n/                   # Configuration next-intl
```

## Regles de Placement

- Nouveau composant UI reutilisable → `components/shared/`
- Composant specifique admin → `components/admin/`
- Composant specifique tenant (menu, panier) → `components/tenant/`
- Nouveau service metier → `src/services/[domaine].service.ts`
- Nouveau schema de validation → `src/lib/validations/[domaine].schema.ts`
- Nouveau type global → `src/types/`
- Nouveau hook query → `src/hooks/queries/`
- Nouveau hook mutation → `src/hooks/mutations/`

## Conventions de Nommage

| Element | Convention | Exemple |
|---------|-----------|---------|
| Fichiers composants | PascalCase | `MenuItemCard.tsx` |
| Fichiers services | kebab-case | `order.service.ts` |
| Fichiers schemas | kebab-case | `order.schema.ts` |
| Fichiers utilitaires | kebab-case | `format-price.ts` |
| Server Actions | prefixe `action` | `actionCreateOrder()` |
| Services | factory `create...Service` | `createOrderService(supabase)` |
| Types/Interfaces | PascalCase | `OrderItemInput` |
| Variables/fonctions | camelCase | `validateTenant()` |

## Data Flow (API Route)

```
Client Request
  → Rate Limiting (Upstash)
  → Zod Validation (safeParse)
  → Auth Check (getUser)
  → Tenant Derivation (admin_users join)
  → Service Layer (business logic)
  → DB Query (via Supabase client)
  → JSON Response (ServiceError → HTTP status)
```

## Regles Anti-Pattern

- JAMAIS de requete DB directe dans un composant React
- JAMAIS d'import de `@supabase/supabase-js` dans un composant — passer par un service ou hook
- JAMAIS de logique metier dans les API routes — deleguer au service layer
- JAMAIS de `any` dans le TypeScript — utiliser des types explicites ou `unknown`
- JAMAIS de fichier de plus de 400 lignes — decomposer
- UN fichier = UNE responsabilite

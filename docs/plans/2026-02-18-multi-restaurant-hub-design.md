# Multi-Restaurant Owner Hub — Design Document

**Date:** 2026-02-18
**Status:** Approved
**Feature:** Hub multi-restaurants pour owners multi-etablissements

---

## 1. Objectif

Permettre a un owner de gerer plusieurs restaurants depuis un hub centralise. Un owner peut avoir des restaurants de la meme enseigne (franchise) ou d'enseignes differentes (multi-marques). Chaque restaurant a son propre abonnement Stripe independant.

Le hub affiche des KPIs globaux agreges + des KPIs par restaurant, et offre un wizard pour ajouter de nouveaux restaurants.

## 2. Decisions

| Decision                   | Choix                                                         |
| -------------------------- | ------------------------------------------------------------- |
| Structure DB               | Table `restaurant_groups` + colonne `group_id` sur `tenants`  |
| Relation owner-groupe      | 1 user = 1 groupe (UNIQUE sur `owner_user_id`)                |
| Facturation                | Par restaurant (chaque tenant = 1 abonnement Stripe)          |
| KPIs                       | RPC PostgreSQL `get_owner_dashboard` (1 requete, tout inclus) |
| Securite                   | RLS sur `restaurant_groups` + policy chainee sur `tenants`    |
| Login flow multi-tenant    | Branchement sur `data.length` (1=direct, 2+=hub)              |
| Ajout restaurant           | Wizard 3 etapes avec validation Zod par etape                 |
| Franchise + Multi-enseigne | Les deux supportes (pas de distinction en DB)                 |
| Facture consolidee (futur) | Supportee via `GROUP BY owner_user_id` sur restaurant_groups  |

## 3. Modele de donnees

### 3.1 Nouvelle table `restaurant_groups`

```sql
CREATE TABLE restaurant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mon Groupe',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_groups_owner_unique UNIQUE (owner_user_id)
);

-- Index pour lookup rapide
CREATE INDEX idx_restaurant_groups_owner ON restaurant_groups(owner_user_id);
```

La contrainte `UNIQUE` sur `owner_user_id` garantit : 1 user = 1 groupe. Tous ses restaurants sont dans le meme groupe.

### 3.2 Colonne ajoutee sur `tenants`

```sql
ALTER TABLE tenants ADD COLUMN group_id uuid REFERENCES restaurant_groups(id) ON DELETE SET NULL;

-- Index pour les JOINs rapides
CREATE INDEX idx_tenants_group_id ON tenants(group_id);
```

`NULLABLE` au depart pour ne pas casser les tenants existants. Le signup et l'ajout de restaurant rempliront toujours `group_id`.

### 3.3 Migration des donnees existantes

```sql
-- Pour chaque tenant existant sans group_id :
-- 1. Trouver le owner (admin_users.role = 'owner' ou 'superadmin')
-- 2. Creer un restaurant_group pour ce user
-- 3. Lier le tenant au groupe

INSERT INTO restaurant_groups (owner_user_id, name)
SELECT DISTINCT au.user_id, 'Mon Groupe'
FROM admin_users au
JOIN tenants t ON t.id = au.tenant_id
WHERE t.group_id IS NULL
  AND au.role IN ('owner', 'superadmin')
  AND NOT EXISTS (
    SELECT 1 FROM restaurant_groups rg WHERE rg.owner_user_id = au.user_id
  );

UPDATE tenants t
SET group_id = rg.id
FROM admin_users au
JOIN restaurant_groups rg ON rg.owner_user_id = au.user_id
WHERE t.id = au.tenant_id
  AND t.group_id IS NULL
  AND au.role IN ('owner', 'superadmin');
```

### 3.4 Policies RLS

```sql
-- restaurant_groups : seul le owner voit/modifie son groupe
ALTER TABLE restaurant_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_select_own_group"
  ON restaurant_groups FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "owner_can_insert_own_group"
  ON restaurant_groups FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "owner_can_update_own_group"
  ON restaurant_groups FOR UPDATE
  USING (owner_user_id = auth.uid());

-- tenants : policy additionnelle pour les group owners
-- (les policies existantes via admin_users restent inchangees)
CREATE POLICY "group_owner_can_read_tenants"
  ON tenants FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM restaurant_groups WHERE owner_user_id = auth.uid()
    )
  );
```

### 3.5 RPC `get_owner_dashboard`

```sql
CREATE OR REPLACE FUNCTION get_owner_dashboard(p_user_id uuid)
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  tenant_plan text,
  tenant_status text,
  tenant_logo_url text,
  tenant_is_active boolean,
  orders_today bigint,
  revenue_today numeric,
  orders_month bigint,
  revenue_month numeric
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.subscription_plan,
    t.subscription_status,
    t.logo_url,
    t.is_active,
    COUNT(o.id) FILTER (WHERE o.created_at >= CURRENT_DATE),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= CURRENT_DATE), 0),
    COUNT(o.id) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)), 0)
  FROM restaurant_groups g
  JOIN tenants t ON t.group_id = g.id
  LEFT JOIN orders o ON o.tenant_id = t.id
  WHERE g.owner_user_id = p_user_id
  GROUP BY t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.logo_url, t.is_active
  ORDER BY t.name;
$$;
```

`SECURITY DEFINER` : execute avec les droits du createur, pas contournable.
`STABLE` : indique a PostgreSQL que la fonction ne modifie rien (optimisation).
Le `WHERE g.owner_user_id = p_user_id` est la seule porte d'entree.

## 4. Login flow modifie

### 4.1 Flow actuel (AuthForm.tsx ligne 131)

```
Login → getUser() → admin_users.select().eq(user_id).single() → 1 tenant → redirect
```

Le `.single()` crash si l'utilisateur a 2+ restaurants.

### 4.2 Nouveau flow

```
Login → getUser() → admin_users.select().eq(user_id) (sans .single())
  ├── 0 resultats → erreur "Aucun restaurant associe"
  ├── 1 resultat, is_super_admin → /admin/tenants
  ├── 1 resultat, onboarding pas fini → /onboarding
  ├── 1 resultat, onboarding fini → /sites/{slug}/admin (direct, comme aujourd'hui)
  └── 2+ resultats → /admin/tenants (le hub)
```

### 4.3 Changements dans AuthForm.tsx

- Ligne 131-135 : remplacer `.single()` par un select normal (retourne un array)
- Brancher sur `data.length`
- Le cas `is_super_admin` reste inchange
- Le cas multi-tenant redirige vers le hub `/admin/tenants`
- Le hub verifie cote client que l'user est owner via `get_owner_dashboard`

## 5. Hub UI (`/admin/tenants`)

### 5.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  ATTABL logo          Bonjour, {userName}   [Logout]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  Mes Etablissements                                 │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ CA Jour  │ │ CA Mois  │ │ Commandes│ │ Restau │ │
│  │ 125 000 F│ │ 2.4M F   │ │ 47 today │ │ 3      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ L'Epicurien                    Premium  Active  ││
│  │ lepicurien.attabl.com                           ││
│  │ 23 commandes · 87 500 F aujourd'hui             ││
│  │                              [Gerer →]          ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ Le Radisson                    Essentiel  Essai ││
│  │ radisson.attabl.com                             ││
│  │ 12 commandes · 45 200 F aujourd'hui             ││
│  │                              [Gerer →]          ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│  │  + Ajouter un etablissement                    │ │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
└─────────────────────────────────────────────────────┘
```

### 5.2 Design charter

- Background : `bg-neutral-50`
- Cards restaurant : `bg-white border border-neutral-100 rounded-xl p-6` — flat, no shadow
- KPI cards globaux : meme style, accent `#CCFF00` sur la valeur principale
- Bouton "Gerer" : `bg-[#CCFF00] text-black font-bold rounded-xl`
- Bouton "Ajouter" : `border-2 border-dashed border-neutral-200 rounded-xl` + hover `border-[#CCFF00]`
- Badges plan : `bg-[#CCFF00]/10 text-neutral-900` (premium), `bg-blue-50 text-blue-700` (essentiel)
- Badges statut : `bg-green-50 text-green-700` (active), `bg-amber-50 text-amber-700` (essai), `bg-red-50 text-red-700` (inactive)

### 5.3 Comportement

- Le hub appelle `get_owner_dashboard` via un hook TanStack Query `useOwnerDashboard`
- Les KPIs globaux = `SUM()` cote client sur le resultat de la RPC (trivial, 5 lignes JS)
- Clic "Gerer →" : `window.location.href = origin + '/sites/' + slug + '/admin'`
- Clic "Ajouter" : ouvre le wizard (meme page, modal ou route separee)
- Pas de sidebar — hub autonome, pas le dashboard d'un restaurant

### 5.4 Logique d'acces

La page `/admin/tenants` sert a deux cas :

1. **Super admin** (is_super_admin=true) : voit TOUS les tenants (comme aujourd'hui)
2. **Owner multi-restaurant** : voit seulement SES restaurants (via RPC)

Le composant detecte le cas au chargement et affiche le bon mode.

## 6. Wizard "Ajouter un etablissement"

### 6.1 Trois etapes

**Etape 1 — Identite**

- Nom de l'etablissement (required, min 2 chars)
- Type : selection parmi Restaurant, Hotel, Bar/Cafe, Boulangerie, Dark Kitchen, Food Truck, Quick Service
- Slug auto-genere a partir du nom (modifiable)

**Etape 2 — Plan**

- Choix : Essai gratuit 14 jours / Essentiel (39 800 F/mois) / Premium (79 800 F/mois)
- Cards plan identiques visuellement a celles de la page signup
- Si Essentiel ou Premium : redirect vers Stripe Checkout apres confirmation

**Etape 3 — Recapitulatif**

- Affiche : nom, type, slug, plan choisi
- Bouton "Confirmer et creer" (`#CCFF00`, bold)
- Au clic : appel API `POST /api/restaurants/create`

### 6.2 Schemas Zod

```typescript
// src/lib/validations/restaurant.schema.ts

const establishmentTypes = [
  'restaurant',
  'hotel',
  'bar-cafe',
  'boulangerie',
  'dark-kitchen',
  'food-truck',
  'quick-service',
] as const;

const planOptions = ['trial', 'essentiel', 'premium'] as const;

export const createRestaurantStep1Schema = z.object({
  name: z.string().min(2, 'Minimum 2 caracteres').max(100),
  type: z.enum(establishmentTypes),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
});

export const createRestaurantStep2Schema = z.object({
  plan: z.enum(planOptions),
});

export const createRestaurantSchema = createRestaurantStep1Schema.merge(
  createRestaurantStep2Schema,
);
```

### 6.3 API `POST /api/restaurants/create`

```
Rate limiting → Auth check (getUser) → Zod validation → Service call → Response
```

Le service :

1. Verifie l'auth via `getUser()`
2. Valide le body avec Zod
3. Recupere le `restaurant_group` de l'owner (ou le cree si premier restaurant)
4. Genere un slug unique via `slug.service.ts`
5. Cree le tenant avec `group_id`
6. Cree l'entree `admin_users` (role: owner)
7. Cree le venue par defaut
8. Si plan payant → cree la session Stripe Checkout
9. Retourne `{ tenantId, slug, checkoutUrl? }`

### 6.4 Navigation apres creation

- Si essai gratuit → redirect `/onboarding` avec le nouveau tenant
- Si plan payant → redirect Stripe Checkout → callback → `/onboarding`

## 7. Modifications du signup existant

Le signup actuel (`signup.service.ts`) cree un tenant mais pas de groupe. Il faut l'adapter :

1. Dans `createTenantWithTrial()` : apres creation du tenant, creer un `restaurant_group` et lier le tenant via `group_id`
2. C'est transparent pour l'utilisateur — aucun changement UI sur la page signup
3. Le groupe est cree automatiquement, nomme "Mon Groupe" par defaut

```typescript
// Ajout dans completeEmailSignup / completeOAuthSignup :
// Apres la creation du tenant, avant la creation de l'admin user :

const { data: group } = await supabase
  .from('restaurant_groups')
  .insert({ owner_user_id: userId, name: 'Mon Groupe' })
  .select('id')
  .single();

if (group) {
  await supabase.from('tenants').update({ group_id: group.id }).eq('id', tenant.id);
}
```

## 8. Fichiers impactes

| Fichier                                         | Action   | Description                                |
| ----------------------------------------------- | -------- | ------------------------------------------ |
| `supabase/migrations/xxx_restaurant_groups.sql` | Creer    | Table + RLS + RPC + migration donnees      |
| `src/types/restaurant-group.types.ts`           | Creer    | Types TypeScript pour restaurant_groups    |
| `src/lib/validations/restaurant.schema.ts`      | Creer    | Schemas Zod pour wizard                    |
| `src/hooks/queries/useOwnerDashboard.ts`        | Creer    | Hook TanStack Query pour la RPC            |
| `src/app/api/restaurants/create/route.ts`       | Creer    | API endpoint creation restaurant           |
| `src/services/restaurant-group.service.ts`      | Creer    | Service metier pour les groupes            |
| `src/app/admin/tenants/page.tsx`                | Modifier | Reecrire en hub multi-restaurants          |
| `src/components/auth/AuthForm.tsx`              | Modifier | Retirer `.single()`, brancher multi-tenant |
| `src/services/signup.service.ts`                | Modifier | Ajouter creation groupe au signup          |

**9 fichiers. 1 migration SQL. 6 nouveaux. 3 modifies.**

## 9. Securite

| Menace                                        | Protection                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Owner accede aux restaurants d'un autre owner | RLS sur `restaurant_groups` : `owner_user_id = auth.uid()`             |
| Injection dans la RPC                         | `SECURITY DEFINER` + parametre `p_user_id` filtre strictement          |
| Creation de restaurant sans auth              | API route verifie `getUser()` + rate limiting                          |
| Slug collision                                | `slug.service.ts` genere des slugs uniques avec verification en DB     |
| Manipulation du group_id                      | Le service derive le group_id de la session, pas du body de la requete |
| Escalade de privileges                        | Le role `owner` est set cote serveur, jamais accepte en parametre      |

## 10. Cas limites

| Cas                                       | Comportement                                              |
| ----------------------------------------- | --------------------------------------------------------- |
| Owner avec 0 restaurant (tenant supprime) | Hub affiche l'empty state + bouton "Ajouter"              |
| Owner avec 1 restaurant                   | Login redirige directement vers le dashboard (pas le hub) |
| Owner avec 2+ restaurants                 | Login redirige vers le hub                                |
| Super admin                               | Hub affiche tous les tenants (mode admin)                 |
| Manager/serveur/chef (pas owner)          | Login redirige vers le dashboard du tenant directement    |
| Signup nouveau compte                     | Cree automatiquement un restaurant_group                  |
| Ajout 2e restaurant                       | Reutilise le restaurant_group existant                    |

---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "supabase/**/*.sql"
---

# Multi-Tenant Rules - ATTABL SaaS

## Flux Multi-Tenant (COMPRENDRE)

1. Utilisateur accede a `radisson.attabl.com`
2. `proxy.ts` (middleware) extrait le sous-domaine `radisson`
3. URL reecrite vers `/sites/radisson/...`
4. Header `x-tenant-slug` injecte par le middleware (serveur, pas client)
5. Pages/API recuperent le tenant via header ou parametre `[site]`
6. TOUTES les requetes DB filtrent par `tenant_id`
7. RLS Supabase = couche de securite supplementaire

## Regles d'Isolation (CRITIQUE)

### Derivation du Tenant

- Le `tenant_id` DOIT etre derive cote serveur via :
  - Header `x-tenant-slug` (injecte par proxy.ts) → lookup tenant en DB
  - Ou join `admin_users` avec `user_id` authentifie → extraction `tenant_id`
- JAMAIS accepter `tenant_id` du body, query params, ou headers custom envoyes par le client
- Le middleware supprime tout header `x-tenant-slug` envoye par le client avant d'injecter le vrai

### Requetes Base de Donnees

- CHAQUE `SELECT`, `INSERT`, `UPDATE`, `DELETE` sur une table multi-tenant DOIT inclure `.eq('tenant_id', tenantId)`
- Pas d'exception, meme si "on sait" que le RLS protege
- Pattern "belt & suspenders" : protection applicative + RLS

### Tables Multi-Tenant (filtrage obligatoire)

- `menu_items` — `.eq('tenant_id', tenantId)`
- `categories` — `.eq('tenant_id', tenantId)`
- `orders` / `order_items` — `.eq('tenant_id', tenantId)`
- `venues` — `.eq('tenant_id', tenantId)`
- `admin_users` — `.eq('tenant_id', tenantId)` (sauf super_admin)
- Toute nouvelle table liee a un tenant DOIT avoir une colonne `tenant_id`

### Tables Publiques (pas de filtrage tenant)

- `tenants` (accessible par slug pour resolution)
- `plans` (configuration pricing globale)

## Domaines Personnalises

- Le proxy supporte les sous-domaines (`radisson.attabl.com`) ET les domaines custom
- Lookup : d'abord par sous-domaine, puis par domaine custom dans la table `tenants`
- Cache de resolution tenant pour eviter les requetes repetees

## Contexte Tenant (Frontend)

- `TenantContext` fournit les infos du tenant aux composants client
- Accessible via `useTenant()` hook
- Contient : slug, nom, couleurs, devise, parametres
- Initialise par le Server Component parent via props (pas de fetch client supplementaire)

## Tests Multi-Tenant

- Chaque test de service DOIT verifier l'isolation :
  - Un service avec `tenantId: 'A'` ne retourne PAS les donnees du `tenantId: 'B'`
  - Les mutations sur tenant A n'affectent pas tenant B
- Mock le header `x-tenant-slug` dans les tests d'API

## Anti-Patterns Multi-Tenant (A BLOQUER)

- Requete sans `.eq('tenant_id', ...)` sur une table multi-tenant
- Accepter `tenant_id` en parametre d'un endpoint authentifie
- Utiliser `admin.ts` (service_role) pour des operations utilisateur normales
- Afficher des donnees d'un tenant dans le contexte d'un autre
- Requete qui fait un `SELECT * FROM table` sans filtre tenant

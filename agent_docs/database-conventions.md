# Conventions Base de Donnees - ATTABL

## Base de donnees

- PostgreSQL via Supabase
- Pas d'ORM (requetes directes via Supabase SDK)
- RLS (Row Level Security) active sur toutes les tables multi-tenant

## Tables principales

### tenants

- Cle primaire : `id` (UUID)
- Identifiant unique : `slug` (utilise pour le sous-domaine)
- Champs Stripe : `stripe_customer_id`, `stripe_subscription_id`
- Statuts : `subscription_status` (trial | active | past_due | cancelled | paused)
- Plans : `subscription_plan` (essentiel | premium | enterprise)

### admin_users

- Lie un `user_id` (auth.users) a un `tenant_id`
- Roles : owner | admin | manager | staff
- `is_super_admin` : acces plateforme globale

### orders / order_items

- `tenant_id` : isolation par tenant
- `order_number` : unique par tenant (format CMD-XXXXX)
- Statuts : pending | completed | cancelled

### menu_items / categories / venues

- Tous possedent un `tenant_id` pour l'isolation multi-tenant
- `is_available` / `is_active` pour le soft-delete

## Conventions de nommage

- Tables : snake_case pluriel (ex: `menu_items`, `admin_users`)
- Colonnes : snake_case (ex: `tenant_id`, `created_at`)
- Cles primaires : `id` (UUID genere par Supabase)
- Cles etrangeres : `[table_singulier]_id` (ex: `tenant_id`, `order_id`)
- Timestamps : `created_at`, `updated_at` (TIMESTAMPTZ avec timezone)
- Booleens : prefixe `is_` (ex: `is_active`, `is_available`)

## Migrations

### Emplacement

`/supabase/migrations/` - fichiers SQL bruts

### Convention de nommage

`YYYYMMDD_description.sql` (ex: `20260207_rls_security.sql`)

### Processus

1. Ecrire le SQL de migration
2. Tester en local avec `supabase start`
3. Appliquer avec `supabase db push` ou `supabase migration up`
4. Ne JAMAIS modifier une migration deja appliquee
5. Pour corriger, creer une nouvelle migration

### Commandes

```bash
pnpm db:migrate   # Appliquer les migrations via Supabase CLI
supabase start    # Demarrer Supabase en local
supabase db push  # Pousser les migrations vers le projet distant
```

## RLS (Row Level Security)

### Pattern standard pour les tables multi-tenant

```sql
-- Lecture : les admins du tenant voient leurs donnees
CREATE POLICY "tenant_select" ON table_name
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

-- Ecriture : les admins du tenant modifient leurs donnees
CREATE POLICY "tenant_insert" ON table_name
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );
```

### Tables avec acces public en lecture

- `tenants` : lecture publique (par slug) pour afficher le menu
- `menu_items` : lecture publique pour les clients du restaurant
- `categories` : lecture publique pour la navigation du menu

## Requetes types

### Recuperer un tenant par slug

```typescript
const { data: tenant } = await supabase
  .from('tenants')
  .select('id, name, slug, logo_url, primary_color')
  .eq('slug', tenantSlug)
  .eq('is_active', true)
  .single();
```

### Filtrer par tenant_id (OBLIGATOIRE)

```typescript
const { data: items } = await supabase
  .from('menu_items')
  .select('*')
  .eq('tenant_id', tenant.id)
  .eq('is_available', true);
```

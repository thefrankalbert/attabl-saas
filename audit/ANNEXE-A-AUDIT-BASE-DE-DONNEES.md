J'ai terminé l'audit. Voici le livrable.

---

# Audit base de données Attabl (lecture seule)

Périmètre reconstitué à partir de :

- `supabase/schema.sql` (snapshot "schema of record", dernier commit `20227d5f`, 19 juin 2026)
- `tests/journeys/fixtures/schema.sql` (snapshot prod réel, dernier commit `37395210`, 29 juin 2026, marqueur `20260628000000`)
- les 138 migrations de `supabase/migrations/`, rejouées dans l'ordre

**Avertissement méthodologique important.** Les deux snapshots sont périmés par rapport à HEAD (`f2277231`, 21 juillet). L'état final = snapshot fixture (marqueur `20260628000000`) + les 40 migrations postérieures. `supabase/schema.sql` est le plus périmé des deux : il lui manque 8 tables (`ads`, `audit_log`, `invitations`, `newsletter_subscriber`, `platform_audit_log`, `push_subscriptions`, `role_permissions`, `tenant_supports`) alors que son en-tête (lignes 6 à 10) affirme qu'il peut « provision a fresh database ».

---

## 1. Tableau récapitulatif des tables (schéma public, état final)

Légende colonnes S/I/U/D : présence d'une policy couvrant l'opération (les policies `FOR ALL` comptent pour les 4).
WC = clause `WITH CHECK` explicite présente sur les policies I/U.

| Table                     | RLS | Col. tenant                     | S                   | I   | U   | D   | WC explicite | Verdict                                                 |
| ------------------------- | --- | ------------------------------- | ------------------- | --- | --- | --- | ------------ | ------------------------------------------------------- |
| admin_users               | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | Écriture intra-tenant non filtrée par rôle (voir DB-05) |
| ads                       | oui | tenant_id                       | oui                 | oui | oui | oui | non (U)      | **SELECT `USING (true)` cross-tenant (DB-07)**          |
| ai_credits_ledger         | oui | tenant_id                       | oui                 | non | non | non | n/a          | OK (lecture seule, écriture service_role)               |
| ai_photo_credits          | oui | tenant_id                       | oui                 | non | non | non | n/a          | OK                                                      |
| announcements             | oui | tenant_id                       | oui                 | oui | oui | oui | non (U)      | OK depuis 20260702000000                                |
| audit_log                 | oui | tenant_id                       | oui                 | oui | non | non | oui          | OK (append-only)                                        |
| categories                | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (lecture publique voulue)                            |
| coupon_redemptions        | oui | tenant_id                       | oui                 | non | non | non | n/a          | OK (append-only service_role)                           |
| coupons                   | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | **Codes lisibles par anon cross-tenant (DB-06)**        |
| dish_photo_drafts         | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (filtre `is_active` + rôle)                          |
| house_accounts            | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| ingredients               | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| invitations               | oui | tenant_id                       | oui                 | oui | oui | non | non (U)      | Pas de DELETE authenticated (service_role only) : voulu |
| item_modifiers            | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| item_options              | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| item_price_variants       | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| item_suggestions          | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| menu_items                | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (lecture publique voulue)                            |
| menus                     | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| newsletter_subscriber     | oui | AUCUNE                          | oui                 | oui | non | oui | oui          | OK (S/D scopés service_role)                            |
| notifications             | oui | tenant_id                       | oui                 | oui | oui | non | oui          | OK                                                      |
| onboarding_progress       | oui | tenant_id                       | oui                 | oui | oui | non | oui          | OK                                                      |
| orange_money_events       | oui | AUCUNE                          | RESTRICTIVE `false` |     |     |     | n/a          | OK (service_role only)                                  |
| order_items               | oui | tenant_id (dep. 20260629000400) | oui                 | oui | oui | oui | oui          | OK                                                      |
| order_mutation_requests   | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (filtre `is_active`)                                 |
| order_notes               | oui | tenant_id                       | oui                 | oui | non | non | oui          | OK (append-only)                                        |
| orders                    | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | Pas d'INSERT anon (voulu, RPC service_role)             |
| payments                  | oui | tenant_id                       | oui                 | oui | non | non | oui          | OK (ledger append-only)                                 |
| platform_audit_log        | oui | tenant_id                       | non                 | non | non | non | n/a          | OK (RLS sans policy = deny-all)                         |
| push_subscriptions        | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | **`USING (true)` : fuite critique (DB-01)**             |
| qr_designs                | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (filtre `is_active` dep. 20260712000000)             |
| recipes                   | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| restaurant_groups         | oui | owner_user_id                   | oui                 | oui | oui | oui | non (U)      | OK                                                      |
| role_permissions          | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (owner only)                                         |
| settings                  | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| stock_alert_notifications | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| stock_count_lines         | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (pas de `TO`, voir DB-14)                            |
| stock_counts              | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK (pas de `TO`, voir DB-14)                            |
| stock_movements           | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| stripe_events             | oui | AUCUNE                          | non                 | non | non | non | n/a          | OK (deny-all)                                           |
| suppliers                 | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| table_assignments         | oui | tenant_id                       | oui                 | oui | oui | oui | non (U)      | OK                                                      |
| table_sessions            | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| tables                    | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | Lecture publique `is_active` assumée                    |
| tenant_supports           | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| tenants                   | oui | id (racine)                     | oui                 | non | oui | non | oui          | **Lecture anon full-colonnes (DB-02)**                  |
| user_preferences          | oui | user_id                         | oui                 | oui | oui | non | oui          | OK                                                      |
| user_sessions             | oui | tenant_id                       | oui                 | oui | non | non | oui          | OK                                                      |
| venues                    | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | OK                                                      |
| wave_events               | oui | AUCUNE                          | RESTRICTIVE `false` |     |     |     | n/a          | OK                                                      |
| zones                     | oui | tenant_id                       | oui                 | oui | oui | oui | oui          | Lecture publique assumée                                |

51 tables, **RLS activée sur 51/51**. Aucune table créée sans `ENABLE ROW LEVEL SECURITY` dans les 138 migrations (vérifié : 39 `CREATE TABLE`, 46 `ENABLE ROW LEVEL SECURITY`).

---

## 2. Problèmes identifiés

### [DB-01] push_subscriptions lisible par anon : fuite des credentials Web Push de tous les tenants

- **Gravité : CRITIQUE**
- **Fichier** : `supabase/migrations/20260226000003_push_subscriptions.sql:27-29` (création), `supabase/migrations/20260309000001_fix_rls_policies.sql:29-32` (correctif jamais appliqué), `tests/journeys/fixtures/schema.sql:3585` (état prod)
- **SQL actuel** :

```sql
-- 20260226000003_push_subscriptions.sql:27
CREATE POLICY "Service can read all push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (true);
```

```sql
-- tests/journeys/fixtures/schema.sql:3585 (dump prod du 2026-06-29)
CREATE POLICY "Service can read all push subscriptions" ON "public"."push_subscriptions" FOR SELECT USING (true);
```

- **Consequence concrete** : la policy n'a aucune clause `TO`, elle s'applique donc au rôle `public`, anon inclus. Le grant table est `GRANT ALL ... TO anon`. La table contient `endpoint`, `p256dh`, `auth` (`fixtures/schema.sql:1717-1725`), c'est-à-dire le triplet complet nécessaire pour chiffrer et envoyer une notification Web Push. Avec la seule clé anon (publique, présente dans chaque bundle navigateur), `GET /rest/v1/push_subscriptions?select=*` retourne toutes les souscriptions de tous les tenants. Un attaquant peut envoyer des push arbitraires sur les tablettes de tous les restaurateurs de la plateforme (phishing « nouvelle commande, cliquez ici »), et corréler `tenant_id`/`user_id` pour cartographier les effectifs.
- **Aggravant** : la migration `20260309000001_fix_rls_policies.sql` corrige exactement ce trou (lignes 29 à 32) mais **la policy `Only service role can read push subscriptions` est absente des deux snapshots** (`schema.sql` du 19 juin ET `fixtures/schema.sql` du 29 juin). La migration n'a donc jamais été appliquée en prod, ou a été annulée hors bande. Les points 1 et 2 de cette même migration ont été re-corrigés par `20260403000000_fix_remaining_linter_warnings.sql`, le point 3 est resté orphelin.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000000_fix_push_subscriptions_rls.sql
DROP POLICY IF EXISTS "Service can read all push subscriptions" ON public.push_subscriptions;

-- Le service_role bypasse la RLS : aucune policy de lecture n'est necessaire pour lui.
-- Un membre lit uniquement ses propres souscriptions.
DROP POLICY IF EXISTS "Users can read own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can read own push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
```

- **Test pgTAP** : `supabase/tests/rls/push_subscriptions.test.sql`
  - `SET ROLE anon;` puis `throws_ok` ou `is(count(*), 0)` sur `SELECT * FROM push_subscriptions`
  - authentifié tenant A : voit uniquement ses propres lignes (`user_id = auth.uid()`), 0 ligne du tenant B
  - `policies_are('public','push_subscriptions', ARRAY['Users can read own push subscriptions','Users can manage own push subscriptions'])` pour verrouiller l'absence de toute policy `USING (true)`

---

### [DB-02] tenants lisible en full-colonnes par anon : fuite des identifiants Stripe et des données de facturation

- **Gravité : CRITIQUE**
- **Fichier** : `supabase/migrations/20260330000000_tighten_tenants_rls.sql:11-13`, grants `tests/journeys/fixtures/schema.sql:4675`
- **SQL actuel** :

```sql
-- 20260330000000_tighten_tenants_rls.sql:11
DROP POLICY IF EXISTS "Tenants are publicly readable" ON tenants;
CREATE POLICY "Public can read active tenants" ON tenants
  FOR SELECT USING (is_active = true);
```

```sql
-- tests/journeys/fixtures/schema.sql:4675
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "anon";
```

- **Consequence concrete** : contrairement à `orders` et `order_items`, qui ont reçu un traitement colonne par colonne (`20260506155500_restrict_anon_pii_columns.sql:21-36`), `tenants` conserve un `GRANT SELECT` table complet pour anon. La policy autorise toute ligne `is_active = true`. Résultat : `GET /rest/v1/tenants?select=*` avec la clé anon dump, pour chaque restaurant de la plateforme, `stripe_customer_id`, `stripe_subscription_id`, `subscription_plan`, `subscription_status`, `subscription_current_period_end`, `trial_ends_at`, `phone`, `address`, `max_admins`, `max_venues`, `activation_events`, `last_active_at` (`fixtures/schema.sql:1895-1950`). C'est la liste clients complète d'Attabl avec le CA implicite par plan, exploitable par un concurrent, plus les identifiants Stripe utiles au support-social-engineering.
- Le commentaire de la migration (lignes 6 à 8) justifie la policy par « No API route returns unbounded tenant lists, so enumeration risk is mitigated at the API layer ». C'est faux : PostgREST est joignable directement avec la clé anon, sans passer par les routes Next.js.
- **Aggravant** : `20260716000000_realtime_menu_live.sql:38-43` ajoute `public.tenants` à la publication `supabase_realtime`. Or `20260623110000_order_status_broadcast.sql:6-9` documente explicitement que « Supabase does NOT apply column-level grants to the realtime payload ». Le même vecteur qui a justifié la migration de `orders` vers Broadcast est ré-ouvert sur `tenants`, en streaming temps réel cette fois.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000100_tenants_anon_column_scope.sql
REVOKE SELECT ON public.tenants FROM anon;

-- Seules les colonnes vitrine restent lisibles par anon (parite avec get_tenant_by_slug).
GRANT SELECT (
  id, slug, name, logo_url, primary_color, secondary_color, description,
  establishment_type, currency, tax_rate, service_charge_rate,
  enable_tax, enable_service_charge, enable_coupons, supported_currencies,
  opening_hours, default_locale, is_active, table_count, custom_domain
) ON public.tenants TO anon;

-- Le realtime ne respecte pas les grants colonne : retirer tenants de la publication.
ALTER PUBLICATION supabase_realtime DROP TABLE public.tenants;
```

(Le storefront doit alors passer par `get_tenant_by_slug` / un canal Broadcast pour le live, comme `orders`.)

- **Test pgTAP** : `supabase/tests/grants/tenants_anon_columns.test.sql`
  - `SET ROLE anon; SELECT stripe_customer_id FROM tenants;` doit lever `42501`
  - idem pour `stripe_subscription_id`, `subscription_status`, `phone`, `address`
  - `SELECT slug, name FROM tenants WHERE is_active` doit réussir
  - assertion que `pg_publication_tables` ne contient pas `public.tenants`

---

### [DB-03] get_my_tenant_ids_array() ignore is_active : un employé désactivé conserve tous ses droits base

- **Gravité : CRITIQUE**
- **Fichier** : `supabase/migrations/20260227000002_rls_optimization.sql:15-25` et `supabase/migrations/20260209000001_fix_rls_recursion.sql:16-24`
- **SQL actuel** :

```sql
-- 20260227000002_rls_optimization.sql:15
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tenant_id), '{}')
  FROM admin_users
  WHERE user_id = auth.uid()
$$;
```

- **Consequence concrete** : aucun filtre `is_active`. Ce helper est référencé par environ 40 policies (chiffre revendiqué par `20260630070000_revoke_unused_secdef_grants.sql:14`) sur 22 tables, et par `assert_tenant_member()` (`20260623000000_secdef_cross_tenant_guard.sql:52`), qui garde à son tour toutes les RPC SECURITY DEFINER de stock, de reporting et de caisse. Un employé licencié dont la ligne `admin_users` est passée à `is_active = false` (la désactivation ne supprime pas la ligne) conserve, tant que son JWT n'est pas expiré et surtout tant que son compte `auth.users` existe, un accès complet en lecture ET en écriture à `orders`, `payments`, `menu_items`, `ingredients`, `stock_movements`, `settings`, `coupons` via PostgREST et via les RPC. Le filtrage `is_active` n'existe qu'en couche applicative (`getAuthenticatedUserWithTenant`).
- Le projet a diagnostiqué exactement ce problème et l'a corrigé **pour une seule table** : `20260712000000_qr_designs_rls_active_member.sql:5-9` (« a deactivated member whose admin_users row still exists could therefore read/insert/update/delete »). Le correctif n'a pas été généralisé au helper.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000200_tenant_helpers_active_only.sql
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tenant_id), '{}')
  FROM admin_users
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true) = true
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM admin_users
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true) = true
$$;
```

Attention au déploiement : `COALESCE(is_active, true)` est indispensable, la policy `atfood_insert_categories` (`fixtures/schema.sql`) traite déjà `is_active IS NULL` comme actif, donc des lignes historiques peuvent avoir `is_active` à NULL.

- **Test pgTAP** : `supabase/tests/rls/deactivated_member.test.sql`
  - créer tenant A avec un membre actif et un membre `is_active = false`
  - sous l'identité du membre désactivé : `SELECT count(*) FROM orders` = 0, `INSERT INTO menu_items` refusé, `SELECT get_my_tenant_ids_array()` = `{}`
  - `SELECT assert_tenant_member('<tenant_A>')` doit lever `42501`
  - sous l'identité du membre actif : tout passe (non-régression)

---

### [DB-04] restock_order a perdu son verrou consultatif : double réapprovisionnement possible

- **Gravité : MAJEUR**
- **Fichier** : régression introduite entre `supabase/migrations/20260629000200_order_cancellation_restock.sql:46` et `supabase/migrations/20260629120000_stock_integrity_restock_atomic_ledger.sql:36`, propagée dans `supabase/migrations/20260702130000_stock_ledger_canonical.sql:136-201` (définition finale)
- **SQL actuel (version d'origine, correcte)** :

```sql
-- 20260629000200_order_cancellation_restock.sql:44-56
  PERFORM public.assert_tenant_member(p_tenant_id);
  PERFORM pg_advisory_xact_lock(hashtext('restock_order:' || p_order_id::text));
  IF EXISTS (SELECT 1 FROM public.stock_movements
             WHERE reference_id = p_order_id
               AND movement_type = 'order_restock'
               AND tenant_id = p_tenant_id) THEN
    RETURN 0;
  END IF;
```

**SQL actuel (version finale, sans verrou)** :

```sql
-- 20260702130000_stock_ledger_canonical.sql:150-168
BEGIN
  FOR v_mov IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS net_destocked
    ...
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.stock_movements r
      WHERE r.reference_id = p_order_id
        AND r.tenant_id = p_tenant_id
        AND r.movement_type = 'order_restock'
        AND r.ingredient_id = v_mov.ingredient_id
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.ingredients
    SET current_stock = current_stock + ABS(v_mov.net_destocked)
    ...
```

- **Consequence concrete** : c'est un lire-puis-écrire classique. Sous `READ COMMITTED`, deux transactions concurrentes qui annulent la même commande (double-clic serveur, ou surtout **rejeu du outbox offline depuis deux tablettes**, scénario explicitement prévu par `20260717000000_order_mutation_idempotency.sql:1-9`) exécutent toutes les deux le `EXISTS` avant que l'autre n'ait committé son `INSERT`, ne voient aucun mouvement `order_restock`, et créditent chacune `ABS(net_destocked)` sur `ingredients.current_stock`. Le stock est gonflé du double, deux lignes `order_restock` sont écrites, et l'invariant `SUM(stock_movements.quantity) = ingredients.current_stock` (posé en tête de `20260702130000:3-6`) tient encore, donc `verify_stock_ledger` ne détecte rien. En coup de feu on sert des plats dont l'ingrédient n'existe plus physiquement.
- À noter : `destock_order` a bien conservé son verrou (`20260702130000:72`) et son décrément est atomique (`UPDATE ... SET current_stock = current_stock - v_required WHERE ... AND current_stock >= v_required`, ligne 97 à 101, une seule instruction, garde intégrée). L'asymétrie destock/restock est donc bien une régression, pas un choix.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000300_restock_order_relock.sql
CREATE OR REPLACE FUNCTION public.restock_order(
  p_order_id uuid, p_tenant_id uuid, p_created_by uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count INT := 0; v_mov RECORD; v_new_stock NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  -- Serialise les rejeux concurrents (outbox offline) sur la meme commande.
  PERFORM pg_advisory_xact_lock(hashtext('restock_order:' || p_order_id::text));
  ... corps identique a 20260702130000:150-197 ...
END;
$$;

-- Garde-fou structurel : un seul restock par (tenant, commande, ingredient).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_restock_once
  ON public.stock_movements (tenant_id, reference_id, ingredient_id)
  WHERE movement_type = 'order_restock';

REVOKE ALL ON FUNCTION public.restock_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_order(uuid, uuid, uuid) TO service_role;
```

- **Test pgTAP** : `supabase/tests/stock/restock_idempotency.test.sql`
  - séquentiel : `destock_order` puis deux `restock_order` successifs, assert `current_stock` revenu exactement au niveau initial et une seule ligne `order_restock` par ingrédient
  - concurrence : via `pgtap` + deux sessions (ou `dblink` / `pg_background`), lancer deux `restock_order` en parallèle sur la même commande, assert que l'index unique lève `23505` sur la seconde et que `current_stock` n'a été crédité qu'une fois
  - assert que `verify_stock_ledger(tenant)` retourne 0 ligne après l'opération

---

### [DB-05] admin_users : n'importe quel membre du tenant peut désactiver le compte de son propriétaire

- **Gravité : MAJEUR**
- **Fichier** : `supabase/migrations/20260227000002_rls_optimization.sql:42-45` (policy), `supabase/migrations/20260420000003_lock_admin_privilege_columns.sql:32-33` (grant colonne)
- **SQL actuel** :

```sql
-- 20260227000002_rls_optimization.sql:42
CREATE POLICY "Admins can manage own tenant admins" ON admin_users
  FOR ALL USING (
    tenant_id = ANY(get_my_tenant_ids_array())
  ) ...
```

```sql
-- 20260420000003_lock_admin_privilege_columns.sql:32
GRANT UPDATE (full_name, phone, last_login, last_login_at, login_count, is_active)
  ON public.admin_users TO authenticated;
```

- **Consequence concrete** : la migration `20260420000003` a bien verrouillé `role`, `custom_permissions`, `email`, `tenant_id`, `user_id` (escalade de privilège fermée), et la policy RESTRICTIVE `Block super_admin escalation by non-super-admins` couvre le `super_admin`. Mais `is_active` reste dans le grant `authenticated`, et la policy `FOR ALL` ne filtre que sur `tenant_id`, jamais sur le rôle du caller. Concrètement : un serveur (rôle `server`) du tenant A peut faire `PATCH /rest/v1/admin_users?id=eq.<owner_id>` avec `{"is_active": false}` et désactiver le propriétaire du restaurant. Combiné à DB-03, il peut aussi désactiver tous les managers sans perdre son propre accès. Déni de service intra-tenant et suppression du contrôle hiérarchique. Le même vecteur permet aussi de réécrire `full_name` et `phone` de tous les collègues.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000400_admin_users_write_scope.sql
-- 1. Chacun ecrit son propre profil.
DROP POLICY IF EXISTS "Members can update own profile" ON public.admin_users;
CREATE POLICY "Members can update own profile" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 2. Seuls owner/admin agissent sur les autres membres du tenant.
DROP POLICY IF EXISTS "Admins can manage own tenant admins" ON public.admin_users;
CREATE POLICY "Owners and admins manage tenant members" ON public.admin_users
  FOR ALL TO authenticated
  USING (
    tenant_id = ANY (public.get_my_tenant_ids_array())
    AND EXISTS (SELECT 1 FROM public.admin_users me
                WHERE me.user_id = (SELECT auth.uid())
                  AND me.tenant_id = admin_users.tenant_id
                  AND me.is_active
                  AND me.role IN ('owner','admin'))
  )
  WITH CHECK (
    tenant_id = ANY (public.get_my_tenant_ids_array())
    AND EXISTS (SELECT 1 FROM public.admin_users me
                WHERE me.user_id = (SELECT auth.uid())
                  AND me.tenant_id = admin_users.tenant_id
                  AND me.is_active
                  AND me.role IN ('owner','admin'))
  );
```

(La sous-requête sur `admin_users` dans une policy `ON admin_users` provoque la récursion corrigée en `20260209000001` ; l'implémentation réelle doit passer par un helper SECURITY DEFINER `public.my_role_in_tenant(uuid)` sur le même modèle que `get_my_tenant_ids_array`.)

- **Test pgTAP** : `supabase/tests/rls/admin_users_write.test.sql`
  - membre rôle `server` du tenant A : `UPDATE admin_users SET is_active=false WHERE role='owner'` affecte 0 ligne
  - membre rôle `server` : peut mettre à jour son propre `full_name`
  - membre rôle `owner` : peut désactiver un `server` de son tenant
  - membre rôle `owner` du tenant A : 0 ligne affectée sur un membre du tenant B

---

### [DB-06] coupons : anon peut énumérer tous les codes promo de tous les tenants

- **Gravité : MAJEUR**
- **Fichier** : policy `Public can validate active coupons` (visible `tests/journeys/fixtures/schema.sql`, section policies), grant `fixtures/schema.sql` (`GRANT ALL ON TABLE public.coupons TO anon`)
- **SQL actuel** :

```sql
CREATE POLICY "Public can validate active coupons" ON "public"."coupons"
  FOR SELECT USING (("is_active" = true));
```

- **Consequence concrete** : pas de clause `TO`, donc anon inclus, et pas de restriction colonne. `GET /rest/v1/coupons?select=*` retourne `code`, `discount_type`, `discount_value`, `max_discount_amount`, `min_order_amount`, `max_uses`, `current_uses` pour tous les tenants (`fixtures/schema.sql:1348-1364`). Un client peut appliquer un code d'un autre restaurant si la validation applicative ne recroise pas le `tenant_id`, et surtout n'importe qui peut siphonner l'intégralité des campagnes promo en cours de la plateforme. La migration `20260702000000_perf_rls_initplan_indexes.sql:23-25` a nettoyé les doublons admin sur cette table mais n'a pas touché à la policy publique.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000500_coupons_no_public_enumeration.sql
DROP POLICY IF EXISTS "Public can validate active coupons" ON public.coupons;
REVOKE ALL ON TABLE public.coupons FROM anon;

-- La validation passe par une RPC scopee : un code, un tenant, pas d'enumeration.
CREATE OR REPLACE FUNCTION public.validate_coupon(p_tenant_id uuid, p_code text)
RETURNS TABLE (id uuid, discount_type text, discount_value numeric,
               min_order_amount numeric, max_discount_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.discount_type::text, c.discount_value,
         c.min_order_amount, c.max_discount_amount
  FROM coupons c
  WHERE c.tenant_id = p_tenant_id
    AND upper(c.code) = upper(p_code)
    AND c.is_active
    AND (c.valid_from  IS NULL OR c.valid_from  <= now())
    AND (c.valid_until IS NULL OR c.valid_until >= now())
    AND (c.max_uses    IS NULL OR c.current_uses < c.max_uses)
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(uuid, text) TO anon, authenticated, service_role;
```

- **Test pgTAP** : `supabase/tests/rls/coupons_public.test.sql`
  - `SET ROLE anon; SELECT count(*) FROM coupons` = 0
  - `SELECT * FROM validate_coupon('<tenant_A>','CODE_A')` retourne 1 ligne
  - `SELECT * FROM validate_coupon('<tenant_A>','CODE_B_DU_TENANT_B')` retourne 0 ligne
  - assert absence de toute policy sur `coupons` dont `qual` contient `is_active = true` sans clause `roles`

---

### [DB-07] ads : SELECT USING (true), le jumeau announcements a été corrigé, pas ads

- **Gravité : MAJEUR**
- **Fichier** : `supabase/migrations/20260331000000_ads_announcements_tables.sql:60-62` (création), `supabase/migrations/20260702000000_perf_rls_initplan_indexes.sql:14-17` (correctif appliqué à announcements uniquement)
- **SQL actuel** :

```sql
-- 20260331000000_ads_announcements_tables.sql:60
DROP POLICY IF EXISTS "Anyone can view active ads" ON ads;
CREATE POLICY "Anyone can view active ads" ON ads
  FOR SELECT USING (true);
```

```sql
-- 20260702000000_perf_rls_initplan_indexes.sql:14
-- 1a. announcements: qual was `true` - exposed INACTIVE announcements to anon.
drop policy if exists "Anyone can view active announcements" on public.announcements;
-- (aucun equivalent pour ads)
```

- **Consequence concrete** : la migration `20260702000000` identifie littéralement le bug (« qual was `true` ») et le corrige sur `announcements`, mais laisse `ads` intact alors que la policy a été créée par la même migration, avec le même nom trompeur et le même prédicat. Anon lit donc toutes les publicités de tous les tenants, y compris celles `is_active = false` (créations en brouillon, campagnes retirées, `image_url` et `link` de partenaires non encore annoncés). Fuite de faible sensibilité mais réelle, et surtout preuve d'un correctif partiel non tracé.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000600_ads_active_only.sql
DROP POLICY IF EXISTS "Anyone can view active ads" ON public.ads;
CREATE POLICY "Public can view active ads" ON public.ads
  FOR SELECT USING (is_active = true);

-- Symetrie avec le correctif announcements : WITH CHECK explicite sur l'UPDATE.
DROP POLICY IF EXISTS "Admins can update own tenant ads" ON public.ads;
CREATE POLICY "Admins can update own tenant ads" ON public.ads
  FOR UPDATE TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
```

- **Test pgTAP** : `supabase/tests/rls/ads.test.sql`
  - insérer une ad `is_active = false` sur tenant A, `SET ROLE anon`, assert 0 ligne
  - insérer une ad `is_active = true`, assert 1 ligne pour anon
  - authentifié tenant B : `UPDATE ads SET tenant_id='<tenant_B>' WHERE tenant_id='<tenant_A>'` affecte 0 ligne

---

### [DB-08] Policies storage non versionnées : seul le bucket tenant-sounds existe dans les migrations

- **Gravité : MAJEUR**
- **Fichier** : `supabase/migrations/20260226000004_tenant_sounds_bucket.sql:1-49`, `supabase/migrations/20260702000000_perf_rls_initplan_indexes.sql:134-136`
- **SQL actuel** :

```sql
-- 20260226000004_tenant_sounds_bucket.sql:2
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-sounds', 'tenant-sounds', true)
ON CONFLICT (id) DO NOTHING;
...
-- ligne 46
CREATE POLICY "Public can read sounds"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tenant-sounds');
```

- **Consequence concrete**, en trois volets :
  1. Le code utilise au moins quatre buckets : `tenant-sounds`, `images` (`src/components/admin/AdsClient.tsx:80`), `menu-items` (`src/hooks/useSettingsData.ts:197`), `qr-designs` (référencé par `20260702000000:136`). **Seul `tenant-sounds` a des policies dans le dépôt.** Les policies des trois autres n'existent que dans le dashboard Supabase : non auditables, non reproductibles, non testables, perdues à la reconstruction d'un environnement. Impossible de répondre depuis le dépôt à la question « peut-on lister les fichiers d'un autre tenant sur `menu-items` ? ».
  2. `Public can read sounds` autorise le rôle `public` (anon inclus) à faire `SELECT` sur `storage.objects` filtré uniquement par `bucket_id`. Un `SELECT` sur `storage.objects` c'est l'API `list()` : n'importe qui peut énumérer l'arborescence complète du bucket, donc la liste des `tenant_id` ayant uploadé un son. Le bucket étant `public = true`, les fichiers sont de toute façon servis par URL, mais l'énumération, elle, n'est pas nécessaire.
  3. Les policies INSERT/UPDATE/DELETE (lignes 7 à 43) résolvent l'appartenance via `INNER JOIN admin_users au ON au.tenant_id = t.id WHERE au.user_id = auth.uid()` **sans filtre `is_active`** : même problème que DB-03, un employé désactivé peut écraser ou supprimer les sons de notification du restaurant.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000700_storage_policies_versioned.sql
-- 1. Supprimer le listing public.
DROP POLICY IF EXISTS "Public can read sounds" ON storage.objects;
-- Bucket public = URLs directes; aucune policy SELECT n'est requise pour la lecture.

-- 2. Filtre is_active sur les ecritures (les 3 policies existantes).
DROP POLICY IF EXISTS "Tenants can upload sounds" ON storage.objects;
CREATE POLICY "Tenants can upload sounds" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-sounds'
  AND (storage.foldername(name))[1] = ANY (
    SELECT t::text FROM unnest(public.get_my_tenant_ids_array()) t
  )
);
-- idem pour UPDATE et DELETE

-- 3. Versionner les buckets manquants (a adapter apres releve de l'etat reel).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('images','images',true), ('menu-items','menu-items',true), ('qr-designs','qr-designs',true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Tenant members write own images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('images','menu-items','qr-designs')
  AND (storage.foldername(name))[1] = ANY (
    SELECT t::text FROM unnest(public.get_my_tenant_ids_array()) t
  )
);
-- + UPDATE / DELETE symetriques
```

- **Test pgTAP** : `supabase/tests/storage/objects_policies.test.sql`
  - `policies_are('storage','objects', ARRAY[...])` : liste exhaustive et figée
  - `SET ROLE anon; SELECT count(*) FROM storage.objects WHERE bucket_id='tenant-sounds'` = 0
  - membre tenant A : `INSERT INTO storage.objects (bucket_id, name) VALUES ('menu-items','<tenant_B_uuid>/x.jpg')` refusé
  - membre désactivé du tenant A : `INSERT` sous son propre préfixe refusé

---

### [DB-09] supabase/schema.sql est périmé et incomplet alors qu'il se présente comme la source de vérité

- **Gravité : MAJEUR**
- **Fichier** : `supabase/schema.sql:1-15`
- **SQL actuel** :

```sql
-- ATTABL - schema of record (generated snapshot)
-- Full public-schema DDL of the production database (tables, RLS policies,
-- functions, indexes, constraints). Schema only - NO row data.
-- ... used to provision a fresh database.
```

- **Consequence concrete** : le fichier a été généré au commit `20227d5f` (19 juin 2026, PR #103) et n'a jamais été régénéré, malgré ~40 migrations postérieures. Il déclare 34 tables contre 42 dans le snapshot du 29 juin et 51 dans l'état réel. Il lui manque `ads`, `audit_log`, `invitations`, `newsletter_subscriber`, `platform_audit_log`, `push_subscriptions`, `role_permissions`, `tenant_supports`, plus les 9 tables post-marqueur. Il contient encore `increment_coupon_usage`, fonction supprimée en prod hors bande (constat fait dans `20260629000300_revoke_anon_order_dml_coupon_exec.sql:32-38`). Toute personne qui suit l'instruction « used to provision a fresh database » obtient une base sans table d'invitations, sans audit, sans permissions par rôle : la revue de sécurité menée sur ce fichier serait fausse.
- **SQL de correction** : pas de migration, une contrainte de processus.

```bash
# a ajouter comme porte CI (job dedie, non bloquant en local)
supabase db dump --linked --schema public -f supabase/schema.sql
git diff --exit-code supabase/schema.sql \
  || { echo "schema.sql desynchronise : regenerer apres migration"; exit 1; }
```

- **Test pgTAP** : `supabase/tests/schema/drift.test.sql`
  - `tables_are('public', ARRAY[... les 51 noms ...])` : toute table ajoutée ou oubliée casse le test
  - `has_column('public','order_items','tenant_id')` et équivalents pour chaque colonne introduite par une migration post-marqueur

---

### [DB-10] Policies UPDATE sans WITH CHECK explicite

- **Gravité : MINEUR**
- **Fichiers** : `20260331000000_ads_announcements_tables.sql:70` et `:92`, `20260218000000_invitations_permissions.sql` (`tenant_admins_can_update_invitations`), `20260218000001_restaurant_groups.sql` (`owner_can_update_own_group`), `20260218000002_table_assignments.sql` (`Tenant members can update assignments`)
- **SQL actuel** :

```sql
CREATE POLICY "Admins can update own tenant ads" ON ads
  FOR UPDATE USING (tenant_id = ANY(get_my_tenant_ids_array()));
```

- **Consequence concrete, avec la nuance qui compte** : contrairement à ce que suggère la formulation habituelle du risque, **ces policies ne permettent pas de déplacer une ligne vers un autre tenant**. PostgreSQL, quand `WITH CHECK` est omis sur une policy `FOR UPDATE`, réutilise l'expression `USING` comme `WITH CHECK`. Le prédicat `tenant_id = ANY(get_my_tenant_ids_array())` est donc bien évalué sur la nouvelle ligne. Le dépôt le documente correctement dans `20260622130000_rls_coverage_hardening.sql:11-13` (« Postgres falls back to USING for the write-check when WITH CHECK is omitted, so this was not an open hole »). Le vrai problème est de robustesse : la boucle de correction de cette migration (lignes 50 à 68) ne traite que `cmd = 'ALL'`, les 5 policies `FOR UPDATE` ci-dessus sont donc restées hors périmètre, en violation de la règle interne du projet (`.claude/rules/01-security.md`, citée ligne 13). Un futur `ALTER POLICY ... USING (...)` qui élargirait le `USING` pour une raison de lecture élargirait silencieusement le contrôle d'écriture du même coup.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000800_explicit_with_check_update.sql
-- Meme approche idempotente que 20260622130000, etendue aux policies FOR UPDATE.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'UPDATE'
      AND permissive = 'PERMISSIVE'
      AND with_check IS NULL
      AND qual IS NOT NULL
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                   r.policyname, r.tablename, r.qual);
  END LOOP;
END $$;
```

- **Test pgTAP** : `supabase/tests/rls/with_check_invariant.test.sql`
  - assertion globale : `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND permissive='PERMISSIVE' AND cmd IN ('ALL','UPDATE','INSERT') AND with_check IS NULL` = 0
  - test comportemental sur `ads` : tenant A tente `UPDATE ads SET tenant_id='<B>'`, assert 0 ligne affectée (doit passer avant ET après le correctif, c'est la preuve du fallback)

---

### [DB-11] destock_order : garde d'idempotence non scopée au tenant

- **Gravité : MINEUR**
- **Fichier** : `supabase/migrations/20260702130000_stock_ledger_canonical.sql:74-80`
- **SQL actuel** :

```sql
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND movement_type = 'order_destock'
  ) THEN
    RETURN 0;
  END IF;
```

- **Consequence concrete** : la sous-requête ne filtre pas sur `tenant_id`, alors que `restock_order` le fait (même fichier, ligne 155). L'exploitation directe suppose une collision d'UUID, donc improbable. Mais `reference_id` n'a aucune contrainte de type : si un jour un mouvement `order_destock` est écrit avec un `reference_id` réutilisé (import, migration de données, seed de test partagé), un déstockage légitime devient un no-op silencieux et le stock ne descend jamais. C'est aussi une incohérence de style qui empêche d'utiliser un index partiel `(tenant_id, reference_id)`.
- **SQL de correction** :

```sql
-- dans la recreation de destock_order
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND tenant_id = p_tenant_id
      AND movement_type = 'order_destock'
  ) THEN
    RETURN 0;
  END IF;
```

- **Test pgTAP** : `supabase/tests/stock/destock_tenant_scope.test.sql`
  - insérer manuellement un mouvement `order_destock` pour le tenant B avec le `reference_id` d'une commande du tenant A, puis appeler `destock_order(commande_A, tenant_A)` : assert que le déstockage a bien lieu (retour > 0)

---

### [DB-12] Grants anon résiduels : TRUNCATE, DELETE et INSERT sur une trentaine de tables

- **Gravité : MINEUR**
- **Fichier** : `tests/journeys/fixtures/schema.sql:4275`, `:4675`, et bloc `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "anon"` en fin de fichier
- **SQL actuel** :

```sql
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_users" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "anon";
...
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
```

- **Consequence concrete** : ce sont les privilèges par défaut de Supabase, pas une erreur du projet, et la RLS bloque effectivement les DML anon (aucune policy `INSERT`/`DELETE` ne s'évalue à vrai pour anon, `get_my_tenant_ids_array()` retournant `{}`). Deux réserves. D'une part `TRUNCATE` **n'est pas soumis à la RLS** ; il n'est pas exposé par PostgREST aujourd'hui, mais le grant reste inutile et non désiré. D'autre part le `ALTER DEFAULT PRIVILEGES` fait que **toute nouvelle table créée par `postgres` est automatiquement `GRANT ALL` pour anon** : la sécurité repose entièrement sur le fait de ne jamais oublier une policy. `20260629000300_revoke_anon_order_dml_coupon_exec.sql:1-20` fait exactement ce raisonnement pour `orders`/`order_items` ; il n'a pas été généralisé.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726000900_anon_grant_minimization.sql
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon', t.tablename);
  END LOOP;
END $$;

-- Tables sans aucun besoin anon : retrait complet.
REVOKE ALL ON TABLE public.admin_users, public.settings, public.audit_log,
  public.platform_audit_log, public.stripe_events, public.wave_events,
  public.orange_money_events, public.user_sessions, public.role_permissions,
  public.invitations, public.stock_movements, public.ingredients,
  public.recipes, public.suppliers FROM anon;
```

- **Test pgTAP** : `supabase/tests/grants/anon_surface.test.sql`
  - assertion globale : `has_table_privilege('anon', t, 'TRUNCATE')` faux pour toutes les tables de `public`
  - liste blanche figée des tables sur lesquelles anon garde `SELECT` (menu, catégories, venues, zones, tables, ads, announcements, tenants colonnes limitées)

---

### [DB-13] set_qr_designs_updated_at sans SET search_path

- **Gravité : MINEUR**
- **Fichier** : `supabase/migrations/20260704000000_qr_designs.sql:67-73`
- **SQL actuel** :

```sql
CREATE OR REPLACE FUNCTION set_qr_designs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- **Consequence concrete** : la fonction est `SECURITY INVOKER` (défaut), donc **ce n'est pas un vecteur d'escalade de privilège** : elle s'exécute avec les droits de l'appelant. C'est en revanche le seul écart au standard du dépôt, respecté partout ailleurs (`20260402000002_fix_function_search_path.sql`, `20260424000001_fix_missing_search_path.sql`), et cela déclenche l'advisor `function_search_path_mutable`. Le corps n'appelle que `now()` (schéma `pg_catalog`), le risque pratique est nul.
- Constat parallèle rassurant : **sur les 68 définitions `SECURITY DEFINER` des migrations, 2 seulement étaient sans `search_path`** (`20260401000001_atomic_user_cleanup.sql:4` et `20260218000001_restaurant_groups.sql:49`), et les deux ont été recréées avec `SET search_path` par `20260626000000_cascade_delete_last_member_tenant.sql:33` et `20260526120000_ensure_restaurant_groups_for_signup.sql:50`. Aucune fonction `SECURITY DEFINER` de l'état final n'est sans `search_path`.
- **SQL de correction** :

```sql
ALTER FUNCTION public.set_qr_designs_updated_at() SET search_path = public;
```

- **Test pgTAP** : `supabase/tests/functions/search_path.test.sql`
  - assertion globale : aucune fonction de `public` avec `prosecdef = true` ou déclenchée par trigger n'a `proconfig IS NULL`

---

### [DB-14] stock_counts et stock_count_lines : policies sans clause TO

- **Gravité : MINEUR**
- **Fichier** : `supabase/migrations/20260703000000_physical_stock_count.sql:61-79`
- **SQL actuel** :

```sql
CREATE POLICY stock_counts_select ON public.stock_counts FOR SELECT
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
```

- **Consequence concrete** : sans `TO authenticated`, la policy s'applique au rôle `public`, donc elle est évaluée pour anon à chaque requête. Elle bloque bien anon (`get_my_tenant_ids_array()` retourne `{}`), il n'y a pas de fuite. Deux effets secondaires : coût d'évaluation inutile pour anon, et incohérence avec toutes les autres tables post-marqueur (`table_sessions`, `payments`, `house_accounts`, `order_notes`, `coupon_redemptions`) qui, elles, portent bien `TO authenticated`. Ces deux tables n'ont par ailleurs **aucun `GRANT` explicite**, contrairement à leurs voisines : elles dépendent entièrement du `ALTER DEFAULT PRIVILEGES` de DB-12.
- **SQL de correction** :

```sql
-- supabase/migrations/20260726001000_stock_counts_role_scope.sql
ALTER POLICY stock_counts_select      ON public.stock_counts      TO authenticated;
ALTER POLICY stock_counts_insert      ON public.stock_counts      TO authenticated;
ALTER POLICY stock_counts_update      ON public.stock_counts      TO authenticated;
ALTER POLICY stock_counts_delete      ON public.stock_counts      TO authenticated;
ALTER POLICY stock_count_lines_select ON public.stock_count_lines TO authenticated;
ALTER POLICY stock_count_lines_insert ON public.stock_count_lines TO authenticated;
ALTER POLICY stock_count_lines_update ON public.stock_count_lines TO authenticated;
ALTER POLICY stock_count_lines_delete ON public.stock_count_lines TO authenticated;

REVOKE ALL ON TABLE public.stock_counts, public.stock_count_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_counts, public.stock_count_lines TO authenticated;
GRANT ALL ON public.stock_counts, public.stock_count_lines TO service_role;
```

- **Test pgTAP** : `supabase/tests/rls/stock_counts.test.sql`
  - `SET ROLE anon; SELECT count(*) FROM stock_counts` = 0
  - membre tenant A : voit ses sessions, 0 ligne du tenant B
  - `policy_roles_are('public','stock_counts','stock_counts_select', ARRAY['authenticated'])`

---

### [DB-15] La fixture de test est figée 40 migrations en arrière

- **Gravité : MINEUR**
- **Fichier** : `tests/journeys/fixtures/schema.sql`, `scripts/run-stock-integration.sh:24` (`FIXTURE_MARKER="20260628000000"`)
- **Consequence concrete** : le harness charge la fixture puis rejoue les migrations postérieures au marqueur. Le mécanisme est correct, mais la fixture reflète l'état prod du 29 juin. Toute dérive prod postérieure non exprimée en migration (or il y en a : `increment_coupon_usage` supprimée hors bande, `create_order_with_items` « drifted in prod » selon `20260629000400:9`, `custom_domain` disparue selon `20260623120000:5-8`) est invisible en test. Le `README.md` des migrations le reconnaît explicitement : « les migrations du repo ne reconstruisent pas une base vierge - schema initial etabli en prod avant tracking ». Cette dette est la raison pour laquelle `pnpm test:db` n'est pas dans les portes CI.
- **Correction** : régénérer la fixture et avancer le marqueur, ou mieux, backfiller une migration de socle qui rende la chaîne rejouable depuis zéro, ce qui supprime la fixture et ouvre la CI.

---

### [DB-16] Aucun test pgTAP

- **Gravité : MAJEUR** (structurel)
- **Constat** : `supabase/tests/` **n'existe pas**. Aucun fichier `*.sql` de test dans le dépôt hormis les deux snapshots. Aucune occurrence de « pgtap » nulle part.
- Ce qui existe à la place : 8 suites Vitest d'intégration (`tests/integration/stock/`, `tests/integration/mutations/`) qui appellent les vraies RPC via le client `service_role`, et 9 spécifications Playwright dont `tests/journeys/08-bola.spec.ts` et `07-edge-cases-security.spec.ts`.
- **Consequence concrete** : les tests d'intégration passent par `service_role`, qui **bypasse la RLS**. Aucun test du dépôt n'exerce donc une policy RLS en tant que rôle `anon` ou `authenticated`. Les trois findings CRITIQUE ci-dessus (DB-01, DB-02, DB-03) sont précisément de cette nature et auraient été capturés par un seul test pgTAP par table. Les tests BOLA Playwright passent par les routes Next.js, qui filtrent par tenant en couche applicative : ils ne testent pas l'accès direct PostgREST, qui est le vecteur réel.

---

## 3. Plan pgTAP

Structure proposée : `supabase/tests/`, exécutée par `supabase test db` (extension `pgtap` à activer dans une migration dédiée, `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;`).

Fixture commune `supabase/tests/00-fixture.sql` : deux tenants (A, B), pour chacun un `owner` actif, un `manager` actif, un `server` actif, un `server` désactivé, plus un jeu minimal de menu, ingrédients, recettes, commandes, paiements.

Helper `supabase/tests/helpers.sql` : `tests.authenticate_as(email text)` qui pose `request.jwt.claims` et `SET ROLE authenticated`, `tests.as_anon()`, `tests.clear_auth()`.

### Tests de couverture structurelle (1 fichier, exécuté en premier)

`supabase/tests/00-structure.test.sql`

1. `tables_are('public', ARRAY[<51 noms>])` : détecte toute table ajoutée sans mise à jour du test
2. pour chaque table de la liste : `is(rowsecurity, true)` depuis `pg_tables` : aucune table sans RLS
3. pour chaque table portant `tenant_id` : au moins une policy par commande S/I/U/D, ou une policy `ALL`
4. `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND permissive='PERMISSIVE' AND cmd IN ('ALL','UPDATE','INSERT') AND with_check IS NULL` = 0
5. `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND qual = 'true' AND roles @> '{anon}'` = 0, avec liste blanche explicite si besoin
6. aucune fonction `prosecdef = true` dans `public` avec `proconfig IS NULL` (search_path)
7. `has_table_privilege('anon', <chaque table>, 'TRUNCATE')` faux partout

### Tests d'isolation multi-tenant, table par table

Un fichier par table portant des données de tenant. Chaque fichier prouve les 5 mêmes propriétés :
lecture cross-tenant impossible, insertion pour un autre tenant impossible, déplacement de ligne vers un autre tenant impossible, suppression cross-tenant impossible, accès anon nul (sauf tables vitrine).

| Fichier                                                                                                                    | Ce que le test doit prouver, en plus du canevas                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `10-rls/admin_users.test.sql`                                                                                              | un `server` ne peut pas modifier `is_active` d'un autre membre (DB-05) ; personne ne peut écrire `role`, `tenant_id`, `custom_permissions`, `is_super_admin` ; la policy RESTRICTIVE bloque bien la création d'un `super_admin` |
| `10-rls/tenants.test.sql`                                                                                                  | anon ne lit ni `stripe_customer_id` ni `subscription_status` (DB-02) ; un owner du tenant A ne peut pas passer `id` ou `group_id` sur le tenant B ; les colonnes de facturation ne sont pas dans le grant `authenticated`       |
| `10-rls/push_subscriptions.test.sql`                                                                                       | anon lit 0 ligne (DB-01) ; un membre du tenant A ne lit pas les souscriptions du tenant B ; aucune policy dont `qual` vaut `true`                                                                                               |
| `10-rls/coupons.test.sql`                                                                                                  | anon lit 0 ligne (DB-06) ; `validate_coupon` renvoie 1 ligne pour le bon tenant, 0 pour le mauvais ; un admin A ne voit pas les coupons de B                                                                                    |
| `10-rls/orders.test.sql`                                                                                                   | anon ne lit aucune colonne PII (`customer_name`, `customer_phone`, `delivery_address`, `notes`, `room_number`) ; anon ne peut pas INSERT ; un admin A ne peut pas passer une commande de B sur son tenant                       |
| `10-rls/order_items.test.sql`                                                                                              | isolation par `tenant_id` ET par `order_id` ; le trigger `set_order_item_tenant_id` remplit bien `tenant_id` ; on ne peut pas rattacher un item à une commande d'un autre tenant                                                |
| `10-rls/payments.test.sql`                                                                                                 | ledger append-only : `UPDATE` et `DELETE` refusés même pour un owner ; insertion cross-tenant refusée                                                                                                                           |
| `10-rls/menu_items.test.sql`                                                                                               | anon ne voit pas les items `deleted_at IS NOT NULL` ; anon voit les items `is_available = false` non supprimés (contrat realtime de `20260716000000`) ; écriture cross-tenant refusée                                           |
| `10-rls/categories.test.sql`                                                                                               | idem menu_items, plus la policy `atfood_insert_categories` limitée à owner/admin/manager                                                                                                                                        |
| `10-rls/ads.test.sql`                                                                                                      | anon ne voit pas les ads `is_active = false` (DB-07) ; pas de lecture cross-tenant après correctif                                                                                                                              |
| `10-rls/announcements.test.sql`                                                                                            | non-régression du correctif `20260702000000` : anon ne voit que `is_active = true`                                                                                                                                              |
| `10-rls/settings.test.sql`                                                                                                 | isolation stricte, aucun accès anon                                                                                                                                                                                             |
| `10-rls/invitations.test.sql`                                                                                              | seuls owner/admin lisent et écrivent ; un `manager` ne voit rien ; pas de lecture cross-tenant du token                                                                                                                         |
| `10-rls/role_permissions.test.sql`                                                                                         | seul `owner` écrit ; tout membre lit celles de son tenant ; rien en cross-tenant                                                                                                                                                |
| `10-rls/audit_log.test.sql`                                                                                                | append-only (pas d'UPDATE/DELETE) ; lecture réservée à owner/admin/manager ; rien en cross-tenant                                                                                                                               |
| `10-rls/platform_audit_log.test.sql`                                                                                       | `authenticated` et `anon` lisent 0 ligne et ne peuvent rien écrire (RLS sans policy)                                                                                                                                            |
| `10-rls/stock_movements.test.sql`                                                                                          | isolation ; le ledger ne peut pas être modifié pour un autre tenant                                                                                                                                                             |
| `10-rls/ingredients.test.sql`, `recipes.test.sql`, `suppliers.test.sql`, `item_suggestions.test.sql`                       | canevas standard                                                                                                                                                                                                                |
| `10-rls/stock_counts.test.sql`                                                                                             | isolation ; anon lit 0 (DB-14) ; une seule session `open` par tenant (index unique)                                                                                                                                             |
| `10-rls/house_accounts.test.sql`, `order_notes.test.sql`                                                                   | isolation ; `order_notes` append-only                                                                                                                                                                                           |
| `10-rls/table_sessions.test.sql`                                                                                           | isolation ; un seul `open` par (tenant, table)                                                                                                                                                                                  |
| `10-rls/coupon_redemptions.test.sql`                                                                                       | lecture tenant seulement, aucune écriture `authenticated`                                                                                                                                                                       |
| `10-rls/qr_designs.test.sql`                                                                                               | membre désactivé bloqué (non-régression `20260712000000`) ; un seul design `is_default` par tenant                                                                                                                              |
| `10-rls/order_mutation_requests.test.sql`                                                                                  | isolation ; membre désactivé bloqué                                                                                                                                                                                             |
| `10-rls/user_preferences.test.sql`, `user_sessions.test.sql`, `onboarding_progress.test.sql`                               | scoping par `user_id`, pas seulement par tenant                                                                                                                                                                                 |
| `10-rls/notifications.test.sql`, `stock_alert_notifications.test.sql`                                                      | isolation ; on ne marque pas comme lue la notification d'un autre                                                                                                                                                               |
| `10-rls/restaurant_groups.test.sql`                                                                                        | scoping par `owner_user_id` ; l'owner peut supprimer son groupe (non-régression `20260622130000:41-45`)                                                                                                                         |
| `10-rls/tables_zones_venues.test.sql`                                                                                      | lecture publique `is_active` assumée et documentée ; écriture strictement tenant                                                                                                                                                |
| `10-rls/tenant_supports.test.sql`, `dish_photo_drafts.test.sql`, `ai_credits_ledger.test.sql`, `ai_photo_credits.test.sql` | canevas standard                                                                                                                                                                                                                |
| `10-rls/webhook_tables.test.sql`                                                                                           | `stripe_events`, `wave_events`, `orange_money_events` : `anon` et `authenticated` lisent 0 et n'écrivent rien                                                                                                                   |
| `10-rls/newsletter_subscriber.test.sql`                                                                                    | anon peut INSERT un email valide, ne peut pas INSERT un email malformé (contrainte de `20260702000000:100-105`), ne peut ni lire ni supprimer                                                                                   |

### Test transversal du membre désactivé

`supabase/tests/20-deactivated-member.test.sql` : sous l'identité du `server` désactivé du tenant A, boucler sur les 51 tables et asserter 0 ligne en lecture et refus en écriture. C'est le test qui verrouille DB-03 et empêche toute régression future du helper.

### Tests des fonctions SECURITY DEFINER

`supabase/tests/30-secdef/grants.test.sql`

- pour chaque fonction `prosecdef`, asserter la liste exacte des rôles ayant `EXECUTE`
- garde-fou explicite : `anon` n'a `EXECUTE` que sur `get_my_tenant_ids`, `get_my_tenant_ids_array`, `is_super_admin`, `prevent_super_admin_elevation`, `get_tenant_by_slug`, `get_orders_for_tracking`, `is_table_occupied`, `get_co_ordered_items` et les triggers `update_*_updated_at`. Toute nouvelle entrée casse le test (c'est la contre-mesure au `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon`)
- `create_order_with_items`, `destock_order`, `restock_order`, `provision_signup_tenant`, `provision_group_restaurant`, `delete_admin_user_atomic`, `reset_tenant_data`, `expire_stale_payment_sessions`, `claim_activation_event` : `service_role` uniquement

`supabase/tests/30-secdef/cross_tenant_guard.test.sql` : pour chacune des ~25 fonctions prenant `p_tenant_id`, appeler sous l'identité d'un membre du tenant A avec l'id du tenant B et asserter `42501` via `assert_tenant_member`. Couvre `get_daily_revenue`, `get_order_summary`, `get_top_items`, `get_category_breakdown`, `get_server_performance`, `get_daily_comps`, `get_house_account_balances`, `get_stock_status`, `get_stock_movements_page`, `get_staff_stock_report`, `get_losses_by_reason`, `verify_stock_ledger`, `reconcile_stock_ledger`, `adjust_ingredient_stock_tx`, `adjust_ingredient_stock`, `set_opening_stock`, `set_recipe_tx`, `record_loss_tx`, `import_recipes_tx`, `open_stock_count`, `save_stock_count_lines`, `commit_stock_count`, `cancel_stock_count`, `reassign_order_table`, `get_owner_dashboard`.

`supabase/tests/30-secdef/anon_surface.test.sql` : sous `anon`, `get_orders_for_tracking(tenant_B, ARRAY[id_du_tenant_A])` retourne `[]` ; `is_table_occupied` retourne un booléen et ne fuit aucune donnée ; `get_tenant_by_slug` ne renvoie aucune colonne de facturation.

### Tests du moteur de stock et des conditions de course

`supabase/tests/40-stock/destock_atomic.test.sql`

- déstockage nominal : recette × quantité, une ligne `order_destock` par ingrédient avec `quantity` négative
- rejeu : second appel retourne 0, aucun mouvement supplémentaire
- stock insuffisant : `INSUFFICIENT_STOCK` levée, aucune écriture partielle
- passage à 0 : les `menu_items` de la recette basculent en `is_available = false`
- invariant : `verify_stock_ledger(tenant)` retourne 0 ligne

`supabase/tests/40-stock/restock_race.test.sql` (le test qui prouve DB-04)

- deux `restock_order` séquentiels : stock restauré une seule fois
- deux `restock_order` concurrents (deux sessions, ou `pg_background_launch`) : assert que `current_stock` final égale le niveau initial et non le double, et que l'index unique `uq_stock_movements_restock_once` a rejeté la seconde insertion
- assert `verify_stock_ledger` à 0 après la course

`supabase/tests/40-stock/physical_count.test.sql` : delta calculé au commit et non à l'ouverture ; commit idempotent (second appel lève `COUNT_ALREADY_CLOSED`) ; une seule session `open` par tenant.

`supabase/tests/40-stock/losses.test.sql` : clamp à 0, `reason_code` hors vocabulaire rejeté, mouvement enregistrant le delta réellement appliqué.

### Tests des triggers

`supabase/tests/50-triggers/`

- `order_items_tenant_id.test.sql` : `trg_order_items_tenant_id` remplit `tenant_id` depuis la commande parente ; `NOT NULL` respecté sur tous les chemins d'insertion
- `super_admin_elevation.test.sql` : `prevent_super_admin_elevation` bloque `INSERT` et `UPDATE` d'un `super_admin` par un non-super-admin
- `venue_plan_limit.test.sql` : plan `starter` bloqué au 2e venue actif, insertion multi-lignes en un appel bloquée (le cas que le trigger `AFTER` traite volontairement), deux créations concurrentes sérialisées par le verrou consultatif ; `enforce_min_one_active_venue` bloque la désactivation du dernier venue
- `qr_paywall.test.sql` : `enforce_qr_customization_entitlement` refuse l'écriture pour un plan `starter`, l'accepte en essai actif
- `tenant_name_unique.test.sql` : collision de nom cross-groupe rejetée, réutilisation intra-groupe acceptée
- `broadcast_order_status.test.sql` : l'échec de `realtime.send` ne fait pas échouer l'`UPDATE` du statut (le bloc `EXCEPTION WHEN OTHERS`)

**Note sur `handle_new_user`** : il n'existe **aucun trigger sur `auth.users`** dans ce dépôt. La création d'utilisateur passe intégralement par les RPC `provision_signup_tenant` et `accept_invitation_membership`, appelées en `service_role`. C'est un choix plus sain qu'un trigger `handle_new_user` (transaction explicite, pas de couplage à GoTrue), mais cela signifie qu'un utilisateur créé directement dans le dashboard Supabase n'aura aucune ligne `admin_users` : à couvrir par `50-triggers/orphan_auth_user.test.sql` qui asserte que `get_my_tenant_ids_array()` retourne `{}` pour un tel utilisateur et qu'il ne lit rien.

### Tests storage

`supabase/tests/60-storage/objects.test.sql` : voir DB-08. Liste figée des policies, aucun listing anon, préfixe de dossier = `tenant_id` du membre actif.

### Ordre d'exécution et intégration CI

```
supabase/tests/
  00-fixture.sql
  helpers.sql
  00-structure.test.sql
  10-rls/*.test.sql          (37 fichiers)
  20-deactivated-member.test.sql
  30-secdef/*.test.sql       (3 fichiers)
  40-stock/*.test.sql        (4 fichiers)
  50-triggers/*.test.sql     (7 fichiers)
  60-storage/objects.test.sql
```

Priorité de rédaction : `00-structure`, `10-rls/push_subscriptions`, `10-rls/tenants`, `20-deactivated-member`, `40-stock/restock_race` couvrent à eux seuls les 4 findings CRITIQUE/MAJEUR les plus exploitables.

---

## 4. Ce qui est déjà correct

Le socle est nettement au-dessus de la moyenne pour un SaaS multi-tenant de cette taille. À porter au crédit du projet :

- **RLS activée sur 51/51 tables.** Aucune migration n'a créé de table sans `ENABLE ROW LEVEL SECURITY`. `platform_audit_log` et `stripe_events` utilisent correctement le pattern RLS-sans-policy comme deny-all (`20260626115557:34-35`, `20260420000000:16-19`).
- **`search_path` explicite sur 100 % des fonctions `SECURITY DEFINER` de l'état final.** Les deux manquantes historiques ont été recréées correctement. `20260623000000:23-27` documente même le piège précis (`CREATE OR REPLACE` sans `SET` efface le `search_path` de la définition précédente), ce qui est un niveau de rigueur rare.
- **Garde d'autorisation cross-tenant dans le corps des fonctions.** `assert_tenant_member()` (`20260623000000:35-58`) est appelée en tête de toutes les RPC prenant un `p_tenant_id`, avec les trois exemptions correctes (service_role, super_admin, membre du tenant). C'est la bonne réponse au fait que `SECURITY DEFINER` bypasse la RLS, et c'est appliqué systématiquement, y compris dans les migrations les plus récentes (`20260710120000:46`, `20260703170000:28`).
- **Discipline des `GRANT`/`REVOKE` sur les fonctions.** Quatre migrations successives (`20260622140000`, `20260629000300`, `20260630060000`, `20260630070000`) réduisent la surface, avec à chaque fois la justification par caller. `20260622140000:11-15` explique correctement pourquoi `REVOKE FROM anon` seul est inefficace quand `PUBLIC` détient le privilège. `20260628010000:27-30` anticipe le piège du surcharge de signature qui recrée un `EXECUTE PUBLIC`.
- **`destock_order` est atomique.** Décrément en une seule instruction avec garde intégrée (`UPDATE ... SET current_stock = current_stock - v_required WHERE ... AND current_stock >= v_required`, `20260702130000:97-101`), verrou consultatif par commande, idempotence par le ledger. C'est exactement le bon pattern, sans lecture-puis-écriture.
- **Ledger de stock avec invariant vérifiable.** Convention du delta signé, plus `verify_stock_ledger` et `reconcile_stock_ledger` (`20260702130000:281`) pour détecter et réparer toute écriture hors RPC. Peu d'équipes se donnent cet outillage.
- **Idempotence des écritures offline.** `client_request_id` avec index unique partiel et gestion du `unique_violation` concurrent (`20260628010000:155-178`), table `order_mutation_requests` avec distinction claire entre claim en vol (`processed_at IS NULL`, donc 409) et succès rejouable (`20260717000000:18-23`).
- **Colonnes PII de `orders`/`order_items` correctement retirées à anon**, colonne par colonne (`20260506155500`), puis migration du realtime vers Broadcast pour fermer la fuite que les grants colonne ne couvraient pas (`20260623110000:6-13`), puis réduction du topic de tenant-wide à per-order (`20260623130000`). Trois itérations, chacune justifiée, chacune resserrant.
- **Colonnes privilégiées de `admin_users` verrouillées à service_role** (`20260420000003`), plus policy RESTRICTIVE anti-escalade `super_admin` (`20260420000001`) et triggers `prevent_super_admin_elevation` sur INSERT et UPDATE (`20260420010000`, `20260420020000`).
- **Entitlements plan appliqués en base**, pas seulement en couche applicative : `enforce_venue_plan_limit` avec verrou consultatif et choix argumenté du `AFTER` plutôt que `BEFORE` pour couvrir les insertions multi-lignes (`20260717120000:15-25`), `enforce_qr_customization_entitlement` (`20260711080000`).
- **Qualité documentaire des migrations.** Chaque fichier explique le pourquoi, la stratégie de rollback, l'ordre de déploiement code/migration, et le caractère additif ou destructif. `20260622130000:9-13` corrige même l'idée reçue sur `WITH CHECK` avec la bonne référence au comportement PostgreSQL. C'est ce qui a rendu cet audit possible.
- **Absence de trigger sur `auth.users`** : la provisioning passe par des RPC transactionnelles explicites, ce qui évite la classe entière de bugs des triggers `handle_new_user`.

---

## 5. Non vérifiable sans accès à la base de production

Les points suivants relèvent d'un constat sur fichiers et ne peuvent être tranchés qu'en interrogeant la base réelle.

1. **L'état réel des policies.** Les deux snapshots datent du 19 et du 29 juin. Les migrations de juillet (`20260702000000` à `20260717120000`) sont supposées appliquées, sans preuve. Requête à passer : `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 2,3;`
2. **DB-01 en particulier.** Il faut confirmer que `Service can read all push subscriptions` existe toujours en prod : `SELECT policyname, qual FROM pg_policies WHERE tablename='push_subscriptions';`. S'il est absent et que `Only service role can read push subscriptions` est présent, DB-01 se dégrade en simple dérive documentaire.
3. **L'état de `supabase_migrations.schema_migrations`.** Quelles migrations sont réellement marquées appliquées ? `20260309000001` y figure-t-elle malgré l'absence de ses policies ? Le précédent de `20260227000000_custom_domains` (« recorded as applied in production but the column never materialized », `20260623120000:5-8`) prouve que le tracker ment déjà au moins une fois.
4. **Les policies storage réelles** sur `images`, `menu-items`, `qr-designs`, et le flag `public` de chaque bucket : `SELECT id, public FROM storage.buckets;` et `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='storage';`
5. **Les grants effectifs**, notamment colonne par colonne : `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated');` et l'équivalent sur `information_schema.column_privileges`.
6. **Les fonctions présentes en prod mais absentes du dépôt.** Plusieurs migrations mentionnent une dérive (`create_order_with_items` « drifted in prod », `selected_option`/`selected_variant` « added out-of-band »). Requête : `SELECT p.proname, p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1;` à diffuser contre la liste reconstituée.
7. **Le contenu réel de la publication realtime** : `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime';`. Détermine l'ampleur exacte de l'aggravation décrite en DB-02.
8. **La reproductibilité de la course de DB-04.** La démonstration ci-dessus est un raisonnement sur le niveau d'isolation `READ COMMITTED` ; la confirmer demande deux sessions concurrentes sur une base réelle, ce que seul `pnpm test:db` (Docker requis) ou un environnement de staging permet.
9. **Les advisors Supabase en cours** (`security` et `performance`) : plusieurs migrations les citent comme source, mais leur état actuel n'est pas consultable depuis le dépôt.
10. **L'existence d'un environnement de staging.** Le `README.md` des migrations le recommande au conditionnel (« Créer un second projet Supabase pour un environnement staging »), ce qui laisse penser que les migrations sont appliquées directement en production. Si c'est confirmé, c'est le risque de processus dominant, devant tous les findings techniques listés ici.

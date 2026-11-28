-- ============================================================================
-- ATTABL - schema of record (generated snapshot)
-- ============================================================================
-- Full public-schema DDL of the production database (tables, RLS policies,
-- functions, indexes, constraints). Schema only - NO row data.
--
-- Purpose: the base schema of the core tables was historically unversioned
-- (migrations only ALTER existing tables). This snapshot documents the real
-- schema in the repo so it can be reviewed, diffed for drift, and used to
-- provision a fresh database.
--
-- This file is NOT part of the migration replay stream (it would conflict with
-- the existing applied migrations on prod). Regenerate after schema changes:
--   supabase db dump --linked --schema public -f supabase/schema.sql
--
-- 2026-11-05 : regenere avec pg_dump 17 et NON avec `supabase db dump`, qui
-- exige Docker (absent de cette machine). Commande reellement utilisee :
--   pg_dump "$DATABASE_URL" --schema-only --schema public --quote-all-identifiers
-- Le resultat inclut proprietaires et privileges, comme l'instantane precedent.
-- 2026-11-23 : regenere apres la mise en production du lot 4 (rapports par
-- espace et rapports avances), avec le schema `private` en plus de `public` :
-- des policies et fonctions de public appellent private.* (20261114110000).
--   pg_dump "$DATABASE_URL" --schema-only --schema public --schema private --quote-all-identifiers
-- Avant de poser le marqueur, chaque migration du depot posterieure a l'ancien
-- marqueur a ete verifiee EN PRODUCTION (suivi supabase_migrations, et par
-- l'existence de ses objets pour les 13 absentes du suivi). Les lignes
-- \restrict / \unrestrict de pg_dump 17 (jeton aleatoire a chaque dump) sont
-- retirees. La table account_deletion_requests (application AtFood, creee en
-- production sans fichier de migration dans ce depot) y figure donc.
-- L'instantane d'avant datait d'une epoque a 34 tables : il en manquait 17 et
-- 42 policies. Il ne decrivait plus la base depuis des mois, ce qui faussait
-- tout audit s'appuyant dessus.
--
-- 2026-11-27 : regenere apres la mise en production de la PR #473 (verification
-- de mise en production: registre de stock, cout moyen pondere, double
-- authentification exigee par la base, adresses e-mail bloquees, alerte de
-- connexion). Toutes les migrations du depot jusqu'a 20261124210700 sont
-- enregistrees en production (comparaison faite). La production porte en plus
-- 20261124190000 (email_unsubscribes), appliquee par une autre session et
-- absente du depot: ses objets figurent dans cet instantane.
--
-- 2026-11-28 : regenere apres la mise en production du lot 1 de la refonte des
-- roles du personnel (postes cumulables, 22 droits, contraction MIG4) et des PR
-- #502 et #504. Toutes les migrations du depot jusqu'a 20261128120000 sont
-- enregistrees en production, et la production n'en porte aucune autre
-- (comparaison faite, 9 sur 9 depuis l'ancien marqueur).
--
-- MARQUEUR LU PAR scripts/run-pgtap.sh. Derniere migration DEJA comprise dans
-- cet instantane. L'executant charge ce fichier puis applique uniquement les
-- migrations POSTERIEURES - beaucoup des anciennes ne sont pas idempotentes et
-- les rejouer casserait la base de test. A mettre a jour a chaque regeneration.
-- SCHEMA_SNAPSHOT_MIGRATION=20261128120000
--
-- A NE PAS CONFONDRE avec tests/journeys/fixtures/schema.sql, qui porte son
-- propre marqueur (FIXTURE_MARKER, ecrit dans son en-tete) et sert de base aux
-- tests de parcours : celui-la ne doit pas etre regenere sans adapter les tests.
-- ============================================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA "private";


ALTER SCHEMA "private" OWNER TO "postgres";

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: codes_droits(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."codes_droits"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT ARRAY[
    'menu.view','menu.edit','menu.price',
    'orders.take','kitchen.track','orders.cancel','orders.discount','orders.refund',
    'orders.pay','cash.close','cash.count',
    'reports.menu','reports.money','reports.own',
    'inventory.view','inventory.edit','suppliers.manage',
    'team.view','team.manage','settings.edit','audit.view','billing.manage'
  ]::text[];
$$;


ALTER FUNCTION "private"."codes_droits"() OWNER TO "postgres";

--
-- Name: droits_hors_catalogue(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."droits_hors_catalogue"() RETURNS TABLE("origine" "text", "code" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $_$
  WITH textes AS (
    SELECT 'politique ' || pol.tablename || ' / ' || pol.policyname AS origine,
           coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') AS texte
    FROM pg_catalog.pg_policies AS pol
    UNION ALL
    SELECT 'fonction ' || n.nspname || '.' || p.proname, p.prosrc
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
  )
  SELECT t.origine, coalesce(m.l[1], m.l[2])
  FROM textes AS t
  CROSS JOIN LATERAL regexp_matches(
    t.texte,
    $re$(?:has_tenant_write_permission|tenant_permission_level)"?\s*\(\s*[^,()]+,\s*'([^']*)'|tenants_avec_droit"?\s*\(\s*'([^']*)'$re$,
    'g') AS m(l)
  WHERE NOT (coalesce(m.l[1], m.l[2]) = ANY (private.codes_droits()));
$_$;


ALTER FUNCTION "private"."droits_hors_catalogue"() OWNER TO "postgres";

--
-- Name: droits_valides("jsonb"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."droits_valides"("p" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_each(p) AS e
      WHERE NOT (e.key = ANY (private.codes_droits())) OR jsonb_typeof(e.value) <> 'boolean')
  END;
$$;


ALTER FUNCTION "private"."droits_valides"("p" "jsonb") OWNER TO "postgres";

--
-- Name: garder_proprietaire(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."garder_proprietaire"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ('owner' = ANY (OLD.postes)) IS DISTINCT FROM ('owner' = ANY (NEW.postes)) THEN
      RAISE EXCEPTION 'the owner poste cannot be granted or removed' USING ERRCODE = '42501';
    END IF;
    IF 'owner' = ANY (OLD.postes)
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
      RAISE EXCEPTION 'the owner row cannot be reassigned' USING ERRCODE = '42501';
    END IF;
    -- Desactiver le proprietaire d'un restaurant ouvert. Les gestes d'equipe
    -- ecrivent en service_role : sans cette garde, la seule protection etait
    -- le controle de l'application. Les gestes de la PLATEFORME restent permis
    -- et se reconnaissent a ce qu'ils datent la ligne : bannir (`banned_at`)
    -- ou retirer (`deleted_at`). Un geste d'equipe n'ecrit que `is_active`.
    IF 'owner' = ANY (OLD.postes)
       AND OLD.is_active IS DISTINCT FROM false AND NEW.is_active IS FALSE
       AND NEW.banned_at IS NULL AND NEW.deleted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM public.tenants AS t WHERE t.id = OLD.tenant_id AND t.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'the owner of a live restaurant cannot be deactivated' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE : interdit tant que le restaurant existe et n'est pas ferme. La
  -- suppression en cascade depuis tenants passe (la ligne tenants n'est plus
  -- visible quand la cascade arrive), delete_my_account sur un restaurant
  -- ferme passe aussi.
  IF 'owner' = ANY (OLD.postes) AND EXISTS (
       SELECT 1 FROM public.tenants AS t WHERE t.id = OLD.tenant_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'the owner of a live restaurant cannot be removed' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "private"."garder_proprietaire"() OWNER TO "postgres";

--
-- Name: matrice_postes(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."matrice_postes"() RETURNS TABLE("poste" "text", "droit" "text", "niveau" "text")
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  VALUES
    ('manager','menu.view','full'), ('manager','menu.edit','full'), ('manager','menu.price','full'),
    ('manager','orders.take','full'), ('manager','kitchen.track','full'), ('manager','orders.cancel','full'),
    ('manager','orders.discount','full'), ('manager','orders.refund','full'), ('manager','orders.pay','full'),
    ('manager','cash.close','full'), ('manager','cash.count','full'), ('manager','reports.menu','full'),
    ('manager','reports.money','full'), ('manager','reports.own','full'), ('manager','inventory.view','full'),
    ('manager','inventory.edit','full'), ('manager','suppliers.manage','full'), ('manager','team.view','full'),
    ('manager','team.manage','full'), ('manager','settings.edit','full'), ('manager','audit.view','full'),
    ('manager','billing.manage','limited'),
    ('chef','menu.view','full'), ('chef','menu.edit','full'), ('chef','menu.price','full'),
    ('chef','kitchen.track','full'), ('chef','reports.menu','full'), ('chef','inventory.view','full'),
    ('chef','inventory.edit','full'), ('chef','suppliers.manage','full'),
    ('cashier','menu.view','full'), ('cashier','orders.take','full'), ('cashier','orders.cancel','limited'),
    ('cashier','orders.discount','limited'), ('cashier','orders.refund','limited'), ('cashier','orders.pay','full'),
    ('cashier','cash.count','full'), ('cashier','reports.own','full'),
    ('bartender','menu.view','full'), ('bartender','orders.take','full'), ('bartender','kitchen.track','full'),
    ('bartender','orders.cancel','limited'), ('bartender','orders.discount','limited'), ('bartender','orders.refund','limited'),
    ('bartender','orders.pay','full'), ('bartender','cash.count','full'), ('bartender','reports.own','full'),
    ('bartender','inventory.view','full'),
    ('reception','menu.view','full'), ('reception','orders.take','full'), ('reception','orders.cancel','limited'),
    ('reception','orders.discount','limited'), ('reception','orders.refund','limited'), ('reception','orders.pay','full'),
    ('reception','cash.count','full'), ('reception','reports.own','full'),
    ('waiter','menu.view','full'), ('waiter','orders.take','full'), ('waiter','orders.cancel','limited'),
    ('waiter','orders.discount','limited'), ('waiter','orders.pay','limited'), ('waiter','reports.own','full'),
    ('cook','menu.view','full'), ('cook','kitchen.track','full'), ('cook','inventory.view','full'),
    ('crew','menu.view','full'), ('crew','orders.take','full'), ('crew','kitchen.track','full'),
    ('crew','orders.cancel','limited'), ('crew','orders.discount','limited'), ('crew','orders.refund','limited'),
    ('crew','orders.pay','full'), ('crew','cash.count','full'), ('crew','reports.own','full'),
    ('crew','inventory.view','full'),
    ('sales','menu.view','full'), ('sales','orders.take','full'), ('sales','orders.cancel','limited'),
    ('sales','orders.discount','limited'), ('sales','orders.refund','limited'), ('sales','orders.pay','full'),
    ('sales','cash.count','full'), ('sales','reports.own','full'),
    ('production','menu.view','full'), ('production','kitchen.track','full'), ('production','inventory.view','full')
  ;
END;
$$;


ALTER FUNCTION "private"."matrice_postes"() OWNER TO "postgres";

--
-- Name: postes_depuis_role("text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."postes_depuis_role"("p_role" "text") RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT CASE p_role
    WHEN 'super_admin' THEN '{}'::text[]
    WHEN 'admin' THEN ARRAY['manager']
    ELSE ARRAY[p_role]
  END;
$$;


ALTER FUNCTION "private"."postes_depuis_role"("p_role" "text") OWNER TO "postgres";

--
-- Name: postes_normalises("text"[]); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."postes_normalises"("p" "text"[]) RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT coalesce(array_agg(x.poste ORDER BY x.rang, x.poste), '{}'::text[])
  FROM (
    SELECT DISTINCT u.poste,
           coalesce(array_position(ARRAY['owner','manager','chef','cashier','bartender','reception',
                                         'waiter','cook','crew','sales','production'], u.poste), 99) AS rang
    FROM unnest(coalesce(p, '{}'::text[])) AS u(poste)
  ) AS x;
$$;


ALTER FUNCTION "private"."postes_normalises"("p" "text"[]) OWNER TO "postgres";

--
-- Name: role_depuis_postes("text"[]); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."role_depuis_postes"("p_postes" "text"[]) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT c.poste
  FROM unnest(ARRAY['owner','manager','chef','cashier','bartender','reception',
                    'waiter','cook','crew','sales','production']) WITH ORDINALITY AS c(poste, rang)
  WHERE c.poste = ANY (p_postes)
  ORDER BY c.rang LIMIT 1;
$$;


ALTER FUNCTION "private"."role_depuis_postes"("p_postes" "text"[]) OWNER TO "postgres";

--
-- Name: storefront_tenant_visible("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."storefront_tenant_visible"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.deleted_at IS NULL
      AND t.suspended_at IS NULL
      AND (
        t.is_active = true
        OR (
          t.subscription_status = 'frozen'
          AND t.freeze_reason = 'trial_expired'
          AND t.trial_ends_at IS NOT NULL
          AND now() < t.trial_ends_at + interval '7 days'
        )
      )
  );
$$;


ALTER FUNCTION "private"."storefront_tenant_visible"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: sync_postes_admin_users(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."sync_postes_admin_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  IF TG_OP = 'INSERT' THEN
    IF cardinality(NEW.postes) = 0 THEN
      NEW.postes := private.postes_depuis_role(NEW.role);
    ELSIF NEW.role IS DISTINCT FROM 'super_admin' THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.postes IS DISTINCT FROM OLD.postes THEN
    IF NEW.role IS DISTINCT FROM 'super_admin' AND cardinality(NEW.postes) > 0 THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.postes := private.postes_depuis_role(NEW.role);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."sync_postes_admin_users"() OWNER TO "postgres";

--
-- Name: sync_postes_invitations(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."sync_postes_invitations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  IF TG_OP = 'INSERT' THEN
    IF cardinality(NEW.postes) = 0 THEN
      NEW.postes := private.postes_depuis_role(NEW.role);
    ELSE
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.postes IS DISTINCT FROM OLD.postes THEN
    IF cardinality(NEW.postes) > 0 THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.postes := private.postes_depuis_role(NEW.role);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."sync_postes_invitations"() OWNER TO "postgres";

--
-- Name: viewer_owns_tenant_group("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION "private"."viewer_owns_tenant_group"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    JOIN public.restaurant_groups g ON g.id = t.group_id
    WHERE t.id = p_tenant_id
      AND g.owner_user_id = (SELECT auth.uid())
  );
$$;


ALTER FUNCTION "private"."viewer_owns_tenant_group"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: accept_invitation_membership("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO v_inv
  FROM invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO admin_users (
    user_id, tenant_id, email, full_name, role, is_active, postes, permission_overrides, created_by
  ) VALUES (
    p_user_id, v_inv.tenant_id, v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    v_inv.role, true, v_inv.postes, v_inv.permission_overrides, v_inv.invited_by
  );

  UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object('tenantId', v_inv.tenant_id, 'tenantSlug', COALESCE(v_slug, ''));
END;
$$;


ALTER FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") OWNER TO "postgres";

--
-- Name: adjust_ingredient_stock_tx("uuid", "uuid", numeric, "text", "text", "uuid", "uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_supplier_id" "uuid" DEFAULT NULL::"uuid", "p_unit_cost" numeric DEFAULT NULL::numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_before NUMERIC(10,3); v_after NUMERIC(10,3);
  v_cost_before NUMERIC(10,2);
  v_price NUMERIC(12,4);
  v_base NUMERIC;
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  IF p_movement_type NOT IN ('manual_add','manual_remove','adjustment','opening') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: %', p_movement_type USING ERRCODE = '22023';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'INVALID_SUPPLIER' USING ERRCODE = '22023';
  END IF;
  -- CUMP: un prix d'achat n'a de sens que pour une reception, et il doit
  -- tenir dans la colonne du cout (numeric(10,2)).
  IF p_unit_cost IS NOT NULL THEN
    IF p_movement_type <> 'manual_add' OR p_delta IS NULL OR p_delta <= 0 THEN
      RAISE EXCEPTION 'INVALID_UNIT_COST: prix accepte pour une reception seulement' USING ERRCODE = '22023';
    END IF;
    v_price := round(p_unit_cost, 4);
    IF v_price <= 0 OR v_price > 99999999.99 THEN
      RAISE EXCEPTION 'INVALID_UNIT_COST: %', p_unit_cost USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT current_stock, cost_per_unit INTO v_before, v_cost_before
    FROM public.ingredients WHERE id = p_ingredient_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  -- B142: une seule regle pour toutes les sorties, celle de la vente et de la
  -- perte: le stock bouge EXACTEMENT de la quantite (-5 + 3 = -2; 8 - 9 = -1),
  -- et le mouvement porte la quantite reelle.
  v_after := v_before + p_delta;
  -- Cout moyen pondere (seulement avec un prix). Un stock negatif ne fausse
  -- pas la moyenne: il compte pour 0, et le cout devient le prix recu.
  v_base := GREATEST(v_before, 0);
  UPDATE public.ingredients
    SET current_stock = v_after,
        cost_per_unit = CASE
          WHEN v_price IS NULL THEN cost_per_unit
          WHEN v_base = 0 THEN round(v_price, 2)
          ELSE round((v_base * v_cost_before + p_delta * v_price) / (v_base + p_delta), 2)
        END,
        updated_at = now()
    WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;
  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, supplier_id, unit_cost)
  VALUES (p_tenant_id, p_ingredient_id, p_movement_type, v_after - v_before, p_notes, v_author, p_supplier_id, v_price);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END; $$;


ALTER FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid", "p_unit_cost" numeric) OWNER TO "postgres";

--
-- Name: anonymize_closed_tenants(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."anonymize_closed_tenants"("p_cutoff" timestamp with time zone) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(t.id) INTO v_ids
  FROM public.tenants t
  WHERE t.deleted_at IS NOT NULL
    AND t.deleted_at < p_cutoff
    AND t.anonymized_at IS NULL;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.admin_users au
  SET email = 'anonymise-' || au.id::text || '@anonymise.invalid',
      full_name = NULL,
      phone = NULL,
      ban_reason = NULL,
      is_active = false
  WHERE au.tenant_id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_users sa
      WHERE sa.user_id = au.user_id
        AND (sa.is_super_admin IS TRUE OR sa.role = 'super_admin')
    );

  -- Comptes clients a credit: le nom (NOT NULL) et la description identifient des
  -- convives. Le lien avec les commandes se fait par id: les soldes et le registre
  -- des paiements ne sont pas touches.
  UPDATE public.house_accounts
  SET name = 'Compte anonymise',
      description = NULL
  WHERE tenant_id = ANY (v_ids);

  -- Le verrou de plan du module Inventaire (`enforce_inventory_entitlement`)
  -- refuserait cette ecriture pour un restaurant ferme sans droit Inventaire,
  -- et ferait echouer TOUTE la purge. Drapeau local a la transaction, lu par
  -- le verrou, retire juste apres (audit B149).
  PERFORM pg_catalog.set_config('attabl.purge_legale', 'on', true);
  UPDATE public.suppliers
  SET contact_name = NULL,
      phone = NULL,
      email = NULL,
      address = NULL,
      notes = NULL
  WHERE tenant_id = ANY (v_ids);
  PERFORM pg_catalog.set_config('attabl.purge_legale', '', true);

  DELETE FROM public.invitations WHERE tenant_id = ANY (v_ids);
  DELETE FROM public.push_subscriptions WHERE tenant_id = ANY (v_ids);
  DELETE FROM public.user_sessions WHERE tenant_id = ANY (v_ids);

  -- Entrees non financieres: tout le contenu part (la ligne reste, sans charge).
  UPDATE public.audit_log
  SET user_email = NULL,
      user_id = NULL,
      old_data = NULL,
      new_data = NULL,
      metadata = NULL
  WHERE tenant_id = ANY (v_ids)
    AND entity_type NOT IN ('order', 'coupon', 'item');

  -- Entrees financieres: les montants restent, les cles personnelles partent.
  UPDATE public.audit_log
  SET user_email = NULL,
      user_id = NULL,
      old_data = old_data - public.audit_personal_keys(),
      new_data = new_data - public.audit_personal_keys(),
      metadata = metadata - public.audit_personal_keys()
  WHERE tenant_id = ANY (v_ids)
    AND entity_type IN ('order', 'coupon', 'item');

  -- Annotations des managers sur les commandes (texte libre, ajout seul): le texte
  -- est remplace, la ligne (qui, quand) est gardee.
  UPDATE public.order_notes
  SET note = 'Note effacee'
  WHERE tenant_id = ANY (v_ids)
    AND note <> 'Note effacee';

  UPDATE public.platform_audit_log
  SET actor_email = NULL,
      target_label = NULL,
      reason = NULL,
      metadata = NULL
  WHERE tenant_id = ANY (v_ids);

  UPDATE public.tenants
  SET phone = NULL,
      address = NULL,
      anonymized_at = now()
  WHERE id = ANY (v_ids);

  RETURN array_length(v_ids, 1);
END;
$$;


ALTER FUNCTION "public"."anonymize_closed_tenants"("p_cutoff" timestamp with time zone) OWNER TO "postgres";

--
-- Name: apply_flutterwave_payment("uuid", bigint, bigint, bigint, boolean, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."apply_flutterwave_payment"("p_payment_id" "uuid", "p_flw_transaction_id" bigint, "p_paid_amount" bigint, "p_current_price" bigint, "p_stripe_live" boolean, "p_now" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_pay public.flutterwave_payments%ROWTYPE;
  v_t public.tenants%ROWTYPE;
  v_base timestamptz;
  v_end timestamptz;
  v_anchor integer;
  v_ts timestamp;
  v_first timestamp;
  v_last integer;
  v_unfreezable text[] := ARRAY[
    'trial_expired', 'past_due_overdue', 'stripe_unpaid',
    'subscription_deleted', 'refund', 'flutterwave_unpaid'
  ];
BEGIN
  SELECT * INTO v_pay FROM public.flutterwave_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_payment');
  END IF;
  IF v_pay.status <> 'pending' THEN
    -- Meme transaction rejouee: doublon ordinaire. Une AUTRE transaction sur une
    -- tentative deja reglee: argent pris, rien a appliquer, remboursement a faire.
    IF v_pay.flw_transaction_id = p_flw_transaction_id THEN
      RETURN jsonb_build_object('outcome', 'duplicate');
    END IF;
    RETURN jsonb_build_object('outcome', 'already_settled_by_other_transaction');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.flutterwave_payments
     WHERE flw_transaction_id = p_flw_transaction_id AND id <> p_payment_id
  ) THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;

  SELECT * INTO v_t FROM public.tenants WHERE id = v_pay.tenant_id FOR UPDATE;
  IF NOT FOUND OR v_t.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'tenant_not_found');
  END IF;

  -- Un abonnement Stripe vivant: on n'encaisse pas deux fois la meme periode.
  IF p_stripe_live OR (
    v_t.stripe_subscription_id IS NOT NULL
    AND v_t.subscription_status IN ('trial', 'active', 'past_due')
  ) THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_conflict', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_conflict');
  END IF;

  -- Autre plan alors que plus d'un jour reste a courir: refuse (changement a l'echeance).
  IF v_t.subscription_status = 'active'
     AND v_t.subscription_plan <> v_pay.plan
     AND v_t.subscription_current_period_end > p_now + interval '1 day' THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_plan_change', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_plan_change');
  END IF;

  -- Tentative expiree: un paiement tardif doit couvrir le prix actuel.
  IF v_pay.created_at < p_now - interval '7 days' AND p_paid_amount < p_current_price THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_expired', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_expired');
  END IF;

  -- Suspendu par le super-admin, ou gele pour une cause qu'un paiement ne leve
  -- pas (litige, cause inconnue): on n'encaisse pas pour un acces qui restera
  -- ferme. L'argent est pris: drapeau de remboursement, rien n'est applique.
  IF v_t.suspended_at IS NOT NULL OR (
    v_t.subscription_status = 'frozen'
    AND NOT (coalesce(v_t.freeze_reason, '') = ANY (v_unfreezable))
  ) THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_blocked', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_blocked');
  END IF;

  -- Debut de periode: essai en cours = ses jours restants sont conserves; meme
  -- plan = fin de periode en cours (aucun jour perdu); autre plan (admis
  -- seulement a moins d'un jour de l'echeance, ou sans periode payee) = maintenant.
  v_base := p_now;
  IF v_t.subscription_status = 'trial' AND v_t.trial_ends_at IS NOT NULL THEN
    v_base := greatest(v_base, v_t.trial_ends_at);
  ELSIF v_t.subscription_plan = v_pay.plan AND v_t.subscription_current_period_end IS NOT NULL THEN
    v_base := greatest(v_base, v_t.subscription_current_period_end);
  END IF;

  -- Fin de periode ANCREE sur le jour du premier mois: la periode qui suit une
  -- periode contigue garde son jour d'ancrage (31 jan -> 28 fev -> 31 mars).
  v_anchor := coalesce(
    (SELECT p.anchor_day FROM public.flutterwave_payments p
      WHERE p.tenant_id = v_t.id AND p.status = 'successful' AND p.period_end = v_base
      ORDER BY p.created_at DESC LIMIT 1),
    extract(day FROM (v_base AT TIME ZONE 'UTC'))::int
  );
  v_ts := v_base AT TIME ZONE 'UTC';
  v_first := date_trunc('month', v_ts)
    + CASE v_pay.billing_interval WHEN 'yearly' THEN interval '12 months' ELSE interval '1 month' END;
  v_last := extract(day FROM (v_first + interval '1 month' - interval '1 day'))::int;
  v_end := ((v_first::date + (least(v_anchor, v_last) - 1)) + v_ts::time) AT TIME ZONE 'UTC';

  UPDATE public.tenants SET
    subscription_plan = v_pay.plan,
    billing_interval = v_pay.billing_interval,
    subscription_current_period_start = v_base,
    subscription_current_period_end = v_end,
    -- L'identifiant Stripe restant ici est celui d'un abonnement MORT (verifie).
    stripe_subscription_id = NULL,
    subscription_status = 'active',
    is_active = true,
    past_due_since = NULL,
    freeze_reason = NULL
  WHERE id = v_t.id;

  UPDATE public.flutterwave_payments
     SET status = 'successful', flw_transaction_id = p_flw_transaction_id,
         period_start = v_base, period_end = v_end, anchor_day = v_anchor
   WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'outcome', 'applied',
    'period_start', v_base,
    'period_end', v_end,
    'unfrozen', v_t.subscription_status = 'frozen'
  );
END;
$$;


ALTER FUNCTION "public"."apply_flutterwave_payment"("p_payment_id" "uuid", "p_flw_transaction_id" bigint, "p_paid_amount" bigint, "p_current_price" bigint, "p_stripe_live" boolean, "p_now" timestamp with time zone) OWNER TO "postgres";

--
-- Name: assert_inventory_edit("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_inventory_edit"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF public.is_super_admin() THEN
    RETURN;
  END IF;
  IF public.has_tenant_write_permission(p_tenant_id, 'inventory.edit') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: inventory.edit required on tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$$;


ALTER FUNCTION "public"."assert_inventory_edit"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_inventory_view("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_inventory_view"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF public.is_super_admin() THEN
    RETURN;
  END IF;
  IF public.has_tenant_write_permission(p_tenant_id, 'inventory.view') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: inventory.view required on tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$$;


ALTER FUNCTION "public"."assert_inventory_view"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_tenant_business_reports("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_tenant_business_reports"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_reports_view(p_tenant_id);
  IF public.tenant_effective_plan(p_tenant_id) NOT IN ('business', 'enterprise') THEN
    RAISE EXCEPTION 'Advanced reports require the Business plan or higher'
      USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "public"."assert_tenant_business_reports"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_tenant_member("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- service_role (order / signup / cron / admin flows) bypasses tenant checks
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  -- super admins may act across any tenant
  IF public.is_super_admin() THEN
    RETURN;
  END IF;
  -- the authenticated caller must belong to the tenant
  IF p_tenant_id = ANY (public.get_my_tenant_ids_array()) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: caller is not a member of tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$$;


ALTER FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_tenant_reports("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_tenant_reports"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Appartenance D'ABORD: un non-membre ne doit rien apprendre du plan d'un
  -- autre restaurant (service_role et super admin passent, comme partout).
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF public.tenant_effective_plan(p_tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Reports require the Pro plan or higher'
      USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "public"."assert_tenant_reports"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_tenant_reports_ventes("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_tenant_reports_ventes"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_reports_view(p_tenant_id);
  PERFORM public.assert_tenant_reports(p_tenant_id);
END;
$$;


ALTER FUNCTION "public"."assert_tenant_reports_ventes"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_tenant_reports_view("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_tenant_reports_view"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN;
  END IF;
  -- Meme resolution que l'application (has_tenant_write_permission). Au lot 1
  -- tous les rapports exigent `reports.money` ; le lot 2 separe carte et argent.
  IF NOT public.has_tenant_write_permission(p_tenant_id, 'reports.money') THEN
    RAISE EXCEPTION 'Reports require the reports.money permission'
      USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "public"."assert_tenant_reports_view"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_valid_timezone("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_valid_timezone"("p_timezone" "text") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_timezone IS NULL THEN
    RAISE EXCEPTION 'Unknown time zone: %', p_timezone USING ERRCODE = '22023';
  END IF;
  PERFORM now() AT TIME ZONE p_timezone;
EXCEPTION
  WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Unknown time zone: %', p_timezone USING ERRCODE = '22023';
END;
$$;


ALTER FUNCTION "public"."assert_valid_timezone"("p_timezone" "text") OWNER TO "postgres";

--
-- Name: audit_log_auteur_session(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."audit_log_auteur_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_email text;
  v_role text;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT au.email, array_to_string(au.postes, '+') INTO v_email, v_role
      FROM public.admin_users au
     WHERE au.user_id = (SELECT auth.uid())
       AND au.tenant_id = NEW.tenant_id
       AND coalesce(au.is_active, true)
       AND au.deleted_at IS NULL
     ORDER BY au.created_at
     LIMIT 1;
    NEW.user_id := (SELECT auth.uid());
    NEW.user_email := coalesce(nullif((SELECT auth.jwt()) ->> 'email', ''), v_email);
    NEW.user_role := v_role;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_log_auteur_session"() OWNER TO "postgres";

--
-- Name: audit_personal_keys(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."audit_personal_keys"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT ARRAY[
    'customer_name', 'customer_phone', 'delivery_address', 'notes',
    'customer_notes', 'email', 'user_email', 'phone', 'full_name',
    'contact_name', 'address', 'emailChangeRequestedTo', 'reason'
  ];
$$;


ALTER FUNCTION "public"."audit_personal_keys"() OWNER TO "postgres";

--
-- Name: auto_create_user_preferences(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."auto_create_user_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_user_preferences"() OWNER TO "postgres";

--
-- Name: borner_zones_depart(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."borner_zones_depart"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT tenant_id FROM nouvelles_zones) n
    WHERE public.tenant_effective_plan(n.tenant_id) NOT IN ('pro', 'business', 'enterprise')
      AND (SELECT count(*) FROM zones z WHERE z.tenant_id = n.tenant_id) > 20
  ) THEN
    RAISE EXCEPTION 'Initial zones exceed the onboarding limit (20)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."borner_zones_depart"() OWNER TO "postgres";

--
-- Name: broadcast_order_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."broadcast_order_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Best-effort: never block an order status update on a broadcast failure.
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'status', NEW.status),
      'status',
      'order:' || NEW.id::text,
      false
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."broadcast_order_status"() OWNER TO "postgres";

--
-- Name: cancel_stock_count("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;
  UPDATE public.stock_counts SET status = 'cancelled', updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;
END;
$$;


ALTER FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") OWNER TO "postgres";

--
-- Name: claim_activation_event("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE tenants
  SET activation_events =
    coalesce(activation_events, '{}'::JSONB) || jsonb_build_object(p_event_key, to_jsonb(NOW()))
  WHERE id = p_tenant_id
    AND (activation_events->>p_event_key) IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;


ALTER FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") OWNER TO "postgres";

--
-- Name: claim_coupon_usage("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rows INT;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM coupons c
      WHERE c.id = p_coupon_id
        AND c.tenant_id = ANY (public.get_my_tenant_ids_array())
        AND public.has_tenant_write_permission(c.tenant_id, 'orders.pay')
    )
  ) THEN
    RAISE EXCEPTION 'access denied: coupon does not belong to caller tenant'
      USING ERRCODE = '42501';
  END IF;

  UPDATE coupons
  SET current_uses = current_uses + 1, updated_at = NOW()
  WHERE id = p_coupon_id
    AND is_active = true
    AND (max_uses IS NULL OR current_uses < max_uses)
    AND (valid_until IS NULL OR valid_until > NOW());

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;


ALTER FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") OWNER TO "postgres";

--
-- Name: close_table_session_if_settled("uuid", "uuid", timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."close_table_session_if_settled"("p_session_id" "uuid", "p_tenant_id" "uuid", "p_stale_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_require_served" boolean DEFAULT true) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_table_number text;
  v_stale_before timestamptz;
begin
  -- Membre du restaurant, super admin ou service_role; refus sinon.
  perform public.assert_tenant_member(p_tenant_id);

  if coalesce(auth.role(), '') <> 'service_role' then
    if not p_require_served then
      raise exception 'access denied: manual table release is server-side only'
        using errcode = '42501';
    end if;
    -- Meme droit que la policy UPDATE de table_sessions: un employe connecte
    -- ne ferme une table que s'il peut encaisser. Les gestes de cuisine et de
    -- salle passent par le serveur applicatif (service_role).
    if not public.has_tenant_write_permission(p_tenant_id, 'orders.pay') then
      raise exception 'access denied: closing a table requires orders.pay'
        using errcode = '42501';
    end if;
  end if;

  -- Le delai "commande payee jamais servie" ne se negocie pas: seul le serveur
  -- applicatif (service_role) le fournit. Un employe connecte qui passerait sa
  -- propre limite (ex: now()) liberait une table payee encore en cuisine.
  v_stale_before := case
    when coalesce(auth.role(), '') = 'service_role' then p_stale_before
    -- Meme valeur que STALE_PAID_ORDER_MS (src/services/order/order-lifecycle.ts).
    else now() - interval '2 hours'
  end;

  select table_number into v_table_number
  from public.table_sessions
  where id = p_session_id and tenant_id = p_tenant_id and status = 'open';
  if v_table_number is null then
    return 'not_open';
  end if;

  -- MEME cle que create_order_with_items: les deux s'excluent mutuellement.
  perform pg_advisory_xact_lock(
    hashtext('table_session:' || p_tenant_id::text || ':' || v_table_number)
  );

  if exists (
    select 1
    from public.orders o
    where o.tenant_id = p_tenant_id
      and o.session_id = p_session_id
      and o.status <> 'cancelled'
      and (
        coalesce(o.payment_status, 'pending') in ('pending', 'partial')
        or (
          p_require_served
          and o.status not in ('delivered', 'served')
          and (v_stale_before is null or o.created_at > v_stale_before)
        )
      )
  ) then
    return 'unsettled';
  end if;

  update public.table_sessions
  set status = 'closed', closed_at = now()
  where id = p_session_id and tenant_id = p_tenant_id and status = 'open';

  return case when found then 'closed' else 'not_open' end;
end;
$$;


ALTER FUNCTION "public"."close_table_session_if_settled"("p_session_id" "uuid", "p_tenant_id" "uuid", "p_stale_before" timestamp with time zone, "p_require_served" boolean) OWNER TO "postgres";

--
-- Name: closed_tenant_auth_users(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."closed_tenant_auth_users"("p_cutoff" timestamp with time zone) RETURNS TABLE("auth_user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT DISTINCT au.user_id
  FROM public.admin_users au
  JOIN public.tenants t ON t.id = au.tenant_id
  WHERE t.deleted_at IS NOT NULL
    AND t.deleted_at < p_cutoff
    AND t.anonymized_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_users sa
      WHERE sa.user_id = au.user_id
        AND (sa.is_super_admin IS TRUE OR sa.role = 'super_admin')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_users other
      JOIN public.tenants ot ON ot.id = other.tenant_id
      WHERE other.user_id = au.user_id
        AND ot.anonymized_at IS NULL
        AND NOT (ot.deleted_at IS NOT NULL AND ot.deleted_at < p_cutoff)
    );
$$;


ALTER FUNCTION "public"."closed_tenant_auth_users"("p_cutoff" timestamp with time zone) OWNER TO "postgres";

--
-- Name: commit_stock_count("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_line RECORD;
  v_before NUMERIC(10,3);
  v_after NUMERIC(10,3);
  v_delta NUMERIC(10,3);
  v_n INT := 0;
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_committed_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);

  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'COUNT_ALREADY_CLOSED' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT scl.ingredient_id, scl.counted_qty, scl.theoretical_qty
    FROM public.stock_count_lines scl
    WHERE scl.count_id = p_count_id AND scl.tenant_id = p_tenant_id
      AND scl.counted_qty IS NOT NULL
  LOOP
    SELECT current_stock INTO v_before FROM public.ingredients
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id
      FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Constat 6: l'ecart est celui de l'ecran (compte - theorique fige a
    -- l'ouverture), applique au stock COURANT: les ventes, receptions et
    -- pertes enregistrees pendant le comptage sont conservees.
    v_delta := v_line.counted_qty - v_line.theoretical_qty;
    IF v_delta = 0 THEN CONTINUE; END IF;
    v_after := v_before + v_delta;

    UPDATE public.ingredients SET current_stock = v_after, updated_at = now()
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id;

    INSERT INTO public.stock_movements
      (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES
      (p_tenant_id, v_line.ingredient_id, 'physical_count', v_after - v_before, p_count_id,
       'Inventaire physique', v_author);

    v_n := v_n + 1;
  END LOOP;

  -- Meme raison que dans destock_order: les verrous `menu_items` sont pris une
  -- fois toutes les lignes `ingredients` verrouillees, jamais entre deux.
  FOR v_line IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS delta
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_count_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'physical_count'
    GROUP BY sm.ingredient_id
  LOOP
    SELECT current_stock INTO v_before
    FROM public.ingredients
    WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id;
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_line.ingredient_id, v_before - v_line.delta, v_before
    );
  END LOOP;

  UPDATE public.stock_counts
    SET status = 'committed', committed_at = now(), committed_by = v_author, updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;

  RETURN v_n;
END;
$$;


ALTER FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") OWNER TO "postgres";

--
-- Name: create_order_with_items("uuid", "text", bigint, "text", "text", "text", "text", "text", "text", "text", bigint, bigint, bigint, bigint, bigint, "uuid", "uuid", "text", "text", "jsonb", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text" DEFAULT NULL::"text", "p_customer_name" "text" DEFAULT NULL::"text", "p_customer_phone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_service_type" "text" DEFAULT 'dine_in'::"text", "p_room_number" "text" DEFAULT NULL::"text", "p_delivery_address" "text" DEFAULT NULL::"text", "p_subtotal" bigint DEFAULT NULL::bigint, "p_tax_amount" bigint DEFAULT 0, "p_service_charge_amount" bigint DEFAULT 0, "p_discount_amount" bigint DEFAULT 0, "p_tip_amount" bigint DEFAULT 0, "p_coupon_id" "uuid" DEFAULT NULL::"uuid", "p_server_id" "uuid" DEFAULT NULL::"uuid", "p_display_currency" "text" DEFAULT NULL::"text", "p_preparation_zone" "text" DEFAULT 'kitchen'::"text", "p_items" "jsonb" DEFAULT '[]'::"jsonb", "p_client_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total bigint;
  v_item jsonb;
  v_session_id uuid;
  v_table_id uuid;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id, order_number, total
      INTO v_order_id, v_order_number, v_total
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', v_order_number, 'total', v_total, 'deduplicated', true);
    END IF;
  END IF;

  IF p_table_number IS NOT NULL THEN
    SELECT t.id INTO v_table_id
      FROM tables t
      JOIN zones z ON z.id = t.zone_id
      JOIN venues v ON v.id = z.venue_id
      WHERE v.tenant_id = p_tenant_id
        AND (t.table_number = p_table_number OR t.display_name = p_table_number)
      -- B122: le NUMERO d'abord (unique par restaurant), le nom affiche
      -- seulement a defaut, dans un ordre fixe.
      ORDER BY (t.table_number = p_table_number) DESC, t.table_number, t.id
      LIMIT 1;
  END IF;

  IF p_table_number IS NOT NULL AND COALESCE(p_service_type, 'dine_in') = 'dine_in' THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_table_number));
    SELECT id INTO v_session_id
      FROM table_sessions
      WHERE tenant_id = p_tenant_id AND table_number = p_table_number AND status = 'open'
      LIMIT 1;
    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (tenant_id, table_number) VALUES (p_tenant_id, p_table_number)
      RETURNING id INTO v_session_id;
    END IF;
  END IF;

  INSERT INTO orders (
    tenant_id, order_number, status, total, table_number, table_id,
    customer_name, customer_phone, notes,
    service_type, room_number, delivery_address,
    subtotal, tax_amount, service_charge_amount,
    discount_amount, tip_amount, payment_status,
    coupon_id, server_id, display_currency, preparation_zone,
    client_request_id, session_id
  ) VALUES (
    p_tenant_id, p_order_number, 'pending', p_total, p_table_number, v_table_id,
    p_customer_name, p_customer_phone, p_notes,
    p_service_type, p_room_number, p_delivery_address,
    COALESCE(p_subtotal, p_total), p_tax_amount, p_service_charge_amount,
    p_discount_amount, p_tip_amount, 'pending',
    p_coupon_id, p_server_id, p_display_currency, p_preparation_zone,
    p_client_request_id, v_session_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, menu_item_id, item_name, item_name_en,
      quantity, price_at_order, customer_notes,
      modifiers, course, item_status, preparation_zone,
      selected_option, selected_variant
    ) VALUES (
      v_order_id,
      (v_item->>'menu_item_id')::uuid,
      v_item->>'item_name',
      v_item->>'item_name_en',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'price_at_order')::bigint, 0),
      v_item->>'customer_notes',
      COALESCE(v_item->'modifiers', '[]'::jsonb),
      v_item->>'course',
      'pending',
      COALESCE(v_item->>'preparation_zone', 'kitchen'),
      v_item->'selected_option',
      v_item->'selected_variant'
    );
  END LOOP;

  RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', p_order_number, 'total', p_total);

EXCEPTION
  WHEN unique_violation THEN
    IF p_client_request_id IS NULL THEN RAISE; END IF;
    SELECT id, order_number, total
      INTO v_order_id, v_order_number, v_total
      FROM orders
      WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
    IF NOT FOUND THEN RAISE; END IF;
    RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', v_order_number, 'total', v_total, 'deduplicated', true);
END;
$$;


ALTER FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid") OWNER TO "postgres";

--
-- Name: decide_owner_trial("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."decide_owner_trial"("p_user_id" "uuid") RETURNS TABLE("mode" "text", "trial_ends" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key text;
  v_confirmed boolean;
  v_running timestamptz;
  v_seen boolean;
  v_l_end timestamptz;
  v_l_confirmed timestamptz;
  v_new_end timestamptz := now() + interval '14 days';
BEGIN
  SELECT lower(btrim(u.email)), u.email_confirmed_at IS NOT NULL
    INTO v_key, v_confirmed
    FROM auth.users u
   WHERE u.id = p_user_id;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'owner_without_email' USING ERRCODE = '22023';
  END IF;

  -- Serialise les creations simultanees du meme proprietaire.
  PERFORM pg_advisory_xact_lock(hashtext('owner_trial:' || v_key));

  SELECT l.trial_ends_at, l.confirmed_at
    INTO v_l_end, v_l_confirmed
    FROM owner_trial_ledger l
   WHERE l.email_key = v_key;

  -- Une confirmation survenue depuis la derniere decision est enregistree.
  IF v_confirmed THEN
    UPDATE owner_trial_ledger
       SET confirmed_at = now()
     WHERE email_key = v_key AND first_user_id = p_user_id AND confirmed_at IS NULL;
    IF FOUND THEN v_l_confirmed := now(); END IF;
  END IF;

  SELECT max(t.trial_ends_at)
    INTO v_running
    FROM tenants t
    JOIN restaurant_groups g ON g.id = t.group_id
   WHERE g.owner_user_id = p_user_id
     AND t.subscription_status = 'trial'
     AND t.trial_ends_at > now();

  IF v_running IS NOT NULL THEN
    RETURN QUERY SELECT 'shared'::text, v_running;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM tenants t
      JOIN restaurant_groups g ON g.id = t.group_id
     WHERE g.owner_user_id = p_user_id
  ) INTO v_seen;

  IF v_seen THEN
    RETURN QUERY SELECT 'none'::text, coalesce(v_l_end, now());
    RETURN;
  END IF;

  -- Aucun etablissement. Une ligne confirmee d'un compte precedent fait foi.
  IF v_l_end IS NOT NULL AND v_l_confirmed IS NOT NULL THEN
    IF v_l_end > now() THEN
      RETURN QUERY SELECT 'shared'::text, v_l_end;
    ELSE
      RETURN QUERY SELECT 'none'::text, v_l_end;
    END IF;
    RETURN;
  END IF;

  -- Pas de ligne, ou ligne jamais confirmee (squatteur): le vrai proprietaire la reprend.
  INSERT INTO owner_trial_ledger (email_key, first_user_id, first_trial_at, trial_ends_at, confirmed_at)
  VALUES (v_key, p_user_id, now(), v_new_end, CASE WHEN v_confirmed THEN now() END)
  ON CONFLICT (email_key) DO UPDATE
    SET first_user_id = EXCLUDED.first_user_id,
        first_trial_at = EXCLUDED.first_trial_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        confirmed_at = EXCLUDED.confirmed_at;
  RETURN QUERY SELECT 'started'::text, v_new_end;
END;
$$;


ALTER FUNCTION "public"."decide_owner_trial"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: delete_admin_user_atomic("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id UUID;
  v_group_id UUID;
  tenant_members_total INT;
  user_memberships_remaining INT;
  group_tenants_remaining INT;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM admin_users
  WHERE id = p_admin_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM 1 FROM tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = p_admin_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT group_id INTO v_group_id FROM tenants WHERE id = v_tenant_id;

  SELECT COUNT(*) INTO tenant_members_total
  FROM admin_users
  WHERE tenant_id = v_tenant_id;

  IF tenant_members_total <= 1 THEN
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = v_tenant_id);

    DELETE FROM tenants WHERE id = v_tenant_id;

    IF v_group_id IS NOT NULL THEN
      SELECT COUNT(*) INTO group_tenants_remaining
      FROM tenants
      WHERE group_id = v_group_id;

      IF group_tenants_remaining = 0 THEN
        DELETE FROM restaurant_groups WHERE id = v_group_id;
      END IF;
    END IF;
  ELSE
    UPDATE admin_users SET created_by = NULL
      WHERE created_by = p_admin_user_id AND tenant_id = v_tenant_id;
    UPDATE invitations SET invited_by = (
      SELECT id FROM admin_users
      WHERE tenant_id = v_tenant_id AND id <> p_admin_user_id
      ORDER BY is_active DESC, (role = 'owner') DESC, created_at ASC
      LIMIT 1
    )
    WHERE invited_by = p_admin_user_id AND tenant_id = v_tenant_id;
    DELETE FROM admin_users WHERE id = p_admin_user_id;
  END IF;

  SELECT COUNT(*) INTO user_memberships_remaining
  FROM admin_users
  WHERE user_id = p_user_id;

  IF user_memberships_remaining = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM restaurant_groups g
      JOIN tenants t ON t.group_id = g.id
      WHERE g.owner_user_id = p_user_id
    ) THEN
      RETURN FALSE;
    END IF;

    BEGIN
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN TRUE;
    EXCEPTION WHEN foreign_key_violation THEN
      RETURN FALSE;
    END;
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: delete_my_account(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."delete_my_account"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_blocking_tenant text;
  m record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'not_authenticated';
  END IF;

  -- Platform operators are never deleted from a tenant app.
  IF EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_uid AND (is_super_admin IS TRUE OR role = 'super_admin')) THEN
    RETURN 'platform_account';
  END IF;

  -- Owner of a restaurant group: the group would cascade-delete.
  IF EXISTS (SELECT 1 FROM restaurant_groups WHERE owner_user_id = v_uid) THEN
    RETURN 'group_owner';
  END IF;

  -- Sole active owner of a live restaurant: deleting would orphan (or wipe) the restaurant.
  SELECT t.name INTO v_blocking_tenant
  FROM admin_users au
  JOIN tenants t ON t.id = au.tenant_id
  WHERE au.user_id = v_uid AND au.role = 'owner' AND t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM admin_users o
      WHERE o.tenant_id = au.tenant_id AND o.user_id <> v_uid AND o.role = 'owner'
        AND o.is_active IS TRUE AND o.deleted_at IS NULL
    )
  LIMIT 1;
  IF v_blocking_tenant IS NOT NULL THEN
    RETURN 'sole_owner:' || v_blocking_tenant;
  END IF;

  -- Leave every restaurant the way the web removes a member (delete_admin_user_atomic, else-branch).
  FOR m IN SELECT id, tenant_id FROM admin_users WHERE user_id = v_uid LOOP
    UPDATE admin_users SET created_by = NULL WHERE created_by = m.id AND tenant_id = m.tenant_id;
    UPDATE invitations SET invited_by = (
      SELECT id FROM admin_users
      WHERE tenant_id = m.tenant_id AND id <> m.id
      ORDER BY is_active DESC, (role = 'owner') DESC, created_at ASC
      LIMIT 1
    ) WHERE invited_by = m.id AND tenant_id = m.tenant_id;
    DELETE FROM admin_users WHERE id = m.id;
  END LOOP;

  -- References without ON DELETE: keep the restaurant's data, drop the link to the person.
  UPDATE menu_items SET image_uploaded_by = NULL WHERE image_uploaded_by = v_uid;
  UPDATE ai_credits_ledger SET user_id = NULL WHERE user_id = v_uid;
  DELETE FROM dish_photo_drafts WHERE created_by = v_uid;   -- the app removes their files first

  BEGIN
    DELETE FROM auth.users WHERE id = v_uid;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'account_deletion_blocked' USING ERRCODE = 'P0001';   -- rolls everything back
  END;
  RETURN 'deleted';
END;
$$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";

--
-- Name: destock_order("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INT := 0;
  v_item RECORD;
  v_recipe RECORD;
  v_new_stock NUMERIC(10,3);
  v_required NUMERIC(10,3);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('destock_order:' || p_order_id::text));

  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND movement_type = 'order_destock'
  ) THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT oi.menu_item_id, oi.quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_order_id
      AND o.tenant_id = p_tenant_id
  LOOP
    FOR v_recipe IN
      SELECT r.ingredient_id, r.quantity_needed
      FROM public.recipes r
      WHERE r.menu_item_id = v_item.menu_item_id
        AND r.tenant_id = p_tenant_id
    LOOP
      v_required := v_recipe.quantity_needed * v_item.quantity;

      -- C-048 (decision du proprietaire du 2026-11-12): on deduit ce qui est
      -- consomme, meme si le stock passe sous zero. Le stock reste juste (le
      -- registre explique chaque gramme) et le controle de stock bas, lance
      -- juste apres par schedule-destock, previent le restaurant.
      UPDATE public.ingredients
      SET current_stock = current_stock - v_required
      WHERE id = v_recipe.ingredient_id
        AND tenant_id = p_tenant_id
      RETURNING current_stock INTO v_new_stock;

      -- Ingredient disparu depuis la fiche technique: rien a deduire, et
      -- surtout pas de blocage du reste de la commande.
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, created_by)
      VALUES (
        p_tenant_id, v_recipe.ingredient_id, 'order_destock',
        -v_required, p_order_id, p_created_by
      );

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- La disponibilite est recalculee APRES la boucle, jamais dedans.
  -- ORDRE DE VERROUS: tous les chemins stock prennent d'abord les lignes
  -- `ingredients`, puis `menu_items`. Appeler sync dans la boucle gardait un
  -- verrou sur `menu_items` pendant qu'on allait verrouiller l'ingredient
  -- suivant, ce qui fermait un cycle avec une reception de marchandise
  -- (`adjust_ingredient_stock_tx`, qui verrouille l'ingredient puis les plats):
  -- deadlock 40P01, et ce declencheur tourne sur le chemin chaud de la prise de
  -- commande. En sortant d'ici, l'ordre est le meme partout.
  -- (Reste inchange et hors sujet ici: deux destockages concurrents peuvent
  -- encore se croiser sur deux ingredients, la boucle de recette n'ayant pas
  -- d'ordre garanti.)
  FOR v_recipe IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS delta
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
  LOOP
    SELECT current_stock INTO v_new_stock
    FROM public.ingredients
    WHERE id = v_recipe.ingredient_id AND tenant_id = p_tenant_id;
    -- delta est negatif: l'etat d'avant est `apres - delta`.
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_recipe.ingredient_id, v_new_stock - v_recipe.delta, v_new_stock
    );
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: encaisser_commande("uuid", "uuid", "text", bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."encaisser_commande"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_method" "text", "p_tip_ajout" bigint DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_ligne record;
  v_etat record;
BEGIN
  IF coalesce(p_tip_ajout, 0) < 0 THEN
    RAISE EXCEPTION 'Pourboire negatif' USING ERRCODE = '22023';
  END IF;

  IF current_user IN ('authenticated', 'anon')
     AND NOT public.has_tenant_write_permission(p_tenant_id, 'orders.pay')
  THEN
    RAISE EXCEPTION 'Encaissement non autorise' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders o
     SET payment_method = p_method,
         payment_status = 'paid',
         paid_at = now(),
         tip_amount = coalesce(o.tip_amount, 0) + coalesce(p_tip_ajout, 0)
   WHERE o.id = p_order_id
     AND o.tenant_id = p_tenant_id
     AND o.payment_status = 'pending'
     -- Une commande annulee garde payment_status = 'pending'.
     AND o.status <> 'cancelled'
  RETURNING o.session_id, o.total, o.tip_amount, o.display_currency INTO v_ligne;

  -- Rien de bascule: deja reglee (double appui, rejeu), partiellement payee,
  -- annulee, ou hors de portee. L'etat dit lequel (NULL = invisible).
  IF NOT FOUND THEN
    SELECT o.payment_status, o.status INTO v_etat
      FROM public.orders o
     WHERE o.id = p_order_id AND o.tenant_id = p_tenant_id;
    RETURN jsonb_build_object(
      'paid', false,
      'payment_status', v_etat.payment_status,
      'status', v_etat.status
    );
  END IF;

  -- Parentheses obligatoires: sans elles, PL/pgSQL coupe la condition du IF
  -- au premier THEN, celui du CASE.
  IF coalesce(v_ligne.tip_amount, 0) >
       (CASE WHEN v_ligne.display_currency IN ('EUR', 'USD') THEN 100000000 ELSE 1000000 END)
  THEN
    RAISE EXCEPTION 'Pourboire trop eleve' USING ERRCODE = '22023';
  END IF;

  -- Registre: total (pourboire exclu) + pourboire. Une erreur ici annule aussi
  -- la bascule ci-dessus.
  INSERT INTO public.payments (tenant_id, order_id, amount, method, status)
  VALUES (p_tenant_id, p_order_id,
          coalesce(v_ligne.total, 0) + coalesce(v_ligne.tip_amount, 0),
          p_method, 'completed');

  RETURN jsonb_build_object('paid', true, 'session_id', v_ligne.session_id);
END;
$$;


ALTER FUNCTION "public"."encaisser_commande"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_method" "text", "p_tip_ajout" bigint) OWNER TO "postgres";

--
-- Name: enforce_category_menu_tenant(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_category_menu_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.menu_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.menus m WHERE m.id = NEW.menu_id AND m.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'menu belongs to another restaurant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."enforce_category_menu_tenant"() OWNER TO "postgres";

--
-- Name: enforce_ingredient_update_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_ingredient_update_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT public.mon_restaurant_a_le_stock(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_ingredient_update_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_inventory_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_inventory_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Purge legale d'un restaurant ferme (drapeau pose par
  -- anonymize_closed_tenants, jamais par une session cliente).
  IF coalesce(current_setting('attabl.purge_legale', true), '') = 'on'
     AND EXISTS (
       SELECT 1 FROM public.tenants t
        WHERE t.id = NEW.tenant_id AND t.deleted_at IS NOT NULL
     ) THEN
    RETURN NEW;
  END IF;
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_inventory_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_item_child_menu_item_tenant(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_item_child_menu_item_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = NEW.menu_item_id AND mi.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'menu item belongs to another restaurant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."enforce_item_child_menu_item_tenant"() OWNER TO "postgres";

--
-- Name: enforce_item_suggestion_tenant(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_item_suggestion_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = NEW.menu_item_id AND mi.tenant_id = NEW.tenant_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = NEW.suggested_item_id AND mi.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'menu item belongs to another restaurant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."enforce_item_suggestion_tenant"() OWNER TO "postgres";

--
-- Name: enforce_kds_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_kds_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.item_status IS NOT DISTINCT FROM OLD.item_status
     AND NEW.held IS NOT DISTINCT FROM OLD.held THEN
    RETURN NEW;
  END IF;

  IF public.tenant_effective_plan(NEW.tenant_id) IN ('pro', 'business', 'enterprise') THEN
    RETURN NEW;
  END IF;

  -- Commande passee pendant l'essai: la cuisine la termine.
  IF EXISTS (
    SELECT 1
    FROM orders o
    JOIN tenants t ON t.id = o.tenant_id
    WHERE o.id = NEW.order_id
      AND t.trial_ends_at IS NOT NULL
      AND o.created_at < t.trial_ends_at
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Kitchen display requires the Pro plan or higher'
    USING ERRCODE = 'check_violation';
END;
$$;


ALTER FUNCTION "public"."enforce_kds_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_menu_item_category_tenant(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_menu_item_category_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'category belongs to another restaurant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."enforce_menu_item_category_tenant"() OWNER TO "postgres";

--
-- Name: enforce_min_one_active_venue(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_min_one_active_venue"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  -- B135 (2): un changement de restaurant touche DEUX plafonds. Verrous pris
  -- dans un ordre fixe (plus petit identifiant d'abord) pour que deux
  -- deplacements croises ne s'interbloquent pas; enforce_venue_plan_limit
  -- reprend ensuite le verrou du restaurant qui recoit (deja tenu).
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || LEAST(OLD.tenant_id, NEW.tenant_id)::text));
    PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || GREATEST(OLD.tenant_id, NEW.tenant_id)::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || NEW.tenant_id::text));
  END IF;

  -- Le restaurant qui PERD l'etablissement (desactive sur place, ou parti
  -- vers un autre restaurant) doit en garder un actif.
  IF NOT (OLD.is_active = true
          AND (NEW.is_active = false OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM venues
  WHERE tenant_id = OLD.tenant_id AND is_active = true;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Cannot deactivate the last active venue'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_min_one_active_venue"() OWNER TO "postgres";

--
-- Name: enforce_order_plan_features(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_order_plan_features"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan     text;
  v_currency text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.service_type IS NOT DISTINCT FROM OLD.service_type
     AND NEW.tip_amount IS NOT DISTINCT FROM OLD.tip_amount
     AND NEW.display_currency IS NOT DISTINCT FROM OLD.display_currency THEN
    RETURN NEW;
  END IF;

  v_plan := public.tenant_effective_plan(NEW.tenant_id);

  IF NEW.service_type IN ('delivery', 'room_service')
     AND (TG_OP = 'INSERT' OR NEW.service_type IS DISTINCT FROM OLD.service_type)
     AND v_plan NOT IN ('business', 'enterprise') THEN
    RAISE EXCEPTION 'Service type % requires the Business plan', NEW.service_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pourboire: refuse a la creation des qu'il est positif (quel que soit le
  -- role, c'est le plan qui juge), et a la modification seulement s'il
  -- AUGMENTE. Une baisse (correction, annulation d'un encaissement) passe,
  -- meme si le plan a change entre-temps.
  IF COALESCE(NEW.tip_amount, 0) > 0
     AND (TG_OP = 'INSERT' OR COALESCE(NEW.tip_amount, 0) > COALESCE(OLD.tip_amount, 0))
     AND v_plan NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Tips require the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.display_currency IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.display_currency IS DISTINCT FROM OLD.display_currency)
     AND v_plan NOT IN ('pro', 'business', 'enterprise') THEN
    SELECT currency INTO v_currency FROM tenants WHERE id = NEW.tenant_id;
    IF NEW.display_currency IS DISTINCT FROM COALESCE(v_currency, 'XAF') THEN
      RAISE EXCEPTION 'Multi-currency requires the Pro plan or higher'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_order_plan_features"() OWNER TO "postgres";

--
-- Name: enforce_qr_customization_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_qr_customization_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'QR customization requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_qr_customization_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_recipes_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_recipes_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Recipes require the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_recipes_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_service_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_service_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Terminer une assignation (ended_at pose) reste permis: c'est du menage.
  IF TG_OP = 'UPDATE'
     AND NEW.server_id IS NOT DISTINCT FROM OLD.server_id
     AND NEW.table_id IS NOT DISTINCT FROM OLD.table_id
     AND NOT (OLD.ended_at IS NOT NULL AND NEW.ended_at IS NULL) THEN
    RETURN NEW;
  END IF;

  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Server assignment requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_service_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_stock_movement_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_stock_movement_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.movement_type IN ('order_destock', 'order_restock') THEN
    RETURN NEW;
  END IF;
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_stock_movement_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_tables_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_tables_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Un verrou par restaurant: deux premieres creations simultanees ne passent
  -- pas toutes les deux (la seconde attend, puis voit le registre rempli).
  PERFORM pg_advisory_xact_lock(hashtext('tables_init:' || NEW.tenant_id::text));

  -- Premiere creation de tables du restaurant (onboarding): incluse partout,
  -- dans les bornes de l'onboarding (controlees apres l'instruction).
  IF NOT EXISTS (SELECT 1 FROM tenant_tables_initialisees WHERE tenant_id = NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Table management requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_tables_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_tenant_name_cross_group_unique(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_tenant_name_cross_group_unique"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- B124: un restaurant ferme ne concurrence personne; et sur UPDATE, on ne
  -- juge que ce qui peut creer un doublon (le nom, le passage en etabli, le
  -- changement de groupe, la reouverture). Un UPDATE sans rapport ne doit pas
  -- echouer sur un doublon ancien, anterieur a cette garde.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NOT (coalesce(NEW.onboarding_completed, false) AND NOT coalesce(OLD.onboarding_completed, false))
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NOT (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Deux comptes qui terminent en meme temps avec le meme nom: le second
  -- attend la fin du premier, puis le voit etabli.
  PERFORM pg_advisory_xact_lock(hashtext('tenant_name:' || lower(btrim(NEW.name))));

  IF EXISTS (
    SELECT 1
    FROM tenants t
    WHERE t.id <> NEW.id
      AND t.deleted_at IS NULL
      AND t.onboarding_completed = true
      AND t.group_id IS NOT NULL
      AND t.group_id <> NEW.group_id
      AND lower(btrim(t.name)) = lower(btrim(NEW.name))
  ) THEN
    RAISE EXCEPTION 'tenant_name_cross_group_conflict'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_tenant_name_cross_group_unique"() OWNER TO "postgres";

--
-- Name: enforce_venue_plan_limit(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_venue_plan_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_effective text;
  v_max       int;
  v_count     int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || NEW.tenant_id::text));

  -- B135 (2): un etablissement actif qui CHANGE de restaurant compte aussi
  -- pour le plafond du restaurant qui le recoit.
  IF NOT (NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active = false
          OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)) THEN
    RETURN NEW;
  END IF;

  v_effective := public.tenant_effective_plan(NEW.tenant_id);

  v_max := CASE v_effective
    WHEN 'starter'    THEN 1
    WHEN 'pro'        THEN 2
    WHEN 'business'   THEN 10
    WHEN 'enterprise' THEN NULL
    ELSE 1
  END;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM venues
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

    IF v_count > v_max THEN
      RAISE EXCEPTION 'Venue limit reached for plan %', v_effective
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_venue_plan_limit"() OWNER TO "postgres";

--
-- Name: exiger_registre_pour_paid(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."exiger_registre_pour_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_status text;
  v_total bigint;
  v_tip bigint;
  v_tenant uuid;
  v_du numeric;
  v_net numeric;
BEGIN
  -- Lu a la validation de la transaction, pas au moment de l'ecriture.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NULL;
  END IF;

  -- Etat COURANT de la commande, pas celui de l'ecriture mise en file: si la
  -- meme transaction l'a fait repasser a un autre statut, il n'y a plus rien a
  -- controler. Les montants ne bougent plus apres la creation
  -- (refuser_reecriture_montants_commande), sauf le pourboire a
  -- l'encaissement: on prend donc la valeur courante.
  SELECT o.payment_status, o.total, o.tip_amount, o.tenant_id
    INTO v_status, v_total, v_tip, v_tenant
    FROM public.orders o
   WHERE o.id = NEW.id;

  IF FOUND THEN
    IF v_status IS DISTINCT FROM 'paid' THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Ligne invisible (ou supprimee dans la meme transaction): on juge sur la
    -- valeur ecrite. Ferme par defaut.
    v_total := NEW.total;
    v_tip := NEW.tip_amount;
    v_tenant := NEW.tenant_id;
  END IF;

  v_du := coalesce(v_total, 0) + coalesce(v_tip, 0);

  -- Meme filtre que fetchTenders (payment.queries.ts): cette commande, ce
  -- restaurant. `payments.status` ne vaut que 'completed' ou 'refunded'
  -- (contrainte payments_status_check).
  SELECT coalesce(sum(CASE WHEN p.status = 'refunded' THEN -p.amount
                           WHEN p.status = 'completed' THEN p.amount
                           ELSE 0 END), 0)
    INTO v_net
    FROM public.payments p
   WHERE p.order_id = NEW.id
     AND p.tenant_id = v_tenant;

  -- Regle de deriveStatus (net > 0 et net >= du), sauf le du nul pour
  -- l'autorite sur l'argent (voir l'en-tete).
  IF v_net < greatest(v_du, 1)
     AND NOT (v_du <= 0 AND public.has_tenant_money_permission(v_tenant))
  THEN
    RAISE EXCEPTION
      'Une commande ne passe payee que si le registre des paiements couvre son du'
      USING ERRCODE = '42501',
            HINT = 'orders_paid_exige_registre';
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."exiger_registre_pour_paid"() OWNER TO "postgres";

--
-- Name: exiger_registre_rembourse_pour_annuler(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."exiger_registre_rembourse_pour_annuler"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_status text;
  v_payment_status text;
  v_total bigint;
  v_tip bigint;
  v_tenant uuid;
  v_du numeric;
  v_net numeric;
BEGIN
  -- Lu a la validation de la transaction, pas au moment de l'ecriture.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NULL;
  END IF;

  -- Etat COURANT: si la meme transaction a fait repartir la commande d'un
  -- autre statut, il n'y a plus d'annulation a juger.
  SELECT o.status, o.payment_status, o.total, o.tip_amount, o.tenant_id
    INTO v_status, v_payment_status, v_total, v_tip, v_tenant
    FROM public.orders o
   WHERE o.id = NEW.id;

  IF FOUND THEN
    IF v_status IS DISTINCT FROM 'cancelled' THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Ligne invisible ou supprimee dans la meme transaction: on juge sur la
    -- valeur ecrite. Ferme par defaut.
    v_payment_status := NEW.payment_status;
    v_total := NEW.total;
    v_tip := NEW.tip_amount;
    v_tenant := NEW.tenant_id;
  END IF;

  v_du := coalesce(v_total, 0) + coalesce(v_tip, 0);

  -- Meme calcul que exiger_registre_pour_paid (20261124100000).
  SELECT coalesce(sum(CASE WHEN p.status = 'refunded' THEN -p.amount
                           WHEN p.status = 'completed' THEN p.amount
                           ELSE 0 END), 0)
    INTO v_net
    FROM public.payments p
   WHERE p.order_id = NEW.id
     AND p.tenant_id = v_tenant;

  -- Regle 1: commande reglee. Il faut un remboursement, quel que soit le role.
  IF v_payment_status = 'paid' OR v_net >= greatest(v_du, 1) THEN
    RAISE EXCEPTION
      'Une commande payee ne s''annule pas: il faut d''abord la rembourser'
      USING ERRCODE = '42501',
            HINT = 'orders_annulation_exige_remboursement';
  END IF;

  -- Regle 2: de l'argent reste en caisse. Decision de l'autorite sur l'argent.
  IF v_net > 0 AND NOT public.has_tenant_money_permission(v_tenant) THEN
    RAISE EXCEPTION
      'Annuler une commande dont l''argent est encore en caisse exige l''autorite sur l''argent'
      USING ERRCODE = '42501',
            HINT = 'orders_annulation_exige_autorite_argent';
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."exiger_registre_rembourse_pour_annuler"() OWNER TO "postgres";

--
-- Name: expire_stale_payment_sessions(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE orders
  SET
    wave_checkout_id = NULL,
    orange_money_pay_token = NULL,
    orange_money_notif_token = NULL,
    payment_initiated_at = NULL,
    payment_method = NULL
  WHERE payment_status = 'pending'
    AND payment_initiated_at IS NOT NULL
    AND payment_initiated_at < now() - make_interval(mins => p_max_age_minutes)
    AND (
      wave_checkout_id IS NOT NULL
      OR orange_money_pay_token IS NOT NULL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) OWNER TO "postgres";

--
-- Name: flutterwave_freeze_overdue(timestamp with time zone, interval, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."flutterwave_freeze_overdue"("p_now" timestamp with time zone, "p_grace" interval, "p_limit" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  WITH due AS (
    SELECT t.id
      FROM public.tenants t
     WHERE t.subscription_status = 'active'
       AND t.deleted_at IS NULL
       AND t.stripe_subscription_id IS NULL
       AND t.subscription_current_period_end < p_now - p_grace
       AND EXISTS (
         SELECT 1 FROM public.flutterwave_payments p
          WHERE p.tenant_id = t.id
            AND p.status = 'successful'
            AND p.period_end = t.subscription_current_period_end
       )
     ORDER BY t.subscription_current_period_end
     LIMIT p_limit
       FOR UPDATE OF t SKIP LOCKED
  )
  UPDATE public.tenants t
     SET subscription_status = 'frozen', is_active = false, freeze_reason = 'flutterwave_unpaid'
    FROM due
   WHERE t.id = due.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."flutterwave_freeze_overdue"("p_now" timestamp with time zone, "p_grace" interval, "p_limit" integer) OWNER TO "postgres";

--
-- Name: flutterwave_renewals_due(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."flutterwave_renewals_due"("p_now" timestamp with time zone, "p_limit" integer) RETURNS TABLE("payment_id" "uuid", "tenant_id" "uuid", "plan" "text", "billing_interval" "text", "period_end" timestamp with time zone, "reminder" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT p.id, p.tenant_id, p.plan, p.billing_interval, p.period_end,
         CASE WHEN p.period_end <= p_now + interval '1 day' THEN 'd1' ELSE 'd7' END
    FROM public.flutterwave_payments p
    JOIN public.tenants t ON t.id = p.tenant_id
   WHERE p.status = 'successful'
     AND t.subscription_status = 'active'
     AND t.deleted_at IS NULL
     AND t.suspended_at IS NULL
     AND t.stripe_subscription_id IS NULL
     AND t.currency IN ('XOF', 'XAF')
     AND t.subscription_current_period_end = p.period_end
     AND p.period_end > p_now
     AND p.period_end <= p_now + interval '7 days'
     AND (
       (p.period_end <= p_now + interval '1 day' AND p.reminder_d1_at IS NULL)
       OR (p.period_end > p_now + interval '1 day' AND p.reminder_d7_at IS NULL)
     )
   ORDER BY p.period_end
   LIMIT p_limit;
$$;


ALTER FUNCTION "public"."flutterwave_renewals_due"("p_now" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";

--
-- Name: garder_ecriture_registre_paiements(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."garder_ecriture_registre_paiements"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order RECORD;
  v_net NUMERIC;
  v_delta NUMERIC;
  v_author UUID;
  v_authority BOOLEAN;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_tenant_write_permission(NEW.tenant_id, 'orders.pay') THEN
    RAISE EXCEPTION 'Enregistrer un paiement exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.method IS NULL OR NEW.method NOT IN
     ('cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money') THEN
    RAISE EXCEPTION 'Moyen de paiement inconnu'
      USING ERRCODE = '22023';
  END IF;

  SELECT au.id INTO v_author
  FROM public.admin_users au
  WHERE au.user_id = (SELECT auth.uid())
    AND au.tenant_id = NEW.tenant_id
    AND (au.is_active IS NULL OR au.is_active = true)
    AND au.deleted_at IS NULL
  LIMIT 1;
  NEW.created_by := v_author;
  NEW.created_at := now();

  SELECT o.total, o.tip_amount, o.status, o.payment_status
    INTO v_order
  FROM public.orders o
  WHERE o.id = NEW.order_id AND o.tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable pour ce restaurant'
      USING ERRCODE = '42501';
  END IF;

  v_authority := public.has_tenant_money_permission(NEW.tenant_id);

  IF NOT v_authority THEN
    IF NEW.status IS DISTINCT FROM 'completed' OR NEW.amount <= 0 THEN
      RAISE EXCEPTION 'Rembourser exige l''autorite sur l''argent'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Rejeu: la cle existe deja, l'index unique leve 23505 apres la garde.
  IF NEW.client_request_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.tenant_id = NEW.tenant_id AND p.client_request_id = NEW.client_request_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Valeur signee de la ligne, comme dans le registre: + encaisse, - rembourse.
  v_delta := CASE WHEN NEW.status = 'refunded' THEN -NEW.amount ELSE NEW.amount END;

  IF v_delta > 0 AND (v_order.status = 'cancelled' OR v_order.payment_status = 'comp') THEN
    RAISE EXCEPTION 'Impossible d''encaisser une commande annulee ou offerte'
      USING ERRCODE = '22023';
  END IF;

  -- Net lu APRES le verrou de la commande (FOR UPDATE ci-dessus).
  SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0)
    INTO v_net
  FROM public.payments p
  WHERE p.order_id = NEW.order_id AND p.tenant_id = NEW.tenant_id;

  IF v_delta < 0 AND -v_delta > v_net THEN
    RAISE EXCEPTION 'Remboursement superieur au montant encaisse'
      USING ERRCODE = '22023', HINT = 'payments_bound_refund';
  END IF;

  IF v_delta > 0
     AND v_delta > (COALESCE(v_order.total, 0) + COALESCE(v_order.tip_amount, 0) - v_net) THEN
    RAISE EXCEPTION 'Montant superieur au solde du'
      USING ERRCODE = '22023', HINT = 'payments_bound_balance';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."garder_ecriture_registre_paiements"() OWNER TO "postgres";

--
-- Name: garder_prix_carte(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."garder_prix_carte"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- SECURITY INVOKER voulu : current_user doit etre celui de l'appelant (en
  -- DEFINER il vaudrait toujours le proprietaire de la fonction et la garde ne
  -- se declencherait jamais). service_role, postgres, taches planifiees et
  -- fonctions SECURITY DEFINER : hors de cette garde.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Supprimer un supplement PAYANT puis le recreer gratuit (deux gestes que
    -- `menu.edit` permet) faisait passer son prix a 0 sans `menu.price`. La
    -- suppression d'un supplement payant exige donc `menu.price`. La cascade
    -- depuis la suppression d'un plat n'est pas concernee : PostgreSQL
    -- l'execute au nom du proprietaire de la table, pas de l'appelant.
    IF coalesce(OLD.price, 0) = 0 AND OLD.prices IS NULL THEN
      RETURN OLD;
    END IF;
    IF NOT public.has_tenant_write_permission(OLD.tenant_id, 'menu.price') THEN
      RAISE EXCEPTION 'changing a price requires the menu.price permission'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.price IS NOT DISTINCT FROM OLD.price
       AND NEW.prices IS NOT DISTINCT FROM OLD.prices THEN
      RETURN NEW;
    END IF;
  ELSIF coalesce(NEW.price, 0) = 0 AND NEW.prices IS NULL THEN
    -- INSERT sans prix (un modificateur gratuit) : `menu.edit` suffit.
    RETURN NEW;
  END IF;
  IF NOT public.has_tenant_write_permission(NEW.tenant_id, 'menu.price') THEN
    RAISE EXCEPTION 'changing a price requires the menu.price permission'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."garder_prix_carte"() OWNER TO "postgres";

--
-- Name: garder_statut_cuisine(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."garder_statut_cuisine"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_statut text;
BEGIN
  -- SECURITY INVOKER voulu : current_user doit etre celui de l'appelant (en
  -- DEFINER il vaudrait toujours le proprietaire de la fonction et la garde ne
  -- se declencherait jamais).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'orders' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    v_statut := NEW.status;
  ELSE
    IF NEW.item_status IS NOT DISTINCT FROM OLD.item_status THEN
      RETURN NEW;
    END IF;
    v_statut := NEW.item_status;
  END IF;
  IF v_statut IN ('preparing', 'ready')
     AND NOT public.has_tenant_write_permission(NEW.tenant_id, 'kitchen.track') THEN
    RAISE EXCEPTION 'setting a kitchen status requires the kitchen.track permission'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."garder_statut_cuisine"() OWNER TO "postgres";

--
-- Name: generate_menu_slug("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Transliterate accented chars and create slug
  base_slug := LOWER(TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(TRIM(p_name)),
        U&'\00E0\00E2\00E4\00E9\00E8\00EA\00EB\00EF\00EE\00F4\00F9\00FB\00FC\00FF\00E7\00F1 ',
        'aaaeeeeiiouuuycn-'
      ),
      '[^a-z0-9-]+', '-', 'g'
    )
  ));

  -- Remove consecutive dashes
  base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');

  -- Ensure non-empty
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'carte';
  END IF;

  final_slug := base_slug;

  -- Ensure uniqueness within tenant
  WHILE EXISTS (
    SELECT 1 FROM menus WHERE tenant_id = p_tenant_id AND slug = final_slug
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$;


ALTER FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") OWNER TO "postgres";

--
-- Name: get_category_breakdown("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("category" "text", "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN PERFORM public.assert_tenant_reports_ventes(p_tenant_id); RETURN QUERY SELECT * FROM public.get_category_breakdown_brut(p_tenant_id, p_start_date, p_end_date); END; $$;


ALTER FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_category_breakdown_brut("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_category_breakdown_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("category" "text", "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    c.name::TEXT AS category,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  JOIN categories c ON c.id = mi.category_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
    AND o.payment_status IN ('paid', 'partial')
  GROUP BY c.name
  ORDER BY revenue DESC;
END;
$$;


ALTER FUNCTION "public"."get_category_breakdown_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_co_ordered_items("uuid", "uuid"[], integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer DEFAULT 6) RETURNS TABLE("menu_item_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_limit integer;
  v_cart uuid[];
begin
  if not private.storefront_tenant_visible(p_tenant_id) then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 6), 1), 24);

  v_cart := array(select unnest(p_cart_ids));
  if coalesce(cardinality(v_cart), 0) > 100 then
    raise exception 'p_cart_ids trop long (max 100)' using errcode = '22023';
  end if;

  return query
  select oi2.menu_item_id
  from order_items oi1
  inner join order_items oi2 on oi1.order_id = oi2.order_id
  inner join orders o on oi1.order_id = o.id
  where oi1.menu_item_id = any(v_cart)
    and oi2.menu_item_id <> all(v_cart)
    and o.tenant_id = p_tenant_id
  group by oi2.menu_item_id
  order by count(*) desc, oi2.menu_item_id
  limit v_limit;
end;
$$;


ALTER FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) OWNER TO "postgres";

--
-- Name: get_daily_revenue("uuid", timestamp with time zone, timestamp with time zone, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text" DEFAULT 'UTC'::"text") RETURNS TABLE("day" "date", "revenue" numeric, "order_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN PERFORM public.assert_tenant_reports_ventes(p_tenant_id); RETURN QUERY SELECT * FROM public.get_daily_revenue_brut(p_tenant_id, p_start_date, p_end_date, p_timezone); END; $$;


ALTER FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") OWNER TO "postgres";

--
-- Name: get_daily_revenue_brut("uuid", timestamp with time zone, timestamp with time zone, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_daily_revenue_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text" DEFAULT 'UTC'::"text") RETURNS TABLE("day" "date", "revenue" numeric, "order_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  PERFORM public.assert_valid_timezone(p_timezone);
  RETURN QUERY
  SELECT (p.created_at AT TIME ZONE p_timezone)::date AS day,
    COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0)::NUMERIC AS revenue,
    COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed')::BIGINT AS order_count
  FROM payments p
  WHERE p.tenant_id = p_tenant_id AND p.created_at >= p_start_date AND p.created_at <= p_end_date
  GROUP BY 1 ORDER BY 1 ASC;
END;
$$;


ALTER FUNCTION "public"."get_daily_revenue_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") OWNER TO "postgres";

--
-- Name: get_dish_margins("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_dish_margins"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("item_id" "uuid", "item_name" "text", "quantity_sold" bigint, "revenue" bigint, "has_recipe" boolean, "cost_complete" boolean, "unit_cost" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH lignes AS (
    SELECT oi.id AS ligne,
           oi.order_id AS cmd,
           oi.menu_item_id AS plat,
           oi.item_name,
           oi.quantity,
           (oi.quantity * oi.price_at_order)::numeric AS brut,
           COALESCE(o.discount_amount, 0)::numeric AS remise,
           SUM(oi.quantity * oi.price_at_order) OVER (PARTITION BY oi.order_id)::numeric AS total_lignes
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = p_tenant_id
       AND o.created_at >= p_start_date
       AND o.created_at <= p_end_date
       AND o.status != 'cancelled'
       AND o.payment_status IN ('paid', 'partial')
  ),
  -- Part de remise de chaque ligne, en unites mineures entieres: part
  -- arrondie a l'inferieur, puis le reste de la commande va a sa ligne la plus
  -- grosse. La somme des parts d'une commande egale EXACTEMENT sa remise
  -- (1 000 sur 3 plats egaux: 334 + 333 + 333, jamais 999 ni 1 001).
  base AS (
    SELECT l.*,
           CASE WHEN l.total_lignes > 0
                THEN floor(l.remise * l.brut / l.total_lignes) ELSE 0 END AS part_base,
           row_number() OVER (PARTITION BY l.cmd ORDER BY l.brut DESC, l.ligne) AS rang
      FROM lignes l
  ),
  parts AS (
    SELECT b.*,
           b.part_base
             + CASE WHEN b.rang = 1 AND b.total_lignes > 0
                    THEN b.remise - SUM(b.part_base) OVER (PARTITION BY b.cmd)
                    ELSE 0 END AS part
      FROM base b
  ),
  ventes AS (
    SELECT p.plat,
           MAX(p.item_name)::text AS nom,
           SUM(p.quantity)::bigint AS qte,
           SUM(p.brut - p.part)::bigint AS ca
      FROM parts p
     GROUP BY p.plat
  ),
  fiches AS (
    SELECT r.menu_item_id AS plat,
           SUM(r.quantity_needed * i.cost_per_unit) AS cout,
           bool_and(i.cost_per_unit > 0) AS complet
      FROM recipes r
      JOIN ingredients i ON i.id = r.ingredient_id AND i.tenant_id = r.tenant_id
     WHERE r.tenant_id = p_tenant_id
     GROUP BY r.menu_item_id
  )
  SELECT v.plat, v.nom, v.qte, v.ca,
         (f.plat IS NOT NULL),
         COALESCE(f.complet, false),
         f.cout
    FROM ventes v
    LEFT JOIN fiches f ON f.plat = v.plat
   ORDER BY v.ca DESC, v.nom ASC;
END;
$$;


ALTER FUNCTION "public"."get_dish_margins"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_house_account_balances("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") RETURNS TABLE("account_id" "uuid", "name" "text", "status" "text", "open_orders" bigint, "outstanding" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT ha.id, ha.name, ha.status,
    COUNT(o.id) FILTER (
      WHERE coalesce(o.payment_status, 'pending') NOT IN ('paid','comp') AND o.status <> 'cancelled'
    )::bigint AS open_orders,
    COALESCE(SUM(
      CASE WHEN coalesce(o.payment_status, 'pending') NOT IN ('paid','comp') AND o.status <> 'cancelled'
        THEN (o.total + COALESCE(o.tip_amount,0))
             - COALESCE((SELECT SUM(CASE WHEN p.status='refunded' THEN -p.amount ELSE p.amount END)
                         FROM payments p WHERE p.order_id = o.id), 0)
        ELSE 0 END), 0)::bigint AS outstanding
  FROM house_accounts ha
  LEFT JOIN orders o ON o.house_account_id = ha.id AND o.tenant_id = ha.tenant_id
  WHERE ha.tenant_id = p_tenant_id
  GROUP BY ha.id, ha.name, ha.status, ha.created_at
  ORDER BY ha.created_at DESC;
END; $$;


ALTER FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: get_losses_by_reason("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("reason_code" "text", "nb_movements" bigint, "total_qty" numeric, "total_cost_value" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.reason_code,
    COUNT(*)::bigint,
    COALESCE(SUM(ABS(sm.quantity)), 0),
    COALESCE(SUM(ABS(sm.quantity) * i.cost_per_unit), 0)
  FROM public.stock_movements sm
  JOIN public.ingredients i
    ON i.id = sm.ingredient_id AND i.tenant_id = sm.tenant_id
  WHERE sm.tenant_id = p_tenant_id
    AND sm.movement_type = 'loss'
    AND (p_start IS NULL OR sm.created_at >= p_start)
    AND (p_end   IS NULL OR sm.created_at <= p_end)
  GROUP BY sm.reason_code
  ORDER BY 4 DESC;
END;
$$;


ALTER FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_my_inventory_tenant_ids(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_my_inventory_tenant_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(array_agg(DISTINCT au.tenant_id), '{}')
  FROM public.admin_users au
  WHERE au.user_id = (SELECT auth.uid())
    AND au.is_active IS TRUE
    AND au.deleted_at IS NULL
    AND (public.has_tenant_write_permission(au.tenant_id, 'inventory.view')
         OR public.has_tenant_write_permission(au.tenant_id, 'inventory.edit')
         OR public.has_tenant_write_permission(au.tenant_id, 'suppliers.manage'));
$$;


ALTER FUNCTION "public"."get_my_inventory_tenant_ids"() OWNER TO "postgres";

--
-- Name: get_my_tenant_ids(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_my_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tenant_id
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and deleted_at is null
    and public.mfa_satisfait()
$$;


ALTER FUNCTION "public"."get_my_tenant_ids"() OWNER TO "postgres";

--
-- Name: get_my_tenant_ids_array(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_my_tenant_ids_array"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(array_agg(tenant_id), '{}')
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and deleted_at is null
    and public.mfa_satisfait()
$$;


ALTER FUNCTION "public"."get_my_tenant_ids_array"() OWNER TO "postgres";

--
-- Name: get_order_summary("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("total_revenue" numeric, "total_orders" bigint, "avg_basket" numeric, "total_tax" numeric, "total_service_charge" numeric, "total_discounts" numeric, "total_tips" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN PERFORM public.assert_tenant_reports_ventes(p_tenant_id); RETURN QUERY SELECT * FROM public.get_order_summary_brut(p_tenant_id, p_start_date, p_end_date); END; $$;


ALTER FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_order_summary_brut("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_order_summary_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("total_revenue" numeric, "total_orders" bigint, "avg_basket" numeric, "total_tax" numeric, "total_service_charge" numeric, "total_discounts" numeric, "total_tips" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_revenue NUMERIC;
  v_orders BIGINT;
  v_tips NUMERIC;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0),
         COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed')
    INTO v_revenue, v_orders
  FROM payments p
  WHERE p.tenant_id = p_tenant_id AND p.created_at >= p_start_date AND p.created_at <= p_end_date;

  -- Pourboires ENCAISSES sur la periode: commandes reglees (ou reglees puis
  -- remboursees en partie, statut 'partial') dont l'encaissement tombe dans la
  -- periode. Un offert ('comp') et une annulation n'en ont pas.
  SELECT COALESCE(SUM(o.tip_amount), 0)
    INTO v_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.paid_at >= p_start_date AND o.paid_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial');

  RETURN QUERY
  SELECT v_revenue::NUMERIC AS total_revenue,
    v_orders::BIGINT AS total_orders,
    CASE WHEN v_orders > 0 THEN ROUND(v_revenue / v_orders, 2) ELSE 0 END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts,
    v_tips::NUMERIC AS total_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial');
END;
$$;


ALTER FUNCTION "public"."get_order_summary_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_orders_for_tracking("uuid", "uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ids uuid[];
  v_n integer;
begin
  -- Aplatissement: neutralise un tableau imbriqué ET renormalise les bornes a 1.
  v_ids := array(select unnest(p_order_ids));
  v_n := coalesce(cardinality(v_ids), 0);

  -- Les 200 plus recentes: le client empile a la fin a chaque commande.
  if v_n > 200 then
    v_ids := v_ids[(v_n - 199):v_n];
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(o) order by o.created_at desc), '[]'::jsonb)
    from (
      select
        ord.id,
        ord.order_number,
        ord.table_number,
        ord.status,
        ord.total,
        ord.subtotal,
        ord.tip_amount,
        ord.discount_amount,
        ord.tax_amount,
        ord.service_charge_amount,
        ord.service_type,
        ord.created_at,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'item_name', oi.item_name,
            'item_name_en', oi.item_name_en,
            'quantity', oi.quantity,
            'price_at_order', oi.price_at_order,
            'menu_item_id', oi.menu_item_id,
            'image_url', mi.image_url,
            'modifiers', coalesce(oi.modifiers, '[]'::jsonb),
            'customer_notes', oi.customer_notes
          ))
          from order_items oi
          left join menu_items mi on mi.id = oi.menu_item_id
          where oi.order_id = ord.id
        ), '[]'::jsonb) as order_items
      from orders ord
      where ord.tenant_id = p_tenant_id
        and ord.id = any(v_ids)
    ) o
  );
end;
$$;


ALTER FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: get_payment_method_report("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_payment_method_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("method" "text", "collected" bigint, "refunded" bigint, "net" bigint, "payment_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  SELECT p.method::text,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0)::bigint,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'refunded'), 0)::bigint,
         SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)::bigint,
         (COUNT(*) FILTER (WHERE p.status = 'completed'))::bigint
    FROM payments p
   WHERE p.tenant_id = p_tenant_id
     AND p.created_at >= p_start_date
     AND p.created_at <= p_end_date
   GROUP BY p.method
   ORDER BY 4 DESC, 1 ASC;
END;
$$;


ALTER FUNCTION "public"."get_payment_method_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_period_comparison("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_period_comparison"("p_tenant_id" "uuid", "p_mode" "text", "p_timezone" "text") RETURNS TABLE("period" "text", "start_at" timestamp with time zone, "end_at" timestamp with time zone, "revenue" bigint, "order_count" bigint, "avg_basket" bigint, "tips" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_local_now timestamp;
  v_cur_start timestamp;
  v_prev_start timestamp;
  v_prev_end timestamp;
  v_step interval;
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);
  PERFORM public.assert_valid_timezone(p_timezone);
  IF p_mode NOT IN ('week', 'month') THEN
    RAISE EXCEPTION 'Unknown comparison mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  v_step := CASE p_mode WHEN 'week' THEN interval '1 week' ELSE interval '1 month' END;
  v_local_now := now() AT TIME ZONE p_timezone;
  v_cur_start := date_trunc(p_mode, v_local_now);
  v_prev_start := v_cur_start - v_step;
  -- Meme duree ecoulee, sans deborder sur la periode en cours (un 31 contre un
  -- mois precedent de 30 jours s'arrete a la fin de ce mois).
  v_prev_end := LEAST(v_prev_start + (v_local_now - v_cur_start), v_cur_start - interval '1 microsecond');

  RETURN QUERY
  SELECT b.p, b.s, b.e,
         s.total_revenue::bigint,
         s.total_orders::bigint,
         ROUND(s.avg_basket)::bigint,
         s.total_tips::bigint
    FROM (VALUES
            ('current'::text, v_cur_start AT TIME ZONE p_timezone, now()),
            ('previous'::text, v_prev_start AT TIME ZONE p_timezone, v_prev_end AT TIME ZONE p_timezone)
         ) AS b(p, s, e)
   CROSS JOIN LATERAL public.get_order_summary(p_tenant_id, b.s, b.e) s;
END;
$$;


ALTER FUNCTION "public"."get_period_comparison"("p_tenant_id" "uuid", "p_mode" "text", "p_timezone" "text") OWNER TO "postgres";

--
-- Name: get_sales_heatmap("uuid", timestamp with time zone, timestamp with time zone, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_sales_heatmap"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") RETURNS TABLE("day_of_week" integer, "hour_of_day" integer, "revenue" bigint, "order_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);
  PERFORM public.assert_valid_timezone(p_timezone);

  RETURN QUERY
  WITH registre AS (
    SELECT EXTRACT(isodow FROM (p.created_at AT TIME ZONE p_timezone))::integer AS jour,
           EXTRACT(hour FROM (p.created_at AT TIME ZONE p_timezone))::integer AS heure,
           p.order_id,
           p.status,
           p.amount,
           p.created_at,
           p.id
      FROM payments p
     WHERE p.tenant_id = p_tenant_id
       AND p.created_at >= p_start_date
       AND p.created_at <= p_end_date
  ),
  argent AS (
    SELECT r.jour, r.heure,
           SUM(CASE WHEN r.status = 'refunded' THEN -r.amount ELSE r.amount END)::bigint AS ca
      FROM registre r
     GROUP BY r.jour, r.heure
  ),
  premiers AS (
    SELECT DISTINCT ON (r.order_id) r.jour, r.heure
      FROM registre r
     WHERE r.status = 'completed'
     ORDER BY r.order_id, r.created_at, r.id
  ),
  commandes AS (
    SELECT pr.jour, pr.heure, COUNT(*)::bigint AS nb
      FROM premiers pr
     GROUP BY pr.jour, pr.heure
  )
  SELECT a.jour, a.heure, a.ca, COALESCE(c.nb, 0)::bigint
    FROM argent a
    LEFT JOIN commandes c ON c.jour = a.jour AND c.heure = a.heure
   ORDER BY 1, 2;
END;
$$;


ALTER FUNCTION "public"."get_sales_heatmap"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") OWNER TO "postgres";

--
-- Name: get_server_performance("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("server_id" "uuid", "server_name" "text", "orders" bigint, "revenue" numeric, "tips" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN PERFORM public.assert_tenant_reports_ventes(p_tenant_id); RETURN QUERY SELECT * FROM public.get_server_performance_brut(p_tenant_id, p_start_date, p_end_date); END; $$;


ALTER FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_server_performance_brut("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_server_performance_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("server_id" "uuid", "server_name" "text", "orders" bigint, "revenue" numeric, "tips" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  WITH encaisse AS (
    SELECT
      o.server_id AS sid,
      COUNT(DISTINCT o.id) FILTER (WHERE p.status = 'completed')::BIGINT AS nb,
      SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)::NUMERIC AS ca
    FROM payments p
    JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant_id
      AND p.created_at >= p_start_date
      AND p.created_at <= p_end_date
      AND o.server_id IS NOT NULL
    GROUP BY o.server_id
  ),
  pourboires AS (
    -- Meme regle que get_order_summary.total_tips.
    SELECT o.server_id AS sid, SUM(o.tip_amount)::NUMERIC AS pb
    FROM orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.paid_at >= p_start_date
      AND o.paid_at <= p_end_date
      AND o.server_id IS NOT NULL
      AND o.status != 'cancelled'
      AND o.payment_status IN ('paid', 'partial')
    GROUP BY o.server_id
  )
  -- FULL JOIN: un serveur dont le pourboire est encaisse dans la periode sans
  -- ligne au registre dans cette meme periode (bornes) garde son pourboire.
  SELECT
    COALESCE(e.sid, pb.sid) AS server_id,
    COALESCE(au.full_name, COALESCE(e.sid, pb.sid)::TEXT)::TEXT AS server_name,
    COALESCE(e.nb, 0)::BIGINT AS orders,
    COALESCE(e.ca, 0)::NUMERIC AS revenue,
    COALESCE(pb.pb, 0)::NUMERIC AS tips
  FROM encaisse e
  FULL JOIN pourboires pb ON pb.sid = e.sid
  LEFT JOIN admin_users au ON au.id = COALESCE(e.sid, pb.sid)
  ORDER BY COALESCE(e.nb, 0) DESC;
END;
$$;


ALTER FUNCTION "public"."get_server_performance_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_staff_stock_report("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("author_id" "uuid", "author_name" "text", "out_qty" numeric, "in_qty" numeric, "movements_count" bigint, "manual_remove_qty" numeric, "adjustment_out_qty" numeric, "order_destock_qty" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN PERFORM public.assert_tenant_reports(p_tenant_id); RETURN QUERY SELECT * FROM public.get_staff_stock_report_brut(p_tenant_id, p_start, p_end); END; $$;


ALTER FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_staff_stock_report_brut("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_staff_stock_report_brut"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("author_id" "uuid", "author_name" "text", "out_qty" numeric, "in_qty" numeric, "movements_count" bigint, "manual_remove_qty" numeric, "adjustment_out_qty" numeric, "order_destock_qty" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.created_by AS author_id,
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = p_tenant_id
       LIMIT 1) AS author_name,
    COALESCE(SUM(CASE WHEN sm.quantity < 0 THEN -sm.quantity ELSE 0 END), 0) AS out_qty,
    COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN  sm.quantity ELSE 0 END), 0) AS in_qty,
    COUNT(*) AS movements_count,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'manual_remove' THEN -sm.quantity ELSE 0 END), 0) AS manual_remove_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'adjustment' AND sm.quantity < 0 THEN -sm.quantity ELSE 0 END), 0) AS adjustment_out_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'order_destock' THEN -sm.quantity ELSE 0 END), 0) AS order_destock_qty
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
    AND sm.created_by IS NOT NULL
    AND sm.created_at >= p_start
    AND sm.created_at <  p_end
  GROUP BY sm.created_by
  ORDER BY out_qty DESC;
END;
$$;


ALTER FUNCTION "public"."get_staff_stock_report_brut"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_stock_losses_report("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_stock_losses_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("ingredient_id" "uuid", "ingredient_name" "text", "unit" "text", "quantity" numeric, "cost_value" numeric, "movement_count" bigint, "main_reason" "text", "cost_complete" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH pertes AS (
    SELECT sm.ingredient_id AS ing, ABS(sm.quantity) AS qte, sm.reason_code AS motif
      FROM stock_movements sm
     WHERE sm.tenant_id = p_tenant_id
       AND sm.movement_type = 'loss'
       AND sm.created_at >= p_start_date
       AND sm.created_at <= p_end_date
  ),
  motifs AS (
    SELECT DISTINCT ON (x.ing) x.ing, x.motif
      FROM (SELECT ing, motif, SUM(qte) AS q FROM pertes GROUP BY ing, motif) x
     ORDER BY x.ing, x.q DESC, x.motif ASC NULLS LAST
  )
  SELECT i.id, i.name::text, i.unit::text,
         SUM(pe.qte),
         SUM(pe.qte * i.cost_per_unit),
         COUNT(*)::bigint,
         m.motif::text,
         (i.cost_per_unit > 0)
    FROM pertes pe
    JOIN ingredients i ON i.id = pe.ing AND i.tenant_id = p_tenant_id
    LEFT JOIN motifs m ON m.ing = pe.ing
   GROUP BY i.id, i.name, i.unit, i.cost_per_unit, m.motif
   ORDER BY 5 DESC, 2 ASC;
END;
$$;


ALTER FUNCTION "public"."get_stock_losses_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_stock_movements_page("uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer DEFAULT 200, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "ingredient_id" "uuid", "movement_type" "text", "quantity" numeric, "reference_id" "uuid", "notes" "text", "reason_code" "text", "created_by" "uuid", "supplier_id" "uuid", "created_at" timestamp with time zone, "ingredient_name" "text", "ingredient_unit" "text", "supplier_name" "text", "author_name" "text", "order_number" "text", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.id, sm.tenant_id, sm.ingredient_id, sm.movement_type, sm.quantity,
    sm.reference_id, sm.notes, sm.reason_code, sm.created_by, sm.supplier_id, sm.created_at,
    (SELECT i.name FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_name,
    (SELECT i.unit FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_unit,
    (SELECT s.name FROM public.suppliers s WHERE s.id = sm.supplier_id) AS supplier_name,
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = sm.tenant_id
       LIMIT 1) AS author_name,
    -- Tenant-scope la jointure: reference_id seul pourrait designer la commande
    -- d'un autre restaurant si un uuid etait devine.
    CASE WHEN sm.movement_type IN ('order_destock', 'order_restock') THEN
      (SELECT o.order_number FROM public.orders o
         WHERE o.id = sm.reference_id AND o.tenant_id = sm.tenant_id)
    END AS order_number,
    COUNT(*) OVER() AS total_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
  ORDER BY sm.created_at DESC, sm.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;


ALTER FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";

--
-- Name: get_stock_status("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "unit" "text", "current_stock" numeric, "min_stock_alert" numeric, "cost_per_unit" numeric, "category" "text", "is_active" boolean, "nb_items_using" bigint, "is_low" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
    i.cost_per_unit, i.category, i.is_active,
    COUNT(DISTINCT r.menu_item_id) AS nb_items_using,
    (i.current_stock <= 0
      OR (i.min_stock_alert > 0 AND i.current_stock <= i.min_stock_alert)) AS is_low
  FROM public.ingredients i
  LEFT JOIN public.recipes r ON r.ingredient_id = i.id AND r.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
           i.cost_per_unit, i.category, i.is_active
  ORDER BY i.name;
END;
$$;


ALTER FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: get_storefront_ads("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_storefront_ads"("p_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "image_url" "text", "link" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select a.id, a.image_url, a.link
  from public.ads a
  where a.tenant_id = p_tenant_id
    and a.is_active = true
    and private.storefront_tenant_visible(p_tenant_id)
  order by a.sort_order asc, a.created_at asc
  limit 6;
$$;


ALTER FUNCTION "public"."get_storefront_ads"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: get_tenant_by_slug("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "logo_url" "text", "currency" "text", "tax_rate" numeric, "service_charge_rate" numeric, "enable_tax" boolean, "enable_service_charge" boolean, "establishment_type" "text", "is_active" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.id, t.name, t.slug, t.logo_url, t.currency, t.tax_rate,
         t.service_charge_rate, t.enable_tax, t.enable_service_charge,
         t.establishment_type, t.is_active
  from tenants t
  where t.slug = p_slug
    and t.is_active = true
  limit 1;
$$;


ALTER FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") OWNER TO "postgres";

--
-- Name: get_tenant_public_by_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "currency" "text", "tax_rate" numeric, "service_charge_rate" numeric, "enable_tax" boolean, "enable_service_charge" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT t.id, t.name, t.slug, t.currency, t.tax_rate, t.service_charge_rate, t.enable_tax, t.enable_service_charge FROM tenants t WHERE t.id = p_id AND t.is_active = true LIMIT 1; $$;


ALTER FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") OWNER TO "postgres";

--
-- Name: get_top_items("uuid", timestamp with time zone, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer DEFAULT 10) RETURNS TABLE("item_id" "uuid", "item_name" "text", "quantity_sold" bigint, "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN PERFORM public.assert_tenant_reports_ventes(p_tenant_id); RETURN QUERY SELECT * FROM public.get_top_items_brut(p_tenant_id, p_start_date, p_end_date, p_limit); END; $$;


ALTER FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";

--
-- Name: get_top_items_brut("uuid", timestamp with time zone, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_top_items_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer DEFAULT 10) RETURNS TABLE("item_id" "uuid", "item_name" "text", "quantity_sold" bigint, "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT oi.menu_item_id AS item_id, MAX(oi.item_name)::TEXT AS item_name,
    SUM(oi.quantity)::BIGINT AS quantity_sold,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial')
  GROUP BY oi.menu_item_id ORDER BY quantity_sold DESC LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_top_items_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";

--
-- Name: get_venue_report("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_venue_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("venue_id" "uuid", "venue_name" "text", "revenue" bigint, "order_count" bigint, "avg_basket" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH registre AS (
    SELECT ve.id AS espace,
           p.order_id,
           p.status,
           p.amount
      FROM payments p
      JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
      -- Commandes anterieures a la migration (venue_id vide): zone de leur table.
      LEFT JOIN tables t ON o.venue_id IS NULL AND t.id = o.table_id AND t.tenant_id = o.tenant_id
      LEFT JOIN zones z ON z.id = t.zone_id AND z.tenant_id = o.tenant_id
      LEFT JOIN venues ve ON ve.id = COALESCE(o.venue_id, z.venue_id) AND ve.tenant_id = o.tenant_id
     WHERE p.tenant_id = p_tenant_id
       AND p.created_at >= p_start_date
       AND p.created_at <= p_end_date
  ),
  par_espace AS (
    SELECT r.espace,
           SUM(CASE WHEN r.status = 'refunded' THEN -r.amount ELSE r.amount END)::bigint AS ca,
           (COUNT(DISTINCT r.order_id) FILTER (WHERE r.status = 'completed'))::bigint AS nb
      FROM registre r
     GROUP BY r.espace
  ),
  lignes AS (
    SELECT v.id AS l_id, v.name::text AS l_nom, COALESCE(a.ca, 0)::bigint AS l_ca, COALESCE(a.nb, 0)::bigint AS l_nb
      FROM venues v
      LEFT JOIN par_espace a ON a.espace = v.id
     WHERE v.tenant_id = p_tenant_id
       AND (v.is_active OR a.espace IS NOT NULL)
    UNION ALL
    SELECT NULL::uuid, NULL::text, a.ca, a.nb
      FROM par_espace a
     WHERE a.espace IS NULL
  )
  SELECT l.l_id,
         l.l_nom,
         l.l_ca,
         l.l_nb,
         CASE WHEN l.l_nb > 0 THEN ROUND(l.l_ca::numeric / l.l_nb)::bigint ELSE 0::bigint END
    FROM lignes l
   ORDER BY l.l_ca DESC, l.l_nom ASC NULLS LAST, l.l_id ASC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_venue_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_venue_top_items("uuid", timestamp with time zone, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_venue_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer DEFAULT 5) RETURNS TABLE("venue_id" "uuid", "item_id" "uuid", "item_name" "text", "quantity_sold" bigint, "revenue" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH ventes AS (
    SELECT ve.id AS espace,
           oi.menu_item_id AS plat,
           MAX(oi.item_name)::text AS nom,
           SUM(oi.quantity)::bigint AS qte,
           SUM(oi.quantity * oi.price_at_order)::bigint AS ca
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      -- Commandes anterieures a la migration (venue_id vide): zone de leur table.
      LEFT JOIN tables t ON o.venue_id IS NULL AND t.id = o.table_id AND t.tenant_id = o.tenant_id
      LEFT JOIN zones z ON z.id = t.zone_id AND z.tenant_id = o.tenant_id
      LEFT JOIN venues ve ON ve.id = COALESCE(o.venue_id, z.venue_id) AND ve.tenant_id = o.tenant_id
     WHERE o.tenant_id = p_tenant_id
       AND o.created_at >= p_start_date
       AND o.created_at <= p_end_date
       AND o.status != 'cancelled'
       AND o.payment_status IN ('paid', 'partial')
     GROUP BY ve.id, oi.menu_item_id
  ),
  classees AS (
    SELECT v.*, row_number() OVER (PARTITION BY v.espace ORDER BY v.qte DESC, v.ca DESC, v.nom ASC, v.plat ASC) AS rang
      FROM ventes v
  )
  SELECT c.espace, c.plat, c.nom, c.qte, c.ca
    FROM classees c
   WHERE c.rang <= LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20)
   ORDER BY c.espace NULLS LAST, c.rang;
END;
$$;


ALTER FUNCTION "public"."get_venue_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";

--
-- Name: guard_house_account_settle(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."guard_house_account_settle"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'settled'
     AND OLD.status IS DISTINCT FROM 'settled'
     AND EXISTS (
       SELECT 1
         FROM public.orders o
        WHERE o.house_account_id = NEW.id
          AND o.tenant_id = NEW.tenant_id
          AND coalesce(o.status, '') <> 'cancelled'
          AND coalesce(o.payment_status, 'pending') NOT IN ('paid', 'comp')
          AND (coalesce(o.total, 0) + coalesce(o.tip_amount, 0))
              - coalesce((
                  SELECT sum(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)
                    FROM public.payments p
                   WHERE p.order_id = o.id
                ), 0) > 0
     ) THEN
    RAISE EXCEPTION 'Une commande de cette ardoise reste a encaisser'
      USING ERRCODE = '23514', HINT = 'house_account_unsettled_orders';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_house_account_settle"() OWNER TO "postgres";

--
-- Name: guard_order_house_account_open(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."guard_order_house_account_open"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_tenant uuid;
BEGIN
  IF NEW.house_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.house_account_id IS NOT DISTINCT FROM OLD.house_account_id THEN
    RETURN NEW;
  END IF;

  SELECT ha.status, ha.tenant_id
    INTO v_status, v_tenant
    FROM public.house_accounts ha
   WHERE ha.id = NEW.house_account_id
     FOR SHARE;

  IF NOT FOUND OR v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Ardoise introuvable'
      USING ERRCODE = '23503', HINT = 'house_account_tenant';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette ardoise est deja soldee'
      USING ERRCODE = '23514', HINT = 'house_account_settled';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_order_house_account_open"() OWNER TO "postgres";

--
-- Name: guard_table_delete_occupied(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."guard_table_delete_occupied"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN OLD;
  END IF;
  IF OLD.table_number IS NULL THEN
    RETURN OLD;
  END IF;

  IF NOT pg_try_advisory_xact_lock(
    hashtext('table_session:' || OLD.tenant_id::text || ':' || OLD.table_number)
  ) THEN
    RAISE EXCEPTION 'Cette table est en cours d''utilisation. Reessayez dans un instant.'
      USING ERRCODE = '55P03', HINT = 'table_busy';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.table_sessions ts
     WHERE ts.tenant_id = OLD.tenant_id
       AND ts.table_number = OLD.table_number
       AND ts.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Une table est occupee. Encaissez et liberez-la avant de la supprimer.'
      USING ERRCODE = '23514', HINT = 'table_occupied';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."guard_table_delete_occupied"() OWNER TO "postgres";

--
-- Name: has_tenant_floor_permission("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_tenant_floor_permission"("p_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT public.has_tenant_write_permission(p_tenant, 'settings.edit');
$$;


ALTER FUNCTION "public"."has_tenant_floor_permission"("p_tenant" "uuid") OWNER TO "postgres";

--
-- Name: has_tenant_money_permission("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_tenant_money_permission"("p_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT public.has_tenant_write_permission(p_tenant, 'orders.pay')
     AND public.has_tenant_write_permission(p_tenant, 'orders.refund')
     AND public.has_tenant_write_permission(p_tenant, 'orders.cancel')
     AND public.has_tenant_write_permission(p_tenant, 'orders.discount');
$$;


ALTER FUNCTION "public"."has_tenant_money_permission"("p_tenant" "uuid") OWNER TO "postgres";

--
-- Name: has_tenant_write_permission("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT coalesce(public.tenant_permission_level(p_tenant, p_perm) = 'full', false);
$$;


ALTER FUNCTION "public"."has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text") OWNER TO "postgres";

--
-- Name: import_recipes_tx("uuid", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb", "p_removals" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_row jsonb;
  v_menu_item_id uuid;
  v_ing_name text;
  v_ing_unit text;
  v_qty numeric;
  v_notes text;
  v_ingredient_id uuid;
  v_existed boolean;
  v_recipes_created int := 0;
  v_recipes_updated int := 0;
  v_ingredients_created int := 0;
  v_recipes_removed int := 0;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);

  IF p_removals IS NOT NULL AND jsonb_typeof(p_removals) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_REMOVALS' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    v_menu_item_id := (v_row->>'menu_item_id')::uuid;
    v_ing_name     := btrim(v_row->>'ingredient_name');
    v_ing_unit     := v_row->>'unit';
    v_qty          := (v_row->>'quantity_needed')::numeric;
    v_notes        := NULLIF(btrim(COALESCE(v_row->>'notes','')), '');

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
    END IF;
    IF v_ing_unit NOT IN ('kg','L','pièce','cl','g','bouteille') THEN
      RAISE EXCEPTION 'INVALID_UNIT: %', v_ing_unit USING ERRCODE = '22023';
    END IF;
    IF v_ing_name IS NULL OR v_ing_name = '' THEN
      RAISE EXCEPTION 'INVALID_INGREDIENT_NAME' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.menu_items mi
                   WHERE mi.id = v_menu_item_id AND mi.tenant_id = p_tenant_id) THEN
      RAISE EXCEPTION 'MENU_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO v_ingredient_id
    FROM public.ingredients
    WHERE tenant_id = p_tenant_id AND lower(name) = lower(v_ing_name)
    ORDER BY is_active DESC, created_at
    LIMIT 1;

    IF v_ingredient_id IS NULL THEN
      INSERT INTO public.ingredients (tenant_id, name, unit)
      VALUES (p_tenant_id, v_ing_name, v_ing_unit)
      RETURNING id INTO v_ingredient_id;
      v_ingredients_created := v_ingredients_created + 1;
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.recipes
                   WHERE menu_item_id = v_menu_item_id
                     AND ingredient_id = v_ingredient_id) INTO v_existed;

    INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed, notes)
    VALUES (p_tenant_id, v_menu_item_id, v_ingredient_id, v_qty, v_notes)
    ON CONFLICT (menu_item_id, ingredient_id)
    DO UPDATE SET quantity_needed = EXCLUDED.quantity_needed, notes = EXCLUDED.notes;

    IF v_existed THEN v_recipes_updated := v_recipes_updated + 1;
    ELSE v_recipes_created := v_recipes_created + 1;
    END IF;
  END LOOP;

  -- Audit B84: retraits dans la meme transaction, filtres par restaurant.
  DELETE FROM public.recipes r
   USING jsonb_to_recordset(COALESCE(p_removals, '[]'::jsonb))
         AS x(menu_item_id uuid, ingredient_id uuid)
   WHERE r.tenant_id = p_tenant_id
     AND r.menu_item_id = x.menu_item_id
     AND r.ingredient_id = x.ingredient_id;
  GET DIAGNOSTICS v_recipes_removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'recipes_created', v_recipes_created,
    'recipes_updated', v_recipes_updated,
    'ingredients_created', v_ingredients_created,
    'recipes_removed', v_recipes_removed
  );
END;
$$;


ALTER FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb", "p_removals" "jsonb") OWNER TO "postgres";

--
-- Name: increment_login_count("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = admin_user_id AND user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'access denied: cannot update login count for another admin'
      USING ERRCODE = '42501';
  END IF;
  UPDATE admin_users
  SET last_login_at = NOW(),
      login_count = COALESCE(login_count, 0) + 1
  WHERE id = admin_user_id;
END;
$$;


ALTER FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") OWNER TO "postgres";

--
-- Name: increment_menu_item_favorites("uuid", "uuid", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'p_delta must be -1 or 1';
  END IF;
  UPDATE menu_items
     SET favorite_count = GREATEST(0, favorite_count + p_delta)
   WHERE id = p_item AND tenant_id = p_tenant
   RETURNING favorite_count INTO v_count;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) OWNER TO "postgres";

--
-- Name: inscrire_espace_commande(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."inscrire_espace_commande"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- A la creation, un espace deja fourni est garde. Quand la commande change
  -- de table, elle prend l'espace de la nouvelle table.
  IF TG_OP = 'INSERT' AND NEW.venue_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT DISTINCT FROM OLD.table_id THEN
    RETURN NEW;
  END IF;
  IF NEW.table_id IS NOT NULL THEN
    SELECT z.venue_id INTO NEW.venue_id
      FROM tables t
      JOIN zones z ON z.id = t.zone_id AND z.tenant_id = t.tenant_id
     WHERE t.id = NEW.table_id AND t.tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."inscrire_espace_commande"() OWNER TO "postgres";

--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
        AND (is_super_admin = true OR role = 'super_admin')
        AND COALESCE(is_active, true)
        AND deleted_at IS NULL
    );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";

--
-- Name: FUNCTION "is_super_admin"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."is_super_admin"() IS 'Vrai si l appelant est super administrateur actif ET que son jeton est aal2 (code TOTP saisi). Sans facteur enregistre, aucun droit de plateforme.';


--
-- Name: is_table_occupied("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM table_sessions
    WHERE tenant_id = p_tenant_id
      AND table_number = p_table_number
      AND status = 'open'
  );
$$;


ALTER FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") OWNER TO "postgres";

--
-- Name: is_tenant_name_taken("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_tenant_name_taken"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.deleted_at IS NULL
      AND t.onboarding_completed = true
      AND t.group_id IS NOT NULL
      AND lower(btrim(t.name)) = lower(btrim(p_name))
  );
$$;


ALTER FUNCTION "public"."is_tenant_name_taken"("p_name" "text") OWNER TO "postgres";

--
-- Name: is_tenant_owner("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_tenant_owner"("p_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT public.mfa_satisfait() AND EXISTS (
    SELECT 1 FROM public.admin_users AS au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND au.is_active IS TRUE
      AND au.deleted_at IS NULL
      AND 'owner' = ANY (au.postes));
$$;


ALTER FUNCTION "public"."is_tenant_owner"("p_tenant" "uuid") OWNER TO "postgres";

--
-- Name: item_suggestions_modifiee_devient_manuelle(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."item_suggestions_modifiee_devient_manuelle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF OLD.source = 'auto' AND (
       NEW.menu_item_id IS DISTINCT FROM OLD.menu_item_id
    OR NEW.suggested_item_id IS DISTINCT FROM OLD.suggested_item_id
    OR NEW.suggestion_type IS DISTINCT FROM OLD.suggestion_type
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.display_order IS DISTINCT FROM OLD.display_order
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
  ) THEN
    NEW.source := 'manual';
  END IF;
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."item_suggestions_modifiee_devient_manuelle"() OWNER TO "postgres";

--
-- Name: marquer_tables_initialisees(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."marquer_tables_initialisees"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT tenant_id FROM nouvelles_tables) n
    WHERE public.tenant_effective_plan(n.tenant_id) NOT IN ('pro', 'business', 'enterprise')
      AND (SELECT count(*) FROM tables t WHERE t.tenant_id = n.tenant_id) > 4000
  ) THEN
    RAISE EXCEPTION 'Initial tables exceed the onboarding limit (4000)'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO tenant_tables_initialisees (tenant_id)
  SELECT DISTINCT tenant_id FROM nouvelles_tables
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."marquer_tables_initialisees"() OWNER TO "postgres";

--
-- Name: menu_items_masquage_manuel(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."menu_items_masquage_manuel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon', 'service_role')
     AND NEW.is_available IS DISTINCT FROM OLD.is_available THEN
    NEW.masque_par_stock := false;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."menu_items_masquage_manuel"() OWNER TO "postgres";

--
-- Name: menus_same_tenant_links(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."menus_same_tenant_links"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_autre uuid;
BEGIN
  -- Verrou consultatif par restaurant (contre-audits E1 et F1), pris AVANT
  -- toute lecture. Une transaction concurrente qui deplace le parent ou la
  -- salle, ou qui pose un lien de parente, dans ce restaurant, est attendue.
  -- Pour un changement de restaurant, les DEUX restaurants sont verrouilles,
  -- toujours le plus petit identifiant d'abord (meme ordre dans les trois
  -- gardes: pas d'interblocage entre elles). Cle a DEUX entiers: tous les
  -- autres verrous consultatifs du depot (destock_order, restock_order,
  -- table_session, venue_cap, tables_init, owner_trial, numerotation) utilisent
  -- la forme a UNE cle, et PostgreSQL tient les deux espaces separes. Aucune
  -- fonction SQL n'ecrit dans `menus` en prenant un autre verrou.
  IF NEW.parent_menu_id IS NOT NULL OR NEW.venue_id IS NOT NULL
     OR (TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    v_autre := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(LEAST(NEW.tenant_id, v_autre)::text));
    IF v_autre IS DISTINCT FROM NEW.tenant_id THEN
      PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(GREATEST(NEW.tenant_id, v_autre)::text));
    END IF;
  END IF;

  IF NEW.parent_menu_id IS NOT NULL THEN
    IF NEW.parent_menu_id = NEW.id THEN
      RAISE EXCEPTION 'MENU_SELF_PARENT: a menu cannot be its own parent'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.menus m
      WHERE m.id = NEW.parent_menu_id AND m.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'MENU_PARENT_OTHER_TENANT: parent menu must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
    -- Remonter les parents depuis le nouveau parent: si l'on retombe sur
    -- cette carte, le lien fermerait un cycle. CYCLE arrete la recursion sur
    -- un cycle deja present en base, sans boucler.
    IF EXISTS (
      WITH RECURSIVE ancetres(id, parent_menu_id) AS (
        SELECT m.id, m.parent_menu_id FROM public.menus m WHERE m.id = NEW.parent_menu_id
        UNION ALL
        SELECT m.id, m.parent_menu_id
        FROM public.menus m
        JOIN ancetres a ON m.id = a.parent_menu_id
      ) CYCLE id SET est_cycle USING chemin
      SELECT 1 FROM ancetres WHERE parent_menu_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'MENU_PARENT_CYCLE: parent link would create a cycle'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.venue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = NEW.venue_id AND v.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'MENU_VENUE_OTHER_TENANT: venue must belong to the same tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."menus_same_tenant_links"() OWNER TO "postgres";

--
-- Name: menus_tenant_move_keeps_children(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."menus_tenant_move_keeps_children"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    -- Contre-audit F1: meme verrou que menus_same_tenant_links, sur les deux
    -- restaurants, le plus petit identifiant d'abord.
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(LEAST(OLD.tenant_id, NEW.tenant_id)::text));
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(GREATEST(OLD.tenant_id, NEW.tenant_id)::text));
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id AND EXISTS (
    SELECT 1 FROM public.menus c
    WHERE c.parent_menu_id = NEW.id AND c.tenant_id <> NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'MENU_MOVE_ORPHANS_CHILDREN: sub-menus would point to another tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."menus_tenant_move_keeps_children"() OWNER TO "postgres";

--
-- Name: mfa_satisfait(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."mfa_satisfait"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1
        FROM auth.mfa_factors f
        WHERE f.user_id = (SELECT auth.uid())
          AND f.status = 'verified'
      );
$$;


ALTER FUNCTION "public"."mfa_satisfait"() OWNER TO "postgres";

--
-- Name: FUNCTION "mfa_satisfait"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."mfa_satisfait"() IS 'Vrai si le compte appelant n a aucun facteur MFA verifie, ou si son jeton est aal2. Ajoutee aux fonctions de droits communes (double authentification exigee par la base).';


--
-- Name: mon_restaurant_a_le_stock("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."mon_restaurant_a_le_stock"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- Membre du restaurant, ou super administrateur (meme regle d'appartenance
  -- que assert_tenant_member); le plan juge ensuite dans les deux cas.
  SELECT (p_tenant_id = ANY (public.get_my_tenant_ids_array()) OR public.is_super_admin())
     AND public.tenant_effective_plan(p_tenant_id) IN ('pro', 'business', 'enterprise');
$$;


ALTER FUNCTION "public"."mon_restaurant_a_le_stock"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: next_order_number("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_jour date := (now() at time zone 'UTC')::date;
  v_seq integer;
begin
  -- Un restaurant inexistant ou supprime n'obtient pas de numero. Deuxieme
  -- barriere seulement: depuis le resserrage des droits ci-dessous, seul
  -- `service_role` peut appeler cette fonction. Ce controle reste parce qu'un
  -- futur chemin pourrait lui rendre des droits sans y penser.
  if not exists (
    select 1 from public.tenants t
     where t.id = p_tenant_id and t.deleted_at is null
  ) then
    raise exception 'Restaurant inconnu' using errcode = 'foreign_key_violation';
  end if;

  insert into public.order_number_counters (tenant_id, jour, dernier)
  values (p_tenant_id, v_jour, 1)
      on conflict (tenant_id, jour)
      do update set dernier = public.order_number_counters.dernier + 1
   returning dernier into v_seq;

  return 'CMD-' || to_char(v_jour, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
end;
$$;


ALTER FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: normaliser_creation_commande(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."normaliser_creation_commande"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.has_tenant_money_permission(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  NEW.created_at     := now();
  NEW.payment_status := 'pending';
  NEW.paid_at        := NULL;
  NEW.payment_method := NULL;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normaliser_creation_commande"() OWNER TO "postgres";

--
-- Name: open_stock_count("uuid", "text", "uuid", "uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_ingredient_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count_id uuid;
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  IF EXISTS (SELECT 1 FROM public.stock_counts WHERE tenant_id = p_tenant_id AND status = 'open') THEN
    RAISE EXCEPTION 'OPEN_COUNT_EXISTS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_counts (tenant_id, reference, status, created_by)
  VALUES (p_tenant_id, NULLIF(p_reference, ''), 'open', v_author)
  RETURNING id INTO v_count_id;

  INSERT INTO public.stock_count_lines (tenant_id, count_id, ingredient_id, theoretical_qty)
  SELECT p_tenant_id, v_count_id, i.id, i.current_stock
  FROM public.ingredients i
  WHERE i.tenant_id = p_tenant_id
    AND i.is_active = true
    AND (p_ingredient_ids IS NULL OR i.id = ANY (p_ingredient_ids));

  IF NOT EXISTS (SELECT 1 FROM public.stock_count_lines WHERE count_id = v_count_id) THEN
    RAISE EXCEPTION 'NO_INGREDIENTS' USING ERRCODE = '22023';
  END IF;

  RETURN v_count_id;
END;
$$;


ALTER FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: order_notes_auteur_session(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."order_notes_auteur_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.created_by := (
      SELECT au.id
        FROM public.admin_users au
       WHERE au.user_id = (SELECT auth.uid())
         AND au.tenant_id = NEW.tenant_id
         AND coalesce(au.is_active, true)
         AND au.deleted_at IS NULL
       ORDER BY au.created_at
       LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."order_notes_auteur_session"() OWNER TO "postgres";

--
-- Name: owner_trial_ledger_sync_confirmation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."owner_trial_ledger_sync_confirmation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "lock_timeout" TO '2s'
    AS $$
DECLARE
  v_row auth.users;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  -- Ce declencheur est greffe sur auth.users: il ne doit JAMAIS faire echouer
  -- une confirmation ou une suppression de compte (GoTrue). Toute erreur est
  -- journalisee en avertissement et la ligne d'origine est toujours rendue.
  BEGIN
    IF v_row.email_confirmed_at IS NOT NULL AND v_row.email IS NOT NULL THEN
      UPDATE public.owner_trial_ledger
         SET confirmed_at = now()
       WHERE email_key = lower(btrim(v_row.email))
         AND first_user_id = v_row.id
         AND confirmed_at IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'owner_trial_ledger_sync: %', SQLERRM;
  END;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."owner_trial_ledger_sync_confirmation"() OWNER TO "postgres";

--
-- Name: prevent_super_admin_elevation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."prevent_super_admin_elevation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    caller_is_super_admin boolean := false;
    service_role_call boolean := false;
  BEGIN
    BEGIN
      service_role_call := coalesce(
        current_setting('request.jwt.claim.role', true) = 'service_role',
        false
      );
    EXCEPTION WHEN OTHERS THEN
      service_role_call := false;
    END;

    IF service_role_call THEN
      RETURN NEW;
    END IF;

    -- INSERT path
    IF TG_OP = 'INSERT' THEN
      IF NEW.role = 'super_admin' OR NEW.is_super_admin = true THEN
        SELECT coalesce(
          (SELECT au.is_super_admin
             FROM admin_users au
             WHERE au.user_id = auth.uid()
             LIMIT 1),
          false
        ) INTO caller_is_super_admin;

        IF NOT caller_is_super_admin THEN
          RAISE EXCEPTION
            'Only super_admin users can create a super_admin row'
            USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    -- UPDATE path
    IF (OLD.role IS NOT DISTINCT FROM NEW.role)
       AND (OLD.is_super_admin IS NOT DISTINCT FROM NEW.is_super_admin) THEN
      RETURN NEW;
    END IF;

    IF (NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM 'super_admin')
       OR (NEW.is_super_admin = true AND OLD.is_super_admin IS DISTINCT FROM true) THEN

      SELECT coalesce(
        (SELECT au.is_super_admin
           FROM admin_users au
           WHERE au.user_id = auth.uid()
           LIMIT 1),
        false
      ) INTO caller_is_super_admin;

      IF NOT caller_is_super_admin THEN
        RAISE EXCEPTION
          'Only super_admin users can grant super_admin privileges'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    IF (OLD.role = 'super_admin' AND NEW.role IS DISTINCT FROM 'super_admin')
       OR (OLD.is_super_admin = true AND NEW.is_super_admin IS DISTINCT FROM true) THEN

      SELECT coalesce(
        (SELECT au.is_super_admin
           FROM admin_users au
           WHERE au.user_id = auth.uid()
           LIMIT 1),
        false
      ) INTO caller_is_super_admin;

      IF NOT caller_is_super_admin THEN
        RAISE EXCEPTION
          'Only super_admin users can revoke super_admin privileges'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."prevent_super_admin_elevation"() OWNER TO "postgres";

--
-- Name: FUNCTION "prevent_super_admin_elevation"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."prevent_super_admin_elevation"() IS 'Blocks non-super_admin callers from granting or revoking super_admin
     role/is_super_admin flag via UPDATE. Service role bypasses.';


--
-- Name: provision_group_restaurant("uuid", "uuid", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_owner uuid;
  v_plan text := CASE WHEN p_plan = 'trial' THEN 'starter' ELSE p_plan END;
  v_mode text;
  v_trial_ends timestamptz;
BEGIN
  SELECT owner_user_id INTO v_owner FROM restaurant_groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'group_not_owned_by_user' USING ERRCODE = '42501';
  END IF;

  SELECT d.mode, d.trial_ends INTO v_mode, v_trial_ends FROM decide_owner_trial(p_user_id) d;

  INSERT INTO tenants (
    slug, name, group_id, subscription_plan, subscription_status, trial_ends_at, is_active, freeze_reason
  ) VALUES (
    p_slug,
    p_name,
    p_group_id,
    v_plan,
    CASE WHEN v_mode = 'none' THEN 'frozen' ELSE 'trial' END,
    v_trial_ends,
    v_mode <> 'none',
    CASE WHEN v_mode = 'none' THEN 'trial_expired' ELSE NULL END
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO admin_users (tenant_id, user_id, email, full_name, role, is_active)
  VALUES (v_tenant_id, p_user_id, p_email, p_name, 'owner', true);

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', p_type, true);

  RETURN jsonb_build_object('tenantId', v_tenant_id, 'slug', p_slug, 'trialMode', v_mode);
END;
$$;


ALTER FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") OWNER TO "postgres";

--
-- Name: provision_signup_tenant("text", "text", "text", "uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_group_id uuid;
  v_mode text;
  v_trial_ends timestamptz;
BEGIN
  SELECT d.mode, d.trial_ends INTO v_mode, v_trial_ends FROM decide_owner_trial(p_user_id) d;

  INSERT INTO tenants (
    slug, name, subscription_plan, subscription_status, trial_ends_at, is_active, freeze_reason
  ) VALUES (
    p_slug,
    p_name,
    p_plan,
    CASE WHEN v_mode = 'none' THEN 'frozen' ELSE 'trial' END,
    v_trial_ends,
    v_mode <> 'none',
    CASE WHEN v_mode = 'none' THEN 'trial_expired' ELSE NULL END
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO restaurant_groups (owner_user_id, name)
  VALUES (p_user_id, 'Mon Groupe')
  ON CONFLICT (owner_user_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_group_id;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id FROM restaurant_groups WHERE owner_user_id = p_user_id;
  END IF;

  UPDATE tenants SET group_id = v_group_id WHERE id = v_tenant_id;

  INSERT INTO admin_users (tenant_id, user_id, email, full_name, phone, role, is_active)
  VALUES (v_tenant_id, p_user_id, p_email, p_full_name, p_phone, 'owner', true);

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', 'restaurant', true);

  RETURN jsonb_build_object(
    'tenantId', v_tenant_id,
    'slug', p_slug,
    'groupId', v_group_id,
    'trialMode', v_mode
  );
END;
$$;


ALTER FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") OWNER TO "postgres";

--
-- Name: purge_audit_logs(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."purge_audit_logs"("p_cutoff" timestamp with time zone) RETURNS TABLE("deleted_count" integer, "pseudonymized_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_deleted integer;
  v_pseudo integer;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < p_cutoff
    AND entity_type NOT IN ('order', 'coupon', 'item');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.audit_log
  SET user_email = NULL,
      user_id = NULL,
      old_data = old_data - public.audit_personal_keys(),
      new_data = new_data - public.audit_personal_keys(),
      metadata = metadata - public.audit_personal_keys()
  WHERE created_at < p_cutoff
    AND entity_type IN ('order', 'coupon', 'item')
    AND (user_email IS NOT NULL
         OR user_id IS NOT NULL
         OR old_data ?| public.audit_personal_keys()
         OR new_data ?| public.audit_personal_keys()
         OR metadata ?| public.audit_personal_keys());
  GET DIAGNOSTICS v_pseudo = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_pseudo;
END;
$$;


ALTER FUNCTION "public"."purge_audit_logs"("p_cutoff" timestamp with time zone) OWNER TO "postgres";

--
-- Name: reassign_order_table("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_table_number text;
  v_old_session_id uuid;
  v_service_type text;
  v_status text;
  v_new_session_id uuid;
  v_pending_count integer;
BEGIN
  -- Tenant-isolation guard: a member cannot reassign another tenant's order.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- A15: meme droit que l'action serveur (`orders.take` : deplacer une
  -- commande est un geste de salle). Sans ce controle, un membre sans ce droit
  -- deplacait une commande par l'API directe.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin()
     AND NOT public.has_tenant_write_permission(p_tenant_id, 'orders.take') THEN
    RAISE EXCEPTION 'access denied: reassigning an order requires orders.take'
      USING ERRCODE = '42501';
  END IF;

  -- Load the order, scoped to the tenant.
  SELECT table_number, session_id, service_type, status
    INTO v_old_table_number, v_old_session_id, v_service_type, v_status
    FROM orders
    WHERE id = p_order_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Only dine-in orders live on a table / session.
  IF v_service_type IS DISTINCT FROM 'dine_in' THEN
    RAISE EXCEPTION 'Only dine-in orders can be reassigned' USING ERRCODE = 'check_violation';
  END IF;

  -- A cancelled order is terminal; moving it would resurrect it onto a table.
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot reassign a cancelled order' USING ERRCODE = 'check_violation';
  END IF;

  -- Destination table must be a real, non-empty label.
  IF p_new_table_number IS NULL OR btrim(p_new_table_number) = '' THEN
    RAISE EXCEPTION 'Destination table number is required' USING ERRCODE = 'check_violation';
  END IF;

  -- B133: la destination doit etre une table de CE restaurant (meme valeur
  -- que l'ecran envoie: `table_number`). Sans ce controle, une commande
  -- partait vers une etiquette inexistante et ouvrait une session fantome.
  IF NOT EXISTS (
    SELECT 1 FROM tables t
     WHERE t.tenant_id = p_tenant_id
       AND t.table_number = p_new_table_number
  ) THEN
    RAISE EXCEPTION 'Destination table not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- No-op: already on the destination table.
  IF v_old_table_number IS NOT DISTINCT FROM p_new_table_number THEN
    RETURN;
  END IF;

  -- Lock both table sessions in a deterministic (sorted) order so two concurrent
  -- reassigns touching the same pair of tables cannot deadlock. If the order has no
  -- old table, only the destination needs locking.
  IF v_old_table_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSIF v_old_table_number < p_new_table_number THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
  END IF;

  -- A reassign always targets a FREE table (the UI only offers free tables). Under
  -- the advisory lock, re-check the destination is still free: if it gained an open
  -- session between the picker load and now (a concurrent order / QR scan), reject
  -- instead of silently merging the moved order onto that other party's check.
  IF EXISTS (
    SELECT 1 FROM table_sessions
    WHERE tenant_id = p_tenant_id
      AND table_number = p_new_table_number
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Destination table is now occupied' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO table_sessions (tenant_id, table_number)
  VALUES (p_tenant_id, p_new_table_number)
  RETURNING id INTO v_new_session_id;

  -- Move the order onto the destination table + session.
  UPDATE orders
    SET table_number = p_new_table_number,
        session_id = v_new_session_id
    WHERE id = p_order_id AND tenant_id = p_tenant_id;

  -- Close the OLD session if nothing unsettled remains on it. A14: meme regle
  -- que close_table_session_if_settled (20261115200000, p_require_served = true,
  -- delai de 2 h): une commande impayee OU partiellement payee, ou pas encore
  -- servie, garde la table occupee. L'ancienne regle ne comptait que 'pending':
  -- un acompte laissait la table liberee avec une addition ouverte. The order we
  -- just moved no longer references the old session, so it is excluded.
  IF v_old_session_id IS NOT NULL AND v_old_session_id IS DISTINCT FROM v_new_session_id THEN
    SELECT count(*) INTO v_pending_count
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND session_id = v_old_session_id
        AND status <> 'cancelled'
        AND (
          coalesce(payment_status, 'pending') IN ('pending', 'partial')
          OR (
            status NOT IN ('delivered', 'served')
            AND created_at > now() - interval '2 hours'
          )
        );

    IF v_pending_count = 0 THEN
      UPDATE table_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = v_old_session_id AND status = 'open';
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") OWNER TO "postgres";

--
-- Name: reconcile_stock_ledger("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row RECORD;
  v_n INT := 0;
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  FOR v_row IN
    SELECT i.id, (i.current_stock - COALESCE(SUM(sm.quantity), 0))::numeric(10, 3) AS drift
    FROM public.ingredients i
    LEFT JOIN public.stock_movements sm
      ON sm.ingredient_id = i.id AND sm.tenant_id = p_tenant_id
    WHERE i.tenant_id = p_tenant_id AND i.is_active = true
    GROUP BY i.id, i.current_stock
    HAVING (i.current_stock - COALESCE(SUM(sm.quantity), 0)) <> 0
  LOOP
    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, reason_code)
    VALUES (p_tenant_id, v_row.id, 'adjustment', v_row.drift, 'Reconciliation ledger', v_author, 'reconcile');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;


ALTER FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: record_loss_tx("uuid", "uuid", numeric, "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_before NUMERIC(10,3);
  v_after  NUMERIC(10,3);
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;
  IF p_reason_code IS NULL OR p_reason_code NOT IN
     ('breakage','expired','theft','spillage','prep_waste','other') THEN
    RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = '22023';
  END IF;

  SELECT current_stock INTO v_before
  FROM public.ingredients
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- B142: la perte porte la quantite DECLAREE et le stock descend d'autant,
  -- y compris sous zero, comme le fait deja la vente (20261112150000). Une
  -- perte ne fait jamais monter le stock et ne disparait plus du rapport des
  -- pertes (decision de l'orchestrateur, contre-audit 1).
  v_after := v_before - p_quantity;

  UPDATE public.ingredients
  SET current_stock = v_after, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements
    (tenant_id, ingredient_id, movement_type, quantity, reason_code, notes, created_by)
  VALUES
    (p_tenant_id, p_ingredient_id, 'loss', v_after - v_before, p_reason_code, p_notes, v_author);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END;
$$;


ALTER FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: record_refund("uuid", "uuid", numeric, "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_client_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total      numeric;
  v_tip        numeric;
  v_net        numeric;
  v_payment_id uuid;
  v_actor      uuid;
BEGIN
  -- (1) APPARTENANCE, avant toute autre chose. Leve 42501 si l'appelant n'est
  -- pas membre du restaurant. Laisse passer service_role et les super-admins.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- (2) HABILITATION. service_role (webhooks, cron) et super-admin agissent
  -- sans ligne de membre: pour eux `created_by` reste celui fourni, car ils
  -- agissent au nom de quelqu'un d'autre et n'ont pas d'id de membre propre.
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    v_actor := p_created_by;
  ELSE
    -- La ligne de membre de l'APPELANT, jamais un parametre. `is_active` et
    -- `deleted_at` sont verifies ici: un compte suspendu ou retire ne doit pas
    -- pouvoir sortir de l'argent de la caisse.
    SELECT a.id INTO v_actor
    FROM public.admin_users AS a
    WHERE a.user_id = (SELECT auth.uid())
      AND a.tenant_id = p_tenant_id
      AND a.is_active IS TRUE
      AND a.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'access denied: no active membership for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;

    -- (3) ARGENT. Rembourser fait sortir de l'argent de la caisse : il faut
    -- l'autorite d'argent du lot 1 (encaisser, rembourser, annuler, remiser,
    -- les quatre en entier), resolue par la MEME fonction que la RLS. Par
    -- defaut : proprietaire et gerant, comme l'ancienne liste de roles.
    IF NOT public.has_tenant_money_permission(p_tenant_id) THEN
      RAISE EXCEPTION 'access denied: refund requires the money permission'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ------------------------------------------------------------------------
  -- A partir d'ici, logique de caisse INCHANGEE (recopiee a l'identique).
  -- ------------------------------------------------------------------------
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit etre superieur a zero'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rejeu: la meme cle renvoie la ligne deja ecrite, sans second mouvement de
  -- caisse. Fait AVANT le verrou, un rejeu ne doit pas attendre.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_payment_id
    FROM payments
    WHERE tenant_id = p_tenant_id
      AND client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  -- Le verrou porte sur la COMMANDE: il serialise tous les mouvements de caisse
  -- de cette commande, remboursements comme encaissements.
  SELECT total, COALESCE(tip_amount, 0)
    INTO v_total, v_tip
  FROM orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  -- Net recalcule DANS la transaction, apres le verrou: c'est ce qui ferme le
  -- TOCTOU. Le second remboursement concurrent lit ici un net deja reduit.
  SELECT COALESCE(SUM(CASE WHEN status = 'refunded' THEN -amount ELSE amount END), 0)
    INTO v_net
  FROM payments
  WHERE order_id = p_order_id AND tenant_id = p_tenant_id;

  IF p_amount > v_net THEN
    RAISE EXCEPTION 'Le montant du remboursement depasse le montant encaisse'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO payments (tenant_id, order_id, amount, method, status, created_by, client_request_id)
  VALUES (p_tenant_id, p_order_id, p_amount, p_method, 'refunded', v_actor, p_client_request_id)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;


ALTER FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") IS 'Enregistre un remboursement. Verifie l''appartenance au restaurant, le role, orders.manage et orders.pay, et derive created_by de auth.uid(): les parametres p_tenant_id et p_created_by ne sont plus crus sur parole. Voir 20261105120000_record_refund_tenant_guard.sql et 20261109200000_argent_orders_pay.sql.';


--
-- Name: refuser_argent_sans_orders_pay(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."refuser_argent_sans_orders_pay"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- B138: la commande est-elle offerte ou remboursee, avant et apres.
  v_argent_avant boolean :=
    coalesce(OLD.payment_status, '') IN ('comp', 'refunded') OR coalesce(OLD.is_comp, false);
  v_argent_apres boolean :=
    coalesce(NEW.payment_status, '') IN ('comp', 'refunded') OR coalesce(NEW.is_comp, false);
  v_hors_cuisine boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- B144: une commande annulee ne revient pas. L'annulation a rendu le stock et
  -- le coupon; la sortir de `cancelled` ne les reprend pas. Aucun client, quel
  -- que soit son droit (l'application ne fait jamais cette transition).
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION
      'Une commande annulee ne peut pas revenir: creez une nouvelle commande'
      USING ERRCODE = '42501';
  END IF;

  -- B68: une commande payee ne s'annule pas; elle se rembourse.
  IF OLD.payment_status = 'paid'
     AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION
      'Une commande payee ne peut pas etre annulee: utilisez un remboursement'
      USING ERRCODE = '42501';
  END IF;

  -- LISTE BLANCHE, comme la section 10 pour `order_items`. Sans `orders.pay`,
  -- seules ces colonnes peuvent changer: faire avancer la commande (`status`,
  -- `served_at`), la prendre en charge (`server_id`), et `updated_at` que le
  -- declencheur update_orders_updated_at reecrit de toute facon. Une premiere
  -- version listait au contraire les colonnes INTERDITES: toute colonne
  -- oubliee restait ouverte au serveur par l'API directe, y compris
  -- `wave_checkout_id` et `orange_money_pay_token`, qui relient un paiement
  -- mobile a SA commande (les reecrire fait payer une commande par l'argent
  -- d'une autre). Une colonne ajoutee plus tard est gardee par defaut.
  -- Les seuls UPDATE applicatifs sous jeton d'employe sans `orders.pay`
  -- (order-lifecycle: status + served_at; assignment.service: server_id)
  -- n'ecrivent que ces colonnes.
  v_hors_cuisine :=
       (to_jsonb(NEW) - ARRAY['status', 'served_at', 'server_id', 'updated_at'])
         IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'served_at', 'server_id', 'updated_at']);

  IF (
       v_hors_cuisine
       -- Annuler une note impayee apres avoir pris l'argent est le
       -- detournement classique: l'annulation reste une operation d'argent.
       OR (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
     )
     -- Jugee sur le restaurant PROPRIETAIRE (OLD), comme les autres gardes.
     AND NOT public.has_tenant_write_permission(OLD.tenant_id, 'orders.pay')
  THEN
    RAISE EXCEPTION
      'Encaisser, annuler, changer la note d''une table ou mettre sur une ardoise exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  -- B138: offrir ou rembourser exige l'autorite sur l'argent (regle reprise de
  -- l'ancien WITH CHECK de la politique UPDATE). Sur une commande deja offerte
  -- ou remboursee, seul le suivi de cuisine reste libre: toute autre colonne,
  -- ou l'annulation, exige aussi cette autorite.
  IF (v_argent_avant OR v_argent_apres)
     AND (
       NOT v_argent_avant
       OR v_hors_cuisine
       OR (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
     )
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Offrir, rembourser ou modifier une commande offerte ou remboursee exige l''autorite sur l''argent'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."refuser_argent_sans_orders_pay"() OWNER TO "postgres";

--
-- Name: refuser_articles_argent_sans_orders_pay(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."refuser_articles_argent_sans_orders_pay"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- Ce que `orders.manage` suffit a changer: le suivi de cuisine.
  suivi constant text[] := ARRAY['item_status', 'course', 'held', 'fired_at', 'preparation_zone'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - suivi) IS DISTINCT FROM (to_jsonb(OLD) - suivi)
     AND NOT public.has_tenant_write_permission(OLD.tenant_id, 'orders.pay')
  THEN
    RAISE EXCEPTION
      'Changer la quantite, le prix ou le plat d''un article exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."refuser_articles_argent_sans_orders_pay"() OWNER TO "postgres";

--
-- Name: refuser_reecriture_montants_commande(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."refuser_reecriture_montants_commande"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- Ordre de REGLEMENT, pour distinguer un progres d'un retour en arriere.
  -- `comp` et `refunded` sont au-dela: ce sont des etats terminaux, et le
  -- declencheur `refuser_argent_sans_orders_pay` (20261124150000) exige
  -- l'autorite argent pour rendre une commande offerte ou remboursee.
  rang_ancien integer;
  rang_nouveau integer;
BEGIN
  -- Seuls les deux roles joignables par un client sont contraints. Voir
  -- l'en-tete pour la mesure de `current_user` dans chaque contexte.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- --------------------------------------------------------------------------
  -- UNE COMMANDE NE CHANGE PAS DE RESTAURANT.
  -- --------------------------------------------------------------------------
  -- Sans cette borne, les gardes ci-dessous se contournaient par un deuxieme
  -- compte. Elles jugeaient l'autorite sur `NEW.tenant_id`, soit le restaurant
  -- que l'ECRITURE propose. Quelqu'un membre de deux restaurants - gerant dans
  -- B, caissier dans A - pouvait donc viser une commande de A (le USING de la
  -- policy passe: il y detient `orders.manage`), poser `tenant_id = B` (le
  -- WITH CHECK passe: il y detient aussi `orders.manage`), et toutes les
  -- gardes interrogeaient alors son autorite argent dans B, ou il l'a.
  -- Les groupes de restaurants existent dans ce produit: ce cas n'est pas
  -- theorique.
  --
  -- Deplacer une commande d'un restaurant a l'autre est en outre une violation
  -- d'isolation en soi. Mesure faite: AUCUN chemin applicatif ne reecrit
  -- `orders.tenant_id`. La borne ne retire donc aucune capacite reelle.
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION
      'Une commande ne change pas de restaurant'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.total IS DISTINCT FROM OLD.total
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.service_charge_amount IS DISTINCT FROM OLD.service_charge_amount
  THEN
    RAISE EXCEPTION
      'Les montants d''une commande ne se reecrivent pas apres sa creation'
      USING ERRCODE = '42501';
  END IF;

  -- Contre-audit 2 du lot B2b-1 (B67): le coupon d'une commande et la trace de
  -- son rendu ne se reecrivent pas apres la creation. Le coupon est rendu par
  -- `rendre_coupon_commande` (service_role) a partir de CETTE colonne: un
  -- employe qui la reecrivait faisait rendre un coupon de son choix, y compris
  -- d'un autre restaurant.
  IF NEW.coupon_id IS DISTINCT FROM OLD.coupon_id
     OR NEW.coupon_rendu_at IS DISTINCT FROM OLD.coupon_rendu_at
  THEN
    RAISE EXCEPTION
      'Le coupon d''une commande ne se reecrit pas apres sa creation'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- Une commande REGLEE ne se deregle pas.
  -- --------------------------------------------------------------------------
  -- POURQUOI CECI PASSE AVANT LE POURBOIRE. Une premiere version ne gardait que
  -- le pourboire, et seulement quand `OLD.payment_status = 'paid'`. Elle se
  -- contournait en trois coups: repasser la commande payee en `pending`, ecrire
  -- le pourboire (OLD vaut alors `pending`, la garde ne voit rien), puis
  -- remettre `paid`. Elle ratait aussi `partial` entierement.
  --
  -- Et le dereglement ouvre bien pire que le pourboire: `markPaid` ne reagit
  -- qu'a `payment_status = 'pending'`. Un employe qui repasse une commande
  -- payee en attente peut donc la REENCAISSER, et le ledger `payments`
  -- compterait deux fois la meme recette.
  --
  -- UN RETOUR EN ARRIERE EST POURTANT LEGITIME - mesure, pas supposition.
  -- `recompute` (src/services/payment.queries.ts) rederive le statut depuis le
  -- ledger apres chaque ecriture, et peut donc repasser `paid` a `partial` ou
  -- `pending` APRES UN REMBOURSEMENT. Il tourne avec le jeton de l'employe,
  -- donc sous RLS. Mais un remboursement exige l'autorite argent
  -- (ORDER_MONEY_ROLES cote application, et un montant negatif ou un statut
  -- non-`completed` exige `has_tenant_money_permission` cote base): exempter
  -- cette autorite preserve donc exactement ce flux. Un encaissement ordinaire,
  -- lui, ne fait JAMAIS reculer le statut - il ajoute un tender positif.
  -- NULL est classe PLUS BAS que tout, et ce n'est pas un detail. Une premiere
  -- version le faisait tomber dans le `ELSE 3`, donc au-DESSUS de `paid`:
  -- passer une commande payee a NULL comptait comme un progres et etait
  -- autorise. Or `payment_status` EST nullable, et un NULL echappe au CHECK de
  -- la colonne (une contrainte est satisfaite quand elle vaut "inconnu", pas
  -- seulement quand elle est vraie). Mesure faite: une commande au statut NULL
  -- est invisible A LA FOIS des lectures de revenu (`= 'paid'`) et des impayes
  -- (`in ('pending','partial')`). Un employe pouvait donc faire DISPARAITRE
  -- une commande encaissee des deux cotes a la fois.
  rang_ancien := CASE
                   WHEN OLD.payment_status IS NULL          THEN -1
                   WHEN OLD.payment_status = 'pending'      THEN 0
                   WHEN OLD.payment_status = 'partial'      THEN 1
                   WHEN OLD.payment_status = 'paid'         THEN 2
                   ELSE 3
                 END;
  rang_nouveau := CASE
                    WHEN NEW.payment_status IS NULL         THEN -1
                    WHEN NEW.payment_status = 'pending'     THEN 0
                    WHEN NEW.payment_status = 'partial'     THEN 1
                    WHEN NEW.payment_status = 'paid'        THEN 2
                    ELSE 3
                  END;

  -- L'autorite est jugee sur le tenant PROPRIETAIRE (`OLD`), jamais sur celui
  -- que l'ecriture propose. La borne de tenant ci-dessus rend les deux egaux,
  -- mais les deux verrous valent mieux qu'un: si cette borne sautait un jour,
  -- les gardes resteraient jugees au bon endroit.
  IF rang_nouveau < rang_ancien
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Une commande reglee ne se deregle pas sans l''autorite argent'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- Le pourboire reste ecrivable A L'ENCAISSEMENT, pas apres.
  -- --------------------------------------------------------------------------
  -- Mesure: les deux seuls chemins qui l'ecrivent (`markPaid` et
  -- `applyPosFinalState`) filtrent `payment_status = 'pending'`. Un pourboire
  -- ne s'ecrit donc legitimement que sur une commande ENCORE EN ATTENTE, dans
  -- le meme UPDATE que la bascule. La borne porte sur `<> 'pending'` et non sur
  -- `= 'paid'`: sans cela, `partial`, `comp` et `refunded` passaient au travers.
  IF NEW.tip_amount IS DISTINCT FROM OLD.tip_amount
     AND coalesce(OLD.payment_status, '') <> 'pending'
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Le pourboire ne se reecrit pas sur une commande deja reglee'
      USING ERRCODE = '42501';
  END IF;

  -- Et il ne BAISSE pas, quel que soit le statut (20261124100100, constat B150,
  -- contre-audit 1). La borne ci-dessus laissait reecrire le pourboire d'une
  -- commande encore 'pending' dans les DEUX sens: un caissier effacait le
  -- pourboire laisse par le client dans la meme requete que la bascule a
  -- 'paid', avec un registre qui couvrait le total sans le pourboire. Le
  -- controle "le registre couvre le du" (20261124100000) lit le pourboire
  -- courant, donc celui que le caissier venait de baisser: l'ecart
  -- disparaissait. Mesure: aucun chemin applicatif ne baisse le pourboire sous
  -- le jeton d'un employe. `encaisser_commande` refuse un ajout negatif et ne
  -- fait qu'ajouter; la route POS tourne en service_role; il n'existe aucun
  -- ecran de correction du pourboire. Une correction reste possible par
  -- l'autorite sur l'argent (owner, admin, manager).
  IF coalesce(NEW.tip_amount, 0) < coalesce(OLD.tip_amount, 0)
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Le pourboire laisse par le client ne se baisse pas sans l''autorite argent'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- L'HORODATAGE DU PAIEMENT NE SE DEPLACE PAS.
  -- --------------------------------------------------------------------------
  -- Trouve en relisant cette garde en adversaire, pas signale. `paid_at`
  -- decide du JOUR auquel une recette est comptee: le reecrire deplace de
  -- l'argent d'une journee a l'autre dans les rapports et fait echouer un
  -- rapprochement de caisse, sans qu'aucun montant ne change.
  --
  -- Figer un `paid_at` deja pose est EXACTEMENT l'invariant que l'application
  -- s'impose: `recompute` ne l'ecrit que s'il est absent
  -- (`becomesPaid && !order.paid_at`), et `markPaid` ne touche qu'une commande
  -- `pending`. Une commande deregle puis re-reglee garde donc l'horodatage de
  -- son PREMIER paiement, ici comme dans le code.
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
     AND OLD.paid_at IS NOT NULL
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'L''horodatage du paiement ne se reecrit pas'
      USING ERRCODE = '42501';
  END IF;

  -- Et il ne s'ANTIDATE pas au PREMIER reglement non plus. La borne ci-dessus
  -- ne gardait que la reecriture d'un horodatage DEJA pose: tant qu'il etait
  -- absent, l'appelant fournissait la date de son choix dans le meme UPDATE
  -- que la bascule, et deplacait la recette d'une journee a l'autre.
  --
  -- Ici on NORMALISE plutot que de refuser, et c'est voulu: les deux chemins
  -- applicatifs envoient deja `new Date()`, donc forcer `now()` ne change rien
  -- pour eux et retire la marge de manoeuvre a un appel direct. Un refus
  -- ferait echouer un encaissement legitime pour un ecart d'horloge de
  -- quelques secondes - un prix trop eleve pour la meme protection.
  --
  -- La normalisation n'est possible que parce que ce declencheur est BEFORE:
  -- en AFTER, `NEW` n'est plus modifiable.
  IF OLD.paid_at IS NULL
     AND NEW.paid_at IS NOT NULL
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    NEW.paid_at := now();
  END IF;

  -- --------------------------------------------------------------------------
  -- LE MOYEN DE PAIEMENT NE SE REECRIT PAS APRES LE REGLEMENT.
  -- --------------------------------------------------------------------------
  -- C'est le vecteur de vol le plus classique en caisse: encaisser en ESPECES,
  -- puis reetiqueter la commande en CARTE. Plus aucune espece n'est attendue
  -- dans le tiroir, donc le comptage ne signale aucun manque, et l'argent
  -- part.
  --
  -- Le registre `payments` porte lui aussi `method` et il est IMMUABLE (aucune
  -- policy UPDATE ni DELETE, par decision de 20261107190000), donc un
  -- rapprochement fait sur le registre voit la verite. Mais la colonne de la
  -- commande est ce que lisent les ecrans et les rapports: la laisser libre,
  -- c'est laisser mentir l'affichage.
  --
  -- Mesure: `markPaid` et `applyPosFinalState` n'ecrivent la methode qu'en
  -- basculant une commande `pending`, et aucun chemin ne la reecrit ensuite.
  --
  -- EXCEPTION (20261121200400): le PREMIER enregistrement du moyen, quand une
  -- commande payee en plusieurs fois devient soldee. `recompute` ecrit alors,
  -- dans le meme UPDATE, `payment_status` de 'partial' a 'paid' et le moyen
  -- dominant du registre, jusque-la NULL. Sans cette exception, un caissier
  -- ne pouvait jamais terminer un encaissement en plusieurs fois. Rien n'est
  -- reetiquete: le moyen etait vide, et la commande ne peut pas rester
  -- 'partial' avec un moyen pose (la bascule a 'paid' est exigee).
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method
     AND coalesce(OLD.payment_status, '') <> 'pending'
     AND NOT (OLD.payment_method IS NULL
              AND coalesce(OLD.payment_status, '') = 'partial'
              AND NEW.payment_status = 'paid'
              -- Et seulement si le REGISTRE couvre le du: meme regle que
              -- `recompute` (payment.calc.ts: du = total + pourboire, net =
              -- encaisse - rembourse, solde si net > 0 et net >= du). Sans
              -- cela, un caissier passait par l'API une commande a 400 sur
              -- 1000 en 'paid' avec un moyen. Lecture sous les droits de
              -- l'appelant (SECURITY INVOKER): la politique SELECT de
              -- `payments` ouvre au membre les paiements de son restaurant.
              AND (SELECT coalesce(sum(CASE WHEN p.status = 'refunded' THEN -p.amount
                                            ELSE p.amount END), 0)
                     FROM public.payments p
                    WHERE p.order_id = OLD.id
                      AND p.tenant_id = OLD.tenant_id)
                  >= greatest(coalesce(NEW.total, 0) + coalesce(NEW.tip_amount, 0), 1))
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Le moyen de paiement ne se reecrit pas apres le reglement'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- LA DATE DE CREATION NE SE DEPLACE PAS.
  -- --------------------------------------------------------------------------
  -- Les tableaux de bord et les rapports regroupent par `created_at`: le
  -- reecrire deplace une commande d'une journee de service a l'autre. Mesure:
  -- aucun chemin applicatif ne reecrit `orders.created_at` apres l'insertion.
  IF NEW.created_at IS DISTINCT FROM OLD.created_at
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'La date de creation d''une commande ne se deplace pas'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."refuser_reecriture_montants_commande"() OWNER TO "postgres";

--
-- Name: regenerate_auto_suggestions("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."regenerate_auto_suggestions"("p_tenant_id" "uuid", "p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.item_suggestions
   WHERE tenant_id = p_tenant_id
     AND source = 'auto';

  INSERT INTO public.item_suggestions (
    tenant_id, menu_item_id, suggested_item_id, suggestion_type,
    description, display_order, is_active, source
  )
  SELECT p_tenant_id, r.menu_item_id, r.suggested_item_id, r.suggestion_type,
         NULL, COALESCE(r.display_order, 0), true, 'auto'
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb))
         AS r(menu_item_id uuid, suggested_item_id uuid, suggestion_type text, display_order integer)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.item_suggestions s
      WHERE s.tenant_id = p_tenant_id
        AND s.source = 'manual'
        AND s.menu_item_id = r.menu_item_id
        AND s.suggested_item_id = r.suggested_item_id
   );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;


ALTER FUNCTION "public"."regenerate_auto_suggestions"("p_tenant_id" "uuid", "p_rows" "jsonb") OWNER TO "postgres";

--
-- Name: registre_stock_garde_ingredients(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."registre_stock_garde_ingredients"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Seule une requete directe d'un client est visee. Dans une fonction
  -- SECURITY DEFINER du registre, current_user est le proprietaire (postgres).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.current_stock IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'current_stock: un produit nait a 0, son stock passe par les fonctions du registre'
      USING ERRCODE = '42501', HINT = 'stock_par_registre';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.current_stock IS DISTINCT FROM OLD.current_stock THEN
    RAISE EXCEPTION 'current_stock ne change que par les fonctions du registre de stock'
      USING ERRCODE = '42501', HINT = 'stock_par_registre';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."registre_stock_garde_ingredients"() OWNER TO "postgres";

--
-- Name: reminder_coach_items("uuid", timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reminder_coach_items"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_split" timestamp with time zone, "p_until" timestamp with time zone) RETURNS TABLE("name" "text", "before_qty" bigint, "last_week_qty" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT oi.item_name,
         coalesce(sum(oi.quantity) FILTER (WHERE oi.created_at < p_split), 0)::bigint,
         coalesce(sum(oi.quantity) FILTER (WHERE oi.created_at >= p_split), 0)::bigint
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = p_tenant_id
  WHERE oi.tenant_id = p_tenant_id
    AND o.status <> 'cancelled'
    AND oi.created_at >= p_since
    AND oi.created_at < p_until
  GROUP BY oi.item_name;
$$;


ALTER FUNCTION "public"."reminder_coach_items"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_split" timestamp with time zone, "p_until" timestamp with time zone) OWNER TO "postgres";

--
-- Name: reminder_coach_slots("uuid", timestamp with time zone, timestamp with time zone, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reminder_coach_slots"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone, "p_tz" "text") RETURNS TABLE("dow" integer, "hour" integer, "orders" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT extract(dow FROM o.created_at AT TIME ZONE p_tz)::integer,
         extract(hour FROM o.created_at AT TIME ZONE p_tz)::integer,
         count(*)
  FROM public.orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.status <> 'cancelled'
    AND o.created_at >= p_since
    AND o.created_at < p_until
  GROUP BY 1, 2;
$$;


ALTER FUNCTION "public"."reminder_coach_slots"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone, "p_tz" "text") OWNER TO "postgres";

--
-- Name: reminder_rule_stats(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reminder_rule_stats"("p_since" timestamp with time zone, "p_resolved_within_min" integer) RETURNS TABLE("rule" "text", "sent" bigint, "escalated" bigint, "restaurants" bigint, "resolved_within" bigint, "median_minutes" double precision, "notifications" bigint, "opened" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT r.rule,
         count(*),
         count(*) FILTER (WHERE r.level = 2),
         count(DISTINCT r.tenant_id),
         count(*) FILTER (
           WHERE r.resolved_at IS NOT NULL
             AND r.resolved_at - r.created_at <= make_interval(mins => p_resolved_within_min)
         ),
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY extract(epoch FROM r.resolved_at - r.created_at) / 60
         ) FILTER (WHERE r.resolved_at IS NOT NULL),
         count(DISTINCT r.notification_id),
         count(DISTINCT r.notification_id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.notification_reads nr WHERE nr.notification_id = r.notification_id
           )
         )
  FROM public.reminders r
  WHERE r.created_at >= p_since
  GROUP BY r.rule;
$$;


ALTER FUNCTION "public"."reminder_rule_stats"("p_since" timestamp with time zone, "p_resolved_within_min" integer) OWNER TO "postgres";

--
-- Name: rendre_coupon_commande("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."rendre_coupon_commande"("p_order_id" "uuid", "p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_coupon uuid;
  v_status text;
  v_rendu timestamptz;
BEGIN
  SELECT o.coupon_id, o.status, o.coupon_rendu_at
    INTO v_coupon, v_status, v_rendu
    FROM public.orders o
   WHERE o.id = p_order_id AND o.tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'cancelled'
     OR v_coupon IS NULL OR v_rendu IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Le coupon doit etre celui du MEME restaurant.
  UPDATE public.coupons c
     SET current_uses = GREATEST(c.current_uses - 1, 0), updated_at = now()
   WHERE c.id = v_coupon AND c.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.orders SET coupon_rendu_at = now()
   WHERE id = p_order_id AND tenant_id = p_tenant_id;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."rendre_coupon_commande"("p_order_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: reorder_categories("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reorder_categories"("p_tenant_id" "uuid", "p_updates" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_expected integer;
  v_count integer;
BEGIN
  IF p_tenant_id IS NULL OR p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'reorder_invalid_input' USING ERRCODE = '22023';
  END IF;

  v_expected := jsonb_array_length(p_updates);
  IF v_expected = 0 THEN
    RETURN 0;
  END IF;
  IF v_expected > 500 THEN
    RAISE EXCEPTION 'reorder_too_many_rows' USING ERRCODE = '22023';
  END IF;

  UPDATE public.categories c
     SET display_order = u.display_order
    FROM jsonb_to_recordset(p_updates) AS u(id uuid, display_order integer)
   WHERE c.id = u.id
     AND c.tenant_id = p_tenant_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION 'reorder_rows_missing' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_count;
END
$$;


ALTER FUNCTION "public"."reorder_categories"("p_tenant_id" "uuid", "p_updates" "jsonb") OWNER TO "postgres";

--
-- Name: reorder_menus("uuid", "uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reorder_menus"("p_tenant_id" "uuid", "p_ordered_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_expected integer;
  v_count integer;
BEGIN
  IF p_tenant_id IS NULL OR p_ordered_ids IS NULL THEN
    RAISE EXCEPTION 'reorder_invalid_input' USING ERRCODE = '22023';
  END IF;

  v_expected := COALESCE(cardinality(p_ordered_ids), 0);
  IF v_expected = 0 THEN
    RETURN 0;
  END IF;
  IF v_expected > 500 THEN
    RAISE EXCEPTION 'reorder_too_many_rows' USING ERRCODE = '22023';
  END IF;

  UPDATE public.menus m
     SET display_order = (o.ord - 1)::integer
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, ord)
   WHERE m.id = o.id
     AND m.tenant_id = p_tenant_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION 'reorder_rows_missing' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_count;
END
$$;


ALTER FUNCTION "public"."reorder_menus"("p_tenant_id" "uuid", "p_ordered_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: request_account_deletion(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."request_account_deletion"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  insert into account_deletion_requests (user_id, email, restaurants)
  select v_uid,
         (select email from auth.users where id = v_uid),
         coalesce((select string_agg(t.name, ', ' order by t.name)
                   from admin_users au join tenants t on t.id = au.tenant_id
                   where au.user_id = v_uid), '')
  on conflict (user_id) do nothing;

  if found then
    insert into notifications (tenant_id, user_id, type, title, body, read)
    select op.tenant_id, op.user_id, 'info', 'Demande de suppression de compte',
           r.email || case when r.restaurants <> '' then ' (' || r.restaurants || ')' else '' end
             || '. A traiter sous 30 jours : table account_deletion_requests.',
           false
    from admin_users op, account_deletion_requests r
    where r.user_id = v_uid
      and (op.is_super_admin is true or op.role = 'super_admin')
      and op.is_active is true and op.tenant_id is not null;
  end if;
  return 'requested';
end;
$$;


ALTER FUNCTION "public"."request_account_deletion"() OWNER TO "postgres";

--
-- Name: reserver_alerte_nouvelle_connexion(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reserver_alerte_nouvelle_connexion"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reserve boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Premiere connexion du compte depuis la mise en service de l'alerte: aucun
  -- appareil n'est encore connu (le cookie n'existait pas), on enregistre sans
  -- alerter. Sans cette regle, CHAQUE utilisateur existant recevait une alerte
  -- "nouvelle connexion" a sa premiere connexion apres le deploiement.
  IF NOT EXISTS (
    SELECT 1 FROM public.alertes_nouvelle_connexion WHERE user_id = v_uid
  ) THEN
    INSERT INTO public.alertes_nouvelle_connexion (user_id, derniere_alerte_at)
    VALUES (v_uid, now() - interval '2 hours')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN false;
  END IF;

  INSERT INTO public.alertes_nouvelle_connexion AS a (user_id, derniere_alerte_at)
  VALUES (v_uid, now())
  ON CONFLICT (user_id) DO UPDATE
    SET derniere_alerte_at = EXCLUDED.derniere_alerte_at
    WHERE a.derniere_alerte_at < now() - interval '1 hour'
  RETURNING true INTO v_reserve;

  RETURN coalesce(v_reserve, false);
END;
$$;


ALTER FUNCTION "public"."reserver_alerte_nouvelle_connexion"() OWNER TO "postgres";

--
-- Name: FUNCTION "reserver_alerte_nouvelle_connexion"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."reserver_alerte_nouvelle_connexion"() IS 'Reserve, pour le compte appelant (auth.uid()), le droit d envoyer une alerte de nouvelle connexion: false a la toute premiere connexion (amorcage, aucun appareil connu), puis true au plus une fois par heure.';


--
-- Name: reset_tenant_data("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    orders_deleted int := 0;
    items_deleted int := 0;
    movements_deleted int := 0;
    coupons_reset int := 0;
  BEGIN
    IF p_tenant_id IS NULL THEN
      RAISE EXCEPTION 'p_tenant_id is required' USING ERRCODE = '22023';
    END IF;

    IF p_reset_type NOT IN ('orders', 'statistics', 'all') THEN
      RAISE EXCEPTION 'Invalid reset_type: %', p_reset_type USING ERRCODE = '22023';
    END IF;

    IF p_reset_type = 'orders' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;

    ELSIF p_reset_type = 'statistics' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
          AND o.status IN ('delivered', 'cancelled')
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id
          AND status IN ('delivered', 'cancelled') RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;

    ELSIF p_reset_type = 'all' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;
      -- B76: la table s'appelle stock_movements (inventory_movements n'existe
      -- pas: le type 'all' echouait toujours).
      WITH del_mov AS (
        DELETE FROM stock_movements WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO movements_deleted FROM del_mov;
      -- Le registre repart du stock actuel, qui n'est pas efface: une ligne
      -- d'ouverture par ingredient a stock non nul, pour que registre et stock
      -- concordent (verify_stock_ledger). Seulement si le restaurant a le
      -- module Stock: sans lui, le verrou de plan refuse ces lignes, et un
      -- reconcile_stock_ledger les ecrira le jour ou il le reprend.
      IF public.tenant_effective_plan(p_tenant_id) IN ('pro', 'business', 'enterprise') THEN
        INSERT INTO stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes)
        SELECT i.tenant_id, i.id, 'opening', i.current_stock, 'Remise a zero: stock de depart'
          FROM ingredients i
         WHERE i.tenant_id = p_tenant_id
           AND i.current_stock <> 0;
      END IF;
      WITH upd_coupons AS (
        UPDATE coupons SET current_uses = 0 WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO coupons_reset FROM upd_coupons;
    END IF;

    RETURN json_build_object(
      'reset_type', p_reset_type,
      'orders_deleted', orders_deleted,
      'items_deleted', items_deleted,
      'movements_deleted', movements_deleted,
      'coupons_reset', coupons_reset
    );
  END;
  $$;


ALTER FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") OWNER TO "postgres";

--
-- Name: restock_order("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INT := 0;
  v_mov RECORD;
  v_new_stock NUMERIC(10,3);
  -- Ingredients effectivement recredites par CET appel, pour ne recalculer la
  -- disponibilite qu'apres la boucle (voir la note d'ordre de verrous).
  v_ids uuid[] := '{}';
  v_deltas numeric[] := '{}';
  v_i INT;
BEGIN
  -- B123: verrou par commande, comme destock_order. Deux annulations
  -- simultanees lisaient toutes deux "pas encore de order_restock" avant que
  -- la premiere ne valide, et la seconde recreditait une deuxieme fois. Avec
  -- le verrou, la seconde attend la fin de la premiere puis voit ses lignes.
  PERFORM pg_advisory_xact_lock(hashtext('restock_order:' || p_order_id::text));

  FOR v_mov IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS net_destocked
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
    HAVING SUM(sm.quantity) < 0
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
    WHERE id = v_mov.ingredient_id
      AND tenant_id = p_tenant_id
    RETURNING current_stock INTO v_new_stock;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES (
      p_tenant_id, v_mov.ingredient_id, 'order_restock',
      ABS(v_mov.net_destocked), p_order_id, 'Annulation / remboursement commande', p_created_by
    );

    v_ids := v_ids || v_mov.ingredient_id;
    v_deltas := v_deltas || ABS(v_mov.net_destocked);
    v_count := v_count + 1;
  END LOOP;

  -- Meme raison que dans destock_order: `menu_items` apres `ingredients`,
  -- jamais entre deux. Les deltas sont accumules plutot que relus depuis le
  -- ledger, pour ne traiter QUE les ingredients recredites par cet appel (un
  -- restockage partiel anterieur ne doit pas etre rejoue comme une transition).
  FOR v_i IN 1 .. COALESCE(array_length(v_ids, 1), 0) LOOP
    SELECT current_stock INTO v_new_stock
    FROM public.ingredients
    WHERE id = v_ids[v_i] AND tenant_id = p_tenant_id;
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_ids[v_i], v_new_stock - v_deltas[v_i], v_new_stock
    );
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: revoke_user_sessions("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  revoked integer;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  DELETE FROM auth.refresh_tokens
    WHERE user_id = p_user_id::text AND session_id IS NULL;
  RETURN revoked;
END;
$$;


ALTER FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: save_stock_count_lines("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_line jsonb;
  v_status text;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    IF (v_line->>'counted_qty') IS NOT NULL AND (v_line->>'counted_qty')::numeric < 0 THEN
      RAISE EXCEPTION 'INVALID_COUNTED_QTY' USING ERRCODE = '22023';
    END IF;
    UPDATE public.stock_count_lines
      SET counted_qty = NULLIF(v_line->>'counted_qty', '')::numeric
      WHERE count_id = p_count_id
        AND tenant_id = p_tenant_id
        AND ingredient_id = (v_line->>'ingredient_id')::uuid;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") OWNER TO "postgres";

--
-- Name: set_opening_stock("uuid", "uuid", numeric, "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_before NUMERIC(10,3);
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  -- Lock the row and read the prior value so the ledger records the DELTA,
  -- keeping SUM(stock_movements.quantity) == ingredients.current_stock.
  SELECT current_stock INTO v_before
  FROM public.ingredients
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.ingredients
  SET current_stock = p_quantity, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by)
  VALUES (p_tenant_id, p_ingredient_id, 'opening', p_quantity - v_before, 'Stock d''ouverture', v_author);
END;
$$;


ALTER FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: set_order_item_tenant_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_order_item_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT o.tenant_id INTO NEW.tenant_id FROM public.orders o WHERE o.id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_order_item_tenant_id"() OWNER TO "postgres";

--
-- Name: set_qr_designs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_qr_designs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_qr_designs_updated_at"() OWNER TO "postgres";

--
-- Name: set_recipe_tx("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_line jsonb; v_ingredient_id uuid; v_qty numeric;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND mi.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'MENU_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::uuid;
    v_qty := (v_line->>'quantity_needed')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ingredients i WHERE i.id = v_ingredient_id AND i.tenant_id = p_tenant_id AND i.is_active = true) THEN
      RAISE EXCEPTION 'INVALID_INGREDIENT' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  DELETE FROM public.recipes WHERE menu_item_id = p_menu_item_id AND tenant_id = p_tenant_id;
  INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed, notes)
  SELECT p_tenant_id, p_menu_item_id, (line->>'ingredient_id')::uuid, (line->>'quantity_needed')::numeric, NULLIF(line->>'notes','')
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS line;

  UPDATE public.menu_items mi
  SET is_available = true,
      masque_par_stock = false
  WHERE mi.id = p_menu_item_id
    AND mi.tenant_id = p_tenant_id
    AND mi.is_available = false
    -- B143: seul un plat masque PAR LE STOCK revient a la carte; un plat
    -- retire a la main par le restaurateur reste retire.
    AND mi.masque_par_stock
    AND NOT EXISTS (
      SELECT 1
      FROM public.recipes r
      JOIN public.ingredients i
        ON i.id = r.ingredient_id AND i.tenant_id = p_tenant_id
      WHERE r.menu_item_id = mi.id
        AND r.tenant_id = p_tenant_id
        AND i.is_active = true
        AND i.current_stock <= 0
    );
END; $$;


ALTER FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") OWNER TO "postgres";

--
-- Name: set_trial_end_date(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_trial_end_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.subscription_status = 'trial' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_trial_end_date"() OWNER TO "postgres";

--
-- Name: stamp_order_ready_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."stamp_order_ready_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' THEN
    NEW.ready_at := now();
  ELSIF NEW.status IN ('pending', 'confirmed', 'preparing') THEN
    -- Renvoyee en cuisine: elle n'est plus prete, son prochain "prete" repart de zero.
    NEW.ready_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."stamp_order_ready_at"() OWNER TO "postgres";

--
-- Name: sync_menu_availability("uuid", "uuid", numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."sync_menu_availability"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_stock_before" numeric, "p_stock_after" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_stock_before IS NULL OR p_stock_after IS NULL THEN
    RETURN;
  END IF;

  -- L'ingredient vient de tomber en rupture: les plats qui en dependent sortent
  -- de la carte.
  IF p_stock_after <= 0 AND p_stock_before > 0 THEN
    UPDATE public.menu_items
    SET is_available = false,
        -- B143: la cause est notee, pour ne rallumer que ce que le stock a eteint.
        masque_par_stock = true
    WHERE tenant_id = p_tenant_id
      AND is_available = true
      AND id IN (
        SELECT r.menu_item_id FROM public.recipes r
        WHERE r.ingredient_id = p_ingredient_id AND r.tenant_id = p_tenant_id
      );
    RETURN;
  END IF;

  -- L'ingredient vient de sortir de rupture: on ne rallume que les plats
  -- entierement servables.
  IF p_stock_after > 0 AND p_stock_before <= 0 THEN
    UPDATE public.menu_items mi
    SET is_available = true,
        masque_par_stock = false
    WHERE mi.tenant_id = p_tenant_id
      AND mi.is_available = false
      -- B143: jamais un plat que le restaurateur a retire lui-meme.
      AND mi.masque_par_stock
      AND EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.menu_item_id = mi.id
          AND r.tenant_id = p_tenant_id
          AND r.ingredient_id = p_ingredient_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.recipes r2
        JOIN public.ingredients i2
          ON i2.id = r2.ingredient_id AND i2.tenant_id = p_tenant_id
        WHERE r2.menu_item_id = mi.id
          AND r2.tenant_id = p_tenant_id
          AND i2.is_active = true
          AND i2.current_stock <= 0
      );
  END IF;
END;
$$;


ALTER FUNCTION "public"."sync_menu_availability"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_stock_before" numeric, "p_stock_after" numeric) OWNER TO "postgres";

--
-- Name: tables_nom_pas_numero_autre(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."tables_nom_pas_numero_autre"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tables t
     WHERE t.tenant_id = NEW.tenant_id
       AND t.id <> NEW.id
       AND t.table_number = NEW.display_name
  ) THEN
    RAISE EXCEPTION 'table_display_name_is_other_table_number: %', NEW.display_name
      USING ERRCODE = '23505';
  END IF;
  -- Sens inverse: un numero egal au nom d'une autre table.
  IF EXISTS (
    SELECT 1 FROM public.tables t
     WHERE t.tenant_id = NEW.tenant_id
       AND t.id <> NEW.id
       AND t.display_name = NEW.table_number
  ) THEN
    RAISE EXCEPTION 'table_number_is_other_table_display_name: %', NEW.table_number
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tables_nom_pas_numero_autre"() OWNER TO "postgres";

--
-- Name: tenant_effective_plan("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."tenant_effective_plan"("p_tenant_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN t.subscription_status = 'trial'
         AND t.trial_ends_at IS NOT NULL
         AND t.trial_ends_at > now() THEN 'business'
    WHEN t.subscription_status = 'trial' THEN 'starter'
    WHEN t.subscription_status IS NULL
         OR t.subscription_status NOT IN ('trial', 'active', 'past_due') THEN 'starter'
    WHEN t.subscription_plan IN ('starter', 'pro', 'business', 'enterprise')
         THEN t.subscription_plan
    ELSE 'starter'
  END
  FROM (SELECT 1) AS one
  LEFT JOIN tenants t ON t.id = p_tenant_id;
$$;


ALTER FUNCTION "public"."tenant_effective_plan"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: tenant_permission_level("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."tenant_permission_level"("p_tenant" "uuid", "p_perm" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_niveau text;
BEGIN
  IF p_perm IS NULL OR NOT (p_perm = ANY (private.codes_droits())) THEN RETURN NULL; END IF;
  IF NOT public.mfa_satisfait() THEN RETURN NULL; END IF;
  SELECT n.niveau INTO v_niveau
  FROM public.admin_users AS au
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN 'owner' = ANY (au.postes) THEN 'full'
      WHEN au.permission_overrides ? p_perm THEN
        CASE WHEN (au.permission_overrides -> p_perm) = 'true'::jsonb THEN 'full' END
      ELSE (
        SELECT CASE max(CASE x.niveau WHEN 'full' THEN 2 WHEN 'limited' THEN 1 ELSE 0 END)
                 WHEN 2 THEN 'full' WHEN 1 THEN 'limited' END
        FROM (
          SELECT CASE
                   WHEN pp.permissions ? p_perm THEN
                     CASE WHEN (pp.permissions -> p_perm) = 'true'::jsonb THEN 'full' END
                   ELSE m.niveau
                 END AS niveau
          FROM unnest(au.postes) AS p(poste)
          LEFT JOIN public.poste_permissions AS pp
                 ON pp.tenant_id = au.tenant_id AND pp.poste = p.poste
          LEFT JOIN private.matrice_postes() AS m
                 ON m.poste = p.poste AND m.droit = p_perm
        ) AS x
      )
    END AS niveau
  ) AS n
  WHERE au.user_id = (SELECT auth.uid())
    AND au.tenant_id = p_tenant
    AND au.is_active IS TRUE
    AND au.deleted_at IS NULL
    AND n.niveau IS NOT NULL
  ORDER BY (n.niveau = 'full') DESC
  LIMIT 1;
  RETURN v_niveau;
END;
$$;


ALTER FUNCTION "public"."tenant_permission_level"("p_tenant" "uuid", "p_perm" "text") OWNER TO "postgres";

--
-- Name: tenants_avec_droit("text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."tenants_avec_droit"("p_perm" "text", "p_niveau_min" "text" DEFAULT 'full'::"text") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT coalesce(array_agg(au.tenant_id), '{}'::uuid[])
  FROM public.admin_users AS au
  WHERE au.user_id = (SELECT auth.uid())
    AND au.is_active IS TRUE
    AND au.deleted_at IS NULL
    AND CASE p_niveau_min
          WHEN 'full' THEN public.tenant_permission_level(au.tenant_id, p_perm) = 'full'
          WHEN 'limited' THEN public.tenant_permission_level(au.tenant_id, p_perm) IS NOT NULL
          ELSE false
        END;
$$;


ALTER FUNCTION "public"."tenants_avec_droit"("p_perm" "text", "p_niveau_min" "text") OWNER TO "postgres";

--
-- Name: unclaim_coupon_usage("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM coupons c
      WHERE c.id = p_coupon_id
        AND c.tenant_id = ANY (public.get_my_tenant_ids_array())
        AND public.has_tenant_write_permission(c.tenant_id, 'orders.pay')
    )
  ) THEN
    RAISE EXCEPTION 'access denied: coupon does not belong to caller tenant'
      USING ERRCODE = '42501';
  END IF;
  UPDATE coupons
  SET current_uses = GREATEST(current_uses - 1, 0), updated_at = NOW()
  WHERE id = p_coupon_id;
END;
$$;


ALTER FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") OWNER TO "postgres";

--
-- Name: update_ingredients_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_ingredients_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ingredients_updated_at"() OWNER TO "postgres";

--
-- Name: update_menus_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_menus_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_menus_updated_at"() OWNER TO "postgres";

--
-- Name: update_suppliers_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_suppliers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_suppliers_updated_at"() OWNER TO "postgres";

--
-- Name: update_tenant_supports_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_tenant_supports_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."update_tenant_supports_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: update_user_preferences_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_user_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_preferences_updated_at"() OWNER TO "postgres";

--
-- Name: venues_tenant_move_keeps_menus(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."venues_tenant_move_keeps_menus"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    -- Contre-audit F1: meme verrou que menus_same_tenant_links, sur les deux
    -- restaurants, le plus petit identifiant d'abord.
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(LEAST(OLD.tenant_id, NEW.tenant_id)::text));
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(GREATEST(OLD.tenant_id, NEW.tenant_id)::text));
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id AND EXISTS (
    SELECT 1 FROM public.menus m
    WHERE m.venue_id = NEW.id AND m.tenant_id <> NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'VENUE_MOVE_ORPHANS_MENUS: menus would point to a venue of another tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."venues_tenant_move_keeps_menus"() OWNER TO "postgres";

--
-- Name: verify_stock_ledger("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") RETURNS TABLE("ingredient_id" "uuid", "name" "text", "current_stock" numeric, "ledger_sum" numeric, "drift" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.current_stock,
    COALESCE(SUM(sm.quantity), 0)::numeric(10, 3),
    (i.current_stock - COALESCE(SUM(sm.quantity), 0))::numeric(10, 3)
  FROM public.ingredients i
  LEFT JOIN public.stock_movements sm
    ON sm.ingredient_id = i.id AND sm.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.current_stock
  HAVING (i.current_stock - COALESCE(SUM(sm.quantity), 0)) <> 0
  ORDER BY i.name;
END;
$$;


ALTER FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: account_deletion_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."account_deletion_requests" (
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "restaurants" "text" DEFAULT ''::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."account_deletion_requests" OWNER TO "postgres";

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."admin_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_login" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_super_admin" boolean DEFAULT false,
    "phone" character varying(50),
    "last_login_at" timestamp with time zone,
    "login_count" integer DEFAULT 0,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "banned_at" timestamp with time zone,
    "banned_by" "uuid",
    "ban_reason" "text",
    "postes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "permission_overrides" "jsonb",
    CONSTRAINT "admin_users_overrides_check" CHECK ((("permission_overrides" IS NULL) OR "private"."droits_valides"("permission_overrides"))),
    CONSTRAINT "admin_users_postes_check" CHECK (("postes" <@ ARRAY['owner'::"text", 'manager'::"text", 'chef'::"text", 'cashier'::"text", 'bartender'::"text", 'reception'::"text", 'waiter'::"text", 'cook'::"text", 'crew'::"text", 'sales'::"text", 'production'::"text"])),
    CONSTRAINT "admin_users_postes_non_vide" CHECK ((("cardinality"("postes") >= 1) OR ("role" = 'super_admin'::"text") OR ("is_super_admin" IS TRUE))),
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'cashier'::"text", 'chef'::"text", 'waiter'::"text", 'super_admin'::"text", 'bartender'::"text", 'reception'::"text", 'cook'::"text", 'crew'::"text", 'sales'::"text", 'production'::"text"])))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";

--
-- Name: adresses_email_bloquees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."adresses_email_bloquees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_hash" "text" NOT NULL,
    "raison" "text" NOT NULL,
    "evenement_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "adresses_email_bloquees_evenement_check" CHECK ((("evenement_id" IS NULL) OR (("length"("evenement_id") >= 1) AND ("length"("evenement_id") <= 200)))),
    CONSTRAINT "adresses_email_bloquees_hash_check" CHECK (("email_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "adresses_email_bloquees_raison_check" CHECK (("raison" = ANY (ARRAY['rebond_definitif'::"text", 'plainte'::"text"])))
);


ALTER TABLE "public"."adresses_email_bloquees" OWNER TO "postgres";

--
-- Name: TABLE "adresses_email_bloquees"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."adresses_email_bloquees" IS 'Adresses en rebond definitif ou en plainte (empreinte SHA-256 de l adresse en minuscules). Ecrit et lu par service_role seulement.';


--
-- Name: ads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "link" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ads_link_http" CHECK ((("link" IS NULL) OR ("link" ~* '^https?://'::"text")))
);


ALTER TABLE "public"."ads" OWNER TO "postgres";

--
-- Name: ai_credits_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_credits_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "delta" integer NOT NULL,
    "reason" "text" NOT NULL,
    "external_ref" "text",
    "menu_item_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_credits_ledger_reason_check" CHECK (("reason" = ANY (ARRAY['purchase_stripe'::"text", 'purchase_wave'::"text", 'purchase_orange_money'::"text", 'monthly_grant'::"text", 'remove_bg'::"text", 'bg_gen'::"text", 'refund'::"text", 'admin_adjustment'::"text"])))
);


ALTER TABLE "public"."ai_credits_ledger" OWNER TO "postgres";

--
-- Name: ai_photo_credits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_photo_credits" (
    "tenant_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "monthly_grant" integer DEFAULT 0 NOT NULL,
    "last_grant_at" timestamp with time zone,
    "lifetime_used" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_photo_credits_balance_check" CHECK (("balance" >= 0))
);


ALTER TABLE "public"."ai_photo_credits" OWNER TO "postgres";

--
-- Name: alertes_nouvelle_connexion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."alertes_nouvelle_connexion" (
    "user_id" "uuid" NOT NULL,
    "derniere_alerte_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."alertes_nouvelle_connexion" OWNER TO "postgres";

--
-- Name: TABLE "alertes_nouvelle_connexion"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."alertes_nouvelle_connexion" IS 'Date de la derniere alerte de nouvelle connexion par compte (plafond 1 par heure). Ecrit par reserver_alerte_nouvelle_connexion() seulement.';


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "title_en" "text",
    "description" "text",
    "description_en" "text",
    "image_url" "text",
    "start_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_date" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "user_email" "text",
    "user_role" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "metadata" "jsonb"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "venue_id" "uuid",
    "name" "text" NOT NULL,
    "name_en" "text",
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "menu_id" "uuid",
    "preparation_zone" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "is_featured_on_home" boolean DEFAULT false NOT NULL,
    "icon" "text",
    "image_url" "text",
    CONSTRAINT "categories_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";

--
-- Name: COLUMN "categories"."is_featured_on_home"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."categories"."is_featured_on_home" IS 'When TRUE, this category is displayed in the client home shortcut grid. Restaurateurs pick explicitly which categories to highlight.';


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."coupon_redemptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "coupon_id" "uuid",
    "order_id" "uuid",
    "discount_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coupon_redemptions" OWNER TO "postgres";

--
-- Name: coupons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "code" character varying(50) NOT NULL,
    "discount_type" character varying(20) NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "min_order_amount" numeric(10,2) DEFAULT 0,
    "max_discount_amount" numeric(10,2),
    "valid_from" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "max_uses" integer,
    "current_uses" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coupons_discount_type_check" CHECK ((("discount_type")::"text" = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying])::"text"[]))),
    CONSTRAINT "coupons_discount_value_check" CHECK (("discount_value" >= (0)::numeric))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";

--
-- Name: cron_heartbeats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."cron_heartbeats" (
    "job" "text" NOT NULL,
    "schedule" "text" NOT NULL,
    "last_run_at" timestamp with time zone NOT NULL,
    "last_status" "text" NOT NULL,
    "last_duration_ms" integer NOT NULL,
    CONSTRAINT "cron_heartbeats_last_duration_ms_check" CHECK (("last_duration_ms" >= 0)),
    CONSTRAINT "cron_heartbeats_last_status_check" CHECK (("last_status" = ANY (ARRAY['ok'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."cron_heartbeats" OWNER TO "postgres";

--
-- Name: dish_photo_drafts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."dish_photo_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "device_id" "text",
    "exif_taken_at" timestamp with time zone,
    "attached_menu_item_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "dish_photo_drafts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'attached'::"text", 'discarded'::"text"])))
);


ALTER TABLE "public"."dish_photo_drafts" OWNER TO "postgres";

--
-- Name: email_unsubscribes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."email_unsubscribes" (
    "email_normalized" "text" NOT NULL,
    "unsubscribed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_unsubscribes_normalized_check" CHECK ((("email_normalized" = "lower"("btrim"("email_normalized"))) AND (("char_length"("email_normalized") >= 3) AND ("char_length"("email_normalized") <= 320)) AND (POSITION(('@'::"text") IN ("email_normalized")) > 1)))
);


ALTER TABLE "public"."email_unsubscribes" OWNER TO "postgres";

--
-- Name: TABLE "email_unsubscribes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."email_unsubscribes" IS 'Adresses desabonnees des relances commerciales (inactivite, fin d essai, premiere et dixieme commande). Ecrite par la route /api/email/unsubscribe (service_role, adresse issue d un jeton verifie), lue avant chaque relance. Jamais lue par un e-mail transactionnel. Aucun acces anon/authenticated.';


--
-- Name: flutterwave_anomalies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."flutterwave_anomalies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "payment_id" "uuid",
    "flw_transaction_id" bigint NOT NULL,
    "tx_ref" "text",
    "kind" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "amount" numeric,
    "currency" "text",
    "detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolution_note" "text",
    CONSTRAINT "flutterwave_anomalies_amount_check" CHECK ((("amount" IS NULL) OR ("amount" >= (0)::numeric))),
    CONSTRAINT "flutterwave_anomalies_kind_check" CHECK (("kind" = ANY (ARRAY['refund_due'::"text", 'provider_mismatch'::"text", 'paid_period_not_active'::"text"]))),
    CONSTRAINT "flutterwave_anomalies_reason_check" CHECK ((("length"("reason") >= 1) AND ("length"("reason") <= 200)))
);


ALTER TABLE "public"."flutterwave_anomalies" OWNER TO "postgres";

--
-- Name: TABLE "flutterwave_anomalies"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."flutterwave_anomalies" IS 'Anomalies d encaissement Flutterwave (remboursements dus, ecarts avec le prestataire). Ecrit par service_role, lu par le super administrateur seulement.';


--
-- Name: flutterwave_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."flutterwave_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tx_ref" "text" NOT NULL,
    "flw_transaction_id" bigint,
    "plan" "text" NOT NULL,
    "billing_interval" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_link" "text",
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "reminder_d7_at" timestamp with time zone,
    "reminder_d1_at" timestamp with time zone,
    "anchor_day" smallint,
    "last_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "flutterwave_payments_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "flutterwave_payments_currency_check" CHECK (("currency" = ANY (ARRAY['XOF'::"text", 'XAF'::"text"]))),
    CONSTRAINT "flutterwave_payments_etat_complet" CHECK (((("status" = 'pending'::"text") AND ("flw_transaction_id" IS NULL) AND ("period_start" IS NULL) AND ("period_end" IS NULL)) OR (("status" = 'successful'::"text") AND ("flw_transaction_id" IS NOT NULL) AND ("period_start" IS NOT NULL) AND ("period_end" IS NOT NULL)) OR (("status" ~~ 'rejected\_%'::"text") AND ("flw_transaction_id" IS NOT NULL) AND ("period_start" IS NULL) AND ("period_end" IS NULL)))),
    CONSTRAINT "flutterwave_payments_interval_check" CHECK (("billing_interval" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "flutterwave_payments_plan_check" CHECK (("plan" = ANY (ARRAY['starter'::"text", 'pro'::"text", 'business'::"text"]))),
    CONSTRAINT "flutterwave_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'successful'::"text", 'rejected_conflict'::"text", 'rejected_plan_change'::"text", 'rejected_expired'::"text", 'rejected_blocked'::"text"])))
);


ALTER TABLE "public"."flutterwave_payments" OWNER TO "postgres";

--
-- Name: TABLE "flutterwave_payments"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."flutterwave_payments" IS 'Registre des paiements d abonnement Flutterwave (mobile money, carte). Une ligne par tentative, creee avant l appel a Flutterwave avec le prix attendu. Ecrit UNIQUEMENT par service_role.';


--
-- Name: house_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."house_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settled_at" timestamp with time zone,
    "settled_by" "uuid",
    CONSTRAINT "house_accounts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."house_accounts" OWNER TO "postgres";

--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT 'pièce'::"text" NOT NULL,
    "current_stock" numeric(10,3) DEFAULT 0 NOT NULL,
    "min_stock_alert" numeric(10,3) DEFAULT 0 NOT NULL,
    "cost_per_unit" numeric(10,2) DEFAULT 0 NOT NULL,
    "category" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purchase_unit" "text",
    "units_per_purchase" numeric(10,3) DEFAULT 1 NOT NULL,
    CONSTRAINT "ingredients_unit_check" CHECK (("unit" = ANY (ARRAY['kg'::"text", 'L'::"text", 'pièce'::"text", 'cl'::"text", 'g'::"text", 'bouteille'::"text"]))),
    CONSTRAINT "ingredients_units_per_purchase_positive" CHECK (("units_per_purchase" > (0)::numeric))
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";

--
-- Name: COLUMN "ingredients"."purchase_unit"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ingredients"."purchase_unit" IS 'Optional purchasing-unit label (casier, sac, carton). NULL = purchased in base unit.';


--
-- Name: COLUMN "ingredients"."units_per_purchase"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ingredients"."units_per_purchase" IS 'Base units (ingredients.unit) contained in one purchase_unit. Default 1.';


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "postes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "permission_overrides" "jsonb",
    CONSTRAINT "invitations_overrides_check" CHECK ((("permission_overrides" IS NULL) OR "private"."droits_valides"("permission_overrides"))),
    CONSTRAINT "invitations_postes_check" CHECK (("postes" <@ ARRAY['manager'::"text", 'chef'::"text", 'cashier'::"text", 'bartender'::"text", 'reception'::"text", 'waiter'::"text", 'cook'::"text", 'crew'::"text", 'sales'::"text", 'production'::"text"])),
    CONSTRAINT "invitations_postes_non_vide" CHECK (("cardinality"("postes") >= 1)),
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'cashier'::"text", 'chef'::"text", 'waiter'::"text", 'bartender'::"text", 'reception'::"text", 'cook'::"text", 'crew'::"text", 'sales'::"text", 'production'::"text"]))),
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";

--
-- Name: item_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "name" character varying(200) NOT NULL,
    "name_en" character varying(200),
    "price" numeric(10,2) DEFAULT 0,
    "is_available" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "prices" "jsonb",
    CONSTRAINT "item_modifiers_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."item_modifiers" OWNER TO "postgres";

--
-- Name: item_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "name_fr" "text" NOT NULL,
    "name_en" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."item_options" OWNER TO "postgres";

--
-- Name: item_price_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_price_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "variant_name_fr" "text" NOT NULL,
    "variant_name_en" "text",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0,
    "prices" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."item_price_variants" OWNER TO "postgres";

--
-- Name: item_suggestions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "suggested_item_id" "uuid" NOT NULL,
    "suggestion_type" "text" DEFAULT 'pairing'::"text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "item_suggestions_check" CHECK (("menu_item_id" <> "suggested_item_id")),
    CONSTRAINT "item_suggestions_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'auto'::"text"]))),
    CONSTRAINT "item_suggestions_suggestion_type_check" CHECK (("suggestion_type" = ANY (ARRAY['pairing'::"text", 'upsell'::"text", 'alternative'::"text"])))
);


ALTER TABLE "public"."item_suggestions" OWNER TO "postgres";

--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."menu_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "description" "text",
    "description_en" "text",
    "price" numeric(10,2) NOT NULL,
    "image_url" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prices" "jsonb",
    "allergens" "text"[] DEFAULT '{}'::"text"[],
    "calories" integer,
    "image_uploaded_at" timestamp with time zone,
    "image_uploaded_by" "uuid",
    "image_source" "text" DEFAULT 'web'::"text",
    "image_ai_processed" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "rating" numeric(2,1),
    "rating_count" integer DEFAULT 0 NOT NULL,
    "is_vegetarian" boolean DEFAULT false NOT NULL,
    "is_spicy" boolean DEFAULT false NOT NULL,
    "favorite_count" integer DEFAULT 0 NOT NULL,
    "options_title_fr" "text",
    "options_title_en" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "masque_par_stock" boolean DEFAULT false NOT NULL,
    CONSTRAINT "menu_items_favorite_count_check" CHECK (("favorite_count" >= 0)),
    CONSTRAINT "menu_items_image_source_check" CHECK (("image_source" = ANY (ARRAY['web'::"text", 'at_food_ios'::"text", 'import'::"text", 'ai_generated'::"text"]))),
    CONSTRAINT "menu_items_price_non_negative" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "menu_items_rating_check" CHECK ((("rating" IS NULL) OR (("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric)))),
    CONSTRAINT "menu_items_rating_count_check" CHECK (("rating_count" >= 0))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";

--
-- Name: COLUMN "menu_items"."masque_par_stock"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."menu_items"."masque_par_stock" IS 'Vrai quand le moteur de stock a masque le plat (rupture). Seuls ces plats reviennent seuls a la carte.';


--
-- Name: menus; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "venue_id" "uuid",
    "parent_menu_id" "uuid",
    "name" "text" NOT NULL,
    "name_en" "text",
    "slug" "text" NOT NULL,
    "description" "text",
    "description_en" "text",
    "image_url" "text",
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_transversal_menu" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."menus" OWNER TO "postgres";

--
-- Name: COLUMN "menus"."is_transversal_menu"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."menus"."is_transversal_menu" IS 'When TRUE, this menu (carte) is exposed as a sub-tab on every other top-level menu in the client UI.';


--
-- Name: newsletter_subscriber; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."newsletter_subscriber" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."newsletter_subscriber" OWNER TO "postgres";

--
-- Name: notification_reads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."notification_reads" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";

--
-- Name: onboarding_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."onboarding_progress" (
    "tenant_id" "uuid" NOT NULL,
    "step" integer DEFAULT 1,
    "completed" boolean DEFAULT false,
    "completed_at" timestamp without time zone,
    "draft" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "onboarding_progress_step_check" CHECK ((("step" >= 1) AND ("step" <= 6)))
);


ALTER TABLE "public"."onboarding_progress" OWNER TO "postgres";

--
-- Name: orange_money_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."orange_money_events" (
    "id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."orange_money_events" OWNER TO "postgres";

--
-- Name: TABLE "orange_money_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."orange_money_events" IS 'Idempotency log for Orange Money callback events. INSERT ON CONFLICT detects replays.';


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "price_at_order" bigint NOT NULL,
    "item_name" "text" NOT NULL,
    "item_name_en" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_status" character varying(20) DEFAULT 'pending'::character varying,
    "course" character varying(20),
    "modifiers" "jsonb" DEFAULT '[]'::"jsonb",
    "customer_notes" "text",
    "preparation_zone" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "selected_option" "jsonb",
    "selected_variant" "jsonb",
    "tenant_id" "uuid" NOT NULL,
    "held" boolean DEFAULT false NOT NULL,
    "fired_at" timestamp with time zone,
    CONSTRAINT "order_items_course_check" CHECK ((("course" IS NULL) OR (("course")::"text" = ANY ((ARRAY['appetizer'::character varying, 'main'::character varying, 'dessert'::character varying, 'drink'::character varying])::"text"[])))),
    CONSTRAINT "order_items_item_status_check" CHECK ((("item_status")::"text" = ANY ((ARRAY['pending'::character varying, 'preparing'::character varying, 'ready'::character varying, 'served'::character varying])::"text"[]))),
    CONSTRAINT "order_items_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";

--
-- Name: COLUMN "order_items"."preparation_zone"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order_items"."preparation_zone" IS 'Preparation zone copied from the item category at order time: kitchen, bar, or both';


--
-- Name: order_mutation_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_mutation_requests" (
    "client_request_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."order_mutation_requests" OWNER TO "postgres";

--
-- Name: order_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_notes" OWNER TO "postgres";

--
-- Name: order_number_counters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_number_counters" (
    "tenant_id" "uuid" NOT NULL,
    "jour" "date" NOT NULL,
    "dernier" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."order_number_counters" OWNER TO "postgres";

--
-- Name: TABLE "order_number_counters"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."order_number_counters" IS 'Compteur de numerotation des commandes, par restaurant et par jour. Remplace le calcul par MAX sur orders, qui reutilisait le numero d une commande supprimee et dependait de RLS. Ecrit UNIQUEMENT par next_order_number (SECURITY DEFINER): aucun role client n a de droit dessus.';


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "venue_id" "uuid",
    "order_number" "text" NOT NULL,
    "table_number" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "subtotal" bigint NOT NULL,
    "total" bigint NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "service_type" character varying(20) DEFAULT 'dine_in'::character varying,
    "room_number" character varying(20),
    "delivery_address" "text",
    "tax_amount" bigint DEFAULT 0,
    "service_charge_amount" bigint DEFAULT 0,
    "discount_amount" bigint DEFAULT 0,
    "payment_method" character varying(20),
    "payment_status" character varying(20) DEFAULT 'pending'::character varying,
    "paid_at" timestamp with time zone,
    "coupon_id" "uuid",
    "assigned_to" "uuid",
    "cashier_id" "uuid",
    "server_id" "uuid",
    "display_currency" character varying(3) DEFAULT NULL::character varying,
    "tip_amount" bigint DEFAULT 0,
    "preparation_zone" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "orange_money_pay_token" "text",
    "orange_money_notif_token" "text",
    "wave_checkout_id" "text",
    "payment_initiated_at" timestamp with time zone,
    "table_id" "uuid",
    "client_request_id" "uuid",
    "session_id" "uuid",
    "served_at" timestamp with time zone,
    "is_comp" boolean DEFAULT false NOT NULL,
    "comp_reason" "text",
    "comped_by" "uuid",
    "comped_at" timestamp with time zone,
    "comp_amount" bigint,
    "house_account_id" "uuid",
    "ready_at" timestamp with time zone,
    "coupon_rendu_at" timestamp with time zone,
    CONSTRAINT "orders_montants_non_negatifs_check" CHECK ((("total" >= 0) AND ("subtotal" >= 0) AND (COALESCE("discount_amount", (0)::bigint) >= 0) AND (COALESCE("service_charge_amount", (0)::bigint) >= 0) AND (COALESCE("tip_amount", (0)::bigint) >= 0))),
    CONSTRAINT "orders_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['cash'::character varying, 'card'::character varying, 'wave'::character varying, 'orange_money'::character varying, 'mtn_momo'::character varying, 'free_money'::character varying])::"text"[]))),
    CONSTRAINT "orders_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'partial'::character varying, 'refunded'::character varying, 'comp'::character varying])::"text"[]))),
    CONSTRAINT "orders_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'mixed'::"text"]))),
    CONSTRAINT "orders_service_type_check" CHECK ((("service_type")::"text" = ANY ((ARRAY['dine_in'::character varying, 'takeaway'::character varying, 'delivery'::character varying, 'room_service'::character varying])::"text"[]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'delivered'::"text", 'served'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";

--
-- Name: COLUMN "orders"."tip_amount"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."tip_amount" IS 'Tip/pourboire amount in base currency (XAF)';


--
-- Name: COLUMN "orders"."coupon_rendu_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."coupon_rendu_at" IS 'Quand le coupon de cette commande annulee a ete rendu (rendre_coupon_commande). NULL = pas rendu.';


--
-- Name: owner_trial_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."owner_trial_ledger" (
    "email_key" "text" NOT NULL,
    "first_user_id" "uuid",
    "first_trial_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_ends_at" timestamp with time zone NOT NULL,
    "confirmed_at" timestamp with time zone
);


ALTER TABLE "public"."owner_trial_ledger" OWNER TO "postgres";

--
-- Name: TABLE "owner_trial_ledger"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."owner_trial_ledger" IS 'Un essai gratuit par proprietaire. Cle = e-mail exact en minuscules (auth.users). Ne compte que si confirmed_at est non nul. Sans FK vers auth.users pour survivre a la suppression du compte. service_role uniquement.';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount" bigint NOT NULL,
    "method" "text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_request_id" "uuid",
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";

--
-- Name: COLUMN "payments"."client_request_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."payments"."client_request_id" IS 'Cle d''idempotence frappee par le client au moment du geste d''encaissement. Un rejeu porte la meme valeur et est refuse par l''index unique (F5).';


--
-- Name: platform_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."platform_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "target_label" "text",
    "tenant_id" "uuid",
    "reason" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_audit_log" OWNER TO "postgres";

--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "platform_settings_key_check" CHECK (("key" = 'support_contact'::"text"))
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";

--
-- Name: poste_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."poste_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "poste" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "poste_permissions_droits_check" CHECK ("private"."droits_valides"("permissions")),
    CONSTRAINT "poste_permissions_poste_check" CHECK (("poste" = ANY (ARRAY['manager'::"text", 'chef'::"text", 'cashier'::"text", 'bartender'::"text", 'reception'::"text", 'waiter'::"text", 'cook'::"text", 'crew'::"text", 'sales'::"text", 'production'::"text"])))
);


ALTER TABLE "public"."poste_permissions" OWNER TO "postgres";

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";

--
-- Name: qr_designs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."qr_designs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "config" "jsonb" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."qr_designs" OWNER TO "postgres";

--
-- Name: recipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity_needed" numeric(10,3) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recipes_quantity_needed_check" CHECK (("quantity_needed" > (0)::numeric))
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";

--
-- Name: reminder_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."reminder_preferences" (
    "admin_user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule" "text" NOT NULL,
    "muted" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reminder_preferences_rule_check" CHECK (("rule" = ANY (ARRAY['order_ready_not_served'::"text", 'order_not_started'::"text", 'pre_service_stock'::"text", 'weekly_coach'::"text"])))
);


ALTER TABLE "public"."reminder_preferences" OWNER TO "postgres";

--
-- Name: reminder_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."reminder_settings" (
    "tenant_id" "uuid" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "reminder_settings_config_check" CHECK (("jsonb_typeof"("config") = 'object'::"text"))
);


ALTER TABLE "public"."reminder_settings" OWNER TO "postgres";

--
-- Name: reminders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule" "text" NOT NULL,
    "subject_key" "text" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "level" smallint DEFAULT 1 NOT NULL,
    "notification_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "reminders_level_check" CHECK (("level" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "reminders_rule_check" CHECK (("rule" = ANY (ARRAY['order_ready_not_served'::"text", 'order_not_started'::"text", 'pre_service_stock'::"text", 'weekly_coach'::"text"]))),
    CONSTRAINT "reminders_subject_key_check" CHECK ((("length"("subject_key") >= 1) AND ("length"("subject_key") <= 200)))
);


ALTER TABLE "public"."reminders" OWNER TO "postgres";

--
-- Name: restaurant_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."restaurant_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Mon Groupe'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_groups" OWNER TO "postgres";

--
-- Name: settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."settings" OWNER TO "postgres";

--
-- Name: stock_alert_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_alert_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "sent_to" "text"[] NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_alert_notifications_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['low_stock'::"text", 'out_of_stock'::"text"])))
);


ALTER TABLE "public"."stock_alert_notifications" OWNER TO "postgres";

--
-- Name: stock_count_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_count_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "count_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "theoretical_qty" numeric(10,3) DEFAULT 0 NOT NULL,
    "counted_qty" numeric(10,3),
    "variance" numeric(10,3) GENERATED ALWAYS AS (("counted_qty" - "theoretical_qty")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_count_lines" OWNER TO "postgres";

--
-- Name: stock_counts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "reference" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid",
    "committed_by" "uuid",
    "committed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_counts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'committed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."stock_counts" OWNER TO "postgres";

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric(10,3) NOT NULL,
    "reference_id" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supplier_id" "uuid",
    "reason_code" "text",
    "unit_cost" numeric(12,4),
    CONSTRAINT "stock_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['order_destock'::"text", 'order_restock'::"text", 'manual_add'::"text", 'manual_remove'::"text", 'adjustment'::"text", 'opening'::"text", 'physical_count'::"text", 'loss'::"text", 'transfer_in'::"text", 'transfer_out'::"text"]))),
    CONSTRAINT "stock_movements_reason_code_check" CHECK ((("reason_code" IS NULL) OR ("reason_code" = ANY (ARRAY['expired'::"text", 'breakage'::"text", 'theft'::"text", 'spillage'::"text", 'prep_waste'::"text", 'recount'::"text", 'reconcile'::"text", 'other'::"text"])))),
    CONSTRAINT "stock_movements_unit_cost_positive" CHECK ((("unit_cost" IS NULL) OR ("unit_cost" > (0)::numeric)))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";

--
-- Name: COLUMN "stock_movements"."unit_cost"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stock_movements"."unit_cost" IS 'Prix d achat par unite de stock saisi a la reception (manual_add). NULL sinon. Sert au cout moyen pondere.';


--
-- Name: stripe_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "stripe_created_at" timestamp with time zone,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";

--
-- Name: TABLE "stripe_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."stripe_events" IS 'Idempotency log for Stripe webhook events. INSERT ON CONFLICT is used
     at the start of every webhook handler to detect replayed events.';


--
-- Name: COLUMN "stripe_events"."completed_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stripe_events"."completed_at" IS 'Date a laquelle le traitement de l evenement a abouti. NULL = jamais abouti.';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "phone" character varying(50),
    "email" "text",
    "address" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";

--
-- Name: table_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."table_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."table_assignments" OWNER TO "postgres";

--
-- Name: table_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."table_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_number" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "table_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."table_sessions" OWNER TO "postgres";

--
-- Name: tables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zone_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_number" character varying(20) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "capacity" integer DEFAULT 2 NOT NULL,
    "is_active" boolean DEFAULT true,
    "qr_code_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "qr_design_id" "uuid",
    CONSTRAINT "tables_capacity_check" CHECK (("capacity" > 0))
);


ALTER TABLE "public"."tables" OWNER TO "postgres";

--
-- Name: tenant_supports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tenant_supports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'chevalet_standard'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_supports_type_check" CHECK (("type" = 'chevalet_standard'::"text"))
);


ALTER TABLE "public"."tenant_supports" OWNER TO "postgres";

--
-- Name: tenant_tables_initialisees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tenant_tables_initialisees" (
    "tenant_id" "uuid" NOT NULL,
    "initialisees_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_tables_initialisees" OWNER TO "postgres";

--
-- Name: TABLE "tenant_tables_initialisees"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."tenant_tables_initialisees" IS 'Restaurants dont les tables de depart existent deja. Ecrit par un trigger, illisible par les clients.';


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subscription_plan" "text" DEFAULT 'starter'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "subscription_current_period_start" timestamp with time zone,
    "subscription_current_period_end" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "max_admins" integer DEFAULT 2 NOT NULL,
    "max_venues" integer DEFAULT 1 NOT NULL,
    "max_menu_items" integer DEFAULT 100 NOT NULL,
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#C5A065'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarding_completed" boolean DEFAULT false,
    "onboarding_completed_at" timestamp with time zone,
    "trial_ends_at" timestamp with time zone,
    "billing_interval" "text" DEFAULT 'monthly'::"text",
    "secondary_color" "text" DEFAULT '#000000'::"text",
    "description" "text",
    "establishment_type" "text" DEFAULT 'restaurant'::"text",
    "address" "text",
    "city" "text",
    "country" "text" DEFAULT 'Cameroun'::"text",
    "phone" "text",
    "table_count" integer DEFAULT 10,
    "notification_sound_id" character varying(50) DEFAULT 'classic-bell'::character varying,
    "currency" character varying(3) DEFAULT 'XAF'::character varying,
    "tax_rate" numeric(5,2) DEFAULT 0,
    "service_charge_rate" numeric(5,2) DEFAULT 0,
    "enable_tax" boolean DEFAULT false,
    "enable_service_charge" boolean DEFAULT false,
    "idle_timeout_minutes" integer DEFAULT 30,
    "screen_lock_mode" "text" DEFAULT 'overlay'::"text",
    "default_locale" "text" DEFAULT 'fr-FR'::"text",
    "supported_currencies" "text"[] DEFAULT '{XAF}'::"text"[] NOT NULL,
    "enable_coupons" boolean DEFAULT false,
    "bar_display_enabled" boolean DEFAULT false NOT NULL,
    "opening_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "enabled_payment_methods" "text"[] DEFAULT ARRAY['cash'::"text", 'card'::"text"] NOT NULL,
    "activation_events" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_active_at" timestamp with time zone,
    "at_food_enabled" boolean DEFAULT true,
    "group_id" "uuid",
    "custom_domain" character varying(255),
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "suspended_at" timestamp with time zone,
    "suspended_by" "uuid",
    "suspend_reason" "text",
    "banner_url" "text",
    "past_due_since" timestamp with time zone,
    "freeze_reason" "text",
    "establishment_details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "anonymized_at" timestamp with time zone,
    "refund_frozen_at" timestamp with time zone,
    CONSTRAINT "tenants_abonnement_inutilisable_implique_inactif" CHECK ((("subscription_status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text"])) OR ("is_active" = false))),
    CONSTRAINT "tenants_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "tenants_currency_check" CHECK ((("currency")::"text" = ANY ((ARRAY['XAF'::character varying, 'XOF'::character varying, 'EUR'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "tenants_establishment_details_is_object" CHECK (("jsonb_typeof"("establishment_details") = 'object'::"text")),
    CONSTRAINT "tenants_screen_lock_mode_check" CHECK (("screen_lock_mode" = ANY (ARRAY['overlay'::"text", 'password'::"text"]))),
    CONSTRAINT "tenants_service_charge_rate_check" CHECK ((("service_charge_rate" >= (0)::numeric) AND ("service_charge_rate" <= (100)::numeric))),
    CONSTRAINT "tenants_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text", 'cancelled'::"text", 'paused'::"text", 'frozen'::"text"]))),
    CONSTRAINT "tenants_tax_rate_check" CHECK ((("tax_rate" >= (0)::numeric) AND ("tax_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";

--
-- Name: COLUMN "tenants"."idle_timeout_minutes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."idle_timeout_minutes" IS 'Minutes of inactivity before lock screen. NULL = disabled. Range: 5-120.';


--
-- Name: COLUMN "tenants"."screen_lock_mode"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."screen_lock_mode" IS 'overlay = simple click-to-unlock, password = requires re-authentication';


--
-- Name: COLUMN "tenants"."default_locale"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."default_locale" IS 'Default locale for the tenant dashboard and client-facing pages. One of: fr-FR, fr-CA, en-US, en-GB, en-AU, en-CA, en-IE, es-ES.';


--
-- Name: COLUMN "tenants"."opening_hours"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."opening_hours" IS 'Weekly opening hours as { mon: {open,close}, ... }. Empty object = always open.';


--
-- Name: COLUMN "tenants"."past_due_since"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."past_due_since" IS 'Instant de la premiere transition vers past_due. NULL des que le statut redevient sain. Lu par le cron de gel pour borner l''impaye dans le temps (F3).';


--
-- Name: COLUMN "tenants"."freeze_reason"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."freeze_reason" IS 'Cause du gel: dispute, subscription_deleted, stripe_unpaid, trial_expired, past_due_overdue. Non nulle SI ET SEULEMENT SI subscription_status = ''frozen''. Lue par charge.dispute.closed, qui ne leve que le gel dont la cause est un litige. service_role uniquement.';


--
-- Name: COLUMN "tenants"."refund_frozen_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."refund_frozen_at" IS 'Date du gel pour remboursement. Une facture payee avant cette date ne leve pas le gel.';


--
-- Name: CONSTRAINT "tenants_abonnement_inutilisable_implique_inactif" ON "tenants"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT "tenants_abonnement_inutilisable_implique_inactif" ON "public"."tenants" IS 'Un restaurant dont l abonnement n est pas utilisable (ni trial, ni active, ni past_due) ne peut pas rester actif. is_active est le verrou lu par isTenantAccessLocked (proxy) et le filtre de get_tenant_by_slug (vitrine): laisser is_active=true sur un statut non entitlant rouvre le tableau de bord ET la vitrine d un restaurant qui ne paie plus. Remplace tenants_gel_implique_inactif, qui ne couvrait que le gel.';


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_sound" "text" DEFAULT 'default'::"text",
    "default_view" "text" DEFAULT 'standard'::"text",
    "language" "text" DEFAULT 'fr'::"text",
    "theme" "text" DEFAULT 'light'::"text",
    "kitchen_config" "jsonb" DEFAULT '{}'::"jsonb",
    "pos_config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_preferences_default_view_check" CHECK (("default_view" = ANY (ARRAY['standard'::"text", 'pos'::"text", 'kitchen'::"text", 'server'::"text"]))),
    CONSTRAINT "user_preferences_language_check" CHECK (("language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))),
    CONSTRAINT "user_preferences_theme_check" CHECK (("theme" = ANY (ARRAY['light'::"text", 'dark'::"text"])))
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "login_at" timestamp with time zone DEFAULT "now"(),
    "logout_at" timestamp with time zone,
    "ip_address" "text",
    "user_agent" "text",
    "device_info" "jsonb" DEFAULT '{}'::"jsonb",
    "login_type" "text" DEFAULT 'web'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_sessions" OWNER TO "postgres";

--
-- Name: venues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."venues" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "type" "text" DEFAULT 'restaurant'::"text" NOT NULL,
    "has_own_menu" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."venues" OWNER TO "postgres";

--
-- Name: wave_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."wave_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "wave_created_at" timestamp with time zone,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wave_events" OWNER TO "postgres";

--
-- Name: TABLE "wave_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."wave_events" IS 'Idempotency log for Wave webhook events. INSERT ON CONFLICT detects replays.';


--
-- Name: zones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "prefix" character varying(10) NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "qr_design_id" "uuid"
);


ALTER TABLE "public"."zones" OWNER TO "postgres";

--
-- Name: account_deletion_requests account_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("user_id");


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");


--
-- Name: adresses_email_bloquees adresses_email_bloquees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."adresses_email_bloquees"
    ADD CONSTRAINT "adresses_email_bloquees_pkey" PRIMARY KEY ("id");


--
-- Name: ads ads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_pkey" PRIMARY KEY ("id");


--
-- Name: ai_credits_ledger ai_credits_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_pkey" PRIMARY KEY ("id");


--
-- Name: ai_photo_credits ai_photo_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_photo_credits"
    ADD CONSTRAINT "ai_photo_credits_pkey" PRIMARY KEY ("tenant_id");


--
-- Name: alertes_nouvelle_connexion alertes_nouvelle_connexion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alertes_nouvelle_connexion"
    ADD CONSTRAINT "alertes_nouvelle_connexion_pkey" PRIMARY KEY ("user_id");


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: categories categories_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_id_tenant_key" UNIQUE ("id", "tenant_id");


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id");


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");


--
-- Name: coupons coupons_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_tenant_id_code_key" UNIQUE ("tenant_id", "code");


--
-- Name: cron_heartbeats cron_heartbeats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cron_heartbeats"
    ADD CONSTRAINT "cron_heartbeats_pkey" PRIMARY KEY ("job");


--
-- Name: dish_photo_drafts dish_photo_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_pkey" PRIMARY KEY ("id");


--
-- Name: email_unsubscribes email_unsubscribes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_unsubscribes"
    ADD CONSTRAINT "email_unsubscribes_pkey" PRIMARY KEY ("email_normalized");


--
-- Name: flutterwave_anomalies flutterwave_anomalies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_anomalies"
    ADD CONSTRAINT "flutterwave_anomalies_pkey" PRIMARY KEY ("id");


--
-- Name: flutterwave_anomalies flutterwave_anomalies_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_anomalies"
    ADD CONSTRAINT "flutterwave_anomalies_unique" UNIQUE ("flw_transaction_id", "kind");


--
-- Name: flutterwave_payments flutterwave_payments_flw_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_payments"
    ADD CONSTRAINT "flutterwave_payments_flw_transaction_id_key" UNIQUE ("flw_transaction_id");


--
-- Name: flutterwave_payments flutterwave_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_payments"
    ADD CONSTRAINT "flutterwave_payments_pkey" PRIMARY KEY ("id");


--
-- Name: flutterwave_payments flutterwave_payments_tx_ref_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_payments"
    ADD CONSTRAINT "flutterwave_payments_tx_ref_key" UNIQUE ("tx_ref");


--
-- Name: house_accounts house_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");


--
-- Name: invitations invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");


--
-- Name: item_modifiers item_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_pkey" PRIMARY KEY ("id");


--
-- Name: item_options item_options_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_pkey" PRIMARY KEY ("id");


--
-- Name: item_price_variants item_price_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_pkey" PRIMARY KEY ("id");


--
-- Name: item_suggestions item_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_pkey" PRIMARY KEY ("id");


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");


--
-- Name: menus menus_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_id_tenant_key" UNIQUE ("id", "tenant_id");


--
-- Name: menus menus_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");


--
-- Name: menus menus_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_tenant_id_slug_key" UNIQUE ("tenant_id", "slug");


--
-- Name: newsletter_subscriber newsletter_subscriber_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."newsletter_subscriber"
    ADD CONSTRAINT "newsletter_subscriber_email_key" UNIQUE ("email");


--
-- Name: newsletter_subscriber newsletter_subscriber_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."newsletter_subscriber"
    ADD CONSTRAINT "newsletter_subscriber_pkey" PRIMARY KEY ("id");


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id", "user_id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: onboarding_progress onboarding_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("tenant_id");


--
-- Name: orange_money_events orange_money_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orange_money_events"
    ADD CONSTRAINT "orange_money_events_pkey" PRIMARY KEY ("id");


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");


--
-- Name: order_mutation_requests order_mutation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_mutation_requests"
    ADD CONSTRAINT "order_mutation_requests_pkey" PRIMARY KEY ("client_request_id");


--
-- Name: order_notes order_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id");


--
-- Name: order_number_counters order_number_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_number_counters"
    ADD CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("tenant_id", "jour");


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");


--
-- Name: owner_trial_ledger owner_trial_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."owner_trial_ledger"
    ADD CONSTRAINT "owner_trial_ledger_pkey" PRIMARY KEY ("email_key");


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");


--
-- Name: platform_audit_log platform_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");


--
-- Name: poste_permissions poste_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."poste_permissions"
    ADD CONSTRAINT "poste_permissions_pkey" PRIMARY KEY ("id");


--
-- Name: poste_permissions poste_permissions_tenant_poste_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."poste_permissions"
    ADD CONSTRAINT "poste_permissions_tenant_poste_key" UNIQUE ("tenant_id", "poste");


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_tenant_user_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_tenant_user_endpoint_key" UNIQUE ("tenant_id", "user_id", "endpoint");


--
-- Name: qr_designs qr_designs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."qr_designs"
    ADD CONSTRAINT "qr_designs_pkey" PRIMARY KEY ("id");


--
-- Name: recipes recipes_menu_item_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_menu_item_id_ingredient_id_key" UNIQUE ("menu_item_id", "ingredient_id");


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");


--
-- Name: reminder_preferences reminder_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminder_preferences"
    ADD CONSTRAINT "reminder_preferences_pkey" PRIMARY KEY ("admin_user_id", "rule");


--
-- Name: reminder_settings reminder_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminder_settings"
    ADD CONSTRAINT "reminder_settings_pkey" PRIMARY KEY ("tenant_id");


--
-- Name: reminders reminders_once; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_once" UNIQUE ("tenant_id", "rule", "subject_key", "recipient_id", "level");


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pkey" PRIMARY KEY ("id");


--
-- Name: restaurant_groups restaurant_groups_owner_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_owner_unique" UNIQUE ("owner_user_id");


--
-- Name: restaurant_groups restaurant_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_pkey" PRIMARY KEY ("id");


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");


--
-- Name: stock_alert_notifications stock_alert_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_pkey" PRIMARY KEY ("id");


--
-- Name: stock_count_lines stock_count_lines_count_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_count_id_ingredient_id_key" UNIQUE ("count_id", "ingredient_id");


--
-- Name: stock_count_lines stock_count_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id");


--
-- Name: stock_counts stock_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_counts"
    ADD CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id");


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");


--
-- Name: stripe_events stripe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");


--
-- Name: table_assignments table_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: table_sessions table_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");


--
-- Name: tenant_supports tenant_supports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_pkey" PRIMARY KEY ("id");


--
-- Name: tenant_supports tenant_supports_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_unique" UNIQUE ("tenant_id", "type");


--
-- Name: tenant_tables_initialisees tenant_tables_initialisees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_tables_initialisees"
    ADD CONSTRAINT "tenant_tables_initialisees_pkey" PRIMARY KEY ("tenant_id");


--
-- Name: tenants tenants_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_custom_domain_key" UNIQUE ("custom_domain");


--
-- Name: tenants tenants_enabled_payment_methods_known; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tenants"
    ADD CONSTRAINT "tenants_enabled_payment_methods_known" CHECK ((("cardinality"("enabled_payment_methods") >= 1) AND ("enabled_payment_methods" <@ ARRAY['cash'::"text", 'card'::"text", 'wave'::"text", 'orange_money'::"text", 'mtn_momo'::"text", 'free_money'::"text"]))) NOT VALID;


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");


--
-- Name: tenants tenants_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_stripe_customer_id_key" UNIQUE ("stripe_customer_id");


--
-- Name: tenants tenants_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");


--
-- Name: wave_events wave_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."wave_events"
    ADD CONSTRAINT "wave_events_pkey" PRIMARY KEY ("id");


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");


--
-- Name: admin_users_tenant_user_vivant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "admin_users_tenant_user_vivant" ON "public"."admin_users" USING "btree" ("tenant_id", "user_id") WHERE ("deleted_at" IS NULL);


--
-- Name: admin_users_un_proprietaire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "admin_users_un_proprietaire" ON "public"."admin_users" USING "btree" ("tenant_id") WHERE (('owner'::"text" = ANY ("postes")) AND ("deleted_at" IS NULL));


--
-- Name: adresses_email_bloquees_email_hash_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "adresses_email_bloquees_email_hash_key" ON "public"."adresses_email_bloquees" USING "btree" ("email_hash");


--
-- Name: flutterwave_anomalies_non_resolues_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "flutterwave_anomalies_non_resolues_idx" ON "public"."flutterwave_anomalies" USING "btree" ("detected_at") WHERE ("resolved_at" IS NULL);


--
-- Name: flutterwave_anomalies_payment_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "flutterwave_anomalies_payment_id_idx" ON "public"."flutterwave_anomalies" USING "btree" ("payment_id");


--
-- Name: flutterwave_anomalies_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "flutterwave_anomalies_tenant_id_idx" ON "public"."flutterwave_anomalies" USING "btree" ("tenant_id");


--
-- Name: flutterwave_payments_tenant_status_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "flutterwave_payments_tenant_status_period_idx" ON "public"."flutterwave_payments" USING "btree" ("tenant_id", "status", "period_end");


--
-- Name: idx_admin_users_banned_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_banned_by" ON "public"."admin_users" USING "btree" ("banned_by");


--
-- Name: idx_admin_users_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_created_by" ON "public"."admin_users" USING "btree" ("created_by");


--
-- Name: idx_admin_users_deleted_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_deleted_by" ON "public"."admin_users" USING "btree" ("deleted_by");


--
-- Name: idx_admin_users_email_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_admin_users_email_tenant" ON "public"."admin_users" USING "btree" ("tenant_id", "email");


--
-- Name: idx_admin_users_live; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_live" ON "public"."admin_users" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_admin_users_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_tenant" ON "public"."admin_users" USING "btree" ("tenant_id");


--
-- Name: idx_admin_users_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_user_id" ON "public"."admin_users" USING "btree" ("user_id");


--
-- Name: idx_ads_tenant_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ads_tenant_active" ON "public"."ads" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_ads_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ads_tenant_id" ON "public"."ads" USING "btree" ("tenant_id");


--
-- Name: idx_ai_credits_ledger_menu_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_credits_ledger_menu_item_id" ON "public"."ai_credits_ledger" USING "btree" ("menu_item_id");


--
-- Name: idx_ai_credits_ledger_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_credits_ledger_tenant_id" ON "public"."ai_credits_ledger" USING "btree" ("tenant_id");


--
-- Name: idx_ai_credits_ledger_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_credits_ledger_user_id" ON "public"."ai_credits_ledger" USING "btree" ("user_id");


--
-- Name: idx_announcements_tenant_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_announcements_tenant_active" ON "public"."announcements" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_announcements_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_announcements_tenant_id" ON "public"."announcements" USING "btree" ("tenant_id");


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");


--
-- Name: idx_audit_log_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_tenant" ON "public"."audit_log" USING "btree" ("tenant_id", "created_at" DESC);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_categories_featured_on_home; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_featured_on_home" ON "public"."categories" USING "btree" ("tenant_id") WHERE ("is_featured_on_home" = true);


--
-- Name: idx_categories_menu; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_menu" ON "public"."categories" USING "btree" ("menu_id");


--
-- Name: idx_categories_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_tenant" ON "public"."categories" USING "btree" ("tenant_id");


--
-- Name: idx_categories_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_venue" ON "public"."categories" USING "btree" ("venue_id");


--
-- Name: idx_coupon_redemptions_coupon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupon_redemptions_coupon_id" ON "public"."coupon_redemptions" USING "btree" ("coupon_id");


--
-- Name: idx_coupon_redemptions_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupon_redemptions_order" ON "public"."coupon_redemptions" USING "btree" ("order_id");


--
-- Name: idx_coupon_redemptions_tenant_coupon; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupon_redemptions_tenant_coupon" ON "public"."coupon_redemptions" USING "btree" ("tenant_id", "coupon_id");


--
-- Name: idx_coupons_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupons_code" ON "public"."coupons" USING "btree" ("code") WHERE ("is_active" = true);


--
-- Name: idx_coupons_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupons_tenant" ON "public"."coupons" USING "btree" ("tenant_id");


--
-- Name: idx_coupons_validation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupons_validation" ON "public"."coupons" USING "btree" ("tenant_id", "code", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_dish_photo_drafts_attached_menu_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dish_photo_drafts_attached_menu_item_id" ON "public"."dish_photo_drafts" USING "btree" ("attached_menu_item_id");


--
-- Name: idx_dish_photo_drafts_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dish_photo_drafts_created_by" ON "public"."dish_photo_drafts" USING "btree" ("created_by");


--
-- Name: idx_dish_photo_drafts_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dish_photo_drafts_tenant" ON "public"."dish_photo_drafts" USING "btree" ("tenant_id", "status");


--
-- Name: idx_house_accounts_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_house_accounts_created_by" ON "public"."house_accounts" USING "btree" ("created_by");


--
-- Name: idx_house_accounts_settled_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_house_accounts_settled_by" ON "public"."house_accounts" USING "btree" ("settled_by");


--
-- Name: idx_house_accounts_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_house_accounts_tenant" ON "public"."house_accounts" USING "btree" ("tenant_id");


--
-- Name: idx_house_accounts_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_house_accounts_tenant_status" ON "public"."house_accounts" USING "btree" ("tenant_id", "status");


--
-- Name: idx_ingredients_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_active" ON "public"."ingredients" USING "btree" ("tenant_id", "is_active");


--
-- Name: idx_ingredients_stock_alert; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_stock_alert" ON "public"."ingredients" USING "btree" ("tenant_id", "is_active", "current_stock", "min_stock_alert") WHERE ("is_active" = true);


--
-- Name: idx_ingredients_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_tenant" ON "public"."ingredients" USING "btree" ("tenant_id");


--
-- Name: idx_ingredients_tenant_lower_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_tenant_lower_name" ON "public"."ingredients" USING "btree" ("tenant_id", "lower"("name"));


--
-- Name: idx_invitations_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");


--
-- Name: idx_invitations_invited_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_invited_by" ON "public"."invitations" USING "btree" ("invited_by");


--
-- Name: idx_invitations_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_tenant" ON "public"."invitations" USING "btree" ("tenant_id");


--
-- Name: idx_invitations_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_token" ON "public"."invitations" USING "btree" ("token");


--
-- Name: idx_ipv_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ipv_menu_item" ON "public"."item_price_variants" USING "btree" ("menu_item_id");


--
-- Name: idx_ipv_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ipv_tenant" ON "public"."item_price_variants" USING "btree" ("tenant_id");


--
-- Name: idx_item_modifiers_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_modifiers_menu_item" ON "public"."item_modifiers" USING "btree" ("menu_item_id");


--
-- Name: idx_item_modifiers_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_modifiers_tenant" ON "public"."item_modifiers" USING "btree" ("tenant_id");


--
-- Name: idx_item_options_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_options_menu_item" ON "public"."item_options" USING "btree" ("menu_item_id");


--
-- Name: idx_item_options_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_options_tenant" ON "public"."item_options" USING "btree" ("tenant_id");


--
-- Name: idx_item_suggestions_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_suggestions_item" ON "public"."item_suggestions" USING "btree" ("menu_item_id");


--
-- Name: idx_item_suggestions_suggested_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_suggestions_suggested_item_id" ON "public"."item_suggestions" USING "btree" ("suggested_item_id");


--
-- Name: idx_item_suggestions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_suggestions_tenant" ON "public"."item_suggestions" USING "btree" ("tenant_id");


--
-- Name: idx_menu_items_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_active" ON "public"."menu_items" USING "btree" ("tenant_id", "category_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_menu_items_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_category" ON "public"."menu_items" USING "btree" ("category_id");


--
-- Name: idx_menu_items_image_uploaded_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_image_uploaded_by" ON "public"."menu_items" USING "btree" ("image_uploaded_by");


--
-- Name: idx_menu_items_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_tenant" ON "public"."menu_items" USING "btree" ("tenant_id");


--
-- Name: idx_menu_items_tenant_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_tenant_category" ON "public"."menu_items" USING "btree" ("tenant_id", "category_id");


--
-- Name: idx_menus_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_active" ON "public"."menus" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_menus_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_parent" ON "public"."menus" USING "btree" ("parent_menu_id");


--
-- Name: idx_menus_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_slug" ON "public"."menus" USING "btree" ("tenant_id", "slug");


--
-- Name: idx_menus_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_tenant" ON "public"."menus" USING "btree" ("tenant_id");


--
-- Name: idx_menus_transversal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_transversal" ON "public"."menus" USING "btree" ("tenant_id") WHERE ("is_transversal_menu" = true);


--
-- Name: idx_menus_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_venue" ON "public"."menus" USING "btree" ("venue_id");


--
-- Name: idx_notification_reads_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notification_reads_tenant_id" ON "public"."notification_reads" USING "btree" ("tenant_id");


--
-- Name: idx_notification_reads_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notification_reads_user_id" ON "public"."notification_reads" USING "btree" ("user_id");


--
-- Name: idx_notifications_tenant_broadcast; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_tenant_broadcast" ON "public"."notifications" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("user_id" IS NULL);


--
-- Name: idx_notifications_tenant_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_tenant_user" ON "public"."notifications" USING "btree" ("tenant_id", "user_id", "read", "created_at" DESC);


--
-- Name: idx_onboarding_progress_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_onboarding_progress_tenant" ON "public"."onboarding_progress" USING "btree" ("tenant_id");


--
-- Name: idx_order_items_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_course" ON "public"."order_items" USING "btree" ("order_id", "course");


--
-- Name: idx_order_items_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_menu_item" ON "public"."order_items" USING "btree" ("menu_item_id");


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");


--
-- Name: idx_order_items_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_status" ON "public"."order_items" USING "btree" ("order_id", "item_status");


--
-- Name: idx_order_items_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_tenant_id" ON "public"."order_items" USING "btree" ("tenant_id");


--
-- Name: idx_order_mutation_requests_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_mutation_requests_tenant" ON "public"."order_mutation_requests" USING "btree" ("tenant_id");


--
-- Name: idx_order_notes_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_notes_created_by" ON "public"."order_notes" USING "btree" ("created_by");


--
-- Name: idx_order_notes_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_notes_order_id" ON "public"."order_notes" USING "btree" ("order_id");


--
-- Name: idx_order_notes_tenant_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_notes_tenant_order" ON "public"."order_notes" USING "btree" ("tenant_id", "order_id");


--
-- Name: idx_orders_assigned; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_assigned" ON "public"."orders" USING "btree" ("assigned_to");


--
-- Name: idx_orders_cashier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_cashier" ON "public"."orders" USING "btree" ("cashier_id");


--
-- Name: idx_orders_comped_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_comped_by" ON "public"."orders" USING "btree" ("comped_by");


--
-- Name: idx_orders_coupon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_coupon_id" ON "public"."orders" USING "btree" ("coupon_id") WHERE ("coupon_id" IS NOT NULL);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);


--
-- Name: idx_orders_house_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_house_account" ON "public"."orders" USING "btree" ("tenant_id", "house_account_id") WHERE ("house_account_id" IS NOT NULL);


--
-- Name: idx_orders_house_account_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_house_account_id" ON "public"."orders" USING "btree" ("house_account_id");


--
-- Name: idx_orders_number_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_orders_number_tenant" ON "public"."orders" USING "btree" ("tenant_id", "order_number");


--
-- Name: idx_orders_orange_pay_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_orange_pay_token" ON "public"."orders" USING "btree" ("orange_money_pay_token") WHERE ("orange_money_pay_token" IS NOT NULL);


--
-- Name: idx_orders_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_payment_status" ON "public"."orders" USING "btree" ("tenant_id", "payment_status");


--
-- Name: idx_orders_ready_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_ready_at" ON "public"."orders" USING "btree" ("ready_at") WHERE ("status" = 'ready'::"text");


--
-- Name: idx_orders_server; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_server" ON "public"."orders" USING "btree" ("server_id");


--
-- Name: idx_orders_service_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_service_type" ON "public"."orders" USING "btree" ("tenant_id", "service_type");


--
-- Name: idx_orders_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_session" ON "public"."orders" USING "btree" ("session_id");


--
-- Name: idx_orders_stale_payment_sessions; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_stale_payment_sessions" ON "public"."orders" USING "btree" ("payment_initiated_at") WHERE ((("payment_status")::"text" = 'pending'::"text") AND ("payment_initiated_at" IS NOT NULL) AND (("wave_checkout_id" IS NOT NULL) OR ("orange_money_pay_token" IS NOT NULL)));


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");


--
-- Name: idx_orders_table_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_table_id" ON "public"."orders" USING "btree" ("table_id") WHERE ("table_id" IS NOT NULL);


--
-- Name: idx_orders_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant" ON "public"."orders" USING "btree" ("tenant_id");


--
-- Name: idx_orders_tenant_order_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_order_number" ON "public"."orders" USING "btree" ("tenant_id", "order_number" "text_pattern_ops");


--
-- Name: idx_orders_tenant_prep_zone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_prep_zone" ON "public"."orders" USING "btree" ("tenant_id", "preparation_zone", "status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text"]));


--
-- Name: idx_orders_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_status" ON "public"."orders" USING "btree" ("tenant_id", "status");


--
-- Name: idx_orders_tenant_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_status_created" ON "public"."orders" USING "btree" ("tenant_id", "status", "created_at" DESC);


--
-- Name: idx_orders_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_venue" ON "public"."orders" USING "btree" ("venue_id");


--
-- Name: idx_orders_venue_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_venue_status" ON "public"."orders" USING "btree" ("venue_id", "status", "created_at" DESC);


--
-- Name: idx_orders_wave_checkout_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_wave_checkout_id" ON "public"."orders" USING "btree" ("wave_checkout_id") WHERE ("wave_checkout_id" IS NOT NULL);


--
-- Name: idx_payments_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payments_created_by" ON "public"."payments" USING "btree" ("created_by");


--
-- Name: idx_payments_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payments_order" ON "public"."payments" USING "btree" ("order_id");


--
-- Name: idx_payments_tenant_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payments_tenant_created" ON "public"."payments" USING "btree" ("tenant_id", "created_at");


--
-- Name: idx_payments_tenant_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payments_tenant_order" ON "public"."payments" USING "btree" ("tenant_id", "order_id");


--
-- Name: idx_platform_audit_log_actor_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_actor_user_id" ON "public"."platform_audit_log" USING "btree" ("actor_user_id");


--
-- Name: idx_platform_audit_log_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_created" ON "public"."platform_audit_log" USING "btree" ("created_at" DESC);


--
-- Name: idx_platform_audit_log_target; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_target" ON "public"."platform_audit_log" USING "btree" ("target_type", "target_id");


--
-- Name: idx_platform_audit_log_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_tenant_id" ON "public"."platform_audit_log" USING "btree" ("tenant_id");


--
-- Name: idx_platform_settings_updated_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_settings_updated_by" ON "public"."platform_settings" USING "btree" ("updated_by");


--
-- Name: idx_poste_permissions_updated_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_poste_permissions_updated_by" ON "public"."poste_permissions" USING "btree" ("updated_by");


--
-- Name: idx_push_subscriptions_last_used; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_push_subscriptions_last_used" ON "public"."push_subscriptions" USING "btree" ("last_used_at");


--
-- Name: idx_push_subscriptions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_push_subscriptions_tenant" ON "public"."push_subscriptions" USING "btree" ("tenant_id");


--
-- Name: idx_push_subscriptions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_push_subscriptions_user" ON "public"."push_subscriptions" USING "btree" ("user_id");


--
-- Name: idx_qr_designs_one_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_qr_designs_one_default" ON "public"."qr_designs" USING "btree" ("tenant_id") WHERE ("is_default" = true);


--
-- Name: idx_qr_designs_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_qr_designs_tenant" ON "public"."qr_designs" USING "btree" ("tenant_id");


--
-- Name: idx_recipes_ingredient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recipes_ingredient" ON "public"."recipes" USING "btree" ("ingredient_id");


--
-- Name: idx_recipes_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recipes_menu_item" ON "public"."recipes" USING "btree" ("menu_item_id");


--
-- Name: idx_recipes_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recipes_tenant" ON "public"."recipes" USING "btree" ("tenant_id");


--
-- Name: idx_reminder_preferences_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reminder_preferences_tenant" ON "public"."reminder_preferences" USING "btree" ("tenant_id");


--
-- Name: idx_reminder_settings_updated_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reminder_settings_updated_by" ON "public"."reminder_settings" USING "btree" ("updated_by");


--
-- Name: idx_reminders_notification; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reminders_notification" ON "public"."reminders" USING "btree" ("notification_id");


--
-- Name: idx_reminders_open; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reminders_open" ON "public"."reminders" USING "btree" ("tenant_id", "rule") WHERE ("resolved_at" IS NULL);


--
-- Name: idx_reminders_recipient_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reminders_recipient_created" ON "public"."reminders" USING "btree" ("recipient_id", "created_at");


--
-- Name: idx_restaurant_groups_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_restaurant_groups_owner" ON "public"."restaurant_groups" USING "btree" ("owner_user_id");


--
-- Name: idx_settings_key_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_settings_key_tenant" ON "public"."settings" USING "btree" ("tenant_id", "key");


--
-- Name: idx_stock_alert_notifications_ingredient_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_alert_notifications_ingredient_id" ON "public"."stock_alert_notifications" USING "btree" ("ingredient_id");


--
-- Name: idx_stock_alerts_rate_limit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_alerts_rate_limit" ON "public"."stock_alert_notifications" USING "btree" ("tenant_id", "ingredient_id", "sent_at" DESC);


--
-- Name: idx_stock_count_lines_count; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_count_lines_count" ON "public"."stock_count_lines" USING "btree" ("count_id");


--
-- Name: idx_stock_count_lines_ingredient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_count_lines_ingredient" ON "public"."stock_count_lines" USING "btree" ("ingredient_id");


--
-- Name: idx_stock_count_lines_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_count_lines_tenant" ON "public"."stock_count_lines" USING "btree" ("tenant_id");


--
-- Name: idx_stock_counts_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_counts_tenant" ON "public"."stock_counts" USING "btree" ("tenant_id");


--
-- Name: idx_stock_counts_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_counts_tenant_status" ON "public"."stock_counts" USING "btree" ("tenant_id", "status");


--
-- Name: idx_stock_movements_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_created_by" ON "public"."stock_movements" USING "btree" ("tenant_id", "created_by") WHERE ("created_by" IS NOT NULL);


--
-- Name: idx_stock_movements_ingredient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_ingredient" ON "public"."stock_movements" USING "btree" ("ingredient_id");


--
-- Name: idx_stock_movements_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_supplier" ON "public"."stock_movements" USING "btree" ("supplier_id") WHERE ("supplier_id" IS NOT NULL);


--
-- Name: idx_stock_movements_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_tenant" ON "public"."stock_movements" USING "btree" ("tenant_id");


--
-- Name: idx_stock_movements_tenant_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_tenant_created" ON "public"."stock_movements" USING "btree" ("tenant_id", "created_at" DESC);


--
-- Name: idx_stock_movements_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_type" ON "public"."stock_movements" USING "btree" ("tenant_id", "movement_type");


--
-- Name: idx_suppliers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_suppliers_active" ON "public"."suppliers" USING "btree" ("tenant_id", "is_active");


--
-- Name: idx_suppliers_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_suppliers_tenant" ON "public"."suppliers" USING "btree" ("tenant_id");


--
-- Name: idx_table_assignments_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_active" ON "public"."table_assignments" USING "btree" ("tenant_id", "table_id") WHERE ("ended_at" IS NULL);


--
-- Name: idx_table_assignments_server; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_server" ON "public"."table_assignments" USING "btree" ("server_id") WHERE ("ended_at" IS NULL);


--
-- Name: idx_table_assignments_table_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_table_id" ON "public"."table_assignments" USING "btree" ("table_id");


--
-- Name: idx_table_assignments_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_tenant" ON "public"."table_assignments" USING "btree" ("tenant_id");


--
-- Name: idx_table_sessions_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_sessions_tenant_status" ON "public"."table_sessions" USING "btree" ("tenant_id", "status");


--
-- Name: idx_tables_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_active" ON "public"."tables" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_tables_qr_design; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_qr_design" ON "public"."tables" USING "btree" ("qr_design_id");


--
-- Name: idx_tables_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_tenant" ON "public"."tables" USING "btree" ("tenant_id");


--
-- Name: idx_tables_zone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_zone" ON "public"."tables" USING "btree" ("zone_id");


--
-- Name: idx_tenants_custom_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_custom_domain" ON "public"."tenants" USING "btree" ("custom_domain") WHERE ("custom_domain" IS NOT NULL);


--
-- Name: idx_tenants_deleted_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_deleted_by" ON "public"."tenants" USING "btree" ("deleted_by");


--
-- Name: idx_tenants_group_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_group_id" ON "public"."tenants" USING "btree" ("group_id");


--
-- Name: idx_tenants_live; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_live" ON "public"."tenants" USING "btree" ("slug") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_tenants_name_ci; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_name_ci" ON "public"."tenants" USING "btree" ("lower"("btrim"("name"))) WHERE (("deleted_at" IS NULL) AND ("onboarding_completed" = true) AND ("group_id" IS NOT NULL));


--
-- Name: idx_tenants_onboarding; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_onboarding" ON "public"."tenants" USING "btree" ("onboarding_completed");


--
-- Name: idx_tenants_past_due_since; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_past_due_since" ON "public"."tenants" USING "btree" ("past_due_since") WHERE ("subscription_status" = 'past_due'::"text");


--
-- Name: idx_tenants_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_slug" ON "public"."tenants" USING "btree" ("slug");


--
-- Name: idx_tenants_stripe_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_stripe_customer_id" ON "public"."tenants" USING "btree" ("stripe_customer_id");


--
-- Name: idx_tenants_subscription_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_subscription_status" ON "public"."tenants" USING "btree" ("subscription_status");


--
-- Name: idx_tenants_suspended_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_suspended_by" ON "public"."tenants" USING "btree" ("suspended_by");


--
-- Name: idx_tenants_trial_ends_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_trial_ends_at" ON "public"."tenants" USING "btree" ("trial_ends_at") WHERE ("subscription_status" = 'trial'::"text");


--
-- Name: idx_user_preferences_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_preferences_user" ON "public"."user_preferences" USING "btree" ("user_id");


--
-- Name: idx_user_sessions_login_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sessions_login_at" ON "public"."user_sessions" USING "btree" ("login_at");


--
-- Name: idx_user_sessions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sessions_tenant" ON "public"."user_sessions" USING "btree" ("tenant_id");


--
-- Name: idx_user_sessions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sessions_user" ON "public"."user_sessions" USING "btree" ("user_id");


--
-- Name: idx_venues_slug_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_venues_slug_tenant" ON "public"."venues" USING "btree" ("tenant_id", "slug");


--
-- Name: idx_venues_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_venues_tenant" ON "public"."venues" USING "btree" ("tenant_id");


--
-- Name: idx_zones_qr_design; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_zones_qr_design" ON "public"."zones" USING "btree" ("qr_design_id");


--
-- Name: idx_zones_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_zones_tenant" ON "public"."zones" USING "btree" ("tenant_id");


--
-- Name: idx_zones_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_zones_venue" ON "public"."zones" USING "btree" ("venue_id");


--
-- Name: ingredients_tenant_lower_name_active_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ingredients_tenant_lower_name_active_key" ON "public"."ingredients" USING "btree" ("tenant_id", "lower"("name")) WHERE "is_active";


--
-- Name: invitations_pending_email_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "invitations_pending_email_unique" ON "public"."invitations" USING "btree" ("tenant_id", "lower"("email")) WHERE ("status" = 'pending'::"text");


--
-- Name: item_suggestions_active_pair_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "item_suggestions_active_pair_key" ON "public"."item_suggestions" USING "btree" ("tenant_id", "menu_item_id", "suggested_item_id") WHERE "is_active";


--
-- Name: orange_money_events_processed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "orange_money_events_processed_at_idx" ON "public"."orange_money_events" USING "btree" ("processed_at" DESC);


--
-- Name: stripe_events_processed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "stripe_events_processed_at_idx" ON "public"."stripe_events" USING "btree" ("processed_at" DESC);


--
-- Name: suppliers_tenant_lower_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "suppliers_tenant_lower_name_key" ON "public"."suppliers" USING "btree" ("tenant_id", "lower"("name"));


--
-- Name: tables_tenant_table_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "tables_tenant_table_number_key" ON "public"."tables" USING "btree" ("tenant_id", "table_number");


--
-- Name: tenant_supports_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "tenant_supports_tenant_id_idx" ON "public"."tenant_supports" USING "btree" ("tenant_id");


--
-- Name: uniq_open_session_per_table; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uniq_open_session_per_table" ON "public"."table_sessions" USING "btree" ("tenant_id", "table_number") WHERE ("status" = 'open'::"text");


--
-- Name: uniq_stock_counts_one_open; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uniq_stock_counts_one_open" ON "public"."stock_counts" USING "btree" ("tenant_id") WHERE ("status" = 'open'::"text");


--
-- Name: uq_orders_tenant_client_request_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_orders_tenant_client_request_id" ON "public"."orders" USING "btree" ("tenant_id", "client_request_id") WHERE ("client_request_id" IS NOT NULL);


--
-- Name: uq_payments_tenant_client_request_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_payments_tenant_client_request_id" ON "public"."payments" USING "btree" ("tenant_id", "client_request_id") WHERE ("client_request_id" IS NOT NULL);


--
-- Name: venues_tenant_slug_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "venues_tenant_slug_uniq" ON "public"."venues" USING "btree" ("tenant_id", "slug");


--
-- Name: wave_events_processed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "wave_events_processed_at_idx" ON "public"."wave_events" USING "btree" ("processed_at" DESC);


--
-- Name: zones_tenant_upper_prefix_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "zones_tenant_upper_prefix_key" ON "public"."zones" USING "btree" ("tenant_id", "upper"(("prefix")::"text"));


--
-- Name: zones_venue_lower_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "zones_venue_lower_name_key" ON "public"."zones" USING "btree" ("tenant_id", "venue_id", "lower"("name")) NULLS NOT DISTINCT;


--
-- Name: admin_users aa_admin_users_sync_postes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "aa_admin_users_sync_postes" BEFORE INSERT OR UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "private"."sync_postes_admin_users"();


--
-- Name: invitations aa_invitations_sync_postes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "aa_invitations_sync_postes" BEFORE INSERT OR UPDATE ON "public"."invitations" FOR EACH ROW EXECUTE FUNCTION "private"."sync_postes_invitations"();


--
-- Name: categories categories_menu_same_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "categories_menu_same_tenant" BEFORE INSERT OR UPDATE OF "menu_id", "tenant_id" ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_category_menu_tenant"();


--
-- Name: admin_users garder_proprietaire_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "garder_proprietaire_trg" BEFORE DELETE OR UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "private"."garder_proprietaire"();


--
-- Name: item_modifiers item_modifiers_same_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "item_modifiers_same_tenant" BEFORE INSERT OR UPDATE OF "menu_item_id", "tenant_id" ON "public"."item_modifiers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_item_child_menu_item_tenant"();


--
-- Name: item_options item_options_same_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "item_options_same_tenant" BEFORE INSERT OR UPDATE OF "menu_item_id", "tenant_id" ON "public"."item_options" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_item_child_menu_item_tenant"();


--
-- Name: item_price_variants item_price_variants_same_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "item_price_variants_same_tenant" BEFORE INSERT OR UPDATE OF "menu_item_id", "tenant_id" ON "public"."item_price_variants" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_item_child_menu_item_tenant"();


--
-- Name: item_suggestions item_suggestions_same_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "item_suggestions_same_tenant" BEFORE INSERT OR UPDATE OF "menu_item_id", "suggested_item_id", "tenant_id" ON "public"."item_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_item_suggestion_tenant"();


--
-- Name: menu_items menu_items_category_same_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "menu_items_category_same_tenant" BEFORE INSERT OR UPDATE OF "category_id", "tenant_id" ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_menu_item_category_tenant"();


--
-- Name: menus menus_same_tenant_links; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "menus_same_tenant_links" BEFORE INSERT OR UPDATE OF "parent_menu_id", "venue_id", "tenant_id" ON "public"."menus" FOR EACH ROW EXECUTE FUNCTION "public"."menus_same_tenant_links"();


--
-- Name: menus menus_tenant_move_keeps_children; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "menus_tenant_move_keeps_children" BEFORE UPDATE OF "tenant_id" ON "public"."menus" FOR EACH ROW EXECUTE FUNCTION "public"."menus_tenant_move_keeps_children"();


--
-- Name: admin_users prevent_super_admin_elevation_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "prevent_super_admin_elevation_trg" BEFORE INSERT OR UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_super_admin_elevation"();


--
-- Name: tenant_supports tenant_supports_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "tenant_supports_updated_at" BEFORE UPDATE ON "public"."tenant_supports" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenant_supports_updated_at"();


--
-- Name: orders trg_annulation_exige_registre_rembourse; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE CONSTRAINT TRIGGER "trg_annulation_exige_registre_rembourse" AFTER UPDATE ON "public"."orders" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((("new"."status" = 'cancelled'::"text") AND ("old"."status" IS DISTINCT FROM 'cancelled'::"text"))) EXECUTE FUNCTION "public"."exiger_registre_rembourse_pour_annuler"();


--
-- Name: orders trg_argent_exige_orders_pay; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_argent_exige_orders_pay" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."refuser_argent_sans_orders_pay"();


--
-- Name: order_items trg_articles_argent_exige_orders_pay; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_articles_argent_exige_orders_pay" BEFORE UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."refuser_articles_argent_sans_orders_pay"();


--
-- Name: audit_log trg_audit_log_auteur_session; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_audit_log_auteur_session" BEFORE INSERT ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_auteur_session"();


--
-- Name: zones trg_borner_zones_depart; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_borner_zones_depart" AFTER INSERT ON "public"."zones" REFERENCING NEW TABLE AS "nouvelles_zones" FOR EACH STATEMENT EXECUTE FUNCTION "public"."borner_zones_depart"();


--
-- Name: orders trg_broadcast_order_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_broadcast_order_status" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."broadcast_order_status"();


--
-- Name: orders trg_creation_commande_non_reglee; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_creation_commande_non_reglee" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."normaliser_creation_commande"();


--
-- Name: ingredients trg_enforce_ingredient_update_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_ingredient_update_entitlement" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_ingredient_update_entitlement"();


--
-- Name: ingredients trg_enforce_inventory_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_inventory_entitlement" BEFORE INSERT ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_inventory_entitlement"();


--
-- Name: stock_count_lines trg_enforce_inventory_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_inventory_entitlement" BEFORE INSERT OR UPDATE ON "public"."stock_count_lines" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_inventory_entitlement"();


--
-- Name: stock_counts trg_enforce_inventory_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_inventory_entitlement" BEFORE INSERT OR UPDATE ON "public"."stock_counts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_inventory_entitlement"();


--
-- Name: suppliers trg_enforce_inventory_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_inventory_entitlement" BEFORE INSERT OR UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_inventory_entitlement"();


--
-- Name: order_items trg_enforce_kds_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_kds_entitlement" BEFORE UPDATE OF "item_status", "held" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_kds_entitlement"();


--
-- Name: venues trg_enforce_min_one_active_venue; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_min_one_active_venue" AFTER UPDATE ON "public"."venues" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_min_one_active_venue"();


--
-- Name: orders trg_enforce_order_plan_features; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_order_plan_features" BEFORE INSERT OR UPDATE OF "service_type", "tip_amount", "display_currency" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_order_plan_features"();


--
-- Name: qr_designs trg_enforce_qr_customization_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_qr_customization_entitlement" BEFORE INSERT OR UPDATE ON "public"."qr_designs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_qr_customization_entitlement"();


--
-- Name: recipes trg_enforce_recipes_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_recipes_entitlement" BEFORE INSERT OR UPDATE ON "public"."recipes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_recipes_entitlement"();


--
-- Name: table_assignments trg_enforce_service_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_service_entitlement" BEFORE INSERT OR UPDATE ON "public"."table_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_service_entitlement"();


--
-- Name: stock_movements trg_enforce_stock_movement_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_stock_movement_entitlement" BEFORE INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_stock_movement_entitlement"();


--
-- Name: tables trg_enforce_tables_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_tables_entitlement" BEFORE INSERT ON "public"."tables" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_tables_entitlement"();


--
-- Name: zones trg_enforce_tables_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_tables_entitlement" BEFORE INSERT ON "public"."zones" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_tables_entitlement"();


--
-- Name: venues trg_enforce_venue_plan_limit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_venue_plan_limit" AFTER INSERT OR UPDATE ON "public"."venues" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_venue_plan_limit"();


--
-- Name: house_accounts trg_house_accounts_settle_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_house_accounts_settle_guard" BEFORE UPDATE OF "status" ON "public"."house_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."guard_house_account_settle"();


--
-- Name: orders trg_inscrire_espace_commande; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_inscrire_espace_commande" BEFORE INSERT OR UPDATE OF "table_id" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."inscrire_espace_commande"();


--
-- Name: item_modifiers trg_item_modifiers_prix; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_item_modifiers_prix" BEFORE INSERT OR DELETE OR UPDATE ON "public"."item_modifiers" FOR EACH ROW EXECUTE FUNCTION "public"."garder_prix_carte"();


--
-- Name: item_suggestions trg_item_suggestions_modifiee_devient_manuelle; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_item_suggestions_modifiee_devient_manuelle" BEFORE UPDATE ON "public"."item_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."item_suggestions_modifiee_devient_manuelle"();


--
-- Name: tables trg_marquer_tables_initialisees; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_marquer_tables_initialisees" AFTER INSERT ON "public"."tables" REFERENCING NEW TABLE AS "nouvelles_tables" FOR EACH STATEMENT EXECUTE FUNCTION "public"."marquer_tables_initialisees"();


--
-- Name: menu_items trg_menu_items_masquage_manuel; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_menu_items_masquage_manuel" BEFORE UPDATE OF "is_available" ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."menu_items_masquage_manuel"();


--
-- Name: menu_items trg_menu_items_prix; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_menu_items_prix" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."garder_prix_carte"();


--
-- Name: orders trg_montants_commande_non_reecrits; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_montants_commande_non_reecrits" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."refuser_reecriture_montants_commande"();


--
-- Name: order_items trg_order_items_statut_cuisine; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_order_items_statut_cuisine" BEFORE UPDATE OF "item_status" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."garder_statut_cuisine"();


--
-- Name: order_items trg_order_items_tenant_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_order_items_tenant_id" BEFORE INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_order_item_tenant_id"();


--
-- Name: order_notes trg_order_notes_auteur_session; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_order_notes_auteur_session" BEFORE INSERT ON "public"."order_notes" FOR EACH ROW EXECUTE FUNCTION "public"."order_notes_auteur_session"();


--
-- Name: orders trg_orders_house_account_open; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_orders_house_account_open" BEFORE INSERT OR UPDATE OF "house_account_id" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."guard_order_house_account_open"();


--
-- Name: orders trg_orders_ready_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_orders_ready_at" BEFORE UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_order_ready_at"();


--
-- Name: orders trg_orders_statut_cuisine; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_orders_statut_cuisine" BEFORE UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."garder_statut_cuisine"();


--
-- Name: orders trg_paid_exige_registre_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE CONSTRAINT TRIGGER "trg_paid_exige_registre_insert" AFTER INSERT ON "public"."orders" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((("new"."payment_status")::"text" = 'paid'::"text")) EXECUTE FUNCTION "public"."exiger_registre_pour_paid"();


--
-- Name: orders trg_paid_exige_registre_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE CONSTRAINT TRIGGER "trg_paid_exige_registre_update" AFTER UPDATE ON "public"."orders" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((("new"."payment_status")::"text" = 'paid'::"text") AND (("old"."payment_status")::"text" IS DISTINCT FROM 'paid'::"text"))) EXECUTE FUNCTION "public"."exiger_registre_pour_paid"();


--
-- Name: payments trg_payments_insert_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_payments_insert_guard" BEFORE INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."garder_ecriture_registre_paiements"();


--
-- Name: qr_designs trg_qr_designs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_qr_designs_updated_at" BEFORE UPDATE ON "public"."qr_designs" FOR EACH ROW EXECUTE FUNCTION "public"."set_qr_designs_updated_at"();


--
-- Name: ingredients trg_registre_stock_garde; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_registre_stock_garde" BEFORE INSERT OR UPDATE OF "current_stock" ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."registre_stock_garde_ingredients"();


--
-- Name: tables trg_tables_delete_occupied_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_tables_delete_occupied_guard" BEFORE DELETE ON "public"."tables" FOR EACH ROW EXECUTE FUNCTION "public"."guard_table_delete_occupied"();


--
-- Name: tables trg_tables_nom_pas_numero_autre; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_tables_nom_pas_numero_autre" BEFORE INSERT OR UPDATE OF "display_name", "table_number", "tenant_id" ON "public"."tables" FOR EACH ROW EXECUTE FUNCTION "public"."tables_nom_pas_numero_autre"();


--
-- Name: tenants trg_tenant_name_cross_group_unique; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_tenant_name_cross_group_unique" BEFORE INSERT OR UPDATE OF "name", "onboarding_completed", "group_id", "deleted_at" ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_tenant_name_cross_group_unique"();


--
-- Name: admin_users trigger_auto_create_user_preferences; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_auto_create_user_preferences" AFTER INSERT ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_user_preferences"();


--
-- Name: ingredients trigger_ingredients_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_ingredients_updated_at" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."update_ingredients_updated_at"();


--
-- Name: menus trigger_menus_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_menus_updated_at" BEFORE UPDATE ON "public"."menus" FOR EACH ROW EXECUTE FUNCTION "public"."update_menus_updated_at"();


--
-- Name: tenants trigger_set_trial_end_date; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_set_trial_end_date" BEFORE INSERT OR UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."set_trial_end_date"();


--
-- Name: stock_counts trigger_stock_counts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_stock_counts_updated_at" BEFORE UPDATE ON "public"."stock_counts" FOR EACH ROW EXECUTE FUNCTION "public"."update_ingredients_updated_at"();


--
-- Name: suppliers trigger_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."update_suppliers_updated_at"();


--
-- Name: user_preferences trigger_user_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_preferences_updated_at"();


--
-- Name: menu_items update_menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_menu_items_updated_at" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_tenants_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: venues venues_tenant_move_keeps_menus; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "venues_tenant_move_keeps_menus" BEFORE UPDATE OF "tenant_id" ON "public"."venues" FOR EACH ROW EXECUTE FUNCTION "public"."venues_tenant_move_keeps_menus"();


--
-- Name: account_deletion_requests account_deletion_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: admin_users admin_users_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_users admin_users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id");


--
-- Name: admin_users admin_users_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_users admin_users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: admin_users admin_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: ads ads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: ai_credits_ledger ai_credits_ledger_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;


--
-- Name: ai_credits_ledger ai_credits_ledger_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: ai_credits_ledger ai_credits_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: ai_photo_credits ai_photo_credits_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_photo_credits"
    ADD CONSTRAINT "ai_photo_credits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: alertes_nouvelle_connexion alertes_nouvelle_connexion_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alertes_nouvelle_connexion"
    ADD CONSTRAINT "alertes_nouvelle_connexion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: announcements announcements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: audit_log audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: categories categories_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;


--
-- Name: categories categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: categories categories_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE SET NULL;


--
-- Name: coupon_redemptions coupon_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: coupons coupons_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: dish_photo_drafts dish_photo_drafts_attached_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_attached_menu_item_id_fkey" FOREIGN KEY ("attached_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;


--
-- Name: dish_photo_drafts dish_photo_drafts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: dish_photo_drafts dish_photo_drafts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: flutterwave_anomalies flutterwave_anomalies_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_anomalies"
    ADD CONSTRAINT "flutterwave_anomalies_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."flutterwave_payments"("id") ON DELETE SET NULL;


--
-- Name: flutterwave_anomalies flutterwave_anomalies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_anomalies"
    ADD CONSTRAINT "flutterwave_anomalies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;


--
-- Name: flutterwave_payments flutterwave_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flutterwave_payments"
    ADD CONSTRAINT "flutterwave_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: house_accounts house_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: house_accounts house_accounts_settled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: house_accounts house_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: ingredients ingredients_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_users"("id");


--
-- Name: invitations invitations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_modifiers item_modifiers_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_modifiers item_modifiers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_options item_options_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_options item_options_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_price_variants item_price_variants_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_price_variants item_price_variants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_suggestions item_suggestions_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_suggestions item_suggestions_suggested_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_suggested_item_id_fkey" FOREIGN KEY ("suggested_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_suggestions item_suggestions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;


--
-- Name: menu_items menu_items_image_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_image_uploaded_by_fkey" FOREIGN KEY ("image_uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: menu_items menu_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: menus menus_parent_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_parent_menu_id_fkey" FOREIGN KEY ("parent_menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;


--
-- Name: menus menus_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: menus menus_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;


--
-- Name: notification_reads notification_reads_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: onboarding_progress onboarding_progress_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: order_items order_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: order_mutation_requests order_mutation_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_mutation_requests"
    ADD CONSTRAINT "order_mutation_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: order_notes order_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: order_notes order_notes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: order_notes order_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: order_number_counters order_number_counters_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_number_counters"
    ADD CONSTRAINT "order_number_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: orders orders_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_comped_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_comped_by_fkey" FOREIGN KEY ("comped_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE SET NULL;


--
-- Name: orders orders_house_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_house_account_id_fkey" FOREIGN KEY ("house_account_id") REFERENCES "public"."house_accounts"("id") ON DELETE SET NULL;


--
-- Name: orders orders_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE SET NULL;


--
-- Name: orders orders_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: orders orders_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: platform_audit_log platform_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: platform_audit_log platform_audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: poste_permissions poste_permissions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."poste_permissions"
    ADD CONSTRAINT "poste_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: poste_permissions poste_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."poste_permissions"
    ADD CONSTRAINT "poste_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: qr_designs qr_designs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."qr_designs"
    ADD CONSTRAINT "qr_designs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: recipes recipes_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: recipes recipes_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: recipes recipes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: reminder_preferences reminder_preferences_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminder_preferences"
    ADD CONSTRAINT "reminder_preferences_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: reminder_preferences reminder_preferences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminder_preferences"
    ADD CONSTRAINT "reminder_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: reminder_settings reminder_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminder_settings"
    ADD CONSTRAINT "reminder_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: reminder_settings reminder_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminder_settings"
    ADD CONSTRAINT "reminder_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: reminders reminders_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE SET NULL;


--
-- Name: reminders reminders_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: reminders reminders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: restaurant_groups restaurant_groups_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_alert_notifications stock_alert_notifications_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: stock_alert_notifications stock_alert_notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_count_lines stock_count_lines_count_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE CASCADE;


--
-- Name: stock_count_lines stock_count_lines_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: stock_count_lines stock_count_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_counts stock_counts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_counts"
    ADD CONSTRAINT "stock_counts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: suppliers suppliers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: table_assignments table_assignments_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: table_assignments table_assignments_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


--
-- Name: table_assignments table_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: table_sessions table_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: tables tables_qr_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_qr_design_id_fkey" FOREIGN KEY ("qr_design_id") REFERENCES "public"."qr_designs"("id") ON DELETE SET NULL;


--
-- Name: tables tables_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: tables tables_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE CASCADE;


--
-- Name: tenant_supports tenant_supports_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: tenant_tables_initialisees tenant_tables_initialisees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_tables_initialisees"
    ADD CONSTRAINT "tenant_tables_initialisees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: tenants tenants_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: tenants tenants_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."restaurant_groups"("id") ON DELETE SET NULL;


--
-- Name: tenants tenants_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: venues venues_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: zones zones_qr_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_qr_design_id_fkey" FOREIGN KEY ("qr_design_id") REFERENCES "public"."qr_designs"("id") ON DELETE SET NULL;


--
-- Name: zones zones_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: zones zones_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: audit_log Admins can insert audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert audit logs" ON "public"."audit_log" FOR INSERT WITH CHECK ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) AND (("user_id" IS NULL) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: audit_log Admins can read audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT USING (("tenant_id" = ANY (( SELECT "public"."tenants_avec_droit"('audit.view'::"text") AS "tenants_avec_droit")::"uuid"[])));


--
-- Name: notifications Admins can read own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can read own notifications" ON "public"."notifications" FOR SELECT USING ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) AND (("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("user_id" IS NULL))));


--
-- Name: notifications Admins can update own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update own notifications" ON "public"."notifications" FOR UPDATE USING ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: admin_users Admins can view own tenant admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant admins" ON "public"."admin_users" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))));


--
-- Name: ads Admins can view own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant ads" ON "public"."ads" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_suggestions Admins can view own tenant item_suggestions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant item_suggestions" ON "public"."item_suggestions" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_items Admins can view own tenant order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));


--
-- Name: orders Admins can view own tenant orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant orders" ON "public"."orders" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: dish_photo_drafts Admins manage own tenant drafts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins manage own tenant drafts" ON "public"."dish_photo_drafts" USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: ai_photo_credits Admins read own credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read own credits" ON "public"."ai_photo_credits" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."is_active" = true)))));


--
-- Name: ai_credits_ledger Admins read own ledger; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read own ledger" ON "public"."ai_credits_ledger" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."is_active" = true)))));


--
-- Name: tenants Authenticated users can read tenants they belong to; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read tenants they belong to" ON "public"."tenants" FOR SELECT USING (("id" = ANY (( SELECT "public"."get_my_tenant_ids_array"() AS "get_my_tenant_ids_array")::"uuid"[])));


--
-- Name: admin_users Block super_admin escalation by non-super-admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Block super_admin escalation by non-super-admins" ON "public"."admin_users" AS RESTRICTIVE USING ((((COALESCE("is_super_admin", false) = false) AND ("role" IS DISTINCT FROM 'super_admin'::"text")) OR "public"."is_super_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((((COALESCE("is_super_admin", false) = false) AND ("role" IS DISTINCT FROM 'super_admin'::"text")) OR "public"."is_super_admin"()));


--
-- Name: table_sessions Cashiers can delete own tenant table_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Cashiers can delete own tenant table_sessions" ON "public"."table_sessions" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.pay'::"text"));


--
-- Name: table_sessions Cashiers can insert own tenant table_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Cashiers can insert own tenant table_sessions" ON "public"."table_sessions" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.pay'::"text"));


--
-- Name: table_sessions Cashiers can update own tenant table_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Cashiers can update own tenant table_sessions" ON "public"."table_sessions" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.pay'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.pay'::"text"));


--
-- Name: categories Catalogue: restaurant visible ou membre; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Catalogue: restaurant visible ou membre" ON "public"."categories" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR "private"."storefront_tenant_visible"("tenant_id") OR "private"."viewer_owns_tenant_group"("tenant_id")));


--
-- Name: menu_items Catalogue: restaurant visible ou membre; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Catalogue: restaurant visible ou membre" ON "public"."menu_items" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR "private"."storefront_tenant_visible"("tenant_id") OR "private"."viewer_owns_tenant_group"("tenant_id")));


--
-- Name: menus Catalogue: restaurant visible ou membre; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Catalogue: restaurant visible ou membre" ON "public"."menus" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR "private"."storefront_tenant_visible"("tenant_id") OR "private"."viewer_owns_tenant_group"("tenant_id")));


--
-- Name: tables Catalogue: restaurant visible ou membre; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Catalogue: restaurant visible ou membre" ON "public"."tables" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR "private"."storefront_tenant_visible"("tenant_id") OR "private"."viewer_owns_tenant_group"("tenant_id")));


--
-- Name: venues Catalogue: restaurant visible ou membre; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Catalogue: restaurant visible ou membre" ON "public"."venues" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR "private"."storefront_tenant_visible"("tenant_id") OR "private"."viewer_owns_tenant_group"("tenant_id")));


--
-- Name: zones Catalogue: restaurant visible ou membre; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Catalogue: restaurant visible ou membre" ON "public"."zones" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR "private"."storefront_tenant_visible"("tenant_id") OR "private"."viewer_owns_tenant_group"("tenant_id")));


--
-- Name: categories Categories are publicly readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Categories are publicly readable" ON "public"."categories" FOR SELECT USING (("is_active" = true));


--
-- Name: newsletter_subscriber Enable delete for service_role only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable delete for service_role only" ON "public"."newsletter_subscriber" FOR DELETE TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: newsletter_subscriber Enable select for service_role only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable select for service_role only" ON "public"."newsletter_subscriber" FOR SELECT TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: table_assignments Floor managers can delete own tenant assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can delete own tenant assignments" ON "public"."table_assignments" FOR DELETE USING ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: tables Floor managers can delete own tenant tables; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can delete own tenant tables" ON "public"."tables" FOR DELETE USING ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: zones Floor managers can delete own tenant zones; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can delete own tenant zones" ON "public"."zones" FOR DELETE USING ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: table_assignments Floor managers can insert own tenant assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can insert own tenant assignments" ON "public"."table_assignments" FOR INSERT WITH CHECK ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: tables Floor managers can insert own tenant tables; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can insert own tenant tables" ON "public"."tables" FOR INSERT WITH CHECK ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: zones Floor managers can insert own tenant zones; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can insert own tenant zones" ON "public"."zones" FOR INSERT WITH CHECK ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: table_assignments Floor managers can update own tenant assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can update own tenant assignments" ON "public"."table_assignments" FOR UPDATE USING ("public"."has_tenant_floor_permission"("tenant_id")) WITH CHECK ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: tables Floor managers can update own tenant tables; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can update own tenant tables" ON "public"."tables" FOR UPDATE USING ("public"."has_tenant_floor_permission"("tenant_id")) WITH CHECK ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: zones Floor managers can update own tenant zones; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Floor managers can update own tenant zones" ON "public"."zones" FOR UPDATE USING ("public"."has_tenant_floor_permission"("tenant_id")) WITH CHECK ("public"."has_tenant_floor_permission"("tenant_id"));


--
-- Name: ingredients Inventory managers can delete own tenant ingredients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can delete own tenant ingredients" ON "public"."ingredients" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: recipes Inventory managers can delete own tenant recipes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can delete own tenant recipes" ON "public"."recipes" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_alert_notifications Inventory managers can delete own tenant stock alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can delete own tenant stock alerts" ON "public"."stock_alert_notifications" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_count_lines Inventory managers can delete own tenant stock_count_lines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can delete own tenant stock_count_lines" ON "public"."stock_count_lines" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_counts Inventory managers can delete own tenant stock_counts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can delete own tenant stock_counts" ON "public"."stock_counts" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: suppliers Inventory managers can delete own tenant suppliers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can delete own tenant suppliers" ON "public"."suppliers" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text"));


--
-- Name: ingredients Inventory managers can insert own tenant ingredients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can insert own tenant ingredients" ON "public"."ingredients" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: recipes Inventory managers can insert own tenant recipes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can insert own tenant recipes" ON "public"."recipes" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_alert_notifications Inventory managers can insert own tenant stock alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can insert own tenant stock alerts" ON "public"."stock_alert_notifications" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_count_lines Inventory managers can insert own tenant stock_count_lines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can insert own tenant stock_count_lines" ON "public"."stock_count_lines" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_counts Inventory managers can insert own tenant stock_counts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can insert own tenant stock_counts" ON "public"."stock_counts" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: suppliers Inventory managers can insert own tenant suppliers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can insert own tenant suppliers" ON "public"."suppliers" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text"));


--
-- Name: ingredients Inventory managers can update own tenant ingredients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can update own tenant ingredients" ON "public"."ingredients" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: recipes Inventory managers can update own tenant recipes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can update own tenant recipes" ON "public"."recipes" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_alert_notifications Inventory managers can update own tenant stock alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can update own tenant stock alerts" ON "public"."stock_alert_notifications" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_count_lines Inventory managers can update own tenant stock_count_lines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can update own tenant stock_count_lines" ON "public"."stock_count_lines" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: stock_counts Inventory managers can update own tenant stock_counts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can update own tenant stock_counts" ON "public"."stock_counts" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));


--
-- Name: suppliers Inventory managers can update own tenant suppliers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory managers can update own tenant suppliers" ON "public"."suppliers" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text"));


--
-- Name: ingredients Inventory viewers can view own tenant ingredients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory viewers can view own tenant ingredients" ON "public"."ingredients" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."get_my_inventory_tenant_ids"() AS "get_my_inventory_tenant_ids")::"uuid"[])));


--
-- Name: recipes Inventory viewers can view own tenant recipes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory viewers can view own tenant recipes" ON "public"."recipes" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."get_my_inventory_tenant_ids"() AS "get_my_inventory_tenant_ids")::"uuid"[])));


--
-- Name: stock_count_lines Inventory viewers can view own tenant stock_count_lines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory viewers can view own tenant stock_count_lines" ON "public"."stock_count_lines" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."get_my_inventory_tenant_ids"() AS "get_my_inventory_tenant_ids")::"uuid"[])));


--
-- Name: stock_counts Inventory viewers can view own tenant stock_counts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory viewers can view own tenant stock_counts" ON "public"."stock_counts" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."get_my_inventory_tenant_ids"() AS "get_my_inventory_tenant_ids")::"uuid"[])));


--
-- Name: stock_movements Inventory viewers can view own tenant stock_movements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory viewers can view own tenant stock_movements" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."get_my_inventory_tenant_ids"() AS "get_my_inventory_tenant_ids")::"uuid"[])));


--
-- Name: suppliers Inventory viewers can view own tenant suppliers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Inventory viewers can view own tenant suppliers" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."get_my_inventory_tenant_ids"() AS "get_my_inventory_tenant_ids")::"uuid"[])));


--
-- Name: item_modifiers Item modifiers viewable by anon for available items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Item modifiers viewable by anon for available items" ON "public"."item_modifiers" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_modifiers"."menu_item_id") AND ("mi"."tenant_id" = "item_modifiers"."tenant_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));


--
-- Name: item_options Item options viewable by anon for available items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Item options viewable by anon for available items" ON "public"."item_options" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_options"."menu_item_id") AND ("mi"."tenant_id" = "item_options"."tenant_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));


--
-- Name: announcements Members can read own tenant announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant announcements" ON "public"."announcements" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: categories Members can read own tenant categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant categories" ON "public"."categories" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: coupons Members can read own tenant coupons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant coupons" ON "public"."coupons" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_modifiers Members can read own tenant item modifiers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant item modifiers" ON "public"."item_modifiers" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_options Members can read own tenant item options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant item options" ON "public"."item_options" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: menu_items Members can read own tenant menu items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant menu items" ON "public"."menu_items" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: menus Members can read own tenant menus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant menus" ON "public"."menus" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_price_variants Members can read own tenant price variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant price variants" ON "public"."item_price_variants" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: settings Members can read own tenant settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant settings" ON "public"."settings" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: tables Members can read own tenant tables; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant tables" ON "public"."tables" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: venues Members can read own tenant venues; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can read own tenant venues" ON "public"."venues" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: zones Members can view own tenant zones; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view own tenant zones" ON "public"."zones" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: admin_users Members update their own admin row; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members update their own admin row" ON "public"."admin_users" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: platform_settings Membres connectes: lecture des reglages plateforme; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Membres connectes: lecture des reglages plateforme" ON "public"."platform_settings" FOR SELECT TO "authenticated" USING (true);


--
-- Name: tenants Membres: leurs restaurants avant double authentification; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Membres: leurs restaurants avant double authentification" ON "public"."tenants" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users" "au"
  WHERE (("au"."tenant_id" = "tenants"."id") AND ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (COALESCE("au"."is_active", true) = true) AND ("au"."deleted_at" IS NULL)))));


--
-- Name: ads Menu managers can delete own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant ads" ON "public"."ads" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: announcements Menu managers can delete own tenant announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant announcements" ON "public"."announcements" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: categories Menu managers can delete own tenant categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant categories" ON "public"."categories" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: coupons Menu managers can delete own tenant coupons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant coupons" ON "public"."coupons" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text"));


--
-- Name: item_modifiers Menu managers can delete own tenant item modifiers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant item modifiers" ON "public"."item_modifiers" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_options Menu managers can delete own tenant item options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant item options" ON "public"."item_options" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_suggestions Menu managers can delete own tenant item_suggestions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant item_suggestions" ON "public"."item_suggestions" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: menu_items Menu managers can delete own tenant menu items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant menu items" ON "public"."menu_items" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: menus Menu managers can delete own tenant menus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant menus" ON "public"."menus" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_price_variants Menu managers can delete own tenant price variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can delete own tenant price variants" ON "public"."item_price_variants" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text"));


--
-- Name: ads Menu managers can insert own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant ads" ON "public"."ads" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: announcements Menu managers can insert own tenant announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant announcements" ON "public"."announcements" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: coupons Menu managers can insert own tenant coupons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant coupons" ON "public"."coupons" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text"));


--
-- Name: item_modifiers Menu managers can insert own tenant item modifiers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant item modifiers" ON "public"."item_modifiers" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_options Menu managers can insert own tenant item options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant item options" ON "public"."item_options" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_suggestions Menu managers can insert own tenant item_suggestions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant item_suggestions" ON "public"."item_suggestions" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: menus Menu managers can insert own tenant menus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant menus" ON "public"."menus" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_price_variants Menu managers can insert own tenant price variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can insert own tenant price variants" ON "public"."item_price_variants" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text"));


--
-- Name: ads Menu managers can update own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant ads" ON "public"."ads" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: announcements Menu managers can update own tenant announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant announcements" ON "public"."announcements" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: categories Menu managers can update own tenant categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant categories" ON "public"."categories" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: coupons Menu managers can update own tenant coupons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant coupons" ON "public"."coupons" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text"));


--
-- Name: item_modifiers Menu managers can update own tenant item modifiers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant item modifiers" ON "public"."item_modifiers" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_options Menu managers can update own tenant item options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant item options" ON "public"."item_options" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_suggestions Menu managers can update own tenant item_suggestions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant item_suggestions" ON "public"."item_suggestions" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: menu_items Menu managers can update own tenant menu items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant menu items" ON "public"."menu_items" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: menus Menu managers can update own tenant menus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant menus" ON "public"."menus" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: item_price_variants Menu managers can update own tenant price variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Menu managers can update own tenant price variants" ON "public"."item_price_variants" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text"));


--
-- Name: house_accounts Money managers can delete own tenant house_accounts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Money managers can delete own tenant house_accounts" ON "public"."house_accounts" FOR DELETE USING ("public"."has_tenant_money_permission"("tenant_id"));


--
-- Name: order_items Money managers can delete own tenant order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Money managers can delete own tenant order items" ON "public"."order_items" FOR DELETE USING (("public"."has_tenant_money_permission"("tenant_id") AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id"))))));


--
-- Name: orders Money managers can delete own tenant orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Money managers can delete own tenant orders" ON "public"."orders" FOR DELETE USING (("public"."has_tenant_money_permission"("tenant_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."payments" "p"
  WHERE ("p"."order_id" = "orders"."id"))))));


--
-- Name: house_accounts Money managers can insert own tenant house_accounts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Money managers can insert own tenant house_accounts" ON "public"."house_accounts" FOR INSERT WITH CHECK ("public"."has_tenant_money_permission"("tenant_id"));


--
-- Name: house_accounts Money managers can update own tenant house_accounts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Money managers can update own tenant house_accounts" ON "public"."house_accounts" FOR UPDATE USING ("public"."has_tenant_money_permission"("tenant_id")) WITH CHECK ("public"."has_tenant_money_permission"("tenant_id"));


--
-- Name: order_notes Order managers can insert own tenant order_notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Order managers can insert own tenant order_notes" ON "public"."order_notes" FOR INSERT WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")));


--
-- Name: order_items Order managers can update own tenant order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Order managers can update own tenant order items" ON "public"."order_items" FOR UPDATE USING ((("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")) AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id")))))) WITH CHECK ((("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")) AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id"))))));


--
-- Name: orders Order managers can update own tenant orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Order managers can update own tenant orders" ON "public"."orders" FOR UPDATE USING (("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text"))) WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")));


--
-- Name: admin_users Platform-removed admin rows are frozen for tenants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Platform-removed admin rows are frozen for tenants" ON "public"."admin_users" AS RESTRICTIVE FOR UPDATE USING ((("deleted_at" IS NULL) OR "public"."is_super_admin"())) WITH CHECK ((("deleted_at" IS NULL) OR "public"."is_super_admin"()));


--
-- Name: item_price_variants Price variants viewable by anon for available items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Price variants viewable by anon for available items" ON "public"."item_price_variants" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_price_variants"."menu_item_id") AND ("mi"."tenant_id" = "item_price_variants"."tenant_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));


--
-- Name: flutterwave_payments Proprietaires et admins lisent les paiements Flutterwave; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Proprietaires et admins lisent les paiements Flutterwave" ON "public"."flutterwave_payments" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."tenants_avec_droit"('billing.manage'::"text", 'limited'::"text") AS "tenants_avec_droit")::"uuid"[])));


--
-- Name: tenants Public can read active tenants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can read active tenants" ON "public"."tenants" FOR SELECT TO "anon" USING (("is_active" = true));


--
-- Name: announcements Public can view active announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view active announcements" ON "public"."announcements" FOR SELECT USING (("is_active" = true));


--
-- Name: menus Public can view active menus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view active menus" ON "public"."menus" FOR SELECT USING (("is_active" = true));


--
-- Name: tables Public can view active tables; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view active tables" ON "public"."tables" FOR SELECT USING (("is_active" = true));


--
-- Name: menu_items Public can view menu items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view menu items" ON "public"."menu_items" FOR SELECT USING (("deleted_at" IS NULL));


--
-- Name: qr_designs Settings managers can delete own tenant qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can delete own tenant qr designs" ON "public"."qr_designs" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: settings Settings managers can delete own tenant settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can delete own tenant settings" ON "public"."settings" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: tenant_supports Settings managers can delete own tenant supports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can delete own tenant supports" ON "public"."tenant_supports" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: venues Settings managers can delete own tenant venues; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can delete own tenant venues" ON "public"."venues" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: qr_designs Settings managers can insert own tenant qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can insert own tenant qr designs" ON "public"."qr_designs" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: settings Settings managers can insert own tenant settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can insert own tenant settings" ON "public"."settings" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: tenant_supports Settings managers can insert own tenant supports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can insert own tenant supports" ON "public"."tenant_supports" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: venues Settings managers can insert own tenant venues; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can insert own tenant venues" ON "public"."venues" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: tenants Settings managers can update own tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can update own tenant" ON "public"."tenants" FOR UPDATE USING ("public"."has_tenant_write_permission"("id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("id", 'settings.edit'::"text"));


--
-- Name: qr_designs Settings managers can update own tenant qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can update own tenant qr designs" ON "public"."qr_designs" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: settings Settings managers can update own tenant settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can update own tenant settings" ON "public"."settings" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: tenant_supports Settings managers can update own tenant supports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can update own tenant supports" ON "public"."tenant_supports" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: venues Settings managers can update own tenant venues; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Settings managers can update own tenant venues" ON "public"."venues" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: platform_settings Super admin: ajout des reglages plateforme; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Super admin: ajout des reglages plateforme" ON "public"."platform_settings" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));


--
-- Name: flutterwave_anomalies Super admin: lecture des anomalies Flutterwave; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Super admin: lecture des anomalies Flutterwave" ON "public"."flutterwave_anomalies" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));


--
-- Name: platform_settings Super admin: modification des reglages plateforme; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Super admin: modification des reglages plateforme" ON "public"."platform_settings" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));


--
-- Name: platform_settings Super admin: suppression des reglages plateforme; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Super admin: suppression des reglages plateforme" ON "public"."platform_settings" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));


--
-- Name: user_sessions Tenant admins can view tenant sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant admins can view tenant sessions" ON "public"."user_sessions" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: table_assignments Tenant members can view assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can view assignments" ON "public"."table_assignments" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: qr_designs Tenant members can view qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can view qr designs" ON "public"."qr_designs" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active"))));


--
-- Name: tenants Tenants visibles: super-administrateur; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenants visibles: super-administrateur" ON "public"."tenants" FOR SELECT TO "authenticated" USING ((("is_active" = true) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));


--
-- Name: push_subscriptions Un membre gere ses abonnements push de son restaurant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Un membre gere ses abonnements push de son restaurant" ON "public"."push_subscriptions" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))));


--
-- Name: onboarding_progress Users can insert own onboarding_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own onboarding_progress" ON "public"."onboarding_progress" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_preferences Users can insert own preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_sessions Users can insert own sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own sessions" ON "public"."user_sessions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users" "au"
  WHERE (("au"."id" = "user_sessions"."user_id") AND ("au"."tenant_id" = "user_sessions"."tenant_id") AND ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND COALESCE("au"."is_active", true) AND ("au"."deleted_at" IS NULL)))));


--
-- Name: onboarding_progress Users can update own onboarding_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own onboarding_progress" ON "public"."onboarding_progress" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_preferences Users can update own preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own preferences" ON "public"."user_preferences" FOR UPDATE USING (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: onboarding_progress Users can view own onboarding_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own onboarding_progress" ON "public"."onboarding_progress" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_preferences Users can view own preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own preferences" ON "public"."user_preferences" FOR SELECT USING ((("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("user_id" IN ( SELECT "au"."id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))));


--
-- Name: user_sessions Users can view own sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own sessions" ON "public"."user_sessions" FOR SELECT USING (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: venues Venues are publicly readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Venues are publicly readable" ON "public"."venues" FOR SELECT USING (("is_active" = true));


--
-- Name: account_deletion_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."account_deletion_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: adresses_email_bloquees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."adresses_email_bloquees" ENABLE ROW LEVEL SECURITY;

--
-- Name: ads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ads" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_credits_ledger; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_credits_ledger" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_photo_credits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_photo_credits" ENABLE ROW LEVEL SECURITY;

--
-- Name: alertes_nouvelle_connexion; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."alertes_nouvelle_connexion" ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories atfood_insert_categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "atfood_insert_categories" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));


--
-- Name: menu_items atfood_insert_menu_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "atfood_insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text") AND "public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text")));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."coupon_redemptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions coupon_redemptions_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "coupon_redemptions_tenant_select" ON "public"."coupon_redemptions" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;

--
-- Name: cron_heartbeats; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cron_heartbeats" ENABLE ROW LEVEL SECURITY;

--
-- Name: dish_photo_drafts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."dish_photo_drafts" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_unsubscribes" ENABLE ROW LEVEL SECURITY;

--
-- Name: flutterwave_anomalies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."flutterwave_anomalies" ENABLE ROW LEVEL SECURITY;

--
-- Name: flutterwave_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."flutterwave_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants group_owner_can_read_tenants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_owner_can_read_tenants" ON "public"."tenants" FOR SELECT USING (("group_id" IN ( SELECT "restaurant_groups"."id"
   FROM "public"."restaurant_groups"
  WHERE ("restaurant_groups"."owner_user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: house_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."house_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: house_accounts house_accounts_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "house_accounts_tenant_select" ON "public"."house_accounts" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_modifiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_options; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_options" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_price_variants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_price_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_suggestions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_suggestions" ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: menus; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."menus" ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_subscriber; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."newsletter_subscriber" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_reads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_reads" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_reads notification_reads_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_reads_delete_own" ON "public"."notification_reads" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: notification_reads notification_reads_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_reads_insert_own" ON "public"."notification_reads" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) AND (EXISTS ( SELECT 1
   FROM "public"."notifications" "n"
  WHERE (("n"."id" = "notification_reads"."notification_id") AND ("n"."tenant_id" = "notification_reads"."tenant_id") AND (("n"."user_id" IS NULL) OR ("n"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));


--
-- Name: notification_reads notification_reads_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_reads_select_own" ON "public"."notification_reads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: notification_reads notification_reads_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_reads_update_own" ON "public"."notification_reads" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())) AND (EXISTS ( SELECT 1
   FROM "public"."notifications" "n"
  WHERE (("n"."id" = "notification_reads"."notification_id") AND ("n"."tenant_id" = "notification_reads"."tenant_id") AND (("n"."user_id" IS NULL) OR ("n"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;

--
-- Name: orange_money_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orange_money_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: orange_money_events orange_money_events_service_only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orange_money_events_service_only" ON "public"."orange_money_events" AS RESTRICTIVE TO "authenticated", "anon" USING (false);


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_items_tenant_select" ON "public"."order_items" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_mutation_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_mutation_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_mutation_requests order_mutation_requests_tenant_rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_mutation_requests_tenant_rw" ON "public"."order_mutation_requests" TO "authenticated" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active")))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active"))));


--
-- Name: order_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_notes order_notes_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_notes_tenant_select" ON "public"."order_notes" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_number_counters; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_number_counters" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_groups owner_can_delete_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_delete_own_group" ON "public"."restaurant_groups" FOR DELETE TO "authenticated" USING (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: restaurant_groups owner_can_insert_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_insert_own_group" ON "public"."restaurant_groups" FOR INSERT WITH CHECK (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: restaurant_groups owner_can_select_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_select_own_group" ON "public"."restaurant_groups" FOR SELECT USING (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: restaurant_groups owner_can_update_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_update_own_group" ON "public"."restaurant_groups" FOR UPDATE USING (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: owner_trial_ledger; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."owner_trial_ledger" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_tenant_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_tenant_insert" ON "public"."payments" FOR INSERT WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'orders.pay'::"text") AND ((("status" = 'completed'::"text") AND ("amount" >= 0)) OR "public"."has_tenant_money_permission"("tenant_id"))));


--
-- Name: payments payments_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_tenant_select" ON "public"."payments" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: platform_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."platform_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: poste_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."poste_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: poste_permissions poste_permissions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "poste_permissions_delete" ON "public"."poste_permissions" FOR DELETE TO "authenticated" USING ("public"."is_tenant_owner"("tenant_id"));


--
-- Name: poste_permissions poste_permissions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "poste_permissions_insert" ON "public"."poste_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_tenant_owner"("tenant_id"));


--
-- Name: poste_permissions poste_permissions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "poste_permissions_select" ON "public"."poste_permissions" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY (( SELECT "public"."get_my_tenant_ids_array"() AS "get_my_tenant_ids_array")::"uuid"[])));


--
-- Name: poste_permissions poste_permissions_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "poste_permissions_update" ON "public"."poste_permissions" FOR UPDATE TO "authenticated" USING ("public"."is_tenant_owner"("tenant_id")) WITH CHECK ("public"."is_tenant_owner"("tenant_id"));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_designs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."qr_designs" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reminder_preferences" ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_preferences reminder_preferences_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_preferences_delete_own" ON "public"."reminder_preferences" FOR DELETE TO "authenticated" USING (("admin_user_id" IN ( SELECT "au"."id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: reminder_preferences reminder_preferences_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_preferences_insert_own" ON "public"."reminder_preferences" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users" "au"
  WHERE (("au"."id" = "reminder_preferences"."admin_user_id") AND ("au"."tenant_id" = "reminder_preferences"."tenant_id") AND ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: reminder_preferences reminder_preferences_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_preferences_select_own" ON "public"."reminder_preferences" FOR SELECT TO "authenticated" USING (("admin_user_id" IN ( SELECT "au"."id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: reminder_preferences reminder_preferences_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_preferences_update_own" ON "public"."reminder_preferences" FOR UPDATE TO "authenticated" USING (("admin_user_id" IN ( SELECT "au"."id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users" "au"
  WHERE (("au"."id" = "reminder_preferences"."admin_user_id") AND ("au"."tenant_id" = "reminder_preferences"."tenant_id") AND ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: reminder_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reminder_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_settings reminder_settings_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_settings_delete" ON "public"."reminder_settings" FOR DELETE TO "authenticated" USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: reminder_settings reminder_settings_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_settings_insert" ON "public"."reminder_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: reminder_settings reminder_settings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_settings_select" ON "public"."reminder_settings" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: reminder_settings reminder_settings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminder_settings_update" ON "public"."reminder_settings" FOR UPDATE TO "authenticated" USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));


--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reminders" ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders reminders_no_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminders_no_delete" ON "public"."reminders" FOR DELETE TO "authenticated" USING (false);


--
-- Name: reminders reminders_no_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminders_no_insert" ON "public"."reminders" FOR INSERT TO "authenticated" WITH CHECK (false);


--
-- Name: reminders reminders_no_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminders_no_update" ON "public"."reminders" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: reminders reminders_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reminders_select_own" ON "public"."reminders" FOR SELECT TO "authenticated" USING (("recipient_id" IN ( SELECT "au"."id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: restaurant_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."restaurant_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_groups service_role_full_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_role_full_access" ON "public"."restaurant_groups" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: invitations service_role_full_access_invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_role_full_access_invitations" ON "public"."invitations" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_alert_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_alert_notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_alert_notifications stock_alerts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_alerts_select" ON "public"."stock_alert_notifications" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_count_lines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_count_lines" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_counts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_counts" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;

--
-- Name: table_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."table_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: table_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."table_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: table_sessions table_sessions_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "table_sessions_tenant_select" ON "public"."table_sessions" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: tables; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations tenant_admins_can_view_invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_admins_can_view_invitations" ON "public"."invitations" FOR SELECT USING (("tenant_id" = ANY (( SELECT "public"."tenants_avec_droit"('team.manage'::"text") AS "tenants_avec_droit")::"uuid"[])));


--
-- Name: tenant_supports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tenant_supports" ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_supports tenant_supports_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_supports_select" ON "public"."tenant_supports" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: tenant_tables_initialisees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tenant_tables_initialisees" ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;

--
-- Name: wave_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."wave_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: wave_events wave_events_service_only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wave_events_service_only" ON "public"."wave_events" AS RESTRICTIVE TO "authenticated", "anon" USING (false);


--
-- Name: zones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."zones" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "private"; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA "private" TO "anon";
GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "codes_droits"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."codes_droits"() FROM PUBLIC;


--
-- Name: FUNCTION "droits_hors_catalogue"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."droits_hors_catalogue"() FROM PUBLIC;


--
-- Name: FUNCTION "droits_valides"("p" "jsonb"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."droits_valides"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."droits_valides"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."droits_valides"("p" "jsonb") TO "service_role";


--
-- Name: FUNCTION "garder_proprietaire"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."garder_proprietaire"() FROM PUBLIC;


--
-- Name: FUNCTION "matrice_postes"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."matrice_postes"() FROM PUBLIC;


--
-- Name: FUNCTION "postes_depuis_role"("p_role" "text"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."postes_depuis_role"("p_role" "text") FROM PUBLIC;


--
-- Name: FUNCTION "postes_normalises"("p" "text"[]); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."postes_normalises"("p" "text"[]) FROM PUBLIC;


--
-- Name: FUNCTION "role_depuis_postes"("p_postes" "text"[]); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."role_depuis_postes"("p_postes" "text"[]) FROM PUBLIC;


--
-- Name: FUNCTION "storefront_tenant_visible"("p_tenant_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."storefront_tenant_visible"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."storefront_tenant_visible"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."storefront_tenant_visible"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."storefront_tenant_visible"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "sync_postes_admin_users"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."sync_postes_admin_users"() FROM PUBLIC;


--
-- Name: FUNCTION "sync_postes_invitations"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."sync_postes_invitations"() FROM PUBLIC;


--
-- Name: FUNCTION "viewer_owns_tenant_group"("p_tenant_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."viewer_owns_tenant_group"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."viewer_owns_tenant_group"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."viewer_owns_tenant_group"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."viewer_owns_tenant_group"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") TO "service_role";


--
-- Name: FUNCTION "adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid", "p_unit_cost" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid", "p_unit_cost" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid", "p_unit_cost" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid", "p_unit_cost" numeric) TO "service_role";


--
-- Name: FUNCTION "anonymize_closed_tenants"("p_cutoff" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."anonymize_closed_tenants"("p_cutoff" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."anonymize_closed_tenants"("p_cutoff" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "apply_flutterwave_payment"("p_payment_id" "uuid", "p_flw_transaction_id" bigint, "p_paid_amount" bigint, "p_current_price" bigint, "p_stripe_live" boolean, "p_now" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_flutterwave_payment"("p_payment_id" "uuid", "p_flw_transaction_id" bigint, "p_paid_amount" bigint, "p_current_price" bigint, "p_stripe_live" boolean, "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_flutterwave_payment"("p_payment_id" "uuid", "p_flw_transaction_id" bigint, "p_paid_amount" bigint, "p_current_price" bigint, "p_stripe_live" boolean, "p_now" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "assert_inventory_edit"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_inventory_edit"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_inventory_edit"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_inventory_view"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_inventory_view"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_inventory_view"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_tenant_business_reports"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_tenant_business_reports"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_tenant_business_reports"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_tenant_member"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_tenant_reports"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_tenant_reports"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_tenant_reports"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_tenant_reports_ventes"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_tenant_reports_ventes"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_tenant_reports_ventes"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_tenant_reports_view"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_tenant_reports_view"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_tenant_reports_view"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_valid_timezone"("p_timezone" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_valid_timezone"("p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_valid_timezone"("p_timezone" "text") TO "service_role";


--
-- Name: FUNCTION "audit_log_auteur_session"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."audit_log_auteur_session"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_log_auteur_session"() TO "service_role";


--
-- Name: FUNCTION "audit_personal_keys"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."audit_personal_keys"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_personal_keys"() TO "service_role";


--
-- Name: FUNCTION "auto_create_user_preferences"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "service_role";


--
-- Name: FUNCTION "borner_zones_depart"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."borner_zones_depart"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."borner_zones_depart"() TO "service_role";


--
-- Name: FUNCTION "broadcast_order_status"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."broadcast_order_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."broadcast_order_status"() TO "service_role";


--
-- Name: FUNCTION "cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") TO "service_role";


--
-- Name: FUNCTION "claim_coupon_usage"("p_coupon_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "close_table_session_if_settled"("p_session_id" "uuid", "p_tenant_id" "uuid", "p_stale_before" timestamp with time zone, "p_require_served" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."close_table_session_if_settled"("p_session_id" "uuid", "p_tenant_id" "uuid", "p_stale_before" timestamp with time zone, "p_require_served" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_table_session_if_settled"("p_session_id" "uuid", "p_tenant_id" "uuid", "p_stale_before" timestamp with time zone, "p_require_served" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_table_session_if_settled"("p_session_id" "uuid", "p_tenant_id" "uuid", "p_stale_before" timestamp with time zone, "p_require_served" boolean) TO "service_role";


--
-- Name: FUNCTION "closed_tenant_auth_users"("p_cutoff" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."closed_tenant_auth_users"("p_cutoff" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."closed_tenant_auth_users"("p_cutoff" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "decide_owner_trial"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."decide_owner_trial"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_owner_trial"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "delete_my_account"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";


--
-- Name: FUNCTION "destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "encaisser_commande"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_method" "text", "p_tip_ajout" bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."encaisser_commande"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_method" "text", "p_tip_ajout" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."encaisser_commande"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_method" "text", "p_tip_ajout" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."encaisser_commande"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_method" "text", "p_tip_ajout" bigint) TO "service_role";


--
-- Name: FUNCTION "enforce_category_menu_tenant"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_category_menu_tenant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_category_menu_tenant"() TO "service_role";


--
-- Name: FUNCTION "enforce_ingredient_update_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."enforce_ingredient_update_entitlement"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_ingredient_update_entitlement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_ingredient_update_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_inventory_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_inventory_entitlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_inventory_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_item_child_menu_item_tenant"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_item_child_menu_item_tenant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_item_child_menu_item_tenant"() TO "service_role";


--
-- Name: FUNCTION "enforce_item_suggestion_tenant"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_item_suggestion_tenant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_item_suggestion_tenant"() TO "service_role";


--
-- Name: FUNCTION "enforce_kds_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."enforce_kds_entitlement"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_kds_entitlement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_kds_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_menu_item_category_tenant"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_menu_item_category_tenant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_menu_item_category_tenant"() TO "service_role";


--
-- Name: FUNCTION "enforce_min_one_active_venue"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_min_one_active_venue"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_min_one_active_venue"() TO "service_role";


--
-- Name: FUNCTION "enforce_order_plan_features"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_order_plan_features"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_order_plan_features"() TO "service_role";


--
-- Name: FUNCTION "enforce_qr_customization_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_qr_customization_entitlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_qr_customization_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_recipes_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."enforce_recipes_entitlement"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_recipes_entitlement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_recipes_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_service_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_service_entitlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_service_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_stock_movement_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."enforce_stock_movement_entitlement"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_stock_movement_entitlement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_stock_movement_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_tables_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_tables_entitlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_tables_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_tenant_name_cross_group_unique"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_tenant_name_cross_group_unique"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_tenant_name_cross_group_unique"() TO "service_role";


--
-- Name: FUNCTION "enforce_venue_plan_limit"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_venue_plan_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_venue_plan_limit"() TO "service_role";


--
-- Name: FUNCTION "exiger_registre_pour_paid"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."exiger_registre_pour_paid"() FROM PUBLIC;


--
-- Name: FUNCTION "exiger_registre_rembourse_pour_annuler"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."exiger_registre_rembourse_pour_annuler"() FROM PUBLIC;


--
-- Name: FUNCTION "expire_stale_payment_sessions"("p_max_age_minutes" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) TO "service_role";


--
-- Name: FUNCTION "flutterwave_freeze_overdue"("p_now" timestamp with time zone, "p_grace" interval, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."flutterwave_freeze_overdue"("p_now" timestamp with time zone, "p_grace" interval, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."flutterwave_freeze_overdue"("p_now" timestamp with time zone, "p_grace" interval, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "flutterwave_renewals_due"("p_now" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."flutterwave_renewals_due"("p_now" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."flutterwave_renewals_due"("p_now" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "garder_ecriture_registre_paiements"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."garder_ecriture_registre_paiements"() TO "anon";
GRANT ALL ON FUNCTION "public"."garder_ecriture_registre_paiements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."garder_ecriture_registre_paiements"() TO "service_role";


--
-- Name: FUNCTION "garder_prix_carte"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."garder_prix_carte"() FROM PUBLIC;


--
-- Name: FUNCTION "garder_statut_cuisine"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."garder_statut_cuisine"() FROM PUBLIC;


--
-- Name: FUNCTION "generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "service_role";


--
-- Name: FUNCTION "get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_category_breakdown_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_category_breakdown_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_category_breakdown_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") TO "service_role";


--
-- Name: FUNCTION "get_daily_revenue_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_daily_revenue_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_revenue_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") TO "service_role";


--
-- Name: FUNCTION "get_dish_margins"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_dish_margins"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dish_margins"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dish_margins"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_house_account_balances"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_my_inventory_tenant_ids"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_my_inventory_tenant_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_inventory_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_inventory_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_inventory_tenant_ids"() TO "service_role";


--
-- Name: FUNCTION "get_my_tenant_ids"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "service_role";


--
-- Name: FUNCTION "get_my_tenant_ids_array"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "service_role";


--
-- Name: FUNCTION "get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_order_summary_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_order_summary_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_order_summary_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "get_payment_method_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_payment_method_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payment_method_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_method_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_period_comparison"("p_tenant_id" "uuid", "p_mode" "text", "p_timezone" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_period_comparison"("p_tenant_id" "uuid", "p_mode" "text", "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_period_comparison"("p_tenant_id" "uuid", "p_mode" "text", "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_period_comparison"("p_tenant_id" "uuid", "p_mode" "text", "p_timezone" "text") TO "service_role";


--
-- Name: FUNCTION "get_sales_heatmap"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_sales_heatmap"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_sales_heatmap"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sales_heatmap"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_timezone" "text") TO "service_role";


--
-- Name: FUNCTION "get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_server_performance_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_server_performance_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_server_performance_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_staff_stock_report_brut"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_staff_stock_report_brut"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_staff_stock_report_brut"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_stock_losses_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_stock_losses_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stock_losses_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_losses_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";


--
-- Name: FUNCTION "get_stock_status"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_storefront_ads"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_storefront_ads"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_storefront_ads"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_storefront_ads"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_storefront_ads"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_tenant_by_slug"("p_slug" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "service_role";


--
-- Name: FUNCTION "get_tenant_public_by_id"("p_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_top_items_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_top_items_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_top_items_brut"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_venue_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_venue_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_venue_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_venue_report"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_venue_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_venue_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_venue_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_venue_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "guard_house_account_settle"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."guard_house_account_settle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_house_account_settle"() TO "service_role";


--
-- Name: FUNCTION "guard_order_house_account_open"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."guard_order_house_account_open"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_order_house_account_open"() TO "service_role";


--
-- Name: FUNCTION "guard_table_delete_occupied"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."guard_table_delete_occupied"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_table_delete_occupied"() TO "service_role";


--
-- Name: FUNCTION "has_tenant_floor_permission"("p_tenant" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."has_tenant_floor_permission"("p_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tenant_floor_permission"("p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tenant_floor_permission"("p_tenant" "uuid") TO "service_role";


--
-- Name: FUNCTION "has_tenant_money_permission"("p_tenant" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."has_tenant_money_permission"("p_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tenant_money_permission"("p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tenant_money_permission"("p_tenant" "uuid") TO "service_role";


--
-- Name: FUNCTION "has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text") TO "service_role";


--
-- Name: FUNCTION "import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb", "p_removals" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb", "p_removals" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb", "p_removals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb", "p_removals" "jsonb") TO "service_role";


--
-- Name: FUNCTION "increment_login_count"("admin_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) TO "service_role";


--
-- Name: FUNCTION "inscrire_espace_commande"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."inscrire_espace_commande"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inscrire_espace_commande"() TO "service_role";


--
-- Name: FUNCTION "is_super_admin"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";


--
-- Name: FUNCTION "is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") TO "service_role";


--
-- Name: FUNCTION "is_tenant_name_taken"("p_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_tenant_name_taken"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_tenant_name_taken"("p_name" "text") TO "service_role";


--
-- Name: FUNCTION "is_tenant_owner"("p_tenant" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_tenant_owner"("p_tenant" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_tenant_owner"("p_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_owner"("p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_owner"("p_tenant" "uuid") TO "service_role";


--
-- Name: FUNCTION "item_suggestions_modifiee_devient_manuelle"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."item_suggestions_modifiee_devient_manuelle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."item_suggestions_modifiee_devient_manuelle"() TO "service_role";


--
-- Name: FUNCTION "marquer_tables_initialisees"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."marquer_tables_initialisees"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marquer_tables_initialisees"() TO "service_role";


--
-- Name: FUNCTION "menu_items_masquage_manuel"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."menu_items_masquage_manuel"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."menu_items_masquage_manuel"() TO "service_role";


--
-- Name: FUNCTION "menus_same_tenant_links"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."menus_same_tenant_links"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."menus_same_tenant_links"() TO "service_role";


--
-- Name: FUNCTION "menus_tenant_move_keeps_children"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."menus_tenant_move_keeps_children"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."menus_tenant_move_keeps_children"() TO "service_role";


--
-- Name: FUNCTION "mfa_satisfait"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mfa_satisfait"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mfa_satisfait"() TO "anon";
GRANT ALL ON FUNCTION "public"."mfa_satisfait"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mfa_satisfait"() TO "service_role";


--
-- Name: FUNCTION "mon_restaurant_a_le_stock"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mon_restaurant_a_le_stock"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mon_restaurant_a_le_stock"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mon_restaurant_a_le_stock"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "next_order_number"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "normaliser_creation_commande"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."normaliser_creation_commande"() TO "anon";
GRANT ALL ON FUNCTION "public"."normaliser_creation_commande"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normaliser_creation_commande"() TO "service_role";


--
-- Name: FUNCTION "open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "order_notes_auteur_session"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."order_notes_auteur_session"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_notes_auteur_session"() TO "service_role";


--
-- Name: FUNCTION "owner_trial_ledger_sync_confirmation"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."owner_trial_ledger_sync_confirmation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_trial_ledger_sync_confirmation"() TO "service_role";


--
-- Name: FUNCTION "prevent_super_admin_elevation"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."prevent_super_admin_elevation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_super_admin_elevation"() TO "service_role";


--
-- Name: FUNCTION "provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") TO "service_role";


--
-- Name: FUNCTION "provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") TO "service_role";


--
-- Name: FUNCTION "purge_audit_logs"("p_cutoff" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."purge_audit_logs"("p_cutoff" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_audit_logs"("p_cutoff" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") TO "service_role";


--
-- Name: FUNCTION "reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "refuser_argent_sans_orders_pay"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."refuser_argent_sans_orders_pay"() TO "anon";
GRANT ALL ON FUNCTION "public"."refuser_argent_sans_orders_pay"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refuser_argent_sans_orders_pay"() TO "service_role";


--
-- Name: FUNCTION "refuser_articles_argent_sans_orders_pay"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."refuser_articles_argent_sans_orders_pay"() TO "anon";
GRANT ALL ON FUNCTION "public"."refuser_articles_argent_sans_orders_pay"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refuser_articles_argent_sans_orders_pay"() TO "service_role";


--
-- Name: FUNCTION "refuser_reecriture_montants_commande"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."refuser_reecriture_montants_commande"() TO "anon";
GRANT ALL ON FUNCTION "public"."refuser_reecriture_montants_commande"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refuser_reecriture_montants_commande"() TO "service_role";


--
-- Name: FUNCTION "regenerate_auto_suggestions"("p_tenant_id" "uuid", "p_rows" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."regenerate_auto_suggestions"("p_tenant_id" "uuid", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_auto_suggestions"("p_tenant_id" "uuid", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regenerate_auto_suggestions"("p_tenant_id" "uuid", "p_rows" "jsonb") TO "service_role";


--
-- Name: FUNCTION "registre_stock_garde_ingredients"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."registre_stock_garde_ingredients"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registre_stock_garde_ingredients"() TO "service_role";


--
-- Name: FUNCTION "reminder_coach_items"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_split" timestamp with time zone, "p_until" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reminder_coach_items"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_split" timestamp with time zone, "p_until" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reminder_coach_items"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_split" timestamp with time zone, "p_until" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "reminder_coach_slots"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone, "p_tz" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reminder_coach_slots"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone, "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reminder_coach_slots"("p_tenant_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone, "p_tz" "text") TO "service_role";


--
-- Name: FUNCTION "reminder_rule_stats"("p_since" timestamp with time zone, "p_resolved_within_min" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reminder_rule_stats"("p_since" timestamp with time zone, "p_resolved_within_min" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reminder_rule_stats"("p_since" timestamp with time zone, "p_resolved_within_min" integer) TO "service_role";


--
-- Name: FUNCTION "rendre_coupon_commande"("p_order_id" "uuid", "p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rendre_coupon_commande"("p_order_id" "uuid", "p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rendre_coupon_commande"("p_order_id" "uuid", "p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "reorder_categories"("p_tenant_id" "uuid", "p_updates" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reorder_categories"("p_tenant_id" "uuid", "p_updates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_categories"("p_tenant_id" "uuid", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_categories"("p_tenant_id" "uuid", "p_updates" "jsonb") TO "service_role";


--
-- Name: FUNCTION "reorder_menus"("p_tenant_id" "uuid", "p_ordered_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reorder_menus"("p_tenant_id" "uuid", "p_ordered_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_menus"("p_tenant_id" "uuid", "p_ordered_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_menus"("p_tenant_id" "uuid", "p_ordered_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "request_account_deletion"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."request_account_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_account_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_account_deletion"() TO "service_role";


--
-- Name: FUNCTION "reserver_alerte_nouvelle_connexion"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reserver_alerte_nouvelle_connexion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserver_alerte_nouvelle_connexion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserver_alerte_nouvelle_connexion"() TO "service_role";


--
-- Name: FUNCTION "reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") TO "service_role";


--
-- Name: FUNCTION "restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "revoke_user_sessions"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") TO "service_role";


--
-- Name: FUNCTION "set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "set_order_item_tenant_id"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_order_item_tenant_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_order_item_tenant_id"() TO "service_role";


--
-- Name: FUNCTION "set_qr_designs_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_qr_designs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_qr_designs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_qr_designs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") TO "service_role";


--
-- Name: FUNCTION "set_trial_end_date"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "service_role";


--
-- Name: FUNCTION "stamp_order_ready_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."stamp_order_ready_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_order_ready_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_order_ready_at"() TO "service_role";


--
-- Name: FUNCTION "sync_menu_availability"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_stock_before" numeric, "p_stock_after" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."sync_menu_availability"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_stock_before" numeric, "p_stock_after" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_menu_availability"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_stock_before" numeric, "p_stock_after" numeric) TO "service_role";


--
-- Name: FUNCTION "tables_nom_pas_numero_autre"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."tables_nom_pas_numero_autre"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tables_nom_pas_numero_autre"() TO "service_role";


--
-- Name: FUNCTION "tenant_effective_plan"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."tenant_effective_plan"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenant_effective_plan"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "tenant_permission_level"("p_tenant" "uuid", "p_perm" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."tenant_permission_level"("p_tenant" "uuid", "p_perm" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenant_permission_level"("p_tenant" "uuid", "p_perm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tenant_permission_level"("p_tenant" "uuid", "p_perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tenant_permission_level"("p_tenant" "uuid", "p_perm" "text") TO "service_role";


--
-- Name: FUNCTION "tenants_avec_droit"("p_perm" "text", "p_niveau_min" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."tenants_avec_droit"("p_perm" "text", "p_niveau_min" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenants_avec_droit"("p_perm" "text", "p_niveau_min" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tenants_avec_droit"("p_perm" "text", "p_niveau_min" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tenants_avec_droit"("p_perm" "text", "p_niveau_min" "text") TO "service_role";


--
-- Name: FUNCTION "unclaim_coupon_usage"("p_coupon_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_ingredients_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_menus_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_suppliers_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_tenant_supports_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "update_user_preferences_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "service_role";


--
-- Name: FUNCTION "venues_tenant_move_keeps_menus"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."venues_tenant_move_keeps_menus"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venues_tenant_move_keeps_menus"() TO "service_role";


--
-- Name: FUNCTION "verify_stock_ledger"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: TABLE "account_deletion_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."account_deletion_requests" TO "service_role";


--
-- Name: TABLE "admin_users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."admin_users" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";


--
-- Name: COLUMN "admin_users"."full_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("full_name") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."last_login"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("last_login") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."phone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("phone") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."last_login_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("last_login_at") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."login_count"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("login_count") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: TABLE "adresses_email_bloquees"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."adresses_email_bloquees" TO "service_role";


--
-- Name: TABLE "ads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ads" TO "authenticated";
GRANT ALL ON TABLE "public"."ads" TO "service_role";


--
-- Name: TABLE "ai_credits_ledger"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."ai_credits_ledger" TO "anon";
GRANT ALL ON TABLE "public"."ai_credits_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_credits_ledger" TO "service_role";


--
-- Name: TABLE "ai_photo_credits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."ai_photo_credits" TO "anon";
GRANT ALL ON TABLE "public"."ai_photo_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_photo_credits" TO "service_role";


--
-- Name: TABLE "alertes_nouvelle_connexion"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."alertes_nouvelle_connexion" TO "service_role";


--
-- Name: TABLE "announcements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";


--
-- Name: TABLE "audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";


--
-- Name: TABLE "categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."categories" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";


--
-- Name: TABLE "coupon_redemptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."coupon_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "service_role";


--
-- Name: TABLE "coupons"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";


--
-- Name: TABLE "cron_heartbeats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cron_heartbeats" TO "service_role";


--
-- Name: TABLE "dish_photo_drafts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."dish_photo_drafts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."dish_photo_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."dish_photo_drafts" TO "service_role";


--
-- Name: TABLE "email_unsubscribes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE ON TABLE "public"."email_unsubscribes" TO "service_role";


--
-- Name: TABLE "flutterwave_anomalies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."flutterwave_anomalies" TO "service_role";
GRANT SELECT ON TABLE "public"."flutterwave_anomalies" TO "authenticated";


--
-- Name: TABLE "flutterwave_payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."flutterwave_payments" TO "service_role";
GRANT SELECT ON TABLE "public"."flutterwave_payments" TO "authenticated";


--
-- Name: TABLE "house_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."house_accounts" TO "anon";
GRANT ALL ON TABLE "public"."house_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."house_accounts" TO "service_role";


--
-- Name: TABLE "ingredients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";


--
-- Name: TABLE "invitations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invitations" TO "service_role";


--
-- Name: COLUMN "invitations"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."tenant_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tenant_id") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."email"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("email") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."role"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("role") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."invited_by"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("invited_by") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."expires_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("expires_at") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("status") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."accepted_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("accepted_at") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: TABLE "item_modifiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."item_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."item_modifiers" TO "service_role";


--
-- Name: TABLE "item_options"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_options" TO "anon";
GRANT ALL ON TABLE "public"."item_options" TO "authenticated";
GRANT ALL ON TABLE "public"."item_options" TO "service_role";


--
-- Name: TABLE "item_price_variants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_price_variants" TO "anon";
GRANT ALL ON TABLE "public"."item_price_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."item_price_variants" TO "service_role";


--
-- Name: TABLE "item_suggestions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."item_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."item_suggestions" TO "service_role";


--
-- Name: TABLE "menu_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."menu_items" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";


--
-- Name: TABLE "menus"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."menus" TO "anon";
GRANT ALL ON TABLE "public"."menus" TO "authenticated";
GRANT ALL ON TABLE "public"."menus" TO "service_role";


--
-- Name: TABLE "newsletter_subscriber"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."newsletter_subscriber" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."newsletter_subscriber" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscriber" TO "service_role";


--
-- Name: TABLE "notification_reads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "onboarding_progress"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."onboarding_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "service_role";


--
-- Name: TABLE "orange_money_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."orange_money_events" TO "anon";
GRANT ALL ON TABLE "public"."orange_money_events" TO "authenticated";
GRANT ALL ON TABLE "public"."orange_money_events" TO "service_role";


--
-- Name: TABLE "order_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";


--
-- Name: COLUMN "order_items"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."order_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("order_id") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."menu_item_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("menu_item_id") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."quantity"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("quantity") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."price_at_order"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("price_at_order") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."item_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("item_name") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."item_name_en"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("item_name_en") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."item_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("item_status") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."course"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("course") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."modifiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("modifiers") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."preparation_zone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("preparation_zone") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."selected_option"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("selected_option") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."selected_variant"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("selected_variant") ON TABLE "public"."order_items" TO "anon";


--
-- Name: TABLE "order_mutation_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."order_mutation_requests" TO "anon";
GRANT ALL ON TABLE "public"."order_mutation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."order_mutation_requests" TO "service_role";


--
-- Name: TABLE "order_notes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."order_notes" TO "anon";
GRANT ALL ON TABLE "public"."order_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."order_notes" TO "service_role";


--
-- Name: TABLE "order_number_counters"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_number_counters" TO "service_role";


--
-- Name: TABLE "orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";


--
-- Name: COLUMN "orders"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."tenant_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tenant_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."venue_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("venue_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."order_number"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("order_number") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."table_number"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("table_number") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("status") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."subtotal"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("subtotal") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."total"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("total") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."completed_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("completed_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."service_type"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("service_type") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."tax_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tax_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."service_charge_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("service_charge_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."discount_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("discount_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."payment_method"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("payment_method") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."payment_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("payment_status") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."paid_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("paid_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."coupon_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("coupon_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."assigned_to"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("assigned_to") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."cashier_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("cashier_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."server_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("server_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."display_currency"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("display_currency") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."tip_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tip_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."preparation_zone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("preparation_zone") ON TABLE "public"."orders" TO "anon";


--
-- Name: TABLE "owner_trial_ledger"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."owner_trial_ledger" TO "service_role";


--
-- Name: TABLE "payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";


--
-- Name: TABLE "platform_audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."platform_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."platform_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_audit_log" TO "service_role";


--
-- Name: TABLE "platform_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."platform_settings" TO "authenticated";


--
-- Name: TABLE "poste_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."poste_permissions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."poste_permissions" TO "authenticated";


--
-- Name: TABLE "push_subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";


--
-- Name: TABLE "qr_designs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."qr_designs" TO "anon";
GRANT ALL ON TABLE "public"."qr_designs" TO "authenticated";
GRANT ALL ON TABLE "public"."qr_designs" TO "service_role";


--
-- Name: TABLE "recipes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";


--
-- Name: TABLE "reminder_preferences"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reminder_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_preferences" TO "service_role";


--
-- Name: TABLE "reminder_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reminder_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_settings" TO "service_role";


--
-- Name: TABLE "reminders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."reminders" TO "service_role";


--
-- Name: TABLE "restaurant_groups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."restaurant_groups" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_groups" TO "service_role";


--
-- Name: TABLE "settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";


--
-- Name: TABLE "stock_alert_notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_alert_notifications" TO "anon";
GRANT ALL ON TABLE "public"."stock_alert_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_alert_notifications" TO "service_role";


--
-- Name: TABLE "stock_count_lines"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_count_lines" TO "anon";
GRANT ALL ON TABLE "public"."stock_count_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_count_lines" TO "service_role";


--
-- Name: TABLE "stock_counts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_counts" TO "anon";
GRANT ALL ON TABLE "public"."stock_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_counts" TO "service_role";


--
-- Name: TABLE "stock_movements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_movements" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";


--
-- Name: TABLE "stripe_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";


--
-- Name: TABLE "suppliers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";


--
-- Name: TABLE "table_assignments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."table_assignments" TO "anon";
GRANT ALL ON TABLE "public"."table_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."table_assignments" TO "service_role";


--
-- Name: TABLE "table_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."table_sessions" TO "anon";
GRANT ALL ON TABLE "public"."table_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."table_sessions" TO "service_role";


--
-- Name: TABLE "tables"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";


--
-- Name: TABLE "tenant_supports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."tenant_supports" TO "anon";
GRANT ALL ON TABLE "public"."tenant_supports" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_supports" TO "service_role";


--
-- Name: TABLE "tenant_tables_initialisees"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tenant_tables_initialisees" TO "service_role";


--
-- Name: TABLE "tenants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";


--
-- Name: COLUMN "tenants"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."tenants" TO "anon";
GRANT SELECT("id") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."slug"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("slug") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("slug") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("name"),UPDATE("name") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("name") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."subscription_plan"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("subscription_plan") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."subscription_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("subscription_status") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."subscription_current_period_start"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("subscription_current_period_start") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."subscription_current_period_end"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("subscription_current_period_end") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."max_admins"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("max_admins") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."max_venues"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("max_venues") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."max_menu_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("max_menu_items") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."logo_url"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("logo_url"),UPDATE("logo_url") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("logo_url") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."primary_color"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("primary_color"),UPDATE("primary_color") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("primary_color") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."is_active"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("is_active") ON TABLE "public"."tenants" TO "anon";
GRANT SELECT("is_active") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at"),UPDATE("updated_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."onboarding_completed"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("onboarding_completed"),UPDATE("onboarding_completed") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."onboarding_completed_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("onboarding_completed_at"),UPDATE("onboarding_completed_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."trial_ends_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("trial_ends_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."billing_interval"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("billing_interval") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."secondary_color"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("secondary_color"),UPDATE("secondary_color") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("secondary_color") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."description"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("description"),UPDATE("description") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("description") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."establishment_type"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("establishment_type"),UPDATE("establishment_type") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("establishment_type") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."address"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("address"),UPDATE("address") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."city"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("city"),UPDATE("city") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."country"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("country"),UPDATE("country") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."phone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("phone"),UPDATE("phone") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."table_count"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("table_count"),UPDATE("table_count") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("table_count") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."notification_sound_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("notification_sound_id"),UPDATE("notification_sound_id") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."currency"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("currency"),UPDATE("currency") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("currency") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."tax_rate"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tax_rate"),UPDATE("tax_rate") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("tax_rate") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."service_charge_rate"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("service_charge_rate"),UPDATE("service_charge_rate") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("service_charge_rate") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."enable_tax"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("enable_tax"),UPDATE("enable_tax") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("enable_tax") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."enable_service_charge"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("enable_service_charge"),UPDATE("enable_service_charge") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("enable_service_charge") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."idle_timeout_minutes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("idle_timeout_minutes"),UPDATE("idle_timeout_minutes") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."screen_lock_mode"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("screen_lock_mode"),UPDATE("screen_lock_mode") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."default_locale"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("default_locale"),UPDATE("default_locale") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("default_locale") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."supported_currencies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("supported_currencies"),UPDATE("supported_currencies") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("supported_currencies") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."enable_coupons"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("enable_coupons"),UPDATE("enable_coupons") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("enable_coupons") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."bar_display_enabled"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("bar_display_enabled"),UPDATE("bar_display_enabled") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."opening_hours"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("opening_hours"),UPDATE("opening_hours") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("opening_hours") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."enabled_payment_methods"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("enabled_payment_methods"),UPDATE("enabled_payment_methods") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."last_active_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("last_active_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."at_food_enabled"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("at_food_enabled") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."group_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("group_id") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."custom_domain"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("custom_domain") ON TABLE "public"."tenants" TO "anon";
GRANT SELECT("custom_domain") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."deleted_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("deleted_at") ON TABLE "public"."tenants" TO "anon";
GRANT SELECT("deleted_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."deleted_by"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("deleted_by") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."suspended_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("suspended_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."suspended_by"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("suspended_by") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."suspend_reason"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("suspend_reason") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."banner_url"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("banner_url") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."past_due_since"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("past_due_since") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."freeze_reason"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("freeze_reason") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."establishment_details"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("establishment_details"),UPDATE("establishment_details") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: TABLE "user_preferences"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";


--
-- Name: TABLE "user_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";


--
-- Name: TABLE "venues"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";


--
-- Name: TABLE "wave_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."wave_events" TO "anon";
GRANT ALL ON TABLE "public"."wave_events" TO "authenticated";
GRANT ALL ON TABLE "public"."wave_events" TO "service_role";


--
-- Name: TABLE "zones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."zones" TO "authenticated";
GRANT ALL ON TABLE "public"."zones" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Declencheurs poses sur auth.users par les migrations de ce depot
-- (20261114120000). pg_dump --schema public --schema private ne les emporte
-- pas, puisque la table est dans auth. Definitions relues en production avec
-- pg_get_triggerdef le 2026-11-28, fonction qualifiee (le search_path du dump
-- est vide).
--

CREATE TRIGGER tg_owner_trial_ledger_confirm_del BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION "public"."owner_trial_ledger_sync_confirmation"();

CREATE TRIGGER tg_owner_trial_ledger_confirm_upd AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW WHEN (((old.email_confirmed_at IS NULL) AND (new.email_confirmed_at IS NOT NULL))) EXECUTE FUNCTION "public"."owner_trial_ledger_sync_confirmation"();

--
-- PostgreSQL database dump complete
--



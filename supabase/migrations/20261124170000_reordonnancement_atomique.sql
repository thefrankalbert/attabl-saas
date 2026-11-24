-- ============================================================================
-- Audits B32 et B56 (Basse): reordonnancement des categories et des cartes en
-- ecritures paralleles.
--
-- CE QUI NE TENAIT PAS. `reorderCategories` (category.service.ts) et
-- `reorderMenus` (menu.mutations.ts) envoyaient un UPDATE par ligne, en
-- parallele (Promise.all). Si l'un echouait, les autres etaient deja ecrits:
-- l'ordre restait a moitie applique (deux rubriques au meme rang), alors que
-- l'ecran revenait a l'ancien ordre. Un identifiant absent (ligne supprimee
-- entre-temps, ou d'un autre restaurant) ne touchait rien et repondait succes.
--
-- LA CORRECTION. Deux fonctions, chacune UN seul UPDATE (donc tout ou rien):
--   - reorder_categories(p_tenant_id, p_updates jsonb [{id, display_order}])
--   - reorder_menus(p_tenant_id, p_ordered_ids uuid[]) : rang = position - 1
-- Chacune filtre par `tenant_id` et compte les lignes touchees: si ce compte
-- differe du nombre demande (ligne absente, autre restaurant, droit refuse par
-- la RLS, identifiant en double), elle leve P0002 et l'UPDATE est annule.
-- SECURITY INVOKER: la RLS existante s'applique (politiques UPDATE de
-- `categories` et `menus` = has_tenant_write_permission(tenant_id, 'menu.edit')),
-- exactement comme les requetes qu'elles remplacent. search_path vide, noms
-- qualifies. EXECUTE pour `authenticated` seulement. Borne a 500 lignes.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code (migration purement additive).
--   - Ancien code + cette base: les fonctions ne sont pas appelees, rien ne
--     change.
--   - Nouveau code + base SANS cette migration: le reordonnancement echoue
--     (message d'erreur, aucun ordre ecrit). D'ou "avant le code".
--
-- ROLLBACK (apres avoir remis l'ancien code):
--   DROP FUNCTION IF EXISTS public.reorder_categories(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.reorder_menus(uuid, uuid[]);
--
-- Rejouable (CREATE OR REPLACE). Pas de BEGIN/COMMIT propre: s'applique avec
-- `psql -1` comme les autres.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reorder_categories(
  p_tenant_id uuid,
  p_updates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.reorder_categories(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_categories(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_menus(
  p_tenant_id uuid,
  p_ordered_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.reorder_menus(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_menus(uuid, uuid[]) TO authenticated;

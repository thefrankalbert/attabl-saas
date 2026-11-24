-- ============================================================================
-- Audit B95 (Moyenne): "Auto-generer" efface toutes les suggestions du
-- restaurant, y compris celles creees a la main.
--
-- CE QUI NE TENAIT PAS. `generateAndSaveSuggestions` (suggestion.service.ts)
-- faisait `DELETE FROM item_suggestions WHERE tenant_id = ...` puis un INSERT,
-- en deux requetes:
--   1. rien ne distinguait une suggestion creee a la main d'une suggestion
--      generee (aucune colonne d'origine): tout etait efface;
--   2. sans transaction, un INSERT en echec apres le DELETE laissait le
--      restaurant sans AUCUNE suggestion.
--
-- LA CORRECTION.
--   - Colonne `source` ('manual' | 'auto'), defaut 'manual'. Les lignes
--     EXISTANTES deviennent 'manual': on ne sait pas lesquelles avaient ete
--     generees, donc aucune n'est jamais effacee par la generation (aucune
--     perte de donnee; une ancienne suggestion generee se supprime a la main).
--     Une creation a la main (ecran, `createSuggestion`) ne renseigne pas la
--     colonne et garde donc 'manual'.
--   - Fonction `regenerate_auto_suggestions(p_tenant_id, p_rows)`: dans UNE
--     transaction, efface les seules suggestions 'auto' du restaurant puis
--     insere les nouvelles en 'auto', en sautant une paire (plat, plat
--     suggere) qu'une suggestion manuelle porte deja. Une erreur annule tout:
--     les anciennes suggestions generees restent.
--     SECURITY INVOKER: la RLS existante s'applique (suppression et insertion
--     exigent `menu.edit` via has_tenant_write_permission), comme les deux
--     requetes qu'elle remplace; le declencheur `item_suggestions_same_tenant`
--     juge toujours chaque ligne. EXECUTE pour `authenticated` seulement.
--   - Declencheur `trg_item_suggestions_modifiee_devient_manuelle` (decision de
--     l'orchestrateur apres le contre-audit 1): une suggestion generee puis
--     MODIFIEE a la main (plat suggere, type, description, ordre, activation)
--     passe a 'manual' et n'est plus effacee par la generation suivante.
--     SECURITY INVOKER (un declencheur de garde en DEFINER verrait toujours le
--     proprietaire). La fonction de regeneration ne fait jamais d'UPDATE.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code.
--   - Ancien code + cette base: l'ancien DELETE/INSERT ignore la colonne
--     (defaut 'manual'): comportement identique a aujourd'hui, defaut compris,
--     jusqu'au deploiement du code.
--   - Nouveau code + base SANS cette migration: la fonction n'existe pas,
--     "Auto-generer" echoue (message d'erreur, rien n'est efface). D'ou
--     "avant le code".
--
-- ROLLBACK (apres avoir remis l'ancien code):
--   DROP TRIGGER IF EXISTS trg_item_suggestions_modifiee_devient_manuelle ON public.item_suggestions;
--   DROP FUNCTION IF EXISTS public.item_suggestions_modifiee_devient_manuelle();
--   DROP FUNCTION IF EXISTS public.regenerate_auto_suggestions(uuid, jsonb);
--   ALTER TABLE public.item_suggestions DROP CONSTRAINT IF EXISTS item_suggestions_source_check;
--   ALTER TABLE public.item_suggestions DROP COLUMN IF EXISTS source;
--
-- Rejouable (IF NOT EXISTS, CREATE OR REPLACE). Pas de BEGIN/COMMIT propre:
-- s'applique avec `psql -1` comme les autres.
-- ============================================================================

ALTER TABLE public.item_suggestions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.item_suggestions'::regclass
      AND conname = 'item_suggestions_source_check'
  ) THEN
    ALTER TABLE public.item_suggestions
      ADD CONSTRAINT item_suggestions_source_check CHECK (source IN ('manual', 'auto'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.regenerate_auto_suggestions(
  p_tenant_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.regenerate_auto_suggestions(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_auto_suggestions(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.item_suggestions_modifiee_devient_manuelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.item_suggestions_modifiee_devient_manuelle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_item_suggestions_modifiee_devient_manuelle ON public.item_suggestions;
CREATE TRIGGER trg_item_suggestions_modifiee_devient_manuelle
  BEFORE UPDATE ON public.item_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.item_suggestions_modifiee_devient_manuelle();

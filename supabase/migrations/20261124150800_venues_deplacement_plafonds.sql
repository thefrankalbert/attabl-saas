-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B135 (Basse), declencheurs des
-- etablissements (`venues`).
--
-- CE QUI NE TENAIT PAS.
-- (1) Le plafond gardait le plan paye quand l'abonnement etait annule ou gele.
--     DEJA REGLE en production: `enforce_venue_plan_limit` lit
--     `tenant_effective_plan()` (starter hors `trial`/`active`/`past_due`),
--     corps stocke lu le 2026-11-24. Rien a changer pour ce point.
-- (2) Changer le `tenant_id` d'un etablissement actif ne declenchait aucun
--     controle: le restaurant qui le recoit depassait son plafond, et celui
--     qui le perd pouvait tomber a zero etablissement actif (vitrine cassee).
--     Le deplacement lui-meme reste permis (decision du lot B1, contre-audit
--     D3: une salle sans carte rattachee peut changer de restaurant).
--
-- LA CORRECTION (point 2 seulement).
-- - `enforce_venue_plan_limit` juge aussi le restaurant qui RECOIT un
--   etablissement actif deplace.
-- - `enforce_min_one_active_venue` juge le restaurant qui PERD l'etablissement
--   (desactive sur place ou deplace), avec des verrous pris dans un ordre fixe.
-- Corps recopies du texte STOCKE en production (`lot-b2b1/prod-fonctions.sql`);
-- seules les lignes marquees B135 changent. Memes declencheurs (AFTER), meme
-- mode SECURITY DEFINER qu'en production, droits reposes a l'identique.
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne. Aucun code ne change
-- le `tenant_id` d'un etablissement.
--
-- ROLLBACK: rejouer les deux corps de prod-fonctions.sql.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_venue_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_min_one_active_venue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.enforce_venue_plan_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_venue_plan_limit() TO service_role;
REVOKE ALL ON FUNCTION public.enforce_min_one_active_venue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_min_one_active_venue() TO service_role;

COMMIT;

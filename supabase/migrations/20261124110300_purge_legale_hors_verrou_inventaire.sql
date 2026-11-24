-- ============================================================================
-- Audit B149 (Haute): la purge legale des restaurants fermes n'est plus bloquee
-- par le verrou de plan du module Inventaire.
--
-- CE QUI NE TENAIT PAS. `anonymize_closed_tenants` (cron de conservation)
-- efface les contacts des fournisseurs des restaurants fermes depuis 30 jours.
-- Le declencheur `trg_enforce_inventory_entitlement` (BEFORE INSERT OR UPDATE
-- ON suppliers) appelle `enforce_inventory_entitlement()`, qui refuse toute
-- ecriture d'un restaurant sans droit Inventaire (essai expire `frozen`,
-- `cancelled`, `starter`). Un seul restaurant ferme dans ce cas, avec un seul
-- fournisseur, faisait echouer la fonction entiere: AUCUN restaurant ferme
-- n'etait anonymise, chaque nuit (essai L143 sur base locale). Les donnees
-- personnelles restaient au-dela de la duree annoncee.
--
-- LA CORRECTION, la plus etroite: la sortie ne vaut QUE pour la purge.
--   - `anonymize_closed_tenants` pose un drapeau LOCAL A LA TRANSACTION
--     (`set_config('attabl.purge_legale', 'on', true)`) juste avant d'effacer
--     les contacts des fournisseurs, et le retire juste apres;
--   - le verrou ne laisse passer que si ce drapeau est pose ET que le
--     restaurant est ferme (`deleted_at` renseigne).
-- Une premiere version (sortie sur `deleted_at` seul) rouvrait le module a une
-- session cliente: la fermeture ne desactive pas les membres, et
-- `has_tenant_write_permission` ne regarde pas `tenants.deleted_at`, donc
-- l'administrateur d'un restaurant ferme `starter` creait fournisseurs et
-- ingredients (contre-audit 1, requetes HTTP). C'est ce que ce drapeau ferme.
--
-- POURQUOI UN CLIENT NE PEUT PAS POSER LE DRAPEAU.
--   - PostgREST n'expose que les fonctions des schemas publies (public,
--     graphql_public): `pg_catalog.set_config` n'est pas appelable par RPC;
--   - aucune fonction appelable par `anon` ou `authenticated` n'appelle
--     `set_config` (recherche dans supabase/migrations et schema.sql le
--     2026-11-24: seule cette fonction, reservee a service_role, le fait);
--   - le nom est dans l'espace `attabl.*`: PostgREST n'ecrit que dans
--     `request.*` (jeton, en-tetes, cookies, methode, chemin), un en-tete de
--     requete ne peut donc pas le poser.
-- La regle de plan elle-meme (statuts) n'est pas touchee: autre constat.
--
-- Corps repris des textes STOCKES en production (lus le 2026-11-23):
--   - `enforce_inventory_entitlement`: identique a
--     `20261121100000_essai_plan_business.sql`, seule la sortie est ajoutee;
--   - `anonymize_closed_tenants`: identique a
--     `20261115110000_retention_purges.sql`, seuls les deux `set_config`
--     encadrant la mise a jour des fournisseurs sont ajoutes.
-- Memes signatures, SECURITY DEFINER, memes `search_path` (`public` pour le
-- verrou, '' pour la purge), memes droits (EXECUTE a postgres et service_role
-- seulement pour les deux).
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne (aucun code ne
-- depend de ce comportement; le cron appelle la meme fonction).
--
-- ROLLBACK: rejouer les definitions de `20261121100000_essai_plan_business.sql`
-- et de `20261115110000_retention_purges.sql`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_inventory_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.enforce_inventory_entitlement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_inventory_entitlement() TO service_role;

CREATE OR REPLACE FUNCTION public.anonymize_closed_tenants(p_cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.anonymize_closed_tenants(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_closed_tenants(timestamptz) TO service_role;

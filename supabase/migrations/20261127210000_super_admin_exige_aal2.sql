-- Super administrateur: la base exige le code de double authentification,
-- meme quand aucun facteur n'est encore enregistre (audit d'equipe du
-- 2026-11-27, constat pentest P-1 / N-1).
--
-- CONSTAT. `is_super_admin()` valait `mfa_satisfait() AND <ligne super admin>`.
-- Or `mfa_satisfait()` est VRAIE pour un compte qui n'a AUCUN facteur verifie,
-- quel que soit le niveau du jeton. Un super administrateur qui n'a pas encore
-- enregistre son application d'authentification gardait donc, avec son seul
-- mot de passe et par l'API Supabase directe, tous les droits de plateforme:
-- politiques `is_super_admin()`, et la garde d'appartenance de tous les
-- restaurants dans 17 fonctions RPC (dont record_refund).
--
-- Les pages du super administrateur exigeaient deja un facteur verifie ET un
-- jeton aal2 (`requireSuperAdmin` -> `hasStrongSession`, `enforceMfa` avec
-- `requireEnrollment`). La meme PR aligne les routes API et Server Actions
-- (`get-session.ts`, owner virtuel du super administrateur; route
-- revalidate-menu). La base dit desormais la meme chose: plus de droit de
-- plateforme sans jeton aal2. Un
-- jeton aal2 n'existe qu'apres la saisie d'un code TOTP verifie, donc la
-- condition implique aussi qu'un facteur est enregistre.
--
-- CE QUI NE CHANGE PAS:
--   - les droits ordinaires d'un super administrateur qui est aussi membre
--     d'un restaurant passent par `has_tenant_write_permission` /
--     `get_my_tenant_ids*` (regle `mfa_satisfait()` inchangee);
--   - sa propre ligne admin_users reste lisible en aal1 (politique RESTRICTIVE
--     "Block super_admin escalation by non-super-admins", clause
--     `user_id = auth.uid()`), la connexion peut donc l'envoyer vers le code;
--   - service_role: auth.uid() est nul, is_super_admin() valait deja faux.
--
-- ORDRE DE DEPLOIEMENT: indifferent (le code de la meme PR exige aussi aal2).
-- Effet en production: tant que le super administrateur n'a pas enregistre son
-- facteur TOTP, il n'a plus de droits de plateforme, ni par la base ni par
-- l'application.
--
-- RETOUR ARRIERE: rejouer la definition de `public.is_super_admin()` de
-- 20261124210700_double_auth_exigee_par_la_base.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
        AND (is_super_admin = true OR role = 'super_admin')
        AND COALESCE(is_active, true)
        AND deleted_at IS NULL
    );
$function$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Vrai si l appelant est super administrateur actif ET que son jeton est aal2 (code TOTP saisi). Sans facteur enregistre, aucun droit de plateforme.';

COMMIT;

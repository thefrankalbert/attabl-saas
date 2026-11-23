-- ============================================================================
-- Audit B147 (Basse): un membre desactive ne lit plus la ligne de son ancien
-- restaurant.
--
-- CE QUI NE TENAIT PAS. La politique "Authenticated users can read tenants
-- they belong to" (texte de production lu le 2026-11-23) accepte toute ligne
-- `admin_users` du compte, sans regarder `is_active`: un employe desactive lit
-- encore, par appel direct a PostgREST, les colonnes de `tenants` accordees a
-- `authenticated` de son ancien restaurant.
--
-- LA CORRECTION. La politique reutilise `get_my_tenant_ids_array()`, le helper
-- SECURITY DEFINER deja employe par les autres politiques de membres (membres
-- actifs seulement, `coalesce(is_active, true)`). Il est entoure d'un
-- `(SELECT ...)::uuid[]` pour n'etre evalue qu'une fois par requete (initplan),
-- pas une fois par ligne (le transtypage fait de la sous-requete une valeur
-- scalaire, sinon `= ANY (sous-requete)` comparerait a des tableaux).
--
-- NUANCE ASSUMEE. Le helper filtre `is_active` mais pas `deleted_at` (corps de
-- production lu le 2026-11-23). Tous les chemins qui suppriment un membre en
-- douceur posent aussi `is_active = false` (platform-admin.service.ts,
-- account-deletion.service.ts): un membre supprime est donc aussi exclu. Changer
-- le helper toucherait toutes les politiques qui l'emploient: hors de ce
-- constat.
--
-- CE QUI NE BOUGE PAS. La lecture publique (`anon`, restaurants actifs), celle
-- du super administrateur et celle du proprietaire de groupe sont d'autres
-- politiques, non touchees. Les connexions (api/login, auth/callback,
-- session-destination) lisent `tenants` par jointure depuis `admin_users`:
-- une ligne de membre inactive y perd sa jointure, mais elle etait deja ecartee
-- par `liveOnly()` (post-login-destination.ts). L'invitation lit `tenants` avec
-- le client service_role.
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS "Authenticated users can read tenants they belong to" ON public.tenants;
--   CREATE POLICY "Authenticated users can read tenants they belong to" ON public.tenants
--     FOR SELECT USING (id IN (SELECT admin_users.tenant_id FROM public.admin_users
--       WHERE admin_users.user_id = (SELECT auth.uid())));
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can read tenants they belong to" ON public.tenants;

CREATE POLICY "Authenticated users can read tenants they belong to"
  ON public.tenants
  FOR SELECT
  USING (id = ANY ((SELECT public.get_my_tenant_ids_array())::uuid[]));

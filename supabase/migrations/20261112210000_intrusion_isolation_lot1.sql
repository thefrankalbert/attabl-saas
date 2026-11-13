-- Test d'intrusion du 2026-11-12, lot 1 : etancheite entre restaurants.
--
-- T-01  Un restaurant pouvait rattacher un supplement, une option, une variante de
--       prix ou une suggestion au plat d'un AUTRE restaurant : les policies
--       d'ecriture ne controlent que le tenant_id de la ligne, jamais celui du
--       plat vise. La ligne apparaissait alors sur la vitrine de la victime.
--       Mesure en production le 2026-11-12 : 0 ligne croisee existante.
-- T-06  is_super_admin() ignorait is_active et deleted_at : un operateur
--       plateforme revoque gardait tous ses droits en base.
-- T-03  Huit policies interrogeaient admin_users sans filtrer is_active ni
--       deleted_at : un employe desactive gardait la lecture du journal d'audit,
--       des invitations, des alertes de stock, des affectations de tables, et
--       l'ecriture des sons de notification.
--
-- Additive et resserrante. Aucune suppression de donnee. Ordre de mise en
-- production : aucune dependance au code applicatif (le code n'ecrit jamais de
-- ligne croisee et ne s'appuie sur aucun acces d'un membre desactive).
--
-- Retour arriere : rejouer les definitions precedentes depuis supabase/schema.sql
-- (policies) et supprimer les quatre declencheurs *_same_tenant ci-dessous.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- T-01 : le plat vise doit appartenir au meme restaurant que la ligne.
-- Meme forme que enforce_menu_item_category_tenant (20261109103938) : un
-- declencheur et non une cle etrangere composite, qui rendait ambigus les
-- embarquements PostgREST.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_item_child_menu_item_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = NEW.menu_item_id AND mi.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'menu item belongs to another restaurant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_item_suggestion_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
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

DROP TRIGGER IF EXISTS item_modifiers_same_tenant ON public.item_modifiers;
CREATE TRIGGER item_modifiers_same_tenant
  BEFORE INSERT OR UPDATE OF menu_item_id, tenant_id ON public.item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_child_menu_item_tenant();

DROP TRIGGER IF EXISTS item_options_same_tenant ON public.item_options;
CREATE TRIGGER item_options_same_tenant
  BEFORE INSERT OR UPDATE OF menu_item_id, tenant_id ON public.item_options
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_child_menu_item_tenant();

DROP TRIGGER IF EXISTS item_price_variants_same_tenant ON public.item_price_variants;
CREATE TRIGGER item_price_variants_same_tenant
  BEFORE INSERT OR UPDATE OF menu_item_id, tenant_id ON public.item_price_variants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_child_menu_item_tenant();

DROP TRIGGER IF EXISTS item_suggestions_same_tenant ON public.item_suggestions;
CREATE TRIGGER item_suggestions_same_tenant
  BEFORE INSERT OR UPDATE OF menu_item_id, suggested_item_id, tenant_id ON public.item_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_suggestion_tenant();

REVOKE ALL ON FUNCTION public.enforce_item_child_menu_item_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_item_suggestion_tenant() FROM PUBLIC, anon, authenticated;

-- Ceinture en lecture : la vitrine ne montre une ligne que si elle est du meme
-- restaurant que le plat (une ligne croisee inseree avant ce correctif, ou par
-- un chemin non prevu, reste invisible du convive).
DROP POLICY IF EXISTS "Item modifiers viewable by anon for available items" ON public.item_modifiers;
CREATE POLICY "Item modifiers viewable by anon for available items"
  ON public.item_modifiers FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = item_modifiers.menu_item_id
      AND mi.tenant_id = item_modifiers.tenant_id
      AND mi.is_available = true AND mi.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "Item options viewable by anon for available items" ON public.item_options;
CREATE POLICY "Item options viewable by anon for available items"
  ON public.item_options FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = item_options.menu_item_id
      AND mi.tenant_id = item_options.tenant_id
      AND mi.is_available = true AND mi.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "Price variants viewable by anon for available items" ON public.item_price_variants;
CREATE POLICY "Price variants viewable by anon for available items"
  ON public.item_price_variants FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = item_price_variants.menu_item_id
      AND mi.tenant_id = item_price_variants.tenant_id
      AND mi.is_available = true AND mi.deleted_at IS NULL
  ));

-- ---------------------------------------------------------------------------
-- T-06 : un super-administrateur revoque n'est plus super-administrateur.
-- Meme signature, meme proprietaire, memes droits d'execution (CREATE OR
-- REPLACE les conserve).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
      AND (is_super_admin = true OR role = 'super_admin')
      AND COALESCE(is_active, true)
      AND deleted_at IS NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- T-03 : un membre desactive ou retire n'a plus aucun acces.
-- get_my_tenant_ids_array() filtre is_active (test DB-03) mais PAS deleted_at.
-- Le retrait en douceur d'un membre met aussi is_active = false
-- (platform-admin.service.ts, softDeleteAdminUser) : c'est ce qui couvre ce cas.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_log;
CREATE POLICY "Admins can read audit logs" ON public.audit_log FOR SELECT
  USING (tenant_id IN (
    SELECT au.tenant_id FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
      AND COALESCE(au.is_active, true) AND au.deleted_at IS NULL
  ));

-- Un membre ne peut plus forger une ligne au nom d'un AUTRE compte. user_id
-- NULL reste permis : audit.service.ts l'ecrit quand l'appelant ne fournit pas
-- d'identite, et un refus ici ferait perdre la ligne en silence (l'insert ne
-- remonte pas l'erreur, par conception).
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_log;
CREATE POLICY "Admins can insert audit logs" ON public.audit_log FOR INSERT
  WITH CHECK (
    tenant_id = ANY (public.get_my_tenant_ids_array())
    AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "tenant_admins_can_view_invitations" ON public.invitations;
CREATE POLICY "tenant_admins_can_view_invitations" ON public.invitations FOR SELECT
  USING (tenant_id IN (
    SELECT au.tenant_id FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.role = ANY (ARRAY['owner', 'admin'])
      AND COALESCE(au.is_active, true) AND au.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "stock_alerts_select" ON public.stock_alert_notifications;
CREATE POLICY "stock_alerts_select" ON public.stock_alert_notifications FOR SELECT
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Tenant members can view assignments" ON public.table_assignments;
CREATE POLICY "Tenant members can view assignments" ON public.table_assignments FOR SELECT
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "tenant_supports_select" ON public.tenant_supports;
CREATE POLICY "tenant_supports_select" ON public.tenant_supports FOR SELECT
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can read own notifications" ON public.notifications;
CREATE POLICY "Admins can read own notifications" ON public.notifications FOR SELECT
  USING (
    tenant_id = ANY (public.get_my_tenant_ids_array())
    AND (user_id = (SELECT auth.uid()) OR user_id IS NULL)
  );

DROP POLICY IF EXISTS "tenant_members_can_view_role_permissions" ON public.role_permissions;
CREATE POLICY "tenant_members_can_view_role_permissions" ON public.role_permissions FOR SELECT
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "owner_can_manage_role_permissions" ON public.role_permissions;
CREATE POLICY "owner_can_manage_role_permissions" ON public.role_permissions
  USING (tenant_id IN (
    SELECT au.tenant_id FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid()) AND au.role = 'owner'
      AND COALESCE(au.is_active, true) AND au.deleted_at IS NULL
  ))
  WITH CHECK (tenant_id IN (
    SELECT au.tenant_id FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid()) AND au.role = 'owner'
      AND COALESCE(au.is_active, true) AND au.deleted_at IS NULL
  ));

-- Sons de notification (bucket tenant-sounds) : meme regle, membre vivant.
-- Le schema storage n'existe pas sur le banc de test ni en CI : garde d'existence.
DO $do$
DECLARE
  membre_vivant constant text :=
    $q$bucket_id = 'tenant-sounds' AND (storage.foldername(name))[1] IN (
         SELECT t::text FROM unnest(public.get_my_tenant_ids_array()) AS t)$q$;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects absent : policies des sons non modifiees';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "Tenants can upload sounds" ON storage.objects';
  EXECUTE 'CREATE POLICY "Tenants can upload sounds" ON storage.objects FOR INSERT TO authenticated WITH CHECK ('
    || membre_vivant || ')';
  EXECUTE 'DROP POLICY IF EXISTS "Tenants can update sounds" ON storage.objects';
  EXECUTE 'CREATE POLICY "Tenants can update sounds" ON storage.objects FOR UPDATE TO authenticated USING ('
    || membre_vivant || ')';
  EXECUTE 'DROP POLICY IF EXISTS "Tenants can delete sounds" ON storage.objects';
  EXECUTE 'CREATE POLICY "Tenants can delete sounds" ON storage.objects FOR DELETE TO authenticated USING ('
    || membre_vivant || ')';
END
$do$;

COMMIT;

NOTIFY pgrst, 'reload schema';

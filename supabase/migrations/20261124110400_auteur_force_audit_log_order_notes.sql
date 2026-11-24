-- ============================================================================
-- Audits B110 et B130 (Moyenne): l'auteur d'une ligne du journal d'audit et
-- d'une note de commande vient de la SESSION, plus de l'appelant.
--
-- CE QUI NE TENAIT PAS.
--   - `audit_log`: la politique d'insertion (production, lue le 2026-11-23)
--     verifie le restaurant et `user_id IS NULL OR user_id = auth.uid()`, mais
--     laisse `user_email` et `user_role` libres. Un employe qui appelle
--     PostgREST directement ecrivait une ligne "Proprietaire, patron@..." que
--     la page Journal d'audit affiche telle quelle.
--   - `order_notes`: la politique exige `orders.manage` mais ne lie pas
--     `created_by` (identifiant `admin_users`, cle etrangere vers
--     admin_users.id) a l'appelant. Un serveur postait une note signee du
--     proprietaire, ni corrigeable ni supprimable ensuite.
--
-- LA CORRECTION. Un declencheur BEFORE INSERT par table ECRASE l'auteur quand
-- l'insertion vient d'une session client (`authenticated` ou `anon`):
--   - audit_log: `user_id = auth.uid()`; `user_role` lu sur la ligne
--     `admin_users` vivante de ce compte DANS le restaurant de la ligne (celle
--     que la politique d'insertion exige deja); `user_email` = l'e-mail du
--     jeton de connexion (`auth.jwt() ->> 'email'`, signe par Supabase, donc
--     non falsifiable), a defaut celui de cette ligne `admin_users`;
--   - order_notes: `created_by` = l'identifiant de cette meme ligne
--     `admin_users`.
-- service_role reste libre: la gestion de l'equipe (actions/admin.ts) ecrit
-- le journal avec ce client, en fournissant elle-meme l'auteur verifie.
--
-- POURQUOI SECURITY INVOKER. La garde lit `current_user`, qui n'a de sens
-- qu'en INVOKER (en DEFINER il vaut toujours le proprietaire de la fonction et
-- la garde ne se declencherait jamais). La lecture de `admin_users` passe
-- alors sous la RLS de l'appelant: la politique "Admins can view own tenant
-- admins" lui laisse toujours lire ses propres lignes (`user_id = auth.uid()`).
--
-- PARCOURS VERIFIES (toutes les ecritures applicatives, recherche du
-- 2026-11-24):
--   - audit_log: uniquement `audit.service.ts`. Avec la session utilisateur
--     (reglages, categories, menus, commandes, QR): l'application y met
--     `user.id`, `user.email` (compte de connexion) et le role `admin_users`
--     du restaurant courant, soit les memes valeurs que le declencheur. Avec
--     service_role (actions/admin.ts): non touche.
--   - order_notes: uniquement `actionAddOrderNote` (session utilisateur), qui
--     passe deja l'`admin_users.id` de l'appelant.
-- L'e-mail du jeton est celui du compte de connexion au moment ou le jeton a
-- ete emis: c'est la valeur que l'application ecrivait (`user.email`), sauf
-- dans les minutes qui suivent un changement d'e-mail (jeton pas encore
-- rafraichi).
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne. L'application
-- ecrit deja l'auteur reel; le declencheur ne change rien a ses lignes.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_audit_log_auteur_session ON public.audit_log;
--   DROP TRIGGER IF EXISTS trg_order_notes_auteur_session ON public.order_notes;
--   DROP FUNCTION IF EXISTS public.audit_log_auteur_session();
--   DROP FUNCTION IF EXISTS public.order_notes_auteur_session();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_log_auteur_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_role text;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT au.email, au.role INTO v_email, v_role
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

CREATE OR REPLACE FUNCTION public.order_notes_auteur_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

-- Fonctions de declencheur: pas d'appel direct par un client.
REVOKE ALL ON FUNCTION public.audit_log_auteur_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_notes_auteur_session() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_log_auteur_session ON public.audit_log;
CREATE TRIGGER trg_audit_log_auteur_session
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_auteur_session();

DROP TRIGGER IF EXISTS trg_order_notes_auteur_session ON public.order_notes;
CREATE TRIGGER trg_order_notes_auteur_session
  BEFORE INSERT ON public.order_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.order_notes_auteur_session();

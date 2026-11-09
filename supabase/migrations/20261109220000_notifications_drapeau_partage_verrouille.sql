-- ============================================================================
-- Notifications du restaurant: le drapeau `read` partage n'est plus modifiable
-- par un membre
-- ============================================================================
--
-- SUITE DE 20261109210000 (lire son en-tete). Une notification diffusee a tout
-- le restaurant (user_id NULL) portait UN drapeau `read` pour toute l'equipe:
-- un serveur qui vidait sa cloche la marquait lue pour le proprietaire et les
-- gerants, y compris par l'API directe avec la cle anon. "Lu" est desormais
-- un etat par personne (`notification_reads`).
--
-- CE QUE FAIT LA MIGRATION: la policy UPDATE de `notifications` perd
-- `OR user_id IS NULL`. Le drapeau partage d'une notification diffusee reste
-- lisible (historique), les notifications personnelles gardent le leur. Les
-- chemins service_role (creation, deduplication du destockage) ne sont pas
-- concernes.
--
-- ORDRE DE DEPLOIEMENT: APRES 20261109210000 ET APRES l'application qui
-- n'ecrit plus que dans `notification_reads`. Appliquee avant l'application,
-- l'ancienne application ferait des UPDATE qui ne touchent plus aucune ligne
-- diffusee: pas d'erreur, mais une cloche qui ne se vide plus.
--
-- VERIFICATION: supabase/tests/rls/notifications_lues_par_personne.test.sql.
--
-- ROLLBACK: reposer "Admins can update own notifications" avec
-- `OR ("user_id" IS NULL)` (supabase/schema.sql).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- notifications: le drapeau partage n'est plus modifiable par un membre
-- ----------------------------------------------------------------------------
-- Meme forme que la policy d'origine (supabase/schema.sql), sans
-- `OR user_id IS NULL`.
DROP POLICY IF EXISTS "Admins can update own notifications" ON public.notifications;

CREATE POLICY "Admins can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT admin_users.tenant_id
      FROM public.admin_users
      WHERE admin_users.user_id = (SELECT auth.uid())
    )
    AND user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    tenant_id IN (
      SELECT admin_users.tenant_id
      FROM public.admin_users
      WHERE admin_users.user_id = (SELECT auth.uid())
    )
    AND user_id = (SELECT auth.uid())
  );

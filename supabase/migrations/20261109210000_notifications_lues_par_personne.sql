-- ============================================================================
-- Notifications du restaurant: "lu" devient un etat PAR PERSONNE
-- ============================================================================
--
-- LE DEFAUT. Les notifications diffusees a tout le restaurant (user_id NULL:
-- nouvelle commande, alerte de stock, echec de destockage) portaient UN SEUL
-- drapeau `read` pour toute l'equipe. Depuis que tout membre peut vider sa
-- cloche (X17, src/app/actions/notifications.ts), un serveur ou un chef qui
-- clique "tout marquer comme lu" marquait ces alertes lues pour le
-- proprietaire et les gerants aussi: ils ne voyaient plus la nouvelle commande
-- ni l'alerte de stock. La policy UPDATE "Admins can update own notifications"
-- l'autorisait explicitement (`OR user_id IS NULL`), y compris par l'API
-- directe avec la cle anon.
--
-- LA CORRECTION TIENT EN DEUX MIGRATIONS, PARCE QUE L'ORDRE COMPTE:
--
--   20261109210000 (celle-ci, PUREMENT ADDITIVE): la table
--   `notification_reads` (notification, personne) = "j'ai lu". Chacun ne lit,
--   n'ecrit et n'efface que SES lignes, et seulement sur une notification de
--   son restaurant qui lui est visible (la sienne ou une diffusee).
--   L'application calcule "lu" = drapeau historique OU ligne a soi
--   (src/hooks/useNotifications.ts) et n'ecrit plus que dans cette table.
--
--   20261109220000 (le resserrement): la policy UPDATE de `notifications`
--   perd `OR user_id IS NULL`.
--
-- ORDRE DE DEPLOIEMENT (obligatoire):
--   1. cette migration;
--   2. l'application;
--   3. 20261109220000.
-- L'application lit `notification_reads(user_id)` en jointure dans la requete
-- de la cloche: deployee AVANT la table, PostgREST repond PGRST200 (relation
-- introuvable) pour tout le monde, la cloche tombe (nouvelles commandes et
-- alertes de stock invisibles) et "marquer comme lu" echoue (42P01). Cette
-- migration seule ne change rien pour l'ancienne application.
--
-- VERIFICATION: supabase/tests/rls/notifications_lues_par_personne.test.sql.
--
-- ROLLBACK: annuler d'abord 20261109220000, redeployer l'application
-- precedente, puis:
--   DROP TABLE IF EXISTS public.notification_reads;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. notification_reads
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id
  ON public.notification_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_tenant_id
  ON public.notification_reads (tenant_id);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_reads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

DROP POLICY IF EXISTS "notification_reads_select_own" ON public.notification_reads;
DROP POLICY IF EXISTS "notification_reads_insert_own" ON public.notification_reads;
DROP POLICY IF EXISTS "notification_reads_update_own" ON public.notification_reads;
DROP POLICY IF EXISTS "notification_reads_delete_own" ON public.notification_reads;

CREATE POLICY "notification_reads_select_own"
  ON public.notification_reads
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- La notification doit etre du MEME restaurant et visible pour soi: le
-- sous-select passe par la RLS SELECT de `notifications` (la sienne ou une
-- diffusee, dans un restaurant dont on est membre).
CREATE POLICY "notification_reads_insert_own"
  ON public.notification_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND tenant_id = ANY (public.get_my_tenant_ids_array())
    AND EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.id = notification_reads.notification_id
        AND n.tenant_id = notification_reads.tenant_id
        AND (n.user_id IS NULL OR n.user_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "notification_reads_update_own"
  ON public.notification_reads
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND tenant_id = ANY (public.get_my_tenant_ids_array())
    AND EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.id = notification_reads.notification_id
        AND n.tenant_id = notification_reads.tenant_id
        AND (n.user_id IS NULL OR n.user_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "notification_reads_delete_own"
  ON public.notification_reads
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

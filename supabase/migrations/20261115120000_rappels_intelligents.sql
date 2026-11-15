-- ============================================================================
-- Rappels intelligents (2026-11-15) - PUREMENT ADDITIVE
-- ============================================================================
--
-- Le moteur de rappels (src/services/reminders/, tache /api/cron/reminders)
-- previent la bonne personne au bon moment: commande prete non servie,
-- commande recue non commencee, ruptures avant l'ouverture, faits de la
-- semaine. Cette migration ajoute ce dont il a besoin, sans rien retirer.
--
-- 1. orders.ready_at: l'heure exacte du passage a "prete". Sans elle, "prete
--    depuis 3 minutes" n'est pas mesurable (seuls created_at et served_at
--    existaient). Rempli par un declencheur, quel que soit le chemin (cuisine,
--    service, API): aucun appelant ne peut l'oublier.
--
-- 2. reminders: le journal des rappels envoyes. Une ligne par (regle, sujet,
--    destinataire, niveau): la cle unique interdit d'envoyer deux fois le meme
--    rappel. resolved_at = l'heure ou le probleme a disparu; c'est la mesure
--    objective de l'efficacite d'une regle, remontee a l'administration de la
--    plateforme (jamais une suppression automatique).
--
-- 3. reminder_settings: les reglages du restaurant (regles actives, delais).
--    Lecture par tout membre, ecriture par qui a le droit 'settings.edit'.
--
-- 4. reminder_preferences: les rappels qu'une personne a coupes pour elle.
--
-- 5. Agregats calcules EN BASE (bilan du lundi, mesures de la console): l'API
--    PostgREST plafonne chaque reponse a 1000 lignes; lire les commandes brutes
--    tronquait les faits d'un restaurant actif. Ces fonctions ne rendent que des
--    totaux. Reservees a service_role (le moteur et la console de plateforme):
--    elles exposeraient les ventes d'un restaurant a qui pourrait les appeler.
--
-- ROLLBACK (rien d'autre n'en depend en base):
--   DROP FUNCTION public.reminder_coach_slots(uuid, timestamptz, timestamptz, text),
--     public.reminder_coach_items(uuid, timestamptz, timestamptz, timestamptz),
--     public.reminder_rule_stats(timestamptz, integer);
--   DROP TABLE public.reminder_preferences, public.reminder_settings, public.reminders;
--   DROP TRIGGER trg_orders_ready_at ON public.orders;
--   DROP FUNCTION public.stamp_order_ready_at();
--   ALTER TABLE public.orders DROP COLUMN ready_at;
-- ============================================================================

-- 1. orders.ready_at ---------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at timestamptz;

-- SECURITY INVOKER: un declencheur de donnees, pas une garde de droits.
CREATE OR REPLACE FUNCTION public.stamp_order_ready_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' THEN
    NEW.ready_at := now();
  ELSIF NEW.status IN ('pending', 'confirmed', 'preparing') THEN
    -- Renvoyee en cuisine: elle n'est plus prete, son prochain "prete" repart de zero.
    NEW.ready_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_ready_at ON public.orders;
CREATE TRIGGER trg_orders_ready_at
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_order_ready_at();

-- Le moteur cherche les commandes pretes depuis plus de N minutes.
CREATE INDEX IF NOT EXISTS idx_orders_ready_at
  ON public.orders (ready_at) WHERE status = 'ready';

-- 2. reminders ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (rule IN (
    'order_ready_not_served', 'order_not_started', 'pre_service_stock', 'weekly_coach'
  )),
  subject_key text NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 200),
  recipient_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  level smallint NOT NULL DEFAULT 1 CHECK (level IN (1, 2)),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT reminders_once UNIQUE (tenant_id, rule, subject_key, recipient_id, level)
);

CREATE INDEX IF NOT EXISTS idx_reminders_open
  ON public.reminders (tenant_id, rule) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_recipient_created
  ON public.reminders (recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reminders_notification
  ON public.reminders (notification_id);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Chacun ne voit que SES rappels. Ecritures: le moteur seul (service_role).
CREATE POLICY reminders_select_own ON public.reminders
  FOR SELECT TO authenticated
  USING (recipient_id IN (
    SELECT au.id FROM public.admin_users au WHERE au.user_id = (SELECT auth.uid())
  ));
CREATE POLICY reminders_no_insert ON public.reminders
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY reminders_no_update ON public.reminders
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY reminders_no_delete ON public.reminders
  FOR DELETE TO authenticated USING (false);

REVOKE ALL ON public.reminders FROM anon;
GRANT SELECT ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

-- 3. reminder_settings -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminder_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- { "rules": { "<rule>": true|false }, "ready_not_served_min": 3, "not_started_min": 5 }
  -- Valide par Zod (src/lib/validations/reminders.schema.ts) avant toute ecriture.
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL
);

ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminder_settings_select ON public.reminder_settings
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
CREATE POLICY reminder_settings_insert ON public.reminder_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_write_permission(tenant_id, 'settings.edit'));
CREATE POLICY reminder_settings_update ON public.reminder_settings
  FOR UPDATE TO authenticated
  USING (public.has_tenant_write_permission(tenant_id, 'settings.edit'))
  WITH CHECK (public.has_tenant_write_permission(tenant_id, 'settings.edit'));
CREATE POLICY reminder_settings_delete ON public.reminder_settings
  FOR DELETE TO authenticated
  USING (public.has_tenant_write_permission(tenant_id, 'settings.edit'));

REVOKE ALL ON public.reminder_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_settings TO authenticated;
GRANT ALL ON public.reminder_settings TO service_role;

-- 4. reminder_preferences ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminder_preferences (
  admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (rule IN (
    'order_ready_not_served', 'order_not_started', 'pre_service_stock', 'weekly_coach'
  )),
  muted boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_user_id, rule)
);

CREATE INDEX IF NOT EXISTS idx_reminder_preferences_tenant
  ON public.reminder_preferences (tenant_id);

ALTER TABLE public.reminder_preferences ENABLE ROW LEVEL SECURITY;

-- Une personne ne gere que SES propres preferences, dans SON restaurant.
CREATE POLICY reminder_preferences_select_own ON public.reminder_preferences
  FOR SELECT TO authenticated
  USING (admin_user_id IN (
    SELECT au.id FROM public.admin_users au WHERE au.user_id = (SELECT auth.uid())
  ));
CREATE POLICY reminder_preferences_insert_own ON public.reminder_preferences
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_user_id AND au.tenant_id = reminder_preferences.tenant_id
      AND au.user_id = (SELECT auth.uid())
  ));
CREATE POLICY reminder_preferences_update_own ON public.reminder_preferences
  FOR UPDATE TO authenticated
  USING (admin_user_id IN (
    SELECT au.id FROM public.admin_users au WHERE au.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_user_id AND au.tenant_id = reminder_preferences.tenant_id
      AND au.user_id = (SELECT auth.uid())
  ));
CREATE POLICY reminder_preferences_delete_own ON public.reminder_preferences
  FOR DELETE TO authenticated
  USING (admin_user_id IN (
    SELECT au.id FROM public.admin_users au WHERE au.user_id = (SELECT auth.uid())
  ));

REVOKE ALL ON public.reminder_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_preferences TO authenticated;
GRANT ALL ON public.reminder_preferences TO service_role;

-- 5. Agregats (service_role seulement) -----------------------------------------

-- Commandes par (jour, heure) A L'HEURE DU RESTAURANT.
CREATE OR REPLACE FUNCTION public.reminder_coach_slots(
  p_tenant_id uuid, p_since timestamptz, p_until timestamptz, p_tz text
)
RETURNS TABLE(dow integer, hour integer, orders bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT extract(dow FROM o.created_at AT TIME ZONE p_tz)::integer,
         extract(hour FROM o.created_at AT TIME ZONE p_tz)::integer,
         count(*)
  FROM public.orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.status <> 'cancelled'
    AND o.created_at >= p_since
    AND o.created_at < p_until
  GROUP BY 1, 2;
$$;

-- Ventes par plat avant / pendant la derniere semaine (commandes annulees exclues).
CREATE OR REPLACE FUNCTION public.reminder_coach_items(
  p_tenant_id uuid, p_since timestamptz, p_split timestamptz, p_until timestamptz
)
RETURNS TABLE(name text, before_qty bigint, last_week_qty bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT oi.item_name,
         coalesce(sum(oi.quantity) FILTER (WHERE oi.created_at < p_split), 0)::bigint,
         coalesce(sum(oi.quantity) FILTER (WHERE oi.created_at >= p_split), 0)::bigint
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = p_tenant_id
  WHERE oi.tenant_id = p_tenant_id
    AND o.status <> 'cancelled'
    AND oi.created_at >= p_since
    AND oi.created_at < p_until
  GROUP BY oi.item_name;
$$;

-- Mesures par regle pour la console de la plateforme (tous les restaurants).
CREATE OR REPLACE FUNCTION public.reminder_rule_stats(
  p_since timestamptz, p_resolved_within_min integer
)
RETURNS TABLE(
  rule text, sent bigint, escalated bigint, restaurants bigint, resolved_within bigint,
  median_minutes double precision, notifications bigint, opened bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT r.rule,
         count(*),
         count(*) FILTER (WHERE r.level = 2),
         count(DISTINCT r.tenant_id),
         count(*) FILTER (
           WHERE r.resolved_at IS NOT NULL
             AND r.resolved_at - r.created_at <= make_interval(mins => p_resolved_within_min)
         ),
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY extract(epoch FROM r.resolved_at - r.created_at) / 60
         ) FILTER (WHERE r.resolved_at IS NOT NULL),
         count(DISTINCT r.notification_id),
         count(DISTINCT r.notification_id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.notification_reads nr WHERE nr.notification_id = r.notification_id
           )
         )
  FROM public.reminders r
  WHERE r.created_at >= p_since
  GROUP BY r.rule;
$$;

REVOKE ALL ON FUNCTION public.reminder_coach_slots(uuid, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reminder_coach_items(uuid, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reminder_rule_stats(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_coach_slots(uuid, timestamptz, timestamptz, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reminder_coach_items(uuid, timestamptz, timestamptz, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reminder_rule_stats(timestamptz, integer) TO service_role;


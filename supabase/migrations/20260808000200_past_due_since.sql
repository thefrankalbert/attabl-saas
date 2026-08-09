-- Borner l'impaye dans le temps (constat F3)
-- ============================================================================
-- Cote ATTABL, `past_due` n'avait AUCUNE borne temporelle. Un tenant pouvait y
-- rester indefiniment tout en gardant son plan, parce que rien ne mesurait
-- depuis QUAND il y etait. Cette colonne est cette mesure: elle est posee a la
-- premiere transition vers past_due (webhook Stripe) et effacee des que le
-- tenant repasse a un statut sain. Le cron de gel s'en sert pour passer a
-- `frozen` au-dela du delai de relance.
--
-- Retro-remplissage: les tenants DEJA en past_due prennent `now()` comme point
-- de depart. Sans cette valeur ils resteraient invisibles au cron - le meme
-- angle mort, simplement deplace. Leur compte a rebours redemarre donc a
-- l'application de la migration, ce qui est le comportement voulu: on ne gele
-- personne retroactivement sans l'avoir observe.
--
-- Rollback:
--   alter table public.tenants drop column if exists past_due_since;
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

COMMENT ON COLUMN public.tenants.past_due_since IS
  'Instant de la premiere transition vers past_due. NULL des que le statut redevient sain. Lu par le cron de gel pour borner l''impaye dans le temps (F3).';

UPDATE public.tenants
   SET past_due_since = now()
 WHERE subscription_status = 'past_due'
   AND past_due_since IS NULL;

-- Le cron filtre sur (statut, date): un index partiel suffit et reste minuscule.
CREATE INDEX IF NOT EXISTS idx_tenants_past_due_since
  ON public.tenants (past_due_since)
  WHERE subscription_status = 'past_due';

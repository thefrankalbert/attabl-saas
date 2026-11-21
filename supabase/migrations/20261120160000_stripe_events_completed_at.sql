-- Webhook Stripe: savoir si un evenement a ete traite JUSQU'AU BOUT.
--
-- CE QUI NE MARCHAIT PAS: la ligne d'idempotence est inseree AVANT le
-- traitement, puis retiree si le traitement echoue, pour que le rejeu de Stripe
-- le retraite. Si ce retrait echoue lui aussi (meme panne), la ligne reste: tous
-- les rejeux repondent "deja traite" et l'evenement n'est JAMAIS applique. Un
-- client a paye, son abonnement n'est pas active, et rien ne le rattrape.
--
-- Une ecriture faite au moment de l'echec ne peut pas proteger d'une panne
-- d'ecriture. La preuve doit etre ecrite au SUCCES: `completed_at` est pose
-- quand le traitement a abouti. Une ligne ancienne sans `completed_at` est un
-- evenement jamais abouti, que le rejeu suivant retraite.
--
-- DEFAULT now(), et c'est voulu:
--   - les lignes existantes recoivent une valeur: elles sont considerees
--     traitees, exactement comme aujourd'hui;
--   - le code deja en ligne, qui ne connait pas la colonne, continue d'inserer
--     des lignes "traitees": aucun changement de comportement tant que le
--     nouveau code n'est pas deploye (migration additive, a appliquer AVANT).
-- Le nouveau code insere explicitement NULL, puis pose la date au succes.
--
-- Rollback: ALTER TABLE public.stripe_events DROP COLUMN completed_at;

ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.stripe_events.completed_at IS
  'Date a laquelle le traitement de l evenement a abouti. NULL = jamais abouti.';

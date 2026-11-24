-- ============================================================================
-- Audit verif-prod R8 / C4 (Moyenne): adresses e-mail a ne plus ecrire.
--
-- CE QUI NE TENAIT PAS. Resend signale les rebonds definitifs et les plaintes
-- (bouton "spam"), mais aucun webhook n'etait declare et rien n'etait garde:
-- le service continuait d'ecrire a une adresse morte ou a quelqu'un qui s'est
-- plaint. Chaque envoi de ce type use la reputation d'expedition du domaine,
-- donc la delivrabilite de TOUS les e-mails d'ATTABL.
--
-- LA CORRECTION. Une liste tenue par la route /api/webhooks/resend (signature
-- Svix verifiee) et lue par le service d'envoi avant chaque e-mail qui n'est
-- PAS lie a la securite (les liens de connexion, de reinitialisation et les
-- alertes de compte partent toujours: les bloquer enfermerait le titulaire
-- hors de son compte).
--
-- PAS D'ADRESSE EN CLAIR. Convention du depot pour les adresses dans les
-- journaux et les compteurs: une empreinte. Ici `email_hash` = SHA-256 complet
-- (64 caracteres hexadecimaux) de l'adresse mise en minuscules et sans espaces
-- autour, calcule par l'application (src/services/email-suppression.service.ts).
-- L'index unique sur cette empreinte vaut donc index unique sur l'adresse en
-- minuscules. Une liste fuitee ne donne pas un annuaire.
--
-- ISOLATION. Donnees de la PLATEFORME, sans restaurant: RLS active et AUCUNE
-- politique pour anon ou authenticated. Seul service_role (webhook, service
-- d'envoi) lit et ecrit.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code. Purement additive. Si la table manque,
-- le service d'envoi journalise un avertissement et envoie quand meme, et le
-- webhook repond 500 (Resend relance).
--
-- ROLLBACK:
--   DROP TABLE public.adresses_email_bloquees;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.adresses_email_bloquees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL,
  raison text NOT NULL,
  -- Identifiant Svix du premier evenement recu (trace, et rejeu sans doublon).
  evenement_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adresses_email_bloquees_hash_check CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT adresses_email_bloquees_raison_check CHECK (
    raison IN ('rebond_definitif', 'plainte')
  ),
  CONSTRAINT adresses_email_bloquees_evenement_check CHECK (
    evenement_id IS NULL OR length(evenement_id) BETWEEN 1 AND 200
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS adresses_email_bloquees_email_hash_key
  ON public.adresses_email_bloquees (email_hash);

COMMENT ON TABLE public.adresses_email_bloquees IS
  'Adresses en rebond definitif ou en plainte (empreinte SHA-256 de l adresse en minuscules). Ecrit et lu par service_role seulement.';

ALTER TABLE public.adresses_email_bloquees ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adresses_email_bloquees FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.adresses_email_bloquees TO service_role;

COMMIT;

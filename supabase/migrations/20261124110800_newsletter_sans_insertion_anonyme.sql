-- ============================================================================
-- Audit B108 (Basse): plus d'insertion anonyme directe dans
-- `newsletter_subscriber`.
--
-- CE QUI NE TENAIT PAS. La politique "Enable insert for public" et le droit
-- INSERT accorde a `anon` (`20260731000500`) laissaient la cle anon du bundle
-- remplir la table par appel direct a PostgREST, sans la limite de debit de
-- l'application.
--
-- IL N'EXISTE PLUS AUCUN CHEMIN APPLICATIF D'INSCRIPTION. L'action serveur
-- `src/app/actions/newsletter.ts`, qui justifiait l'exception, a ete supprimee
-- comme code mort par le commit cc69e844 (PR #385). Verifie le 2026-11-24:
-- `rg newsletter_subscriber src` ne trouve que le type genere, et aucun
-- formulaire ne l'emploie. Il n'y a donc rien a faire passer par un client
-- serveur: on retire seulement le droit et la politique.
--
-- CE QUI RESTE. Lecture et suppression reservees a service_role (politiques
-- inchangees). Les lignes deja inscrites ne sont pas touchees.
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne.
--
-- ROLLBACK (deconseille):
--   GRANT INSERT ON public.newsletter_subscriber TO anon;
--   CREATE POLICY "Enable insert for public" ON public.newsletter_subscriber
--     FOR INSERT WITH CHECK ((email IS NOT NULL) AND (char_length(email) >= 5)
--     AND (char_length(email) <= 255) AND (POSITION('@' IN email) > 1));
-- ============================================================================

DROP POLICY IF EXISTS "Enable insert for public" ON public.newsletter_subscriber;

REVOKE INSERT ON public.newsletter_subscriber FROM anon, authenticated;

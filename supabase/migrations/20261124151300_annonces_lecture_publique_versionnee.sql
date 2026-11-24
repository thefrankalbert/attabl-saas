-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B125 (Basse). La politique "Public can
-- view active announcements" est ecrite dans le depot.
--
-- CE QUI NE TENAIT PAS. La politique existe en production (lue le
-- 2026-11-23: SELECT, roles `public`, `USING (is_active = true)`), mais AUCUN
-- fichier de migration ne la cree (seul un commentaire de
-- 20260702000000_perf_rls_initplan_indexes.sql la mentionne). Une base
-- reconstruite depuis le depot ne l'aurait pas, alors que la vitrine LIT les
-- annonces avec le client a cookies (`components/tenant/AnnouncementBanner.tsx`,
-- monte par `sites/[site]/(storefront)/layout.tsx`): un visiteur n'y verrait
-- plus aucune annonce.
--
-- LA CORRECTION. Migration idempotente qui (re)cree la politique a
-- l'identique du texte de production (`lot-b2b1/prod-politiques.txt`). En
-- production, elle remplace la politique par elle-meme: aucun changement
-- d'acces. Les politiques d'ecriture (`menu.edit`) et la lecture des membres
-- sont inchangees.
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne (aucun changement en
-- production).
--
-- ROLLBACK: aucun en production (etat identique). Sur une base reconstruite:
--   DROP POLICY IF EXISTS "Public can view active announcements" ON public.announcements;
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Public can view active announcements" ON public.announcements;
CREATE POLICY "Public can view active announcements"
  ON public.announcements
  FOR SELECT
  USING (is_active = true);

COMMIT;

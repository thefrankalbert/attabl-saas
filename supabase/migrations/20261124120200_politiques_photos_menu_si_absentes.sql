-- ============================================================================
-- Politiques `storage.objects` du bucket `menu-items`: creees si elles
-- manquent, dans leur etat final (constat "politiques storage hors
-- migrations", audit de mise en production du 2026-11-23).
-- ============================================================================
--
-- LE CONSTAT, VERIFIE. L'audit dit que trois politiques du bucket `menu-items`
-- ("Tenants can upload/update/delete own menu photos") ne sont creees par
-- aucune migration, et que 20261108214107 (lignes 19 a 44) les modifie par
-- ALTER POLICY. C'est inexact pour la chaine complete: 20260805000200 les cree
-- (CREATE POLICY), et la politique de lecture "Tenants can read own menu
-- photos" vient de 20261108182858. Une base qui rejoue TOUTE la chaine les a
-- donc. Le trou reel est ailleurs: une base reconstruite depuis l'instantane
-- `supabase/schema.sql` (schema `public` seul) puis les migrations posterieures
-- n'a AUCUNE de ces quatre politiques, puisque les migrations qui les creent et
-- les modifient sont anterieures a l'instantane et ne sont pas rejouees.
-- `scripts/run-journeys-local.sh` le contourne en rejouant 20260805000200 a la
-- main, puis 20261108214107 dans sa version a jour, ce qu'aucun autre outil ne
-- fait. Sans politique, l'ecriture directe est refusee (ferme par defaut) mais
-- la lecture de ses propres photos aussi, et le banc ne ressemble plus a la
-- production.
--
-- CE QUE FAIT CETTE MIGRATION. Pour chacune des quatre politiques: si elle
-- n'existe pas, elle est creee dans l'etat final voulu par 20261108214107
-- (ecriture limitee a `menu.edit` du restaurant du dossier, dossier au format
-- UUID, sinon refus) et 20261108182858 (lecture par les membres du restaurant
-- du dossier). Si elle existe deja (production, chaine complete), elle n'est
-- PAS touchee, meme si son texte differe: cette migration ne modifie aucune
-- politique existante. Sans table `storage.objects` (base pgTAP), elle ne fait
-- rien. Rejouable.
--
-- ORDRE DE DEPLOIEMENT. Indifferent: en production les quatre politiques
-- existent (20261108214107 a ete applique en production le 2026-11-08), donc
-- rien n'y change. Aucun acces n'est retire.
--
-- ROLLBACK (seulement sur une base ou cette migration les a creees):
--   DROP POLICY IF EXISTS "Tenants can upload menu photos" ON storage.objects;
--   DROP POLICY IF EXISTS "Tenants can update own menu photos" ON storage.objects;
--   DROP POLICY IF EXISTS "Tenants can delete own menu photos" ON storage.objects;
--   DROP POLICY IF EXISTS "Tenants can read own menu photos" ON storage.objects;
-- ============================================================================

DO $guard$
DECLARE
  -- Texte de 20261108214107, a l'identique.
  v_ecriture constant text := $q$bucket_id = 'menu-items' AND CASE
    WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_tenant_write_permission(((storage.foldername(name))[1])::uuid, 'menu.edit')
    ELSE false END$q$;
  -- Texte de 20261108182858, a l'identique.
  v_lecture constant text := $q$bucket_id = 'menu-items'
  AND (storage.foldername(name))[1] IN (SELECT (t.t)::text FROM unnest(public.get_my_tenant_ids_array()) t(t))$q$;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects absent: politiques des photos du menu non creees';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'Tenants can upload menu photos') THEN
    EXECUTE 'CREATE POLICY "Tenants can upload menu photos" ON storage.objects'
         || ' FOR INSERT TO authenticated WITH CHECK (' || v_ecriture || ')';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'Tenants can update own menu photos') THEN
    EXECUTE 'CREATE POLICY "Tenants can update own menu photos" ON storage.objects'
         || ' FOR UPDATE TO authenticated USING (' || v_ecriture || ') WITH CHECK (' || v_ecriture || ')';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'Tenants can delete own menu photos') THEN
    EXECUTE 'CREATE POLICY "Tenants can delete own menu photos" ON storage.objects'
         || ' FOR DELETE TO authenticated USING (' || v_ecriture || ')';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'Tenants can read own menu photos') THEN
    EXECUTE 'CREATE POLICY "Tenants can read own menu photos" ON storage.objects'
         || ' FOR SELECT TO authenticated USING (' || v_lecture || ')';
  END IF;
END $guard$;

-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B113 (Moyenne, avec son complement du
-- 2026-11-23) et B114 (Basse). Espaces de fichiers `tenant-sounds` et
-- `qr-designs`.
--
-- CE QUI NE TENAIT PAS.
-- B113. L'espace `tenant-sounds` N'EXISTE PAS en production (`storage.buckets`
--   ne contient que `logos`, `menu-items`, `qr-designs`, lu le 2026-11-23):
--   l'envoi d'un son de notification personnalise (`SoundSettings.tsx`) ne
--   pouvait pas aboutir. Sa migration d'origine (20260226000004) le creait
--   sans limite de taille ni liste de types (controles seulement dans le
--   navigateur: 2 Mo, mp3/wav/ogg).
-- B113, complement. Ses politiques d'ajout, de modification et de suppression
--   (20261112210000) n'exigent que d'etre membre du restaurant: un serveur ou
--   un chef pouvait remplacer ou supprimer le son d'alerte de tout le
--   restaurant (chemin fixe `${tenantId}/custom-notification.<ext>`,
--   `upsert: true`). L'ecran est reserve aux reglages (`settings.edit`).
-- B114. L'espace `qr-designs` est public, sans limite de taille ni liste de
--   types (les deux autres espaces ont 5 Mo et 3 types d'image): un membre
--   pouvait y deposer n'importe quel fichier par l'API directe. Aucun code ne
--   lit ni n'ecrit cet espace aujourd'hui (recherche dans src/: 0 resultat).
--
-- LA CORRECTION.
-- 1. `tenant-sounds` est cree s'il manque (public: le son est lu par son
--    adresse publique, `getPublicUrl`), avec `file_size_limit` = 2 Mo et les
--    quatre types audio que l'ecran accepte. S'il existe deja, seules ces deux
--    limites sont posees.
-- 2. Ses politiques d'ecriture exigent `settings.edit` sur le restaurant du
--    dossier (meme forme que l'espace `menu-items`: dossier au format UUID,
--    sinon refus). Une politique de LECTURE pour les membres vivants du
--    restaurant est ajoutee: l'envoi avec `upsert: true` relit l'objet
--    existant, ce qu'aucune politique ne permettait.
-- 3. `qr-designs` recoit `file_size_limit` = 5 Mo et les trois types d'image
--    des autres espaces. Il reste public.
-- AUCUN fichier n'est supprime ni deplace: seules la table `storage.buckets`
-- (deux colonnes, ou une ligne nouvelle) et les politiques changent. Un
-- fichier deja depose qui depasserait les limites reste en place; les
-- limites ne jugent que les envois suivants.
-- Le schema `storage` n'existe ni sur le banc de test ni en CI: garde
-- d'existence, comme 20261112210000. Le test pgTAP pose un schema `storage`
-- minimal pour exercer ce fichier.
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne. L'ecran des sons
-- envoie deja ces types et ces tailles, avec la session d'un utilisateur qui a
-- `settings.edit` (page des reglages).
--
-- ROLLBACK: remettre les trois politiques de 20261112210000 (membre vivant),
-- supprimer "Tenants can read own sounds", et
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--    WHERE id IN ('tenant-sounds', 'qr-designs');
-- (L'espace `tenant-sounds` cree peut rester: il etait attendu par le code.)
-- ============================================================================

DO $do$
DECLARE
  reglages constant text :=
    $q$bucket_id = 'tenant-sounds' AND CASE
       WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN public.has_tenant_write_permission(((storage.foldername(name))[1])::uuid, 'settings.edit')
       ELSE false
     END$q$;
  membre_vivant constant text :=
    $q$bucket_id = 'tenant-sounds' AND (storage.foldername(name))[1] IN (
         SELECT t::text FROM unnest(public.get_my_tenant_ids_array()) AS t)$q$;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'schema storage absent : espaces de fichiers non modifies';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('tenant-sounds', 'tenant-sounds', true, 2097152,
          ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'])
  ON CONFLICT (id) DO UPDATE
    SET file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  UPDATE storage.buckets
     SET file_size_limit = 5242880,
         allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
   WHERE id = 'qr-designs';

  EXECUTE 'DROP POLICY IF EXISTS "Tenants can upload sounds" ON storage.objects';
  EXECUTE 'CREATE POLICY "Tenants can upload sounds" ON storage.objects FOR INSERT TO authenticated WITH CHECK ('
    || reglages || ')';
  EXECUTE 'DROP POLICY IF EXISTS "Tenants can update sounds" ON storage.objects';
  EXECUTE 'CREATE POLICY "Tenants can update sounds" ON storage.objects FOR UPDATE TO authenticated USING ('
    || reglages || ') WITH CHECK (' || reglages || ')';
  EXECUTE 'DROP POLICY IF EXISTS "Tenants can delete sounds" ON storage.objects';
  EXECUTE 'CREATE POLICY "Tenants can delete sounds" ON storage.objects FOR DELETE TO authenticated USING ('
    || reglages || ')';
  EXECUTE 'DROP POLICY IF EXISTS "Tenants can read own sounds" ON storage.objects';
  EXECUTE 'CREATE POLICY "Tenants can read own sounds" ON storage.objects FOR SELECT TO authenticated USING ('
    || membre_vivant || ')';
END
$do$;

-- storage.objects / bucket `menu-items`: ecriture ouverte a TOUS les tenants.
--
-- Constat trouve le 2026-08-05 en interrogeant la PRODUCTION. L'audit pre-pilote
-- (DB-08) parlait de "policies non versionnees"; le probleme reel est plus grave.
--
-- Etat mesure en production:
--   [UPDATE] "Authenticated update/delete 19sf9hu_0"  using: bucket_id = 'menu-items'
--   [DELETE] "Authenticated update/delete 19sf9hu_2"  using: bucket_id = 'menu-items'
--   [INSERT] "Authenticated upload 19sf9hu_0"         check: bucket_id = 'menu-items'
--
-- AUCUN filtre de tenant. N'importe quel utilisateur authentifie - donc n'importe
-- quel restaurateur client - pouvait MODIFIER ou SUPPRIMER les photos de plats de
-- n'importe quel autre restaurant.
--
-- POURQUOI ON NE SCOPE PAS LES FICHIERS EXISTANTS
--
-- Le reflexe serait de copier le modele de `qr-designs`, qui scope sur
-- (storage.foldername(name))[1] = tenant. Mesure avant d'ecrire, sur les 121
-- fichiers reels du bucket:
--   - 0 / 121 sont ranges dans un dossier (noms a plat: `<uuid>_<horodatage>.jpg`)
--   - 0 / 121 ont un prefixe correspondant a un menu_items.id
--   - 0 / 121 ont un prefixe correspondant a un tenants.id
--   - 54 / 121 seulement sont references par un menu_items.image_url
--   - 44 / 121 seulement ont un `owner`
-- Il n'existe donc AUCUNE attribution fiable au tenant pour 67 fichiers. Scoper
-- par dossier aurait rendu les 121 photos non modifiables ET aurait pu les faire
-- disparaitre des pages. C'est exactement le genre de migration "evidente" qui
-- casse la production.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- On ferme le trou pour l'avenir sans toucher a l'existant:
--   - ecriture autorisee UNIQUEMENT sous `<tenant_id>/...` du tenant de l'appelant
--   - les fichiers a plat deja presents restent SERVIS (bucket public, lecture par
--     URL, aucune policy SELECT requise) mais ne sont plus modifiables par un
--     autre tenant - ni par personne d'autre que le service_role
--
-- Le code d'upload est adapte dans le meme lot (src/hooks/useSettingsData.ts):
-- les nouveaux fichiers partent sous `<tenant_id>/`. Sans ce changement, plus
-- aucun upload ne passerait.
--
-- Consequence assumee: remplacer une ANCIENNE photo laisse l'ancien fichier
-- orphelin dans le bucket (sa suppression echoue silencieusement, elle n'est plus
-- autorisee). C'est un fichier inutile, pas une perte de donnee, et c'est
-- preferable a laisser un restaurant supprimer les photos d'un autre.
--
-- Rollback:
--   drop policy "Tenants can upload menu photos" on storage.objects;
--   drop policy "Tenants can update own menu photos" on storage.objects;
--   drop policy "Tenants can delete own menu photos" on storage.objects;
--   create policy "Authenticated upload 19sf9hu_0" on storage.objects for insert
--     to authenticated with check (bucket_id = 'menu-items');
--   create policy "Authenticated update/delete 19sf9hu_0" on storage.objects for update
--     to authenticated using (bucket_id = 'menu-items');
--   create policy "Authenticated update/delete 19sf9hu_2" on storage.objects for delete
--     to authenticated using (bucket_id = 'menu-items');

drop policy if exists "Authenticated upload 19sf9hu_0" on storage.objects;
drop policy if exists "Authenticated update/delete 19sf9hu_0" on storage.objects;
drop policy if exists "Authenticated update/delete 19sf9hu_2" on storage.objects;

create policy "Tenants can upload menu photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'menu-items'
    and (storage.foldername(name))[1] = any (
      select t::text from unnest(public.get_my_tenant_ids_array()) t
    )
  );

create policy "Tenants can update own menu photos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'menu-items'
    and (storage.foldername(name))[1] = any (
      select t::text from unnest(public.get_my_tenant_ids_array()) t
    )
  )
  with check (
    bucket_id = 'menu-items'
    and (storage.foldername(name))[1] = any (
      select t::text from unnest(public.get_my_tenant_ids_array()) t
    )
  );

create policy "Tenants can delete own menu photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'menu-items'
    and (storage.foldername(name))[1] = any (
      select t::text from unnest(public.get_my_tenant_ids_array()) t
    )
  );

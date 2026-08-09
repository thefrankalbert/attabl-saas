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
-- (storage.foldername(name))[1] = tenant. Mesure en production le 2026-08-08,
-- sur les 121 fichiers reels du bucket:
--   - 77 / 121 sont ranges dans un dossier (prefixe tenant ou slug de la demo)
--   - 44 / 121 sont a plat (`<uuid>_<horodatage>.jpg`), sans attribution possible
--   - sur ces 44, TROIS SEULEMENT sont referencees par un menu_items.image_url;
--     les 41 autres sont des orphelines qu'aucun plat n'affiche
-- Scoper par dossier sans reprise prealable rendrait ces 44 fichiers
-- non modifiables. Les trois qui comptent doivent etre recopiees sous
-- `<tenant_id>/` avec mise a jour de image_url AVANT que ces policies mordent;
-- les 41 autres ne sont referencees par rien.
--
-- (Une mesure anterieure annoncait 54 fichiers references sur 121: elle etait
-- fausse, la jointure comparait mal les URL. Chiffres ci-dessus re-mesures.)
--
-- CE QUE FAIT CETTE MIGRATION
--
-- On ferme le trou pour l'avenir sans toucher a l'existant:
--   - ecriture autorisee UNIQUEMENT sous `<tenant_id>/...` du tenant de l'appelant
--   - les fichiers a plat deja presents restent SERVIS (bucket public, lecture par
--     URL, aucune policy SELECT requise) mais ne sont plus modifiables par un
--     autre tenant - ni par personne d'autre que le service_role
--
-- ETAT REEL APRES LE LOT (corrige apres audit - la phrase precedente decrivait
-- une etape intermediaire): plus AUCUN ecrivain authentifie ne subsiste sur ce
-- bucket. Les quatre chemins d'upload (onboarding, hook partage, logo des
-- reglages, LogoCropper) passent desormais par /api/upload, qui ecrit avec le
-- client service_role - donc hors RLS. Ces trois policies ne sont donc plus des
-- autorisations, ce sont des refus: elles ferment la porte que le reroutage
-- vient de cesser d'emprunter. C'est le bon etat de securite, mais il faut le
-- dire dans ce sens - une future fonctionnalite qui reprendrait l'ecriture
-- directe depuis le navigateur se heurterait a elles, et c'est voulu.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS: fermer la LECTURE. Le bucket est public
-- par conception (les photos de plats sont affichees sur une vitrine publique),
-- donc n'importe qui connaissant une URL lit la photo de n'importe quel
-- restaurant. C'est acceptable pour ce contenu.
--
-- L'ENUMERATION, elle, est deja fermee - mesure le 2026-08-08 et non plus
-- supposee: RLS est ACTIVE sur storage.objects et il n'existe AUCUNE policy
-- SELECT, ni pour ce bucket ni pour un autre. `storage.list()` ne renvoie donc
-- rien a un client anon ou authentifie; seule la lecture par URL directe
-- fonctionne, ce qui est le comportement voulu d'un bucket public.
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

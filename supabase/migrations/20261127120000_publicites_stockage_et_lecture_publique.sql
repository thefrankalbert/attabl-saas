-- Publicites: la fonction etait inutilisable en production.
--
-- 1. Le bucket `images` (bannieres) n'existait pas: tout envoi echouait.
--    Il est public en lecture (comme `logos` et `menu-items`); l'ecriture passe
--    uniquement par /api/upload (cle de service, dossier <tenant_id>/ derive de
--    la session, droit menu.edit), donc aucune politique d'ecriture n'est posee
--    sur storage.objects pour ce bucket.
-- 2. La carte des clients ne pouvait pas lire les annonces. La table reste
--    FERMEE a anon (controle DB-07 de anon_exposure.test.sql): les clients
--    passent par get_storefront_ads, qui ne rend que id, image et lien des
--    annonces ACTIVES d'un restaurant visible en vitrine (meme regle que le
--    catalogue: private.storefront_tenant_visible).
-- 3. Le lien d'une annonce devient un <a href> chez les clients: seuls les
--    liens http(s) sont acceptes (un lien javascript: executerait du code).
--    La table est vide en production au moment de cette migration.
--
-- Retour arriere:
--   drop function public.get_storefront_ads(uuid);
--   alter table public.ads drop constraint ads_link_http;
--   delete from storage.buckets where id = 'images';  -- seulement si vide

-- Garde: la base de test pgTAP de la CI n'a pas le schema storage complet
-- (meme garde que 20261124151100).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets absent: bucket images non cree (base de test)';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end
$$;

create or replace function public.get_storefront_ads(p_tenant_id uuid)
returns table (id uuid, image_url text, link text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.image_url, a.link
  from public.ads a
  where a.tenant_id = p_tenant_id
    and a.is_active = true
    and private.storefront_tenant_visible(p_tenant_id)
  order by a.sort_order asc, a.created_at asc
  limit 6;
$$;

revoke all on function public.get_storefront_ads(uuid) from public;
grant execute on function public.get_storefront_ads(uuid) to anon, authenticated, service_role;

alter table public.ads drop constraint if exists ads_link_http;
alter table public.ads
  add constraint ads_link_http check (link is null or link ~* '^https?://');

-- Publicites (20261127120000): les clients lisent, par get_storefront_ads,
-- les annonces ACTIVES d'un restaurant visible, rien d'autre; la table reste
-- fermee a anon (DB-07); un lien non http(s) est refuse.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values
  ('f7000000-0000-4000-8000-00000000000a', 'pub-visible', 'Pub visible', true, 'business', 'active'),
  ('f7000000-0000-4000-8000-00000000000b', 'pub-suspendu', 'Pub suspendu', true, 'business', 'active');
update public.tenants set suspended_at = now() where id = 'f7000000-0000-4000-8000-00000000000b';

insert into public.ads (tenant_id, image_url, link, sort_order, is_active)
values
  ('f7000000-0000-4000-8000-00000000000a', '/a.jpg', 'https://exemple.com', 1, true),
  ('f7000000-0000-4000-8000-00000000000a', '/b.jpg', null, 2, false),
  ('f7000000-0000-4000-8000-00000000000b', '/c.jpg', null, 1, true);

select throws_ok(
  $$insert into public.ads (tenant_id, image_url, link, sort_order, is_active)
    values ('f7000000-0000-4000-8000-00000000000a', '/d.jpg', 'javascript:alert(1)', 3, true)$$,
  '23514', null, 'un lien javascript: est refuse par la base');

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';

select is((select count(*) from public.get_storefront_ads('f7000000-0000-4000-8000-00000000000a'))::int, 1,
  'client: seule l annonce active du restaurant visible est rendue');
select is((select link from public.get_storefront_ads('f7000000-0000-4000-8000-00000000000a')),
  'https://exemple.com', 'client: le lien de l annonce est rendu');
select is((select count(*) from public.get_storefront_ads('f7000000-0000-4000-8000-00000000000b'))::int, 0,
  'client: aucune annonce d un restaurant suspendu');
select throws_ok('select id from public.ads limit 1', '42501', null,
  'client: la table ads reste fermee (DB-07)');

reset role;
select ok(
  has_function_privilege('anon', 'public.get_storefront_ads(uuid)', 'EXECUTE'),
  'get_storefront_ads est executable par anon');

select * from finish();
rollback;

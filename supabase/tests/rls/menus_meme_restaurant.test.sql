-- Une carte ne peut pas etre rattachee a la carte ou a l'espace d'un AUTRE
-- restaurant, ni etre son propre parent (audit B24, CRITIQUE).
--
-- CE QUE CE TEST VERROUILLE. Avant 20261123100000, les politiques d'ecriture
-- de `menus` ne regardaient que `tenant_id`, et `parent_menu_id` / `venue_id`
-- n'avaient qu'une cle etrangere (qui ignore la RLS). L'admin du restaurant A
-- accrochait une carte a une carte de B, et la vitrine de B l'affichait.
--
-- Execution: scripts/run-pgtap.sh --local

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into public.tenants (id, slug, name, is_active, currency, subscription_status) values
  ('a24a0000-0000-0000-0000-00000000000a', 'b24-resto-a', 'Resto A', true, 'XOF', 'active'),
  ('a24b0000-0000-0000-0000-00000000000b', 'b24-resto-b', 'Resto B', true, 'XOF', 'active');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('e24a0000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'owner-a@exemple.test', 'x', now(), now());

insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('d24a0000-0000-0000-0000-00000000000a', 'e24a0000-0000-0000-0000-00000000000a',
   'a24a0000-0000-0000-0000-00000000000a', 'owner-a@exemple.test', 'owner', true);

insert into public.venues (id, tenant_id, slug, name) values
  ('f24a0000-0000-0000-0000-00000000000a', 'a24a0000-0000-0000-0000-00000000000a', 'salle-a', 'Salle A'),
  ('f24b0000-0000-0000-0000-00000000000b', 'a24b0000-0000-0000-0000-00000000000b', 'salle-b', 'Salle B');

insert into public.menus (id, tenant_id, name, slug, is_active) values
  ('c24a0000-0000-0000-0000-00000000000a', 'a24a0000-0000-0000-0000-00000000000a', 'Carte A', 'carte-a', true),
  ('c24b0000-0000-0000-0000-00000000000b', 'a24b0000-0000-0000-0000-00000000000b', 'Carte B', 'carte-b', true);

select is(
  (select p.prosecdef from pg_proc p where p.proname = 'menus_same_tenant_links'),
  false,
  'la garde est SECURITY INVOKER');

select ok(
  exists (select 1 from pg_trigger
          where tgrelid = 'public.menus'::regclass and tgname = 'menus_same_tenant_links'),
  'le declencheur est pose sur menus');

-- Le proprietaire de A, avec sa session.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e24a0000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$insert into public.menus (tenant_id, name, slug, is_active, parent_menu_id)
    values ('a24a0000-0000-0000-0000-00000000000a', 'Intrus', 'intrus', true,
            'c24b0000-0000-0000-0000-00000000000b')$$,
  '23514', NULL,
  'une carte de A ne peut pas avoir pour parent une carte de B');

select throws_ok(
  $$update public.menus set parent_menu_id = 'c24b0000-0000-0000-0000-00000000000b'
    where id = 'c24a0000-0000-0000-0000-00000000000a'$$,
  '23514', NULL,
  'ni par une mise a jour');

select throws_ok(
  $$insert into public.menus (tenant_id, name, slug, is_active, venue_id)
    values ('a24a0000-0000-0000-0000-00000000000a', 'Intrus 2', 'intrus-2', true,
            'f24b0000-0000-0000-0000-00000000000b')$$,
  '23514', NULL,
  'une carte de A ne peut pas etre rattachee a un espace de B');

select throws_ok(
  $$update public.menus set parent_menu_id = id
    where id = 'c24a0000-0000-0000-0000-00000000000a'$$,
  '23514', NULL,
  'une carte ne peut pas etre son propre parent');

select lives_ok(
  $$insert into public.menus (tenant_id, name, slug, is_active, parent_menu_id, venue_id)
    values ('a24a0000-0000-0000-0000-00000000000a', 'Sous-carte', 'sous-carte', true,
            'c24a0000-0000-0000-0000-00000000000a', 'f24a0000-0000-0000-0000-00000000000a')$$,
  'temoin: parent et espace du meme restaurant acceptes');

select lives_ok(
  $$update public.menus set name = 'Carte A renommee'
    where id = 'c24a0000-0000-0000-0000-00000000000a'$$,
  'temoin: une mise a jour sans lien n est pas genee');

reset role;
select * from finish();
rollback;

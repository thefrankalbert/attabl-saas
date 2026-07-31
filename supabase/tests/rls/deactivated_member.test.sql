-- LOT 1 / DB-03 - un employe desactive ne doit plus avoir d acces en base.
--
-- get_my_tenant_ids_array() et get_my_tenant_ids() sont references par 66 policies
-- (mesure le 2026-07-31) et par assert_tenant_member(), qui garde les RPC de stock,
-- de reporting et de caisse. Ce test protege les DEUX sens:
--   - le membre desactive perd l acces (correction);
--   - le membre actif le garde (non-regression, c est le garde-fou de la migration).
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/deactivated_member.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

-- Jeu d essai minimal: un tenant, un membre actif, un membre desactive.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'actif@test.local', 'x', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'desactive@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('33333333-3333-3333-3333-333333333333', 'tenant-test-db03', 'Tenant Test DB-03', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111', 'actif@test.local', 'owner', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222', 'desactive@test.local', 'waiter', false);

-- ------------------------------------------------ membre ACTIF (non-regression)
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select is(
  coalesce(array_length(public.get_my_tenant_ids_array(), 1), 0),
  1,
  'DB-03 non-regression: un membre ACTIF voit toujours son tenant'
);
select ok(
  '33333333-3333-3333-3333-333333333333'::uuid = any (public.get_my_tenant_ids_array()),
  'DB-03 non-regression: c est bien SON tenant qui est retourne'
);
-- assert_tenant_member n accorde pas EXECUTE au role authenticated (verifie le
-- 2026-07-31: postgres, anon, service_role uniquement). Elle n est jamais appelee
-- directement par un client: elle l est DANS le corps des RPC SECURITY DEFINER,
-- donc sous l identite du proprietaire. On reproduit ce contexte en repassant
-- proprietaire; le claim JWT, lui, reste positionne et pilote auth.uid().
reset role;
select lives_ok(
  'select public.assert_tenant_member(''33333333-3333-3333-3333-333333333333''::uuid)',
  'DB-03 non-regression: assert_tenant_member passe pour un membre actif'
);
set local role authenticated;

-- --------------------------------------------------- membre DESACTIVE (fix)
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select is(
  coalesce(array_length(public.get_my_tenant_ids_array(), 1), 0),
  0,
  'DB-03: un membre DESACTIVE ne voit plus aucun tenant'
);
select is(
  (select count(*)::int from public.get_my_tenant_ids()),
  0,
  'DB-03: get_my_tenant_ids() ne retourne rien pour un membre desactive'
);
-- Meme contexte proprietaire que ci-dessus, sinon on mesurerait un "permission
-- denied for function" au lieu du refus d appartenance que l on veut prouver.
reset role;
select throws_ok(
  'select public.assert_tenant_member(''33333333-3333-3333-3333-333333333333''::uuid)',
  '42501',
  null,
  'DB-03: assert_tenant_member refuse un membre desactive'
);
select * from finish();
rollback;

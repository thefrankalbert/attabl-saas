-- Isolation entre restaurants : les postes et les reglages d'un restaurant ne
-- donnent rien dans un autre.
--
-- POURQUOI CE TEST EXISTE. La resolution lit trois sources par restaurant (la
-- ligne du membre, les reglages de poste, la matrice). Un filtre `tenant_id`
-- oublie sur l'une d'elles ferait d'un gerant du restaurant A un gerant de B,
-- ou appliquerait a A un reglage pose par le proprietaire de B.
--
-- TEMOIN. Le meme gerant, les memes requetes, passent dans SON restaurant.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- 1 proprietaire de A, 2 gerant de A, 3 proprietaire de B.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a6000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'isolation' || g || '@test.local', 'x', now(), now()
from generate_series(1, 3) g;
insert into public.tenants (id, slug, name, is_active) values
  ('a6000000-0000-4000-8000-00000000000a', 'isolation-a', 'Isolation A', true),
  ('a6000000-0000-4000-8000-00000000000b', 'isolation-b', 'Isolation B', true);
insert into public.admin_users (tenant_id, user_id, email, postes, is_active) values
  ('a6000000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000101', 'isolation1@test.local', '{owner}', true),
  ('a6000000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000102', 'isolation2@test.local', '{manager}', true),
  ('a6000000-0000-4000-8000-00000000000b', 'a6000000-0000-4000-8000-000000000103', 'isolation3@test.local', '{owner}', true);

-- Reglage pose dans B : il retire menu.edit au poste Gerant DE B.
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('a6000000-0000-4000-8000-00000000000b', 'manager', '{"menu.edit": false}'::jsonb);

-- Les 22 codes, pour interroger la resolution sous le role authenticated (qui
-- n'a pas le droit d'executer private.codes_droits).
create table public.codes_isolation as select c as code from unnest(private.codes_droits()) c;
grant select on public.codes_isolation to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000102"}';

select is((select count(*)::int from public.codes_isolation c
            where public.tenant_permission_level('a6000000-0000-4000-8000-00000000000a', c.code) is not null), 22,
  'temoin: le gerant de A a un niveau sur les 22 codes dans A');
select is((select count(*)::int from public.codes_isolation c
            where public.tenant_permission_level('a6000000-0000-4000-8000-00000000000b', c.code) is not null), 0,
  'isolation: le gerant de A n a AUCUN niveau sur les 22 codes dans B');
select is(public.tenants_avec_droit('menu.edit'), array['a6000000-0000-4000-8000-00000000000a']::uuid[],
  'isolation: tenants_avec_droit ne rend que son restaurant');
select ok(public.has_tenant_write_permission('a6000000-0000-4000-8000-00000000000a', 'menu.edit'),
  'isolation: le reglage pose dans B ne retire rien au gerant de A');

select is((select count(*)::int from public.poste_permissions), 0,
  'isolation: le gerant de A ne LIT pas les reglages de B');
update public.poste_permissions set permissions = '{}'::jsonb
 where tenant_id = 'a6000000-0000-4000-8000-00000000000b';
delete from public.poste_permissions where tenant_id = 'a6000000-0000-4000-8000-00000000000b';
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a6000000-0000-4000-8000-00000000000b', 'chef', '{"menu.price": false}')$$,
  '42501', null, 'isolation: le gerant de A n ECRIT pas un reglage dans B');

-- Le proprietaire de A non plus : etre proprietaire ne vaut que chez soi.
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000101"}';
select ok(public.is_tenant_owner('a6000000-0000-4000-8000-00000000000a'),
  'temoin: le proprietaire de A est proprietaire de A');
select ok(not public.is_tenant_owner('a6000000-0000-4000-8000-00000000000b'),
  'isolation: le proprietaire de A n est PAS proprietaire de B');
select is(public.tenant_permission_level('a6000000-0000-4000-8000-00000000000b', 'menu.view'), null,
  'isolation: le proprietaire de A n a aucun droit dans B');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a6000000-0000-4000-8000-00000000000b', 'chef', '{"menu.price": false}')$$,
  '42501', null, 'isolation: le proprietaire de A n ecrit pas un reglage dans B');
select lives_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a6000000-0000-4000-8000-00000000000a', 'chef', '{"menu.price": false}')$$,
  'temoin: la meme ecriture passe dans SON restaurant');
select throws_ok(
  $$update public.poste_permissions set tenant_id = 'a6000000-0000-4000-8000-00000000000b'
     where tenant_id = 'a6000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'isolation: il ne deplace pas un reglage vers B (WITH CHECK)');

reset role;
select is((select permissions from public.poste_permissions
            where tenant_id = 'a6000000-0000-4000-8000-00000000000b' and poste = 'manager'),
  '{"menu.edit": false}'::jsonb,
  'isolation: le reglage de B est intact apres l UPDATE et le DELETE du gerant de A (0 ligne touchee)');
select is((select count(*)::int from public.poste_permissions
            where tenant_id = 'a6000000-0000-4000-8000-00000000000b'), 1,
  'isolation: B ne porte toujours que son propre reglage');

select * from finish();
rollback;

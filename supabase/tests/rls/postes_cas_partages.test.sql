-- Cas PARTAGES entre le TypeScript et la base.
--
-- POURQUOI CE TEST EXISTE. La resolution des droits est ecrite deux fois : en
-- SQL (`public.tenant_permission_level`) et en TypeScript
-- (`permissionLevel`, src/lib/permissions.ts). L'ecran lit la seconde, la base
-- applique la premiere. Si elles divergent, l'ecran promet un geste que la
-- base refuse, ou cache un geste qu'elle accepte.
--
-- Ce fichier rejoue contre la VRAIE base les cas de
-- `tests/fixtures/permission-cases.json`, le meme fichier que lit Vitest
-- (src/lib/__tests__/permissions.test.ts). Un cas ajoute au JSON est verifie
-- des deux cotes sans rien ecrire ici.
--
-- Il compare aussi le catalogue et la matrice de la base a ceux du JSON, dans
-- les deux sens, et verifie qu'un code hors catalogue est refuse au
-- proprietaire comme au gerant.
--
-- TEMOIN. Le JSON porte, pour chaque regle, un cas et son contraire (meme
-- membre avec et sans reglage, serveur seul et serveur plus caissier). Une
-- resolution qui rendrait toujours la meme reponse echoue donc forcement. Et
-- le plan est calcule sur le JSON : un fichier vide donnerait un plan a 3, pas
-- un faux vert.
--
-- Execution: scripts/run-pgtap.sh (lance depuis la racine du depot : le
-- fichier JSON est lu par chemin relatif a la racine).

\set fixture `cat tests/fixtures/permission-cases.json`

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table _fx on commit drop as select :'fixture'::jsonb as j;
create temporary table _cas on commit drop as
  select (c.n)::int as n,
         c.cas ->> 'name' as nom,
         array(select jsonb_array_elements_text(c.cas -> 'postes')) as postes,
         nullif(c.cas -> 'permission_overrides', 'null'::jsonb) as reglage,
         c.cas -> 'poste_permissions' as reglages_postes,
         c.cas ->> 'perm' as droit,
         c.cas ->> 'expected' as attendu,
         ('a9000000-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid as tenant_id,
         ('a9100000-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid as user_id
  from _fx, jsonb_array_elements(_fx.j -> 'cases') with ordinality as c(cas, n);
create temporary table _inconnus on commit drop as
  select u.code from _fx, jsonb_array_elements_text(_fx.j -> 'unknown_codes') as u(code);
grant select on _cas, _inconnus to authenticated;

select plan(3 + (select count(*) from _cas)::int + 2 * (select count(*) from _inconnus)::int);

-- ---------------------------------------------------------------------------
-- Catalogue et matrice : la base = le JSON, dans les deux sens
-- ---------------------------------------------------------------------------
select is(
  private.codes_droits(),
  array(select jsonb_array_elements_text(j -> 'codes') from _fx),
  'catalogue: les 22 codes de la base sont ceux du JSON, dans le meme ordre');

select set_eq(
  $$select poste, droit, niveau from private.matrice_postes()$$,
  $$select p.key as poste, d.key as droit, d.value #>> '{}' as niveau
      from _fx, jsonb_each(_fx.j -> 'matrix') as p, jsonb_each(p.value) as d$$,
  'matrice: aucune case en trop ni en moins entre la base et le JSON');

select is((select count(*) from private.matrice_postes()), 86::bigint,
  'temoin: la matrice de la base porte bien 86 cases (la comparaison n est pas vide)');

-- ---------------------------------------------------------------------------
-- Donnees : un restaurant et un membre par cas
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'cas' || n || '@test.local', 'x', now(), now()
from _cas;
-- Le proprietaire et le gerant des codes hors catalogue.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('a9200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cas-owner@test.local', 'x', now(), now()),
  ('a9200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cas-manager@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
select tenant_id, 'tenant-cas-' || n, 'Cas ' || n, true, 'business', 'active' from _cas;
insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('a9300000-0000-4000-8000-000000000001', 'tenant-cas-inconnus', 'Cas inconnus', true, 'business', 'active');

-- Un cas sans poste est un visiteur sans ligne de membre (la base refuse une
-- ligne de restaurant sans poste).
insert into public.admin_users (tenant_id, user_id, email, postes, permission_overrides, is_active)
select tenant_id, user_id, 'cas' || n || '@test.local', postes, reglage, true
from _cas where cardinality(postes) > 0;
insert into public.admin_users (tenant_id, user_id, email, postes, is_active) values
  ('a9300000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000001', 'cas-owner@test.local', '{owner}', true),
  ('a9300000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000002', 'cas-manager@test.local', '{manager}', true);

insert into public.poste_permissions (tenant_id, poste, permissions)
select c.tenant_id, r.key, r.value
from _cas c, jsonb_each(c.reglages_postes) as r;

-- Appelle la resolution sous le jeton d'un membre donne. SECURITY INVOKER :
-- c'est bien `authenticated` qui interroge, comme l'API.
create function pg_temp.niveau_pour(p_user uuid, p_tenant uuid, p_droit text) returns text
language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
  return public.tenant_permission_level(p_tenant, p_droit);
end;
$f$;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Les cas du JSON
-- ---------------------------------------------------------------------------
select is(pg_temp.niveau_pour(user_id, tenant_id, droit), attendu, 'cas partage: ' || nom)
from _cas order by n;

-- ---------------------------------------------------------------------------
-- Code hors catalogue : refuse pour tout le monde, proprietaire compris
-- ---------------------------------------------------------------------------
select is(pg_temp.niveau_pour('a9200000-0000-4000-8000-000000000001',
                              'a9300000-0000-4000-8000-000000000001', code), null,
          'hors catalogue: "' || code || '" refuse au proprietaire')
from _inconnus order by code;
select is(pg_temp.niveau_pour('a9200000-0000-4000-8000-000000000002',
                              'a9300000-0000-4000-8000-000000000001', code), null,
          'hors catalogue: "' || code || '" refuse au gerant')
from _inconnus order by code;

reset role;
select * from finish();
rollback;

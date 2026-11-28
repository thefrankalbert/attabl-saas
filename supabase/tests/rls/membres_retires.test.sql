-- Un membre retire (`deleted_at`) ou desactive (`is_active = false`) n'a plus
-- aucun droit, par aucune des fonctions de resolution.
--
-- POURQUOI CE TEST EXISTE. Avant le lot 1 des roles, `get_my_tenant_ids` et
-- `get_my_tenant_ids_array` ne regardaient pas `deleted_at` : un membre retire
-- par la plateforme restait "membre" pour les politiques de lecture qui
-- reposent sur l'appartenance. Et les gardes ecrivaient `is_active` de trois
-- facons differentes. Tout est aligne : `is_active IS TRUE` et
-- `deleted_at IS NULL`, partout.
--
-- TEMOIN. Le meme membre, reactive, retrouve tout.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('ac000000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'retire@test.local', 'x', now(), now());
insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('ac000000-0000-4000-8000-000000000001', 'tenant-retire', 'Tenant Retire', true, 'business', 'active');
insert into public.admin_users (id, tenant_id, user_id, email, postes, is_active)
values ('ac000000-0000-4000-8000-000000000201', 'ac000000-0000-4000-8000-000000000001',
        'ac000000-0000-4000-8000-000000000101', 'retire@test.local', '{manager}', true);

create function pg_temp.etat() returns text language sql as $f$
  select coalesce(public.tenant_permission_level('ac000000-0000-4000-8000-000000000001', 'menu.edit'), 'aucun')
      || '/' || public.has_tenant_write_permission('ac000000-0000-4000-8000-000000000001', 'menu.edit')::text
      || '/' || cardinality(public.tenants_avec_droit('audit.view'))::text
      || '/' || cardinality(public.get_my_tenant_ids_array())::text
      || '/' || (select count(*) from public.get_my_tenant_ids())::text
      || '/' || cardinality(public.get_my_inventory_tenant_ids())::text
      || '/' || public.has_tenant_money_permission('ac000000-0000-4000-8000-000000000001')::text
      || '/' || public.has_tenant_floor_permission('ac000000-0000-4000-8000-000000000001')::text;
$f$;

-- Les fonctions de resolution ne dependent que du jeton (auth.uid()), pas du
-- role Postgres : le jeton est pose sans changer de role, pour pouvoir
-- modifier la ligne du membre entre deux mesures.
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000101"}';

select is(pg_temp.etat(), 'full/true/1/1/1/1/true/true', 'temoin: membre actif, tout est ouvert');

update public.admin_users set is_active = false where id = 'ac000000-0000-4000-8000-000000000201';
select is(pg_temp.etat(), 'aucun/false/0/0/0/0/false/false', 'desactive (is_active = false): plus rien, par aucune fonction');
update public.admin_users set is_active = true where id = 'ac000000-0000-4000-8000-000000000201';
select is(pg_temp.etat(), 'full/true/1/1/1/1/true/true', 'temoin: reactive, tout revient');

update public.admin_users set deleted_at = now() where id = 'ac000000-0000-4000-8000-000000000201';
select is(pg_temp.etat(), 'aucun/false/0/0/0/0/false/false', 'retire (deleted_at): plus rien, y compris l appartenance');
update public.admin_users set deleted_at = null where id = 'ac000000-0000-4000-8000-000000000201';
select is(pg_temp.etat(), 'full/true/1/1/1/1/true/true', 'temoin: restaure, tout revient');

-- Les memes mesures par de vraies lectures sous le role authenticated.
insert into public.audit_log (tenant_id, action, entity_type)
values ('ac000000-0000-4000-8000-000000000001', 'create', 'menu_item');
insert into public.categories (id, tenant_id, name)
values ('ac000000-0000-4000-8000-000000000301', 'ac000000-0000-4000-8000-000000000001', 'Plats');
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('ac000000-0000-4000-8000-000000000001', 'chef', '{"menu.price": false}');

set local role authenticated;
select is((select count(*)::int from public.audit_log), 1, 'temoin: actif, il lit le journal d audit');
select is((select count(*)::int from public.poste_permissions), 1, 'temoin: actif, il lit les reglages de poste');
update public.categories set name = 'Actif' where id = 'ac000000-0000-4000-8000-000000000301';
select is((select name from public.categories where id = 'ac000000-0000-4000-8000-000000000301'), 'Actif',
  'temoin: actif, il modifie la carte');
reset role;

update public.admin_users set deleted_at = now() where id = 'ac000000-0000-4000-8000-000000000201';
set local role authenticated;
select is((select count(*)::int from public.audit_log), 0, 'retire: il ne lit plus le journal d audit');
select is((select count(*)::int from public.poste_permissions), 0, 'retire: il ne lit plus les reglages de poste');
update public.categories set name = 'Retire' where id = 'ac000000-0000-4000-8000-000000000301';
reset role;
select is((select name from public.categories where id = 'ac000000-0000-4000-8000-000000000301'), 'Actif',
  'retire: son UPDATE de la carte touche 0 ligne');

update public.admin_users set deleted_at = null, is_active = false where id = 'ac000000-0000-4000-8000-000000000201';
set local role authenticated;
select is((select count(*)::int from public.audit_log), 0, 'desactive: il ne lit plus le journal d audit');
select is((select count(*)::int from public.poste_permissions), 0, 'desactive: il ne lit plus les reglages de poste');
update public.categories set name = 'Desactive' where id = 'ac000000-0000-4000-8000-000000000301';
reset role;
select is((select name from public.categories where id = 'ac000000-0000-4000-8000-000000000301'), 'Actif',
  'desactive: son UPDATE de la carte touche 0 ligne');

-- Proprietaire desactive : is_tenant_owner tombe aussi.
update public.admin_users set is_active = true where id = 'ac000000-0000-4000-8000-000000000201';
delete from public.admin_users where id = 'ac000000-0000-4000-8000-000000000201';
insert into public.admin_users (id, tenant_id, user_id, email, postes, is_active)
values ('ac000000-0000-4000-8000-000000000202', 'ac000000-0000-4000-8000-000000000001',
        'ac000000-0000-4000-8000-000000000101', 'retire@test.local', '{owner}', true);
select ok(public.is_tenant_owner('ac000000-0000-4000-8000-000000000001'),
  'temoin: proprietaire actif, is_tenant_owner est vrai');
-- Le geste de la plateforme date la ligne (`banned_at`) : `is_active = false`
-- seul sur un proprietaire est refuse en base (proprietaire_protege.test.sql).
update public.admin_users set is_active = false, banned_at = now()
 where id = 'ac000000-0000-4000-8000-000000000202';
select ok(not public.is_tenant_owner('ac000000-0000-4000-8000-000000000001'),
  'proprietaire desactive par la plateforme: is_tenant_owner est faux');

select * from finish();
rollback;

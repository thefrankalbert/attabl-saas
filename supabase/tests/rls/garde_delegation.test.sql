-- La garde d'ecriture doit HONORER les delegations du proprietaire, et ne rien
-- elargir en leur absence.
--
-- POURQUOI CE TEST EXISTE. `/api/permissions` accepte `admin`, `manager`,
-- `cashier`, `chef` et `waiter`: un proprietaire peut donc deleguer une
-- permission a ces cinq roles depuis l'interface du produit. Mais la premiere
-- version de `has_tenant_write_permission` (20261107100000) ne lisait les
-- surcharges QUE pour `admin` et `manager`, et seulement pour refuser
-- davantage. Mesure le 2026-11-07 sur l'etat alors servi: un chef a qui le
-- proprietaire venait d'accorder `inventory.edit` etait refuse par la base.
-- L'ecran disait oui, la base disait non, et sur un UPDATE la RLS ne leve
-- aucune erreur - elle masque la ligne. La delegation etait donc inoperante
-- pour les trois roles qu'elle est censee servir.
--
-- Les DEUX sens sont testes, et le second compte autant que le premier:
--   - une delegation explicite est honoree (correctif);
--   - SANS delegation, rien n'est elargi, et un refus explicite reste un refus
--     (non-regression: ce correctif ne doit ouvrir aucune ecriture que le
--     proprietaire n'a pas accordee lui-meme).
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/garde_delegation.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'chef-delegue@test.local', 'x', now(), now()),
  ('d2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'chef-simple@test.local', 'x', now(), now()),
  ('d3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-simple@test.local', 'x', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-prive@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('d5555555-5555-5555-5555-555555555555', 'tenant-delegation', 'Tenant Delegation', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  -- Chef a qui le proprietaire a accorde inventory.edit, par surcharge de ROLE.
  (gen_random_uuid(), 'd5555555-5555-5555-5555-555555555555',
   'd1111111-1111-1111-1111-111111111111', 'chef-delegue@test.local', 'chef', true, null),
  -- Chef sans aucune delegation: temoin de non-elargissement.
  (gen_random_uuid(), 'd5555555-5555-5555-5555-555555555555',
   'd2222222-2222-2222-2222-222222222222', 'chef-simple@test.local', 'chef', true, null),
  -- Serveur a qui le proprietaire a accorde menu.edit INDIVIDUELLEMENT.
  (gen_random_uuid(), 'd5555555-5555-5555-5555-555555555555',
   'd3333333-3333-3333-3333-333333333333', 'serveur-simple@test.local', 'waiter', true,
   '{"menu.edit": true}'::jsonb),
  -- Gerant a qui le proprietaire a RETIRE inventory.edit.
  (gen_random_uuid(), 'd5555555-5555-5555-5555-555555555555',
   'd4444444-4444-4444-4444-444444444444', 'gerant-prive@test.local', 'manager', true, null);

-- Surcharges de ROLE pour ce tenant, telles que /api/permissions les ecrit.
-- NOTE: la surcharge porte sur le ROLE, donc elle s applique aux DEUX chefs.
-- C est pourquoi le temoin de non-elargissement utilise une permission
-- DIFFERENTE (menu.edit), que personne n a deleguee au chef.
insert into public.role_permissions (tenant_id, role, permissions)
values
  ('d5555555-5555-5555-5555-555555555555', 'chef', '{"inventory.edit": true}'::jsonb),
  ('d5555555-5555-5555-5555-555555555555', 'manager', '{"inventory.edit": false}'::jsonb);

set local role authenticated;

-- ===========================================================================
-- La delegation est HONOREE
-- ===========================================================================
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111"}';
select ok(
  public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'inventory.edit'),
  'delegation: un chef a qui le proprietaire accorde inventory.edit est AUTORISE'
);

set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333"}';
select ok(
  public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'menu.edit'),
  'delegation: un waiter avec une surcharge INDIVIDUELLE menu.edit est AUTORISE'
);

-- ===========================================================================
-- RIEN n'est elargi sans delegation
-- ===========================================================================
set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222"}';
select ok(
  not public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'menu.edit'),
  'non-elargissement: un chef sans delegation menu.edit reste REFUSE'
);

select ok(
  not public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'settings.edit'),
  'non-elargissement: un chef sans delegation settings.edit reste REFUSE'
);

set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333"}';
-- Depuis 20261109200000 le serveur detient orders.manage par defaut (il fait
-- avancer les commandes). Le droit qu'il n'a PAS sans delegation est l'argent.
select ok(
  not public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'orders.pay'),
  'non-elargissement: un waiter sans delegation orders.pay reste REFUSE'
);

select ok(
  not public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'inventory.edit'),
  'non-elargissement: un waiter sans delegation inventory.edit reste REFUSE'
);

-- ===========================================================================
-- Un RETRAIT explicite reste un retrait
-- ===========================================================================
set local request.jwt.claims = '{"sub":"d4444444-4444-4444-4444-444444444444"}';
select ok(
  not public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'inventory.edit'),
  'retrait: un gerant a qui on RETIRE inventory.edit est REFUSE'
);

select ok(
  public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'menu.edit'),
  'retrait: ce meme gerant garde menu.edit, non touchee'
);

-- ===========================================================================
-- Lire custom_permissions comme source d autorisation ne doit pas ouvrir
-- d escalade, et une valeur non booleenne ne doit rien accorder
-- ===========================================================================
-- Le serveur a `{"menu.edit": true}` en surcharge individuelle (assertion 2).
-- S il pouvait ECRIRE cette colonne sur sa propre ligne, il s accorderait
-- n importe quoi: la policy `Members update their own admin row` l autorise a
-- modifier SA ligne. Le verrou est au niveau des COLONNES
-- (20261105000000): `custom_permissions` n est pas dans la liste blanche
-- `GRANT UPDATE(colonne)` de `authenticated`.
set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333"}';
select throws_ok(
  $$update public.admin_users set custom_permissions = '{"settings.edit": true}'::jsonb
    where user_id = 'd3333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  'escalade: un waiter ne peut PAS ecrire son propre custom_permissions'
);

-- Comparaison STRICTE: seule la valeur booleenne `true` accorde. Pose en tant
-- que proprietaire de la base, puisque personne d autre ne peut ecrire cette
-- colonne - c est precisement ce que l assertion precedente prouve.
reset role;
update public.admin_users
set custom_permissions = '{"settings.edit": "oui"}'::jsonb
where user_id = 'd2222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222"}';
select ok(
  not public.has_tenant_write_permission('d5555555-5555-5555-5555-555555555555', 'settings.edit'),
  'stricte: une valeur non booleenne ("oui") n accorde RIEN'
);

select * from finish();
rollback;

-- Cumul de postes : une personne qui porte plusieurs postes a, pour chaque
-- droit, le niveau LE PLUS HAUT de ses postes.
--
-- POURQUOI CE TEST EXISTE. Avant le lot 1 des roles, une personne avait un seul
-- role : un serveur qui tient aussi la caisse devait etre declare caissier et
-- perdait son poste de serveur. Le cumul est la raison d'etre de la colonne
-- `postes`. Consequence voulue, verifiee ici : retirer un droit au POSTE
-- Serveur ne le retire pas a une personne qui est aussi Caissier. Pour retirer
-- un droit a une personne precise, on passe par le reglage par personne
-- (postes_reglage_par_personne.test.sql).
--
-- TEMOIN. Chaque gain du cumul est compare au membre qui ne porte QUE le poste
-- de serveur : la meme requete est refusee pour lui.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

-- 1 serveur seul, 2 serveur + caissier, 3 cuisinier + vente.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a3000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'cumul' || g || '@test.local', 'x', now(), now()
from generate_series(1, 3) g;

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('a3000000-0000-4000-8000-000000000001', 'tenant-cumul', 'Tenant Cumul', true, 'business', 'active');

insert into public.admin_users (tenant_id, user_id, email, postes, is_active) values
  ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000101', 'cumul1@test.local', '{waiter}', true),
  -- Ecrit dans le desordre et avec un doublon : le declencheur normalise.
  ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000102', 'cumul2@test.local', '{waiter,cashier,waiter}', true),
  ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000103', 'cumul3@test.local', '{cook,sales}', true);

insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, tip_amount, status, payment_status)
values ('a3000000-0000-4000-8000-000000000205', 'a3000000-0000-4000-8000-000000000001',
        'takeaway', 'C-01', 5000, 5000, 0, 'pending', 'pending');

select is((select postes from public.admin_users where user_id = 'a3000000-0000-4000-8000-000000000102'),
  '{cashier,waiter}'::text[], 'normalisation: ordre canonique et sans doublon');
select is((select role from public.admin_users where user_id = 'a3000000-0000-4000-8000-000000000102'),
  'cashier', 'projection: role = premier poste dans l ordre canonique');

set local role authenticated;

-- ===========================================================================
-- limited + full = full
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000101"}';
select is(public.tenant_permission_level('a3000000-0000-4000-8000-000000000001', 'orders.pay'), 'limited',
  'temoin: un serveur seul a orders.pay limite');
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  '42501', null, 'temoin: un serveur seul n encaisse PAS');
select is(public.tenant_permission_level('a3000000-0000-4000-8000-000000000001', 'orders.refund'), null,
  'temoin: un serveur seul n a aucun droit de remboursement');

set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000102"}';
select is(public.tenant_permission_level('a3000000-0000-4000-8000-000000000001', 'orders.pay'), 'full',
  'cumul: serveur + caissier, limite + entier = entier');
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  'cumul: serveur + caissier encaisse');
select is(public.tenant_permission_level('a3000000-0000-4000-8000-000000000001', 'orders.refund'), 'limited',
  'cumul: rien + limite = limite (et limite n ouvre aucune ecriture)');
select ok(not public.has_tenant_write_permission('a3000000-0000-4000-8000-000000000001', 'orders.refund'),
  'cumul: un droit limite ne passe PAS la garde d ecriture');

-- ===========================================================================
-- cuisinier + vente : suit la cuisine ET encaisse
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000103"}';
select ok(public.has_tenant_write_permission('a3000000-0000-4000-8000-000000000001', 'kitchen.track')
      and public.has_tenant_write_permission('a3000000-0000-4000-8000-000000000001', 'inventory.view'),
  'cumul: cuisinier + vente garde les droits du cuisinier');
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  'cumul: cuisinier + vente encaisse (droit du poste Vente)');
select ok(not public.has_tenant_write_permission('a3000000-0000-4000-8000-000000000001', 'menu.edit'),
  'cumul: le cumul n invente aucun droit (ni cuisinier ni vente ne modifient la carte)');

-- ===========================================================================
-- Reglage du restaurant sur UN poste : il ne touche pas les autres postes
-- ===========================================================================
reset role;
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('a3000000-0000-4000-8000-000000000001', 'waiter', '{"orders.take": false}'::jsonb);
set local role authenticated;

set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000101"}';
select ok(not public.has_tenant_write_permission('a3000000-0000-4000-8000-000000000001', 'orders.take'),
  'reglage de poste: le serveur seul ne prend plus de commande');
select ok(public.has_tenant_write_permission('a3000000-0000-4000-8000-000000000001', 'menu.view'),
  'reglage de poste: ses autres droits de serveur sont intacts');

set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000102"}';
select ok(public.has_tenant_write_permission('a3000000-0000-4000-8000-000000000001', 'orders.take'),
  'reglage de poste: serveur + caissier prend toujours les commandes (droit du poste Caissier)');

-- Reglage du poste Caissier a faux sur orders.pay : il reste la case `limited`
-- du poste Serveur. Le niveau le plus haut des deux est donc `limited`.
reset role;
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('a3000000-0000-4000-8000-000000000001', 'cashier', '{"orders.pay": false}'::jsonb);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000102"}';
select is(public.tenant_permission_level('a3000000-0000-4000-8000-000000000001', 'orders.pay'), 'limited',
  'reglage de poste: caissier ferme + serveur limite = limite');
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  '42501', null, 'reglage de poste: la meme personne n encaisse plus');

select * from finish();
rollback;

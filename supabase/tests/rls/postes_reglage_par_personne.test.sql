-- Reglage par personne (`permission_overrides`) : il gagne sur tout, dans les
-- deux sens. Seul le proprietaire y echappe.
--
-- POURQUOI CE TEST EXISTE. C'est le seul moyen de retirer un droit a UNE
-- personne (le reglage de poste touche tout le poste, et le cumul garde le
-- niveau le plus haut). S'il ne tranchait pas en premier, un retrait pose par
-- le proprietaire serait annule en silence par un poste ou par un reglage du
-- restaurant.
--
-- Ordre de decision verifie : proprietaire, puis reglage par personne, puis
-- reglage du restaurant pour le poste, puis matrice.
--
-- TEMOIN. Pour chaque cas, un second membre du MEME poste sans reglage obtient
-- le resultat inverse.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a4000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'personne' || g || '@test.local', 'x', now(), now()
from generate_series(1, 7) g;

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('a4000000-0000-4000-8000-000000000001', 'tenant-personne', 'Tenant Personne', true, 'business', 'active');

insert into public.admin_users (tenant_id, user_id, email, postes, permission_overrides, is_active) values
  ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000101', 'personne1@test.local', '{chef}', '{"menu.price": false}', true),
  ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000102', 'personne2@test.local', '{chef}', null, true),
  ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000103', 'personne3@test.local', '{waiter}', '{"orders.pay": true}', true),
  ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000104', 'personne4@test.local', '{waiter}', null, true),
  ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000105', 'personne5@test.local', '{manager}', '{"settings.edit": false}', true),
  ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000106', 'personne6@test.local', '{manager}', null, true),
  -- Un `false` sur la ligne du proprietaire : ignore, il a toujours tout.
  ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000107', 'personne7@test.local', '{owner}', '{"menu.edit": false}', true);

-- Reglage du RESTAURANT qui dit le contraire du reglage par personne du gerant.
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('a4000000-0000-4000-8000-000000000001', 'manager', '{"settings.edit": true}'::jsonb);

insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, tip_amount, status, payment_status)
values ('a4000000-0000-4000-8000-000000000205', 'a4000000-0000-4000-8000-000000000001',
        'takeaway', 'P-01', 5000, 5000, 0, 'pending', 'pending');

set local role authenticated;

-- Retrait : chef sans le droit de prix.
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000101"}';
select is(public.tenant_permission_level('a4000000-0000-4000-8000-000000000001', 'menu.price'), null,
  'retrait: un chef a qui le proprietaire retire menu.price ne l a plus');
select ok(public.has_tenant_write_permission('a4000000-0000-4000-8000-000000000001', 'menu.edit'),
  'retrait: ce chef garde menu.edit, non touche');
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000102"}';
select is(public.tenant_permission_level('a4000000-0000-4000-8000-000000000001', 'menu.price'), 'full',
  'temoin: un chef sans reglage a menu.price');

-- Octroi : serveur qui encaisse. `true` vaut `full`, il depasse la case `limited`.
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000103"}';
select is(public.tenant_permission_level('a4000000-0000-4000-8000-000000000001', 'orders.pay'), 'full',
  'octroi: un serveur a qui le proprietaire donne orders.pay l a en entier');
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  'octroi: ce serveur encaisse vraiment');
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000104"}';
select is(public.tenant_permission_level('a4000000-0000-4000-8000-000000000001', 'orders.pay'), 'limited',
  'temoin: un serveur sans reglage reste limite');
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  '42501', null, 'temoin: un serveur sans reglage n encaisse PAS');

-- Le reglage par personne gagne sur le reglage du restaurant pour le poste.
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000105"}';
select ok(not public.has_tenant_write_permission('a4000000-0000-4000-8000-000000000001', 'settings.edit'),
  'priorite: retrait par personne, malgre un reglage du poste Gerant a vrai');
select ok(not public.has_tenant_floor_permission('a4000000-0000-4000-8000-000000000001'),
  'priorite: ce gerant ne touche plus au plan de salle');
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000106"}';
select ok(public.has_tenant_write_permission('a4000000-0000-4000-8000-000000000001', 'settings.edit'),
  'temoin: un gerant sans reglage par personne a settings.edit');

-- Le proprietaire ignore un `false`.
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-000000000107"}';
select is(public.tenant_permission_level('a4000000-0000-4000-8000-000000000001', 'menu.edit'), 'full',
  'proprietaire: un reglage a faux sur sa ligne est ignore');
select ok(public.has_tenant_write_permission('a4000000-0000-4000-8000-000000000001', 'billing.manage'),
  'proprietaire: il a aussi le droit que le gerant n a que limite');

select * from finish();
rollback;

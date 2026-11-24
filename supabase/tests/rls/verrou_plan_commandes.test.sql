-- Verrou de plan sur les commandes (migration 20261121130000).
--
-- Temoin negatif: sans la migration, chaque throws_ok ci-dessous passe en lives
-- (aucun controle du plan sur une commande ecrite directement en base).
-- Execution: scripts/run-pgtap.sh --local
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

set local session_replication_role = replica;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at) values
  ('d4000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caisse-s@test.local', 'x', now(), now(), now()),
  ('d4000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caissier-s@test.local', 'x', now(), now(), now()),
  ('d4000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caissier-p@test.local', 'x', now(), now(), now());
insert into tenants (id, slug, name, subscription_plan, subscription_status, is_active, currency) values
  ('d4000000-0000-4000-8000-000000000001', 'vc-starter', 'VC Starter', 'starter', 'active', true, 'XOF'),
  ('d4000000-0000-4000-8000-000000000002', 'vc-pro', 'VC Pro', 'pro', 'active', true, 'XOF'),
  ('d4000000-0000-4000-8000-000000000003', 'vc-business', 'VC Business', 'business', 'active', true, 'XOF');
insert into tenants (id, slug, name, subscription_plan, subscription_status, trial_ends_at, is_active, currency) values
  ('d4000000-0000-4000-8000-000000000004', 'vc-essai', 'VC Essai', 'starter', 'trial', now() + interval '5 days', true, 'XOF');
insert into admin_users (id, tenant_id, user_id, email, role, is_active) values
  ('d4000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a1', 'caisse-s@test.local', 'owner', true),
  ('d4000000-0000-4000-8000-000000000012', 'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2', 'caissier-s@test.local', 'cashier', true),
  ('d4000000-0000-4000-8000-000000000013', 'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000000a3', 'caissier-p@test.local', 'cashier', true);
insert into orders (id, tenant_id, order_number, subtotal, total, service_type, tip_amount) values
  ('d4000000-0000-4000-8000-0000000000b1', 'd4000000-0000-4000-8000-000000000001', 'S-1', 1000, 1000, 'dine_in', 0),
  -- Commande Starter avec un pourboire enregistre pendant l'essai.
  ('d4000000-0000-4000-8000-0000000000b2', 'd4000000-0000-4000-8000-000000000001', 'S-9', 1000, 1000, 'dine_in', 500),
  ('d4000000-0000-4000-8000-0000000000b3', 'd4000000-0000-4000-8000-000000000002', 'P-9', 1000, 1000, 'dine_in', 200);
set local session_replication_role = origin;

-- 1-5. Starter.
select lives_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, service_type)
  values ('d4000000-0000-4000-8000-000000000001', 'S-2', 1000, 1000, 'takeaway')
$$, 'Starter: commande a emporter acceptee');
select throws_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, service_type)
  values ('d4000000-0000-4000-8000-000000000001', 'S-3', 1000, 1000, 'delivery')
$$, '23514', null, 'Starter: livraison refusee');
select throws_ok($$
  update orders set tip_amount = 500 where id = 'd4000000-0000-4000-8000-0000000000b1'
$$, '23514', null, 'Starter: pourboire ajoute refuse');
select throws_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, display_currency)
  values ('d4000000-0000-4000-8000-000000000001', 'S-4', 1000, 1000, 'EUR')
$$, '23514', null, 'Starter: devise etrangere refusee');
select lives_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, display_currency)
  values ('d4000000-0000-4000-8000-000000000001', 'S-5', 1000, 1000, 'XOF')
$$, 'Starter: la devise du restaurant passe');

-- 6-8. Pro.
select lives_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, tip_amount, display_currency)
  values ('d4000000-0000-4000-8000-000000000002', 'P-1', 1000, 1000, 500, 'EUR')
$$, 'Pro: pourboire et devise etrangere acceptes');
select throws_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, service_type)
  values ('d4000000-0000-4000-8000-000000000002', 'P-2', 1000, 1000, 'room_service')
$$, '23514', null, 'Pro: service en chambre refuse');
select throws_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, service_type)
  values ('d4000000-0000-4000-8000-000000000002', 'P-3', 1000, 1000, 'delivery')
$$, '23514', null, 'Pro: livraison refusee');

-- 9. Business.
select lives_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, service_type)
  values ('d4000000-0000-4000-8000-000000000003', 'B-1', 1000, 1000, 'delivery')
$$, 'Business: livraison acceptee');

-- 10. Une autre modification d'une commande Starter n'est pas bloquee.
select lives_ok($$
  update orders set notes = 'table au fond' where id = 'd4000000-0000-4000-8000-0000000000b1'
$$, 'Starter: modifier une autre colonne passe');

-- 11-13. Pourboire: creation refusee en Starter, baisse permise, essai en cours accepte.
select throws_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, tip_amount)
  values ('d4000000-0000-4000-8000-000000000001', 'S-6', 1000, 1000, 300)
$$, '23514', null, 'Starter: creation avec pourboire refusee');
select lives_ok($$
  update orders set tip_amount = 0 where id = 'd4000000-0000-4000-8000-0000000000b2'
$$, 'Starter: baisser un pourboire existant reste permis');
select lives_ok($$
  insert into orders (tenant_id, order_number, subtotal, total, tip_amount, service_type)
  values ('d4000000-0000-4000-8000-000000000004', 'E-1', 1000, 1000, 300, 'delivery')
$$, 'essai en cours: pourboire et livraison acceptes');

-- 14. L'attaque elle-meme: le client connecte ecrit le pourboire en direct.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d4000000-0000-4000-8000-0000000000a1"}';
select throws_ok($$
  update orders set tip_amount = 700 where id = 'd4000000-0000-4000-8000-0000000000b1'
$$, '23514', null, 'Starter: le client connecte ne peut pas poser un pourboire en direct');

-- 15-17. Encaissement en caisse: markPaid ecrit l'ancien pourboire + l'ajout,
-- avec le jeton du caissier.
set local request.jwt.claims = '{"sub":"d4000000-0000-4000-8000-0000000000a3"}';
select lives_ok($$
  update orders set tip_amount = tip_amount + 300 where id = 'd4000000-0000-4000-8000-0000000000b3'
$$, 'Pro: le caissier ajoute un pourboire a l encaissement');
select is((select tip_amount from orders where id = 'd4000000-0000-4000-8000-0000000000b3'), 500::bigint,
  'Pro: le pourboire vaut bien l ancien plus l ajout');
set local request.jwt.claims = '{"sub":"d4000000-0000-4000-8000-0000000000a2"}';
select throws_ok($$
  update orders set tip_amount = coalesce(tip_amount, 0) + 300 where id = 'd4000000-0000-4000-8000-0000000000b1'
$$, '23514', null, 'Starter: le caissier ne peut pas ajouter de pourboire a l encaissement');
reset role;

select * from finish();
rollback;

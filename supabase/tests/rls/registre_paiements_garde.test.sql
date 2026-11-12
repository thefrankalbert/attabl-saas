-- Garde d'ecriture du registre des paiements (migration 20261112135000).
--
-- Le chiffre d'affaires se lit dans `payments` (C-041). Ces assertions
-- prouvent que la BASE refuse ce que la politique d'insertion laissait
-- passer a un caissier, et qu'elle impose date et auteur. Mesure faite sur le
-- banc le 2026-11-12: sans la garde, les cas 1 a 3 passent (temoin negatif).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-registre@test.local', 'x', now(), now()),
  ('c2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-registre@test.local', 'x', now(), now()),
  ('c9999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-registre@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('c3333333-3333-3333-3333-333333333333', 'tenant-registre', 'Tenant Registre', true),
       ('c3999999-9999-4999-8999-999999999999', 'tenant-registre-voisin', 'Voisin', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('ca000000-0000-4000-8000-000000000001', 'c3333333-3333-3333-3333-333333333333',
   'c1111111-1111-1111-1111-111111111111', 'caissier-registre@test.local', 'cashier', true, null),
  ('ca000000-0000-4000-8000-000000000002', 'c3333333-3333-3333-3333-333333333333',
   'c2222222-2222-2222-2222-222222222222', 'gerant-registre@test.local', 'manager', true, null),
  ('ca000000-0000-4000-8000-000000000009', 'c3333333-3333-3333-3333-333333333333',
   'c9999999-9999-9999-9999-999999999999', 'serveur-registre@test.local', 'waiter', true, null);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status)
values
  ('c4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333',
   'REG-1', 10000, 10000, 'served', 'pending'),
  ('c5555555-5555-5555-5555-555555555555', 'c3333333-3333-3333-3333-333333333333',
   'REG-ANNULEE', 5000, 5000, 'cancelled', 'pending'),
  ('c6666666-6666-6666-6666-666666666666', 'c3999999-9999-4999-8999-999999999999',
   'VOISIN-1', 8000, 8000, 'served', 'pending');

set local role authenticated;

-- Caissier: droit d'encaisser, PAS l'autorite sur l'argent.
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c5555555-5555-5555-5555-555555555555', 1000, 'cash', 'completed')$$,
  '22023', null, 'caissier: n encaisse pas une commande annulee');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c6666666-6666-6666-6666-666666666666', 1000, 'cash', 'completed')$$,
  '42501', null, 'caissier: n encaisse pas la commande d un autre restaurant');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', 999999, 'cash', 'completed')$$,
  '22023', null, 'caissier: ne depasse pas le solde du');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', -1000, 'cash', 'completed')$$,
  '42501', null, 'caissier: ne rembourse pas par un montant negatif');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', 1000, 'bitcoin', 'completed')$$,
  '22023', null, 'caissier: moyen de paiement inconnu refuse');

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status, created_at, created_by)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', 4000, 'cash', 'completed',
            '2026-01-01 00:00:00+00', 'ca000000-0000-4000-8000-000000000002')$$,
  'caissier: un acompte de 4000 passe');

select is(
  (select created_at::date = current_date from public.payments
    where order_id = 'c4444444-4444-4444-4444-444444444444' and amount = 4000),
  true, 'la date est celle du jour, pas celle envoyee (pas d antidatage)');

select is(
  (select created_by from public.payments
    where order_id = 'c4444444-4444-4444-4444-444444444444' and amount = 4000),
  'ca000000-0000-4000-8000-000000000001'::uuid,
  'l auteur est le caissier connecte, pas le collegue envoye');

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', 6000, 'cash', 'completed')$$,
  'caissier: le solde exact passe');

-- Serveur: pas le droit d'encaisser.
set local request.jwt.claims = '{"sub":"c9999999-9999-9999-9999-999999999999"}';
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', 100, 'cash', 'completed')$$,
  '42501', null, 'serveur: n enregistre aucun paiement');

-- Gerant: autorite sur l'argent, rembourse directement (contrat PR #373).
set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222"}';
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', -1000, 'cash', 'completed')$$,
  'gerant: rembourse par un montant negatif');

reset role;
select is(
  (select sum(case when status = 'refunded' then -amount else amount end)::int
     from public.payments where order_id = 'c4444444-4444-4444-4444-444444444444'),
  9000, 'registre: 4000 + 6000 - 1000 = 9000');

select * from finish();
rollback;

-- Bornes du registre des paiements pour les roles qui ont l'autorite sur
-- l'argent (migration 20261114100000, audit M-06 et M-07).
--
-- Avant la migration, la garde rendait la main a un gerant ou a un proprietaire:
-- il pouvait, par l'API directe, rembourser plus que l'encaisse et encaisser
-- plus que le solde. Sans la migration, les insertions refusees ci-dessous REUSSISSENT
-- (temoin negatif): c est ce que ce test mesure.
--
-- Pas de test de deux sessions simultanees dans pgTAP (une seule connexion).
-- La serialisation tient au verrou FOR UPDATE de la commande, pris AVANT la
-- lecture du net: les deux derniers cas verifient que le corps stocke le contient
-- et qu'il reste SECURITY INVOKER.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/payments_bornes_tous_roles.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-bornes@test.local', 'x', now(), now()),
  ('e2999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron-bornes@test.local', 'x', now(), now()),
  ('e2888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-bornes@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('e3333333-3333-4333-8333-333333333333', 'tenant-bornes', 'Tenant Bornes', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('ea000000-0000-4000-8000-000000000002', 'e3333333-3333-4333-8333-333333333333',
   'e2222222-2222-4222-8222-222222222222', 'gerant-bornes@test.local', 'manager', true, null),
  ('ea000000-0000-4000-8000-000000000003', 'e3333333-3333-4333-8333-333333333333',
   'e2999999-9999-4999-8999-999999999999', 'patron-bornes@test.local', 'owner', true, null),
  ('ea000000-0000-4000-8000-000000000004', 'e3333333-3333-4333-8333-333333333333',
   'e2888888-8888-4888-8888-888888888888', 'caissier-bornes@test.local', 'cashier', true, null);

insert into public.orders (id, tenant_id, order_number, subtotal, total, tip_amount, status, payment_status)
values
  ('e4444444-4444-4444-8444-444444444444', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-1', 10000, 10000, 0, 'served', 'pending'),
  ('e5555555-5555-4555-8555-555555555555', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-ANNULEE', 5000, 5000, 0, 'cancelled', 'pending'),
  ('e6666666-6666-4666-8666-666666666666', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-POURBOIRE', 4000, 4000, 500, 'served', 'pending'),
  ('e7777777-7777-4777-8777-777777777777', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-PROPRIO', 3000, 3000, 0, 'served', 'pending'),
  ('e8888888-8888-4888-8888-888888888888', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-ANNULEE-PAYEE', 3000, 3000, 0, 'cancelled', 'pending'),
  ('e9999999-9999-4999-8999-999999999999', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-OFFERTE', 2000, 2000, 0, 'served', 'comp'),
  ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-REJEU', 5000, 5000, 0, 'served', 'pending'),
  ('ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'e3333333-3333-4333-8333-333333333333',
   'BORNES-CAISSIER', 4000, 4000, 0, 'served', 'pending');

-- Encaisse avant l'annulation (insere hors jeton d'utilisateur: chemin de confiance).
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('e3333333-3333-4333-8333-333333333333',
        'e8888888-8888-4888-8888-888888888888', 3000, 'cash', 'completed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e2222222-2222-4222-8222-222222222222"}';

select ok(
  public.has_tenant_money_permission('e3333333-3333-4333-8333-333333333333'),
  'preuve du sujet: le gerant a l autorite sur l argent');

-- M-06: rembourser sans rien avoir encaisse.
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', 1000, 'cash', 'refunded')$$,
  '22023', null, 'gerant: pas de remboursement (ligne refunded) sur une commande sans encaissement');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', -1000, 'cash', 'completed')$$,
  '22023', null, 'gerant: pas de remboursement (montant negatif) sur une commande sans encaissement');

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', 6000, 'cash', 'completed')$$,
  'gerant: un encaissement de 6000 sur une note de 10000 passe');

-- M-07: le second appareil, qui a lu le solde avant le premier, ecrit 5000
-- alors qu'il ne reste que 4000.
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', 5000, 'cash', 'completed')$$,
  '22023', null, 'gerant: n encaisse pas au-dela du solde (second appareil)');

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', 4000, 'cash', 'completed')$$,
  'gerant: le solde exact passe');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', 1, 'cash', 'completed')$$,
  '22023', null, 'gerant: une commande soldee n accepte plus un seul franc de plus');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', 10001, 'cash', 'refunded')$$,
  '22023', null, 'gerant: ne rembourse pas plus que le net encaisse (ligne refunded)');

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', 3000, 'cash', 'refunded')$$,
  'gerant: un remboursement partiel dans la limite du net passe');

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', -7001, 'cash', 'completed')$$,
  '22023', null, 'gerant: net deja reduit par le premier remboursement (7000 restant)');

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e4444444-4444-4444-8444-444444444444', -7000, 'cash', 'completed')$$,
  'gerant: rembourser exactement le net restant passe');

-- Commande annulee: pas d'encaissement, meme pour le gerant.
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e5555555-5555-4555-8555-555555555555', 1000, 'cash', 'completed')$$,
  '22023', null, 'gerant: n encaisse pas une commande annulee');

-- Pourboire: le solde du est total + pourboire (4500).
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e6666666-6666-4666-8666-666666666666', 4501, 'cash', 'completed')$$,
  '22023', null, 'gerant: le plafond est total + pourboire (4501 refuse)');

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e6666666-6666-4666-8666-666666666666', 4500, 'cash', 'completed')$$,
  'gerant: total + pourboire (4500) passe');

-- Le proprietaire est borne comme le gerant.
set local request.jwt.claims = '{"sub":"e2999999-9999-4999-8999-999999999999"}';
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e7777777-7777-4777-8777-777777777777', 999999, 'cash', 'completed')$$,
  '22023', null, 'proprietaire: n encaisse pas au-dela du solde');


-- Rejeu (M1): la meme cle ne doit pas recevoir 22023 mais 23505 de l'index unique.
set local request.jwt.claims = '{"sub":"e2222222-2222-4222-8222-222222222222"}';
set local role authenticated;
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status, client_request_id)
    values ('e3333333-3333-4333-8333-333333333333',
            'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5000, 'cash', 'completed',
            'e0000000-0000-4000-8000-000000000001')$$,
  'gerant: encaissement avec cle de rejeu passe');
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status, client_request_id)
    values ('e3333333-3333-4333-8333-333333333333',
            'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5000, 'cash', 'completed',
            'e0000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'gerant: le rejeu de la meme cle leve 23505 (pas 22023)');
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status, client_request_id)
    values ('e3333333-3333-4333-8333-333333333333',
            'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5000, 'cash', 'completed',
            'e0000000-0000-4000-8000-000000000002')$$,
  '22023', null, 'temoin: une AUTRE cle au-dela du solde reste refusee (22023)');

-- Commande offerte: le gerant n'encaisse pas.
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e9999999-9999-4999-8999-999999999999', 1000, 'cash', 'completed')$$,
  '22023', null, 'gerant: n encaisse pas une commande offerte');

-- Commande annulee apres encaissement: le remboursement reste permis jusqu'au net.
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e8888888-8888-4888-8888-888888888888', 3001, 'cash', 'refunded')$$,
  '22023', null, 'gerant: commande annulee, pas de remboursement au-dela du net');
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'e8888888-8888-4888-8888-888888888888', 3000, 'cash', 'refunded')$$,
  'gerant: commande annulee, remboursement du net permis');

-- Caissier: non-regression (meme comportement qu'avant la migration).
set local request.jwt.claims = '{"sub":"e2888888-8888-4888-8888-888888888888"}';
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 4000, 'cash', 'completed')$$,
  'caissier: encaisse le solde exact');
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 'cash', 'completed')$$,
  '22023', null, 'caissier: pas un franc de plus');
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('e3333333-3333-4333-8333-333333333333',
            'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1000, 'cash', 'refunded')$$,
  '42501', null, 'caissier: ne rembourse toujours pas');

reset role;

select is(
  (select sum(case when status = 'refunded' then -amount else amount end)::int
     from public.payments where order_id = 'e4444444-4444-4444-8444-444444444444'),
  0, 'registre: 6000 + 4000 - 3000 - 7000 = 0, jamais negatif');

select is(
  (select prosecdef from pg_proc where proname = 'garder_ecriture_registre_paiements'),
  false, 'la garde reste SECURITY INVOKER (sinon current_user vaut le proprietaire)');

select matches(
  (select prosrc from pg_proc where proname = 'garder_ecriture_registre_paiements'),
  'FOR UPDATE',
  'la garde verrouille la commande avant de lire le net (deux ecritures simultanees se serialisent)');

select * from finish();
rollback;

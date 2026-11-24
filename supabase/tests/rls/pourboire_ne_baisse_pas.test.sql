-- Le pourboire d'une commande ne BAISSE pas sans l'autorite sur l'argent
-- (migration 20261124100100, constat B150, contre-audit 1 point 1b).
--
-- Le geste refuse: le caissier efface le pourboire laisse par le client dans
-- la meme requete que la bascule a 'paid', avec un registre qui couvre le
-- total sans le pourboire. Le controle reporte de 20261124100000 lisait le
-- pourboire courant (deja baisse) et laissait passer.
--
-- Temoin (base construite sans 20261124100100): les refus 1, 3 et 5 et leurs
-- consequences 2 et 4 echouent; les temoins positifs 6 a 10 passent.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c7111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-pourboire@test.local', 'x', now(), now()),
  ('c7222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-pourboire@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('c7a00000-0000-4000-8000-00000000000a', 'pourboire-a', 'Pourboire A', true, 'pro', 'active');

insert into public.admin_users (tenant_id, user_id, email, role, is_active)
values ('c7a00000-0000-4000-8000-00000000000a', 'c7111111-1111-4111-8111-111111111111',
        'caissier-pourboire@test.local', 'cashier', true),
       ('c7a00000-0000-4000-8000-00000000000a', 'c7222222-2222-4222-8222-222222222222',
        'gerant-pourboire@test.local', 'manager', true);

-- Toutes: total 1000, pourboire du client 500 (du 1500), a encaisser.
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, tip_amount,
                           status, payment_status)
values
  ('c7c00000-0000-4000-8000-000000000001', 'c7a00000-0000-4000-8000-00000000000a', 'takeaway', 'P-1', 1000, 1000, 500, 'served', 'pending'),
  ('c7c00000-0000-4000-8000-000000000002', 'c7a00000-0000-4000-8000-00000000000a', 'takeaway', 'P-2', 1000, 1000, 500, 'served', 'pending'),
  ('c7c00000-0000-4000-8000-000000000003', 'c7a00000-0000-4000-8000-00000000000a', 'takeaway', 'P-3', 1000, 1000, 500, 'served', 'pending'),
  ('c7c00000-0000-4000-8000-000000000004', 'c7a00000-0000-4000-8000-00000000000a', 'takeaway', 'P-4', 1000, 1000, 500, 'served', 'pending');

-- P-1: registre a 1000, le total SANS le pourboire (le geste du contre-audit).
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('c7a00000-0000-4000-8000-00000000000a', 'c7c00000-0000-4000-8000-000000000001', 1000, 'cash', 'completed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c7111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- (1) Le geste du contre-audit: pourboire efface et bascule dans la meme requete.
select throws_ok(
  $$update public.orders set tip_amount = 0, payment_status = 'paid', payment_method = 'cash', paid_at = now()
     where id = 'c7c00000-0000-4000-8000-000000000001'$$,
  '42501', null, 'caissier: effacer le pourboire du client en soldant est refuse');
select is((select tip_amount from public.orders where id = 'c7c00000-0000-4000-8000-000000000001'),
  500::bigint, 'caissier: le pourboire du client est intact');

-- (3) Baisse seule, sans bascule, sur une commande en attente.
select throws_ok(
  $$update public.orders set tip_amount = 100 where id = 'c7c00000-0000-4000-8000-000000000002'$$,
  '42501', null, 'caissier: baisser le pourboire d une commande en attente est refuse');
select is((select tip_amount from public.orders where id = 'c7c00000-0000-4000-8000-000000000002'),
  500::bigint, 'caissier: le pourboire reste 500');

-- (5) Mettre le pourboire a NULL compte comme une baisse a 0.
select throws_ok(
  $$update public.orders set tip_amount = null where id = 'c7c00000-0000-4000-8000-000000000002'$$,
  '42501', null, 'caissier: effacer le pourboire par NULL est refuse');

-- (6) Temoin positif: encaisser_commande AJOUTE un pourboire de caisse (PR #446).
select is(
  public.encaisser_commande('c7c00000-0000-4000-8000-000000000003',
    'c7a00000-0000-4000-8000-00000000000a', 'cash', 200) ->> 'paid',
  'true', 'caissier: encaisser avec un pourboire de caisse reste possible');
select is((select tip_amount from public.orders where id = 'c7c00000-0000-4000-8000-000000000003'),
  700::bigint, 'caissier: le pourboire de caisse s ajoute a celui du client');

-- (8) Temoin positif: une HAUSSE directe du pourboire d'une commande en
-- attente reste permise (seule la baisse est bornee).
select lives_ok(
  $$update public.orders set tip_amount = 600 where id = 'c7c00000-0000-4000-8000-000000000002'$$,
  'caissier: hausser le pourboire d une commande en attente reste permis');

-- (9) Temoin positif: l'autorite sur l'argent corrige un pourboire saisi par
-- erreur.
set local request.jwt.claims = '{"sub":"c7222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok(
  $$update public.orders set tip_amount = 0 where id = 'c7c00000-0000-4000-8000-000000000004'$$,
  'gerant: corriger (baisser) un pourboire reste possible');
select is((select tip_amount from public.orders where id = 'c7c00000-0000-4000-8000-000000000004'),
  0::bigint, 'gerant: le pourboire a REELLEMENT ete corrige');

select * from finish();
rollback;

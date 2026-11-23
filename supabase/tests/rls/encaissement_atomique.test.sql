-- Encaissement en une transaction (migration 20261120220000).
--
-- Le defaut corrige: markPaid basculait la commande en payee, PUIS ecrivait la
-- ligne du registre. Si le registre echouait, l'annulation ne pouvait pas
-- reussir pour un caissier. Les deux premieres assertions montrent que cet
-- ancien chemin (bascule sans ligne) est desormais refuse a la validation
-- (20261124100000, constat B150); les suivantes prouvent que la fonction
-- encaisser_commande ne laisse jamais une commande payee sans sa ligne.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-atomique@test.local', 'x', now(), now()),
  ('e2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-atomique@test.local', 'x', now(), now()),
  ('e3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'proprio-atomique@test.local', 'x', now(), now()),
  ('e4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-atomique@test.local', 'x', now(), now()),
  ('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-delegue@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('ea000000-0000-4000-8000-00000000000a', 'atomique-a', 'Atomique A', true, 'pro', 'active'),
       ('ea000000-0000-4000-8000-00000000000b', 'atomique-b', 'Atomique B', true, 'pro', 'active');

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values ('eb000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-00000000000a',
        'e1111111-1111-1111-1111-111111111111', 'caissier-atomique@test.local', 'cashier', true, null),
       ('eb000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-00000000000a',
        'e2222222-2222-2222-2222-222222222222', 'serveur-atomique@test.local', 'waiter', true, null),
       ('eb000000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-00000000000a',
        'e3333333-3333-3333-3333-333333333333', 'proprio-atomique@test.local', 'owner', true, null),
       ('eb000000-0000-4000-8000-000000000004', 'ea000000-0000-4000-8000-00000000000a',
        'e4444444-4444-4444-4444-444444444444', 'gerant-atomique@test.local', 'manager', true, null),
       -- Serveur a qui le proprietaire a delegue l'encaissement.
       ('eb000000-0000-4000-8000-000000000005', 'ea000000-0000-4000-8000-00000000000a',
        'e5555555-5555-5555-5555-555555555555', 'serveur-delegue@test.local', 'waiter', true,
        '{"orders.pay": true}'::jsonb);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status, tip_amount)
values
  -- Temoin de l'ancien chemin.
  ('ec000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-00000000000a',
   'AT-1', 5000, 5000, 'served', 'pending', 0),
  -- Registre refuse: doit rester a encaisser.
  ('ec000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-00000000000a',
   'AT-2', 5000, 5000, 'served', 'pending', 500),
  -- Encaissement normal, 500 laisses par le client.
  ('ec000000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-00000000000a',
   'AT-3', 5000, 5000, 'served', 'pending', 500),
  -- Annulee.
  ('ec000000-0000-4000-8000-000000000004', 'ea000000-0000-4000-8000-00000000000a',
   'AT-4', 5000, 5000, 'cancelled', 'pending', 0),
  -- Autre restaurant.
  ('ec000000-0000-4000-8000-000000000005', 'ea000000-0000-4000-8000-00000000000b',
   'AT-5', 5000, 5000, 'served', 'pending', 0),
  -- Deja partiellement payee.
  ('ec000000-0000-4000-8000-000000000006', 'ea000000-0000-4000-8000-00000000000a',
   'AT-6', 5000, 5000, 'served', 'partial', 0),
  -- Encaissees par le proprietaire, le gerant, le serveur delegue.
  ('ec000000-0000-4000-8000-000000000007', 'ea000000-0000-4000-8000-00000000000a',
   'AT-7', 5000, 5000, 'served', 'pending', 0),
  ('ec000000-0000-4000-8000-000000000008', 'ea000000-0000-4000-8000-00000000000a',
   'AT-8', 5000, 5000, 'served', 'pending', 0),
  ('ec000000-0000-4000-8000-000000000009', 'ea000000-0000-4000-8000-00000000000a',
   'AT-9', 5000, 5000, 'served', 'pending', 0);

-- Commande en euros, pour le plafond a 2 decimales (100 000 000 centimes).
insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status,
                           tip_amount, display_currency)
values ('ec000000-0000-4000-8000-000000000010', 'ea000000-0000-4000-8000-00000000000a',
        'AT-10', 5000, 5000, 'served', 'pending', 0, 'EUR');

-- Panne du registre simulee pour la commande AT-2 seulement (annulee avec la
-- transaction du test).
create function public.test_panne_registre() returns trigger
language plpgsql as $$
begin
  if new.order_id = 'ec000000-0000-4000-8000-000000000002' then
    raise exception 'registre indisponible' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_panne_registre before insert on public.payments
  for each row execute function public.test_panne_registre();

-- Ecriture puis validation simulee des controles reportes de 20261124100000.
create function public.test_atomique_valider(p_sql text) returns void
language plpgsql security invoker as $$
begin
  execute p_sql;
  set constraints trg_paid_exige_registre_update immediate;
  set constraints trg_paid_exige_registre_update deferred;
end;
$$;
grant execute on function public.test_atomique_valider(text) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111"}';

-- Temoin de l'ancien chemin (deux ecritures separees: la bascule, puis la
-- ligne au registre dans une autre requete). Depuis 20261124100000 (constat
-- B150), la base refuse a la validation toute bascule a 'paid' que le registre
-- ne couvre pas: la premiere ecriture de l'ancien chemin ne passerait plus.
-- La validation est simulee par SET CONSTRAINTS ... IMMEDIATE (un test pgTAP
-- ne valide jamais sa transaction).
select throws_ok(
  $$select public.test_atomique_valider($q$update public.orders
      set payment_status = 'paid', payment_method = 'cash', paid_at = '2001-01-01T00:00:00Z'
      where id = 'ec000000-0000-4000-8000-000000000001'$q$)$$,
  '42501', null, 'ancien chemin: la bascule sans ligne au registre est refusee a la validation');
select is((select payment_status from public.orders where id = 'ec000000-0000-4000-8000-000000000001'),
  'pending', 'ancien chemin: la commande reste a encaisser');

-- Registre en panne APRES la bascule: RIEN ne doit rester bascule.
select throws_ok(
  $$select public.encaisser_commande('ec000000-0000-4000-8000-000000000002',
      'ea000000-0000-4000-8000-00000000000a', 'cash', 200)$$,
  'P0001', null, 'registre en panne: l appel echoue');
select is((select payment_status from public.orders where id = 'ec000000-0000-4000-8000-000000000002'),
  'pending', 'registre en panne: la commande reste a encaisser');
select is((select tip_amount from public.orders where id = 'ec000000-0000-4000-8000-000000000002'),
  500::bigint, 'registre en panne: le pourboire du client est intact');
select is((select count(*)::int from public.payments where order_id = 'ec000000-0000-4000-8000-000000000002'),
  0, 'registre en panne: aucune ligne au registre');

-- Plafond calcule par la base (1 000 000 en XAF/XOF): 500 + 999 501 le
-- depasse. Aucun parametre ne permet de l'eviter.
select throws_ok(
  $$select public.encaisser_commande('ec000000-0000-4000-8000-000000000003',
      'ea000000-0000-4000-8000-00000000000a', 'cash', 999501)$$,
  '22023', null, 'plafond depasse: refuse');
select is((select payment_status from public.orders where id = 'ec000000-0000-4000-8000-000000000003'),
  'pending', 'plafond depasse: la commande reste a encaisser');

-- Encaissement normal: 500 du client + 200 de la caisse.
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000003',
    'ea000000-0000-4000-8000-00000000000a', 'cash', 200) ->> 'paid',
  'true', 'encaissement: bascule faite');
select is((select tip_amount from public.orders where id = 'ec000000-0000-4000-8000-000000000003'),
  700::bigint, 'encaissement: le pourboire de la caisse s ajoute a celui du client');
select is((select sum(amount)::bigint from public.payments where order_id = 'ec000000-0000-4000-8000-000000000003'),
  5700::bigint, 'encaissement: registre = total + pourboire, une seule fois');

-- Rejeu: aucun effet, et l'etat dit "deja reglee".
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000003',
    'ea000000-0000-4000-8000-00000000000a', 'cash', 200),
  '{"paid": false, "payment_status": "paid", "status": "served"}'::jsonb,
  'rejeu: rien de bascule, deja reglee');
select is((select count(*)::int from public.payments where order_id = 'ec000000-0000-4000-8000-000000000003'),
  1, 'rejeu: toujours une seule ligne au registre');

-- Commande annulee: jamais encaissee, et l'etat le dit (l'application affiche
-- "annulee" au lieu de "deja reglee").
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000004',
    'ea000000-0000-4000-8000-00000000000a', 'cash'),
  '{"paid": false, "payment_status": "pending", "status": "cancelled"}'::jsonb,
  'annulee: rien de bascule, statut cancelled renvoye');

-- Plafond en EUR: 100 000 000 centimes (1 000 000 EUR). Au-dela: refuse.
select throws_ok(
  $$select public.encaisser_commande('ec000000-0000-4000-8000-000000000010',
      'ea000000-0000-4000-8000-00000000000a', 'cash', 100000001)$$,
  '22023', null, 'EUR: plafond depasse refuse');
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000010',
    'ea000000-0000-4000-8000-00000000000a', 'cash', 100000000) ->> 'paid',
  'true', 'EUR: plafond exact accepte');

-- Partiellement payee: rien de bascule, et l'etat le dit (l'application
-- renvoie une erreur explicite au lieu d'un faux succes).
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000006',
    'ea000000-0000-4000-8000-00000000000a', 'cash'),
  '{"paid": false, "payment_status": "partial", "status": "served"}'::jsonb,
  'partielle: etat partial renvoye');
select is((select count(*)::int from public.payments where order_id = 'ec000000-0000-4000-8000-000000000006'),
  0, 'partielle: aucune ligne au registre');

-- Autre restaurant annonce: refus explicite (pas le droit d'encaisser chez lui).
select throws_ok(
  $$select public.encaisser_commande('ec000000-0000-4000-8000-000000000005',
      'ea000000-0000-4000-8000-00000000000b', 'cash')$$,
  '42501', null, 'autre restaurant annonce: refuse');
-- Commande d'un autre restaurant sous son propre restaurant: invisible, sans
-- aucun etat (l'application repond "introuvable").
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000005',
    'ea000000-0000-4000-8000-00000000000a', 'cash'),
  '{"paid": false, "status": null, "payment_status": null}'::jsonb,
  'commande d un autre restaurant: rien de bascule, aucun etat');

-- Serveur sans orders.pay: refus explicite, rien d'ecrit.
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$select public.encaisser_commande('ec000000-0000-4000-8000-000000000004',
      'ea000000-0000-4000-8000-00000000000a', 'cash')$$,
  '42501', null, 'serveur sans orders.pay: refuse');

-- Ceux qui ont le droit d'encaisser: proprietaire, gerant, serveur delegue.
set local request.jwt.claims = '{"sub":"e3333333-3333-3333-3333-333333333333"}';
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000007',
    'ea000000-0000-4000-8000-00000000000a', 'cash') ->> 'paid',
  'true', 'proprietaire: encaisse');
set local request.jwt.claims = '{"sub":"e4444444-4444-4444-4444-444444444444"}';
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000008',
    'ea000000-0000-4000-8000-00000000000a', 'card') ->> 'paid',
  'true', 'gerant: encaisse');
set local request.jwt.claims = '{"sub":"e5555555-5555-5555-5555-555555555555"}';
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000009',
    'ea000000-0000-4000-8000-00000000000a', 'cash') ->> 'paid',
  'true', 'serveur a qui orders.pay est delegue: encaisse');

reset role;
select is((select payment_status from public.orders where id = 'ec000000-0000-4000-8000-000000000005'),
  'pending', 'autre restaurant: sa commande est intacte');

select is((select count(*)::int from pg_proc
             where proname = 'encaisser_commande' and pronamespace = 'public'::regnamespace),
  1, 'une seule version de encaisser_commande (l ancien brouillon a 5 arguments est supprime)');

select is((select count(*)::int from public.payments
            where order_id in ('ec000000-0000-4000-8000-000000000007',
                               'ec000000-0000-4000-8000-000000000008',
                               'ec000000-0000-4000-8000-000000000009')),
  3, 'proprietaire, gerant et serveur delegue: une ligne au registre chacun');

select is(has_function_privilege('anon',
  'public.encaisser_commande(uuid, uuid, text, bigint)', 'EXECUTE'),
  false, 'anon ne peut pas encaisser');

select * from finish();
rollback;

-- Encaissement en une transaction (migration 20261120220000).
--
-- Le defaut corrige: markPaid basculait la commande en payee, PUIS ecrivait la
-- ligne du registre. Si le registre echouait, l'annulation ne pouvait pas
-- reussir pour un caissier. Les deux premieres assertions en donnent la
-- preuve (temoin de l'ancien chemin); les suivantes prouvent que la fonction
-- encaisser_commande ne laisse jamais une commande payee sans sa ligne.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-atomique@test.local', 'x', now(), now()),
  ('e2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-atomique@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('ea000000-0000-4000-8000-00000000000a', 'atomique-a', 'Atomique A', true, 'pro', 'active'),
       ('ea000000-0000-4000-8000-00000000000b', 'atomique-b', 'Atomique B', true, 'pro', 'active');

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values ('eb000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-00000000000a',
        'e1111111-1111-1111-1111-111111111111', 'caissier-atomique@test.local', 'cashier', true, null),
       ('eb000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-00000000000a',
        'e2222222-2222-2222-2222-222222222222', 'serveur-atomique@test.local', 'waiter', true, null);

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
   'AT-6', 5000, 5000, 'served', 'partial', 0);

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

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111"}';

-- Temoin de l'ancien chemin (deux ecritures separees). La bascule passe, mais
-- la garde remplace paid_at: une annulation filtree sur la valeur envoyee par
-- l'application ne retrouve donc jamais la ligne...
update public.orders
   set payment_status = 'paid', payment_method = 'cash', paid_at = '2001-01-01T00:00:00Z'
 where id = 'ec000000-0000-4000-8000-000000000001';
select is(
  (select paid_at = '2001-01-01T00:00:00Z'::timestamptz from public.orders
    where id = 'ec000000-0000-4000-8000-000000000001'),
  false, 'ancien chemin: paid_at reecrit, l annulation par paid_at ne trouve rien');
-- ... et le retour a pending est refuse au caissier.
select throws_ok(
  $$update public.orders set payment_status = 'pending', payment_method = null, paid_at = null
    where id = 'ec000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'ancien chemin: le caissier ne peut pas annuler la bascule');

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
  '{"paid": false, "payment_status": "paid"}'::jsonb, 'rejeu: rien de bascule, deja reglee');
select is((select count(*)::int from public.payments where order_id = 'ec000000-0000-4000-8000-000000000003'),
  1, 'rejeu: toujours une seule ligne au registre');

-- Commande annulee: jamais encaissee.
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000004',
    'ea000000-0000-4000-8000-00000000000a', 'cash') ->> 'paid',
  'false', 'annulee: rien de bascule');

-- Partiellement payee: rien de bascule, et l'etat le dit (l'application
-- renvoie une erreur explicite au lieu d'un faux succes).
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000006',
    'ea000000-0000-4000-8000-00000000000a', 'cash'),
  '{"paid": false, "payment_status": "partial"}'::jsonb, 'partielle: etat partial renvoye');
select is((select count(*)::int from public.payments where order_id = 'ec000000-0000-4000-8000-000000000006'),
  0, 'partielle: aucune ligne au registre');

-- Autre restaurant annonce: refus explicite (pas le droit d'encaisser chez lui).
select throws_ok(
  $$select public.encaisser_commande('ec000000-0000-4000-8000-000000000005',
      'ea000000-0000-4000-8000-00000000000b', 'cash')$$,
  '42501', null, 'autre restaurant annonce: refuse');
-- Commande d'un autre restaurant sous son propre restaurant: invisible.
select is(
  public.encaisser_commande('ec000000-0000-4000-8000-000000000005',
    'ea000000-0000-4000-8000-00000000000a', 'cash') ->> 'paid',
  'false', 'commande d un autre restaurant: rien de bascule');

-- Serveur sans orders.pay: refus explicite, rien d'ecrit.
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$select public.encaisser_commande('ec000000-0000-4000-8000-000000000004',
      'ea000000-0000-4000-8000-00000000000a', 'cash')$$,
  '42501', null, 'serveur sans orders.pay: refuse');

reset role;
select is((select payment_status from public.orders where id = 'ec000000-0000-4000-8000-000000000005'),
  'pending', 'autre restaurant: sa commande est intacte');

select is(has_function_privilege('anon',
  'public.encaisser_commande(uuid, uuid, text, bigint)', 'EXECUTE'),
  false, 'anon ne peut pas encaisser');

select * from finish();
rollback;

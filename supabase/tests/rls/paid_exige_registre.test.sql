-- Une commande ne DEVIENT 'paid' que si le registre couvre son du
-- (migration 20261124100000, constat B150).
--
-- Le controle est un declencheur de contrainte REPORTE a la validation. Un test
-- pgTAP ne valide jamais sa transaction (rollback final): on force donc
-- l'execution des controles en file avec SET CONSTRAINTS ... IMMEDIATE, juste
-- apres l'ecriture, dans la fonction test_b150_valider. Elle s'execute sous le
-- role courant (SECURITY INVOKER), comme la validation d'une requete PostgREST.
-- En cas de refus, throws_ok annule l'ecriture ET le controle en file (sous-
-- transaction): aucun controle ne deborde sur l'assertion suivante.
--
-- test_b150_valider ECHOUE (P0001) si l'un des deux declencheurs manque: un
-- declencheur supprime ou renomme ne peut pas desactiver le test en silence.
-- Sans la migration, toutes les assertions qui passent par lui echouent donc.
--
-- L'insertion directe par un employe est fermee par la RLS depuis
-- 20261124100200. Pour prouver le declencheur d'INSERT pour lui-meme (s'il
-- revenait une politique INSERT), le test pose une politique INSERT
-- temporaire, annulee avec la transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(35);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-b150@test.local', 'x', now(), now()),
  ('d2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-b150@test.local', 'x', now(), now()),
  ('d3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-b150@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('da000000-0000-4000-8000-00000000000a', 'b150-a', 'B150 A', true, 'pro', 'active');

insert into public.admin_users (tenant_id, user_id, email, role, is_active)
values ('da000000-0000-4000-8000-00000000000a', 'd1111111-1111-4111-8111-111111111111',
        'caissier-b150@test.local', 'cashier', true),
       ('da000000-0000-4000-8000-00000000000a', 'd2222222-2222-4222-8222-222222222222',
        'gerant-b150@test.local', 'manager', true),
       ('da000000-0000-4000-8000-00000000000a', 'd3333333-3333-4333-8333-333333333333',
        'serveur-b150@test.local', 'waiter', true);

-- dc..01 a dc..14: 1000 de du chacune sauf mention.
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, tip_amount,
                           status, payment_status, table_number)
values
  ('dc000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-01', 1000, 1000, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-02', 1000, 1000, 0, 'served', 'partial', null),
  ('dc000000-0000-4000-8000-000000000003', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-03', 1000, 1000, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000004', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-04', 1000, 1000, 500, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000005', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-05', 1000, 1000, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000006', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-06', 1000, 1000, 0, 'served', 'partial', null),
  ('dc000000-0000-4000-8000-000000000007', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-07', 1000, 1000, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000008', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-08', 1000, 1000, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000009', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-09', 0, 0, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000010', 'da000000-0000-4000-8000-00000000000a', 'dine_in', 'B-10', 1000, 1000, 0, 'pending', 'pending', 'T1'),
  ('dc000000-0000-4000-8000-000000000011', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-11', 1000, 1000, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000012', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-12', 1000, 1000, 0, 'served', 'pending', null),
  ('dc000000-0000-4000-8000-000000000013', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-13', 0, 0, 0, 'served', 'pending', null);

-- B-09: commande a 0 qui porte 10 000 de plats (le detournement du
-- contre-audit 1, point 5). B-13: commande a 0 sans plat.
insert into public.categories (id, tenant_id, name)
values ('de000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000a', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price)
values ('df000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000a',
        'de000000-0000-4000-8000-000000000001', 'Poulet braise', 5000);
insert into public.order_items (order_id, menu_item_id, quantity, price_at_order, item_name, tenant_id)
values ('dc000000-0000-4000-8000-000000000009', 'df000000-0000-4000-8000-000000000001', 2, 5000,
        'Poulet braise', 'da000000-0000-4000-8000-00000000000a');

-- Politique INSERT temporaire (voir l'en-tete), pour le declencheur d'INSERT.
create policy test_b150_insertion on public.orders for insert to authenticated
  with check (tenant_id = 'da000000-0000-4000-8000-00000000000a');

-- B-02: registre a 400 sur 1000. B-06: commande coincee, registre complet.
-- B-12: registre complet, statut pending (temoin positif du gerant).
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('da000000-0000-4000-8000-00000000000a', 'dc000000-0000-4000-8000-000000000002', 400, 'cash', 'completed'),
       ('da000000-0000-4000-8000-00000000000a', 'dc000000-0000-4000-8000-000000000006', 400, 'cash', 'completed'),
       ('da000000-0000-4000-8000-00000000000a', 'dc000000-0000-4000-8000-000000000006', 600, 'cash', 'completed'),
       ('da000000-0000-4000-8000-00000000000a', 'dc000000-0000-4000-8000-000000000012', 1000, 'cash', 'completed');

-- Ecriture puis execution immediate des controles reportes de la migration.
create function public.test_b150_valider(p_sql text) returns void
language plpgsql security invoker as $$
begin
  if (select count(*) from pg_trigger
       where tgrelid = 'public.orders'::regclass
         and tgname in ('trg_paid_exige_registre_update', 'trg_paid_exige_registre_insert')) <> 2 then
    raise exception 'test_b150_valider: un declencheur trg_paid_exige_registre_* manque'
      using errcode = 'P0001';
  end if;
  execute p_sql;
  set constraints trg_paid_exige_registre_update, trg_paid_exige_registre_insert immediate;
  set constraints trg_paid_exige_registre_update, trg_paid_exige_registre_insert deferred;
end;
$$;
grant execute on function public.test_b150_valider(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Caissier
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- (1) UPDATE direct pending -> paid, registre vide: refuse.
select throws_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000001'$q$)$$,
  '42501', null, 'caissier: pending -> paid sans registre refuse');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000001'),
  'pending', 'caissier: la commande reste a encaisser');

-- (2) Meme geste, registre a 400 sur 1000: refuse...
select throws_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid'
      where id = 'dc000000-0000-4000-8000-000000000002'$q$)$$,
  '42501', null, 'caissier: registre 400 sur 1000, partial -> paid refuse');
-- ... temoin positif: le caissier verse le solde (recordTender), et le meme
-- passage a paid (recompute) est accepte.
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('da000000-0000-4000-8000-00000000000a', 'dc000000-0000-4000-8000-000000000002', 600, 'card', 'completed');
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'card', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000002' and tenant_id = 'da000000-0000-4000-8000-00000000000a'$q$)$$,
  'temoin: registre complet, le meme passage a paid est accepte');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000002'),
  'paid', 'temoin: commande soldee');

-- (12) Dans UNE transaction: paid, puis une ligne de 400 seulement: refuse.
select throws_ok(
  $$select public.test_b150_valider($q$with m as (update public.orders set payment_status = 'paid'
      where id = 'dc000000-0000-4000-8000-000000000003' returning id)
      insert into public.payments (tenant_id, order_id, amount, method, status)
      select 'da000000-0000-4000-8000-00000000000a', id, 400, 'cash', 'completed' from m$q$)$$,
  '42501', null, 'caissier: paid et une ligne de 400 sur 1000 dans la meme transaction refuse');
select is((select count(*)::int from public.payments where order_id = 'dc000000-0000-4000-8000-000000000003'),
  0, 'refus: la ligne partielle est annulee avec la bascule');

-- (4) encaisser_commande: bascule PUIS ligne, meme transaction. Le controle
-- reporte voit la ligne: accepte. Pourboire du client 500, +200 a la caisse.
select lives_ok(
  $$select public.test_b150_valider($q$select public.encaisser_commande('dc000000-0000-4000-8000-000000000004',
      'da000000-0000-4000-8000-00000000000a', 'cash', 200)$q$)$$,
  'caissier: encaisser_commande accepte');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000004'),
  'paid', 'encaisser_commande: commande payee');
select is((select sum(amount)::bigint from public.payments where order_id = 'dc000000-0000-4000-8000-000000000004'),
  1700::bigint, 'encaisser_commande: registre = total + pourboire');

-- (5) Encaissement en plusieurs fois depuis la fiche: recordTender (ligne),
-- recompute (statut), dans des transactions separees.
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('da000000-0000-4000-8000-00000000000a', 'dc000000-0000-4000-8000-000000000005', 400, 'cash', 'completed');
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'partial'
      where id = 'dc000000-0000-4000-8000-000000000005' and tenant_id = 'da000000-0000-4000-8000-00000000000a'
        and payment_status <> 'paid'$q$)$$,
  'fiche: acompte, statut partial');
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('da000000-0000-4000-8000-00000000000a', 'dc000000-0000-4000-8000-000000000005', 600, 'cash', 'completed');
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000005' and tenant_id = 'da000000-0000-4000-8000-00000000000a'$q$)$$,
  'fiche: solde verse, recompute passe la commande a paid');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000005'),
  'paid', 'fiche: commande soldee');

-- (6) Reparation d'une commande coincee (resyncStatus): registre complet.
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000006' and tenant_id = 'da000000-0000-4000-8000-00000000000a'$q$)$$,
  'reparation: commande coincee passe a paid');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000006'),
  'paid', 'reparation: commande soldee');

-- (9) Du nul: un caissier ne solde pas une commande a 0, surtout pas une
-- commande a 0 qui porte 10 000 de plats (registre vide).
select throws_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000009'$q$)$$,
  '42501', null, 'du nul: le caissier ne solde pas une commande a 0 qui porte des plats');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000009'),
  'pending', 'du nul: la commande a 0 reste a encaisser');
select throws_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000013'$q$)$$,
  '42501', null, 'du nul: le caissier ne solde pas non plus une commande a 0 sans plat');

-- ---------------------------------------------------------------------------
-- Gerant (autorite sur l'argent): la regle vaut aussi
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}';

-- (3) refuse sans registre...
select throws_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000007'$q$)$$,
  '42501', null, 'gerant: pending -> paid sans registre refuse');
-- ... temoin positif: le meme geste avec un registre complet.
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000012'$q$)$$,
  'temoin gerant: registre complet, passage a paid accepte');

-- Du nul, temoin positif: l'autorite sur l'argent encaisse une commande a 0
-- a la caisse (encaisser_commande, ligne a 0), comme aujourd'hui.
select lives_ok(
  $$select public.test_b150_valider($q$select public.encaisser_commande('dc000000-0000-4000-8000-000000000013',
      'da000000-0000-4000-8000-00000000000a', 'cash', 0)$q$)$$,
  'du nul: le gerant encaisse une commande a 0');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000013'),
  'paid', 'du nul: la commande a 0 est payee par le gerant');

-- Une commande INSEREE deja paid, sans registre: refusee.
select throws_ok(
  $$select public.test_b150_valider($q$insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total,
      tip_amount, status, payment_status, payment_method, paid_at)
      values ('dc000000-0000-4000-8000-000000000020', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-20',
      1000, 1000, 0, 'served', 'paid', 'cash', now())$q$)$$,
  '42501', null, 'gerant: insertion d une commande deja paid sans registre refusee');
-- Temoin: la meme insertion, pending, est acceptee.
select lives_ok(
  $$select public.test_b150_valider($q$insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total,
      tip_amount, status, payment_status)
      values ('dc000000-0000-4000-8000-000000000021', 'da000000-0000-4000-8000-00000000000a', 'takeaway', 'B-21',
      1000, 1000, 0, 'served', 'pending')$q$)$$,
  'temoin: la meme insertion en pending est acceptee');

-- (7) Offrir (compOrder): pose 'comp', pas 'paid', sans registre: accepte.
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'comp', is_comp = true, comp_reason = 'test',
      comped_at = now(), comp_amount = 1000
      where id = 'dc000000-0000-4000-8000-000000000008' and tenant_id = 'da000000-0000-4000-8000-00000000000a'
        and payment_status = 'pending' and status <> 'cancelled'$q$)$$,
  'gerant: offrir une commande reste possible sans registre');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000008'),
  'comp', 'offert: commande offerte');

-- ---------------------------------------------------------------------------
-- (10) Gestes sans argent: inchanges
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated"}';
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set status = 'preparing'
      where id = 'dc000000-0000-4000-8000-000000000010' and tenant_id = 'da000000-0000-4000-8000-00000000000a'$q$)$$,
  'serveur: faire avancer en cuisine');
set local request.jwt.claims = '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.test_b150_valider($q$select public.reassign_order_table('dc000000-0000-4000-8000-000000000010',
      'da000000-0000-4000-8000-00000000000a', 'T9')$q$)$$,
  'caissier: changer la table');
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set status = 'cancelled'
      where id = 'dc000000-0000-4000-8000-000000000010' and tenant_id = 'da000000-0000-4000-8000-00000000000a'$q$)$$,
  'caissier: annuler');
select is((select status || '/' || table_number from public.orders where id = 'dc000000-0000-4000-8000-000000000010'),
  'cancelled/T9', 'gestes sans argent: tous appliques');

-- ---------------------------------------------------------------------------
-- (8) service_role: libre (route POS: bascule, puis ligne a part)
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$select public.test_b150_valider($q$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
      where id = 'dc000000-0000-4000-8000-000000000011' and tenant_id = 'da000000-0000-4000-8000-00000000000a'
        and payment_status = 'pending' and status <> 'cancelled'$q$)$$,
  'service_role: bascule sans registre acceptee');
select is((select payment_status from public.orders where id = 'dc000000-0000-4000-8000-000000000011'),
  'paid', 'service_role: commande payee');

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
reset role;
select is((select count(*)::int from pg_trigger
            where tgrelid = 'public.orders'::regclass
              and tgname in ('trg_paid_exige_registre_update', 'trg_paid_exige_registre_insert')
              and tgdeferrable and tginitdeferred and tgenabled = 'O'),
  2, 'deux declencheurs de contrainte, reportes a la validation, actifs');
select is((select prosecdef from pg_proc where oid = to_regprocedure('public.exiger_registre_pour_paid()')),
  false, 'SECURITY INVOKER: current_user est celui de l appelant');
select is((select has_function_privilege('authenticated', f, 'EXECUTE')
                   or has_function_privilege('anon', f, 'EXECUTE')
              from (select to_regprocedure('public.exiger_registre_pour_paid()') as f) x
             where f is not null),
  false, 'personne d autre que le proprietaire n a EXECUTE sur la fonction');

select * from finish();
rollback;

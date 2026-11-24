-- Une commande dont l'argent est au registre ne s'annule pas par l'API directe
-- (migration 20261124120000, constats X2, X3, N3).
--
-- Le controle est un declencheur de contrainte REPORTE a la validation. Un test
-- pgTAP ne valide jamais sa transaction: test_x23_valider force l'execution des
-- controles en file (SET CONSTRAINTS ... IMMEDIATE) juste apres l'ecriture,
-- sous le role courant, comme la validation d'une requete PostgREST. La meme
-- regle a ete prouvee en transaction reellement COMMITEE par la sonde du
-- correcteur (rapport de correction du 2026-11-24).
--
-- test_x23_valider ECHOUE (P0001) si le declencheur manque: sans la migration,
-- toutes les assertions de refus echouent.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e7111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-x23@test.local', 'x', now(), now()),
  ('e7222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-x23@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('e7000000-0000-4000-8000-00000000000a', 'x23-a', 'X23 A', true, 'pro', 'active');

insert into public.admin_users (tenant_id, user_id, email, role, is_active)
values ('e7000000-0000-4000-8000-00000000000a', 'e7111111-1111-4111-8111-111111111111',
        'caissier-x23@test.local', 'cashier', true),
       ('e7000000-0000-4000-8000-00000000000a', 'e7222222-2222-4222-8222-222222222222',
        'gerant-x23@test.local', 'manager', true);

-- Du de 5000 chacune.
-- 01 partial, 2000 au registre       02 paid, 5000 au registre
-- 03 impayee, registre vide          04 partial: 5000 encaisses, 3000 rendus
-- 05 rembourse en entier (net 0)     06 paid, 5000 (gerant)
-- 07 paid, 5000 (service_role)
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, tip_amount,
                           status, payment_status)
values
  ('e7c00000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-00000000000a', 'takeaway', 'X-01', 5000, 5000, 0, 'served', 'partial'),
  ('e7c00000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-00000000000a', 'takeaway', 'X-02', 5000, 5000, 0, 'served', 'paid'),
  ('e7c00000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-00000000000a', 'takeaway', 'X-03', 5000, 5000, 0, 'served', 'pending'),
  ('e7c00000-0000-4000-8000-000000000004', 'e7000000-0000-4000-8000-00000000000a', 'takeaway', 'X-04', 5000, 5000, 0, 'served', 'partial'),
  ('e7c00000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-00000000000a', 'takeaway', 'X-05', 5000, 5000, 0, 'served', 'refunded'),
  ('e7c00000-0000-4000-8000-000000000006', 'e7000000-0000-4000-8000-00000000000a', 'takeaway', 'X-06', 5000, 5000, 0, 'served', 'paid'),
  ('e7c00000-0000-4000-8000-000000000007', 'e7000000-0000-4000-8000-00000000000a', 'takeaway', 'X-07', 5000, 5000, 0, 'served', 'paid');

insert into public.payments (tenant_id, order_id, amount, method, status)
values
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000001', 2000, 'cash', 'completed'),
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000002', 5000, 'cash', 'completed'),
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000004', 5000, 'cash', 'completed'),
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000004', 3000, 'cash', 'refunded'),
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000005', 5000, 'cash', 'completed'),
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000005', 5000, 'cash', 'refunded'),
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000006', 5000, 'cash', 'completed'),
  ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000007', 5000, 'cash', 'completed');

create function public.test_x23_valider(p_sql text) returns void
language plpgsql security invoker as $$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.orders'::regclass
                    and tgname = 'trg_annulation_exige_registre_rembourse') then
    raise exception 'test_x23_valider: le declencheur trg_annulation_exige_registre_rembourse manque'
      using errcode = 'P0001';
  end if;
  execute p_sql;
  set constraints trg_annulation_exige_registre_rembourse immediate;
  set constraints trg_annulation_exige_registre_rembourse deferred;
end;
$$;
grant execute on function public.test_x23_valider(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Caissier (orders.pay, sans autorite sur l'argent)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e7111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- X2: commande partial, 2000 au registre.
select throws_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000001'$q$)$$,
  '42501', null, 'caissier: annuler une commande partial avec 2000 au registre refuse (X2)');
select is((select status from public.orders where id = 'e7c00000-0000-4000-8000-000000000001'),
  'served', 'caissier: la commande partial reste active');

-- X3: commande payee, 5000 au registre.
select throws_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000002'$q$)$$,
  '42501', null, 'caissier: annuler une commande payee refuse (X3)');
select is((select status from public.orders where id = 'e7c00000-0000-4000-8000-000000000002'),
  'served', 'caissier: la commande payee reste active');

-- Partiellement remboursee: decision de l'autorite sur l'argent.
select throws_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000004'$q$)$$,
  '42501', null, 'caissier: annuler une commande partiellement remboursee (net 2000) refuse');

-- Temoin positif: commande impayee, registre vide (chemin applicatif normal).
select lives_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000003'$q$)$$,
  'temoin: le caissier annule une commande impayee');
select is((select status from public.orders where id = 'e7c00000-0000-4000-8000-000000000003'),
  'cancelled', 'temoin: la commande impayee est annulee');

-- ---------------------------------------------------------------------------
-- Gerant (autorite sur l'argent)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"e7222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000006'$q$)$$,
  '42501', null, 'gerant: une commande payee ne s annule pas sans remboursement');
select is((select status from public.orders where id = 'e7c00000-0000-4000-8000-000000000006'),
  'served', 'gerant: la commande payee reste active');

-- Chemin ardoise: partiellement remboursee, le gerant decide.
select lives_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000004'$q$)$$,
  'temoin: le gerant annule une commande partiellement remboursee (ardoise)');

-- Remboursee en entier: net 0.
select lives_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000005'$q$)$$,
  'temoin: le gerant annule une commande remboursee en entier');

-- Rembourser puis annuler dans la meme transaction: jugee sur l'etat final.
select lives_ok(
  $$select public.test_x23_valider($q$with r as (insert into public.payments (tenant_id, order_id, amount, method, status)
      values ('e7000000-0000-4000-8000-00000000000a', 'e7c00000-0000-4000-8000-000000000001', 2000, 'cash', 'refunded')
      returning order_id)
      update public.orders set status = 'cancelled', payment_status = 'refunded'
      where id in (select order_id from r)$q$)$$,
  'temoin: rembourser puis annuler dans la meme transaction est accepte');
select is((select status from public.orders where id = 'e7c00000-0000-4000-8000-000000000001'),
  'cancelled', 'temoin: commande remboursee puis annulee');

-- ---------------------------------------------------------------------------
-- service_role (route POS, crons) et proprietaire: hors du controle
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$select public.test_x23_valider($q$update public.orders set status = 'cancelled'
      where id = 'e7c00000-0000-4000-8000-000000000007'$q$)$$,
  'service_role: hors du controle (chemins serveur)');

reset role;
select is((select count(*)::int from public.payments
            where tenant_id = 'e7000000-0000-4000-8000-00000000000a' and status = 'completed'),
  6, 'aucun refus n a touche au registre');
select is((select prosecdef from pg_proc where proname = 'exiger_registre_rembourse_pour_annuler'),
  false, 'la garde est SECURITY INVOKER (current_user reel)');

select * from finish();
rollback;

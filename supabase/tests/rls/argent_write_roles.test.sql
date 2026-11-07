-- Les ECRITURES D ARGENT exigent un ROLE, pas seulement l appartenance.
--
-- Suite de catalogue_write_roles.test.sql, pour les quatre tables ou le defaut
-- touche l argent. Mesure avant correction (2026-11-07), avec la seule cle anon
-- et le compte d un employe de role `waiter`:
--
--   marquer une commande PAYEE sans ligne de paiement => POSSIBLE
--   changer le TOTAL d une commande                    => POSSIBLE
--   mettre la TVA du restaurant a zero                 => POSSIBLE
--   SUPPRIMER une commande                             => POSSIBLE
--
-- Marquer payee sans ligne au ledger fait disparaitre une recette: la
-- comptabilite ne voit plus l encaissement, mais la commande est servie.
--
-- CE QUE CE TEST PROTEGE AUSSI (et c est la moitie du travail): le gerant doit
-- continuer a encaisser, a corriger une commande et a changer ses taxes. Une
-- policy trop serree couperait le service en salle.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/argent_write_roles.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant.argent@test.local', 'x', now(), now()),
  ('c2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur.argent@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, tax_rate)
values ('c3333333-3333-3333-3333-333333333333', 'tenant-argent-roles', 'Tenant Argent', true, 18);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  (gen_random_uuid(), 'c3333333-3333-3333-3333-333333333333',
   'c1111111-1111-1111-1111-111111111111', 'gerant.argent@test.local', 'manager', true),
  (gen_random_uuid(), 'c3333333-3333-3333-3333-333333333333',
   'c2222222-2222-2222-2222-222222222222', 'serveur.argent@test.local', 'waiter', true);

insert into public.orders (id, tenant_id, order_number, status, payment_status, subtotal, total)
values ('c4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333',
        'CMD-TEST-1', 'pending', 'pending', 29000, 29000);

-- ===========================================================================
-- Le WAITER: il lit, il ne touche plus a l argent
-- ===========================================================================
-- RLS masque les lignes, elle ne leve pas d erreur sur un UPDATE ou un DELETE
-- sans correspondance: on assert sur l ETAT OBSERVE. Un INSERT refuse, lui,
-- leve bien 42501.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222"}';

update public.orders set payment_status = 'paid'
 where id = 'c4444444-4444-4444-4444-444444444444';
select is(
  (select payment_status from public.orders where id = 'c4444444-4444-4444-4444-444444444444'),
  'pending',
  'argent: un waiter ne peut PAS marquer une commande payee'
);

update public.orders set total = 1 where id = 'c4444444-4444-4444-4444-444444444444';
select is(
  (select total::int from public.orders where id = 'c4444444-4444-4444-4444-444444444444'),
  29000,
  'argent: un waiter ne peut PAS changer le total d une commande'
);

update public.tenants set tax_rate = 0 where id = 'c3333333-3333-3333-3333-333333333333';
select is(
  (select tax_rate::int from public.tenants where id = 'c3333333-3333-3333-3333-333333333333'),
  18,
  'argent: un waiter ne peut PAS mettre la TVA du restaurant a zero'
);

delete from public.orders where id = 'c4444444-4444-4444-4444-444444444444';
select is(
  (select count(*)::int from public.orders where id = 'c4444444-4444-4444-4444-444444444444'),
  1,
  'argent: un waiter ne peut PAS supprimer une commande'
);

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', 29000, 'cash', 'completed')$$,
  '42501',
  null,
  'argent: un waiter ne peut PAS ecrire au ledger des paiements'
);

select throws_ok(
  $$insert into public.orders (tenant_id, order_number, subtotal, total)
    values ('c3333333-3333-3333-3333-333333333333', 'CMD-PIRATE', 1, 1)$$,
  '42501',
  null,
  'argent: un waiter ne peut PAS creer une commande en base directement'
);

-- Non-regression de LECTURE: le service a besoin de voir les commandes.
select is(
  (select count(*)::int from public.orders where id = 'c4444444-4444-4444-4444-444444444444'),
  1,
  'argent: un waiter LIT toujours les commandes de son restaurant'
);

-- ===========================================================================
-- Le MANAGER: il encaisse toujours
-- ===========================================================================
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('c3333333-3333-3333-3333-333333333333',
            'c4444444-4444-4444-4444-444444444444', 29000, 'cash', 'completed')$$,
  'argent non-regression: un manager ecrit au ledger des paiements'
);

update public.orders set payment_status = 'paid'
 where id = 'c4444444-4444-4444-4444-444444444444';
select is(
  (select payment_status from public.orders where id = 'c4444444-4444-4444-4444-444444444444'),
  'paid',
  'argent non-regression: un manager marque la commande payee'
);

update public.tenants set tax_rate = 20 where id = 'c3333333-3333-3333-3333-333333333333';
select is(
  (select tax_rate::int from public.tenants where id = 'c3333333-3333-3333-3333-333333333333'),
  20,
  'argent non-regression: un manager change la TVA du restaurant'
);

select lives_ok(
  $$insert into public.orders (tenant_id, order_number, subtotal, total)
    values ('c3333333-3333-3333-3333-333333333333', 'CMD-TEST-2', 5000, 5000)$$,
  'argent non-regression: un manager cree une commande'
);

-- Parite avec l application: la permission RETIREE mord aussi en base.
reset role;
update public.admin_users
   set custom_permissions = '{"orders.manage": false}'::jsonb
 where user_id = 'c1111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111"}';

update public.orders set total = 42 where id = 'c4444444-4444-4444-4444-444444444444';
select is(
  (select total::int from public.orders where id = 'c4444444-4444-4444-4444-444444444444'),
  29000,
  'parite: un manager dont orders.manage est RETIRE ne touche plus aux commandes'
);

select * from finish();
rollback;

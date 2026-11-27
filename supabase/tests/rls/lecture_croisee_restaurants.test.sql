-- Lecture croisee entre restaurants: un membre du restaurant A ne lit AUCUNE
-- ligne du restaurant B, et `anon` non plus (constats K1.11 et N2, audit de
-- mise en production du 2026-11-23).
--
-- POURQUOI CE TEST. Ajouter `create policy ... for select using (true)` sur
-- `orders`, `payments`, `order_items` ou `admin_users` laissait toute la suite
-- pgTAP verte: aucune assertion ne lisait une table sensible avec le jeton
-- d'un AUTRE restaurant. Ce fichier le fait pour chaque table multi-tenant qui
-- porte des donnees privees.
--
-- POUR CHAQUE TABLE, trois assertions:
--   1. temoin positif: le proprietaire de B lit au moins une ligne de B (la
--      ligne existe et la lecture n'est pas simplement cassee pour tous);
--   2. le proprietaire de A lit 0 ligne de B;
--   3. `anon` lit 0 ligne de B. Un refus de privilege (42501, table sans
--      GRANT SELECT a anon) compte comme 0 ligne lue.
-- Proprietaire et non simple employe: c'est le membre le plus puissant, celui
-- que les politiques reservees (journal d'audit, paiements Flutterwave,
-- invitations) laissent lire.
--
-- HORS DE CE TEST, PAR CONCEPTION. Les tables du catalogue public (`menus`,
-- `categories`, `menu_items`, `venues`, `tables`, `zones`, `item_options`,
-- `item_modifiers`, `item_price_variants`) sont lisibles par tout visiteur:
-- c'est la carte affichee sur la vitrine et au QR de table (politiques
-- "Catalogue: restaurant visible ou membre" et "... publicly readable").
-- `announcements` a une politique publique en cours de traitement ailleurs
-- (constat B125, lot B2b-1).
--
-- PREUVE PAR MUTATION (rapport de correction du 2026-11-24): avec
-- `create policy t on public.<table> for select to authenticated, anon using (true)`
-- sur orders, payments, order_items ou admin_users, ce fichier echoue.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(57);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e9aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'proprio-a-lx@test.local', 'x', now(), now()),
  ('e9bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'proprio-b-lx@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('e9000000-0000-4000-8000-00000000000a', 'lx-a', 'LX A', true, 'business', 'active'),
       ('e9000000-0000-4000-8000-00000000000b', 'lx-b', 'LX B', true, 'business', 'active');

-- Une ligne de chaque table sensible pour un restaurant (ecrite par le
-- proprietaire de la base, hors RLS).
create function public.test_lx_semer(p_tenant uuid, p_user uuid, p_email text) returns void
language plpgsql as $$
declare
  v_admin uuid;
  v_order uuid := gen_random_uuid();
  v_cat uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_ingr uuid := gen_random_uuid();
  v_coupon uuid := gen_random_uuid();
begin
  insert into public.admin_users (tenant_id, user_id, email, role, is_active)
  values (p_tenant, p_user, p_email, 'owner', true) returning id into v_admin;
  insert into public.categories (id, tenant_id, name) values (v_cat, p_tenant, 'Plats');
  insert into public.menu_items (id, tenant_id, category_id, name, price)
  values (v_item, p_tenant, v_cat, 'Poulet', 5000);
  insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, status, payment_status)
  values (v_order, p_tenant, 'takeaway', 'LX-' || left(p_tenant::text, 4), 5000, 5000, 'served', 'paid');
  insert into public.order_items (order_id, menu_item_id, quantity, price_at_order, item_name, tenant_id)
  values (v_order, v_item, 1, 5000, 'Poulet', p_tenant);
  insert into public.payments (tenant_id, order_id, amount, method, status)
  values (p_tenant, v_order, 5000, 'cash', 'completed');
  insert into public.order_notes (tenant_id, order_id, note) values (p_tenant, v_order, 'sans piment');
  insert into public.table_sessions (tenant_id, table_number, status) values (p_tenant, 'T1', 'open');
  insert into public.house_accounts (tenant_id, name) values (p_tenant, 'Client ardoise');
  insert into public.ingredients (id, tenant_id, name) values (v_ingr, p_tenant, 'Riz');
  insert into public.stock_movements (tenant_id, ingredient_id, movement_type, quantity)
  values (p_tenant, v_ingr, 'manual_add', 10);
  insert into public.suppliers (tenant_id, name) values (p_tenant, 'Grossiste');
  insert into public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed)
  values (p_tenant, v_item, v_ingr, 1);
  insert into public.notifications (tenant_id, title) values (p_tenant, 'Commande prete');
  insert into public.coupons (id, tenant_id, code, discount_type, discount_value)
  values (v_coupon, p_tenant, 'LX10', 'percentage', 10);
  insert into public.coupon_redemptions (tenant_id, coupon_id, order_id) values (p_tenant, v_coupon, v_order);
  insert into public.settings (tenant_id, key, value) values (p_tenant, 'lx', '{}'::jsonb);
  insert into public.audit_log (tenant_id, action, entity_type) values (p_tenant, 'update', 'order');
  insert into public.invitations (tenant_id, email, role, invited_by, token, expires_at)
  values (p_tenant, 'invite-' || p_email, 'waiter', v_admin, gen_random_uuid()::text, now() + interval '1 day');
  insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
  values (p_tenant, 'lx-' || p_tenant::text, 'pro', 'monthly', 10000, 'XOF');
  insert into public.user_sessions (user_id, tenant_id) values (v_admin, p_tenant);
end;
$$;

select public.test_lx_semer('e9000000-0000-4000-8000-00000000000a', 'e9aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'proprio-a-lx@test.local');
select public.test_lx_semer('e9000000-0000-4000-8000-00000000000b', 'e9bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'proprio-b-lx@test.local');

-- Nombre de lignes du restaurant B visibles par le role courant. Un refus de
-- privilege vaut 0 ligne lue.
create function public.test_lx_lire_b(p_table text) returns int
language plpgsql security invoker as $$
declare v int;
begin
  execute format('select count(*)::int from public.%I where tenant_id = %L',
                 p_table, 'e9000000-0000-4000-8000-00000000000b') into v;
  return v;
exception when insufficient_privilege then
  return 0;
end;
$$;
grant execute on function public.test_lx_lire_b(text) to authenticated, anon;

create temp table lx_tables (nom text primary key) on commit drop;
insert into lx_tables values
  ('orders'), ('order_items'), ('payments'), ('admin_users'), ('table_sessions'),
  ('order_notes'), ('house_accounts'), ('ingredients'), ('stock_movements'), ('suppliers'),
  ('recipes'), ('notifications'), ('coupons'), ('coupon_redemptions'), ('settings'),
  ('audit_log'), ('invitations'), ('flutterwave_payments'), ('user_sessions');
grant select on lx_tables to authenticated, anon;

-- 1. Proprietaire de B: temoin positif.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e9bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select cmp_ok(public.test_lx_lire_b(nom), '>=', 1, 'temoin: le proprietaire de B lit ' || nom)
  from lx_tables order by nom;

-- 2. Proprietaire de A: rien de B.
set local request.jwt.claims = '{"sub":"e9aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select is(public.test_lx_lire_b(nom), 0, 'le proprietaire de A ne lit aucune ligne de B dans ' || nom)
  from lx_tables order by nom;

-- 3. Visiteur anonyme: rien de B.
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(public.test_lx_lire_b(nom), 0, 'anon ne lit aucune ligne de B dans ' || nom)
  from lx_tables order by nom;

reset role;
select * from finish();
rollback;

-- Suivi de commande du convive: chaque ligne renvoie ses supplements et sa note
-- (20261127220000, audit d'equipe du 2026-11-27, convive C15/#48/#49).
-- Temoin: les cles deja servies restent identiques, et une ligne sans
-- supplement renvoie un tableau vide (pas null).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into public.tenants (id, slug, name, is_active, currency, subscription_plan, subscription_status)
values ('aa000000-2711-4000-8000-00000000000a', 'suivi-details', 'Suivi details', true, 'XAF', 'business', 'active');
insert into public.categories (id, tenant_id, name)
values ('bb000000-2711-4000-8000-00000000000a', 'aa000000-2711-4000-8000-00000000000a', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price)
values
  ('cc000000-2711-4000-8000-000000000001', 'aa000000-2711-4000-8000-00000000000a', 'bb000000-2711-4000-8000-00000000000a', 'Brochettes', 4000),
  ('cc000000-2711-4000-8000-000000000002', 'aa000000-2711-4000-8000-00000000000a', 'bb000000-2711-4000-8000-00000000000a', 'Attieke', 3000);
insert into public.orders (id, tenant_id, order_number, subtotal, total)
values ('dd000000-2711-4000-8000-00000000000a', 'aa000000-2711-4000-8000-00000000000a', 'SUIVI-001', 15600, 15600);
insert into public.order_items (tenant_id, order_id, menu_item_id, item_name, price_at_order, quantity, modifiers, customer_notes)
values
  ('aa000000-2711-4000-8000-00000000000a', 'dd000000-2711-4000-8000-00000000000a', 'cc000000-2711-4000-8000-000000000001',
   'Brochettes', 6000, 2, '[{"id":"m1","name":"Sauce piment","price":300}]'::jsonb, 'Grande - Saignant'),
  ('aa000000-2711-4000-8000-00000000000a', 'dd000000-2711-4000-8000-00000000000a', 'cc000000-2711-4000-8000-000000000002',
   'Attieke', 3000, 1, null, null);

set local role anon;

create temp table suivi on commit drop as
  select jsonb_array_elements(
    (public.get_orders_for_tracking('aa000000-2711-4000-8000-00000000000a',
       array['dd000000-2711-4000-8000-00000000000a'::uuid]) -> 0) -> 'order_items') as ligne;

select is((select ligne -> 'modifiers' -> 0 ->> 'name' from suivi where ligne ->> 'item_name' = 'Brochettes'),
  'Sauce piment', 'la ligne renvoie ses supplements');
select is((select ligne ->> 'customer_notes' from suivi where ligne ->> 'item_name' = 'Brochettes'),
  'Grande - Saignant', 'la ligne renvoie sa note (taille et option)');
select is((select ligne -> 'modifiers' from suivi where ligne ->> 'item_name' = 'Attieke'),
  '[]'::jsonb, 'une ligne sans supplement renvoie un tableau vide');
select is((select (ligne ->> 'price_at_order')::int from suivi where ligne ->> 'item_name' = 'Brochettes'),
  6000, 'temoin: le prix unitaire servi ne change pas');
select is((select count(*)::int from suivi), 2, 'temoin: les deux lignes sont servies');

select * from finish();
rollback;

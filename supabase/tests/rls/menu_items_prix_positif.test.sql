-- Un prix de plat ne peut pas etre negatif (audit B6 et B42).
--
-- Avant 20261123100200, `menu_items.price` n'avait aucune contrainte en base:
-- un plat a -5000 FCFA s'enregistrait par tout chemin qui validait mal le prix.
--
-- Execution: scripts/run-pgtap.sh --local

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

insert into public.tenants (id, slug, name, is_active, currency, subscription_status) values
  ('b6000000-0000-0000-0000-00000000000a', 'b6-resto', 'Resto B6', true, 'XOF', 'active');
insert into public.categories (id, tenant_id, name) values
  ('b6c00000-0000-0000-0000-00000000000a', 'b6000000-0000-0000-0000-00000000000a', 'Plats');

select throws_ok(
  $$insert into public.menu_items (tenant_id, category_id, name, price)
    values ('b6000000-0000-0000-0000-00000000000a', 'b6c00000-0000-0000-0000-00000000000a', 'Negatif', -5000)$$,
  '23514', NULL,
  'un prix negatif est refuse par la base');

select lives_ok(
  $$insert into public.menu_items (tenant_id, category_id, name, price)
    values ('b6000000-0000-0000-0000-00000000000a', 'b6c00000-0000-0000-0000-00000000000a', 'Offert', 0)$$,
  'temoin: un prix nul reste accepte');

select ok(
  (select convalidated from pg_constraint
    where conrelid = 'public.menu_items'::regclass and conname = 'menu_items_price_non_negative'),
  'la contrainte est validee quand aucune ligne existante n est negative');

select * from finish();
rollback;

-- Par poste, une ecriture PERMISE et une ecriture REFUSEE, par de vraies
-- requetes sous le role `authenticated`.
--
-- POURQUOI CE TEST EXISTE. postes_matrice_par_poste verifie ce que la fonction
-- de resolution REPOND. Celui-ci verifie ce que la base LAISSE FAIRE : une
-- politique repointee sur le mauvais droit, ou oubliee, ne se voit que par une
-- ecriture reelle. Dix surfaces, celles que le lot 1 des roles a repointees
-- (conception D.1) ou ouvertes a de nouveaux postes (B.4).
--
-- TEMOIN DE CHAQUE REFUS. Un UPDATE refuse par la RLS ne leve AUCUNE erreur :
-- il touche 0 ligne. Chaque refus relit donc la ligne et constate qu'elle n'a
-- pas change ; chaque INSERT refuse verifie le code 42501. Et pour chaque
-- surface, la MEME requete passe pour un autre poste : le refus vient bien du
-- droit, pas d'une requete fausse.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

-- 1 proprietaire, 2 gerant, 3 chef, 4 cuisinier, 5 caissier, 6 serveur,
-- 7 serveur a qui le proprietaire a retire la prise de commande.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a2000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ecriture' || g || '@test.local', 'x', now(), now()
from generate_series(1, 7) g;

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('a2000000-0000-4000-8000-000000000001', 'tenant-ecritures', 'Tenant Ecritures', true, 'business', 'active');

insert into public.admin_users (tenant_id, user_id, email, postes, permission_overrides, is_active) values
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000101', 'ecriture1@test.local', '{owner}', null, true),
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000102', 'ecriture2@test.local', '{manager}', null, true),
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000103', 'ecriture3@test.local', '{chef}', null, true),
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000104', 'ecriture4@test.local', '{cook}', null, true),
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000105', 'ecriture5@test.local', '{cashier}', null, true),
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000106', 'ecriture6@test.local', '{waiter}', null, true),
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000107', 'ecriture7@test.local', '{waiter}',
   '{"orders.take": false}'::jsonb, true);

insert into public.categories (id, tenant_id, name)
values ('a2000000-0000-4000-8000-000000000201', 'a2000000-0000-4000-8000-000000000001', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price, description)
values ('a2000000-0000-4000-8000-000000000202', 'a2000000-0000-4000-8000-000000000001',
        'a2000000-0000-4000-8000-000000000201', 'Riz gras', 2500, 'origine');
insert into public.venues (id, tenant_id, slug, name, is_active)
values ('a2000000-0000-4000-8000-000000000203', 'a2000000-0000-4000-8000-000000000001', 'salle', 'Salle', true);
insert into public.zones (id, venue_id, tenant_id, name, prefix)
values ('a2000000-0000-4000-8000-000000000204', 'a2000000-0000-4000-8000-000000000203',
        'a2000000-0000-4000-8000-000000000001', 'Terrasse', 'T');
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, tip_amount, status, payment_status)
values ('a2000000-0000-4000-8000-000000000205', 'a2000000-0000-4000-8000-000000000001',
        'takeaway', 'E-01', 5000, 5000, 0, 'pending', 'pending');
-- Un encaissement deja au registre, pour que le remboursement ait de quoi rendre.
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000205', 2000, 'cash', 'completed');

set local role authenticated;

-- ===========================================================================
-- 1. menu_items UPDATE (menu.edit) : chef oui, cuisinier non
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000104"}';
update public.menu_items set description = 'cuisinier' where id = 'a2000000-0000-4000-8000-000000000202';
select is((select description from public.menu_items where id = 'a2000000-0000-4000-8000-000000000202'),
  'origine', 'carte: un cuisinier ne modifie PAS un plat (0 ligne touchee)');

set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000103"}';
update public.menu_items set description = 'chef' where id = 'a2000000-0000-4000-8000-000000000202';
select is((select description from public.menu_items where id = 'a2000000-0000-4000-8000-000000000202'),
  'chef', 'carte: un chef modifie un plat (gain du lot 1)');

-- ===========================================================================
-- 2. ingredients INSERT (inventory.edit) : chef oui, caissier non
-- ===========================================================================
select lives_ok(
  $$insert into public.ingredients (tenant_id, name, unit) values ('a2000000-0000-4000-8000-000000000001', 'Riz', 'kg')$$,
  'stock: un chef cree un ingredient (gain du lot 1)');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000105"}';
select throws_ok(
  $$insert into public.ingredients (tenant_id, name, unit) values ('a2000000-0000-4000-8000-000000000001', 'Sel', 'kg')$$,
  '42501', null, 'stock: un caissier ne cree PAS d ingredient');

-- ===========================================================================
-- 3. suppliers INSERT (suppliers.manage) : chef oui, cuisinier non
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000103"}';
select lives_ok(
  $$insert into public.suppliers (tenant_id, name) values ('a2000000-0000-4000-8000-000000000001', 'Grossiste')$$,
  'fournisseurs: un chef cree un fournisseur');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000104"}';
select throws_ok(
  $$insert into public.suppliers (tenant_id, name) values ('a2000000-0000-4000-8000-000000000001', 'Autre')$$,
  '42501', null, 'fournisseurs: un cuisinier ne cree PAS de fournisseur');

-- ===========================================================================
-- 4. orders UPDATE (orders.take OU kitchen.track)
--    Tous les postes ont l'un des deux droits par defaut : le refus se prouve
--    donc avec un serveur a qui le proprietaire a retire orders.take.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000107"}';
update public.orders set status = 'preparing' where id = 'a2000000-0000-4000-8000-000000000205';
select is((select status from public.orders where id = 'a2000000-0000-4000-8000-000000000205'),
  'pending', 'commandes: un serveur prive de orders.take ne fait PAS avancer une commande (0 ligne)');

set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000106"}';
update public.orders set status = 'preparing' where id = 'a2000000-0000-4000-8000-000000000205';
select is((select status from public.orders where id = 'a2000000-0000-4000-8000-000000000205'),
  'preparing', 'commandes: un serveur fait avancer une commande (orders.take)');

set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000103"}';
update public.orders set status = 'ready' where id = 'a2000000-0000-4000-8000-000000000205';
select is((select status from public.orders where id = 'a2000000-0000-4000-8000-000000000205'),
  'ready', 'commandes: un chef change le statut (kitchen.track)');

-- ===========================================================================
-- 5. coupons INSERT (orders.discount) : gerant oui, chef non
--    Sans le repointage, le chef (qui gagne menu.edit) creerait des codes promo.
-- ===========================================================================
select throws_ok(
  $$insert into public.coupons (tenant_id, code, discount_type, discount_value)
    values ('a2000000-0000-4000-8000-000000000001', 'CHEF', 'percentage', 10)$$,
  '42501', null, 'coupons: un chef ne cree PAS de code promo, malgre menu.edit');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000102"}';
select lives_ok(
  $$insert into public.coupons (tenant_id, code, discount_type, discount_value)
    values ('a2000000-0000-4000-8000-000000000001', 'GERANT', 'percentage', 10)$$,
  'coupons: un gerant cree un code promo');

-- ===========================================================================
-- 6. ads INSERT (settings.edit) : gerant oui, chef non
-- ===========================================================================
select lives_ok(
  $$insert into public.ads (tenant_id, image_url, sort_order, is_active)
    values ('a2000000-0000-4000-8000-000000000001', '/g.jpg', 1, true)$$,
  'publicites: un gerant cree une publicite');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000103"}';
select throws_ok(
  $$insert into public.ads (tenant_id, image_url, sort_order, is_active)
    values ('a2000000-0000-4000-8000-000000000001', '/c.jpg', 2, true)$$,
  '42501', null, 'publicites: un chef ne cree PAS de publicite, malgre menu.edit');

-- ===========================================================================
-- 7. venues UPDATE (settings.edit) : gerant oui, caissier non
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000105"}';
update public.venues set name = 'caissier' where id = 'a2000000-0000-4000-8000-000000000203';
select is((select name from public.venues where id = 'a2000000-0000-4000-8000-000000000203'),
  'Salle', 'espaces: un caissier ne renomme PAS un espace (0 ligne)');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000102"}';
update public.venues set name = 'gerant' where id = 'a2000000-0000-4000-8000-000000000203';
select is((select name from public.venues where id = 'a2000000-0000-4000-8000-000000000203'),
  'gerant', 'espaces: un gerant renomme un espace');

-- ===========================================================================
-- 8. tables INSERT (plan de salle = settings.edit) : gerant oui, serveur non
-- ===========================================================================
select lives_ok(
  $$insert into public.tables (zone_id, tenant_id, table_number, display_name, capacity, is_active)
    values ('a2000000-0000-4000-8000-000000000204', 'a2000000-0000-4000-8000-000000000001', '1', 'T1', 4, true)$$,
  'plan de salle: un gerant cree une table');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000106"}';
select throws_ok(
  $$insert into public.tables (zone_id, tenant_id, table_number, display_name, capacity, is_active)
    values ('a2000000-0000-4000-8000-000000000204', 'a2000000-0000-4000-8000-000000000001', '2', 'T2', 4, true)$$,
  '42501', null, 'plan de salle: un serveur ne cree PAS de table');

-- ===========================================================================
-- 9. payments INSERT (orders.pay en entier) : caissier oui, serveur non
--    La case du serveur vaut `limited` jusqu'au lot 3 : elle n'ouvre rien.
-- ===========================================================================
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  '42501', null, 'caisse: un serveur n encaisse PAS au lot 1 (orders.pay limite)');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000105"}';
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000205', 500, 'cash', 'completed')$$,
  'caisse: un caissier encaisse');

-- ===========================================================================
-- 10. record_refund (autorite d'argent : les quatre droits) : gerant oui,
--     caissier non (ses droits d'annuler, remiser, rembourser sont `limited`)
-- ===========================================================================
select throws_ok(
  $$select public.record_refund('a2000000-0000-4000-8000-000000000205',
      'a2000000-0000-4000-8000-000000000001', 1000, 'cash')$$,
  '42501', null, 'remboursement: un caissier ne rembourse PAS');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000102"}';
select lives_ok(
  $$select public.record_refund('a2000000-0000-4000-8000-000000000205',
      'a2000000-0000-4000-8000-000000000001', 1000, 'cash')$$,
  'remboursement: un gerant rembourse');

select * from finish();
rollback;

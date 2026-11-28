-- Statuts de cuisine : "en preparation" et "pret" exigent `kitchen.track`.
--
-- POURQUOI CE TEST EXISTE. Le cahier des charges (section 5) reserve "Suivre en
-- cuisine ou au bar" au proprietaire, au gerant, au chef, au cuisinier et au
-- barman. Or la politique UPDATE de `orders` et de `order_items` laisse passer
-- `orders.take` OU `kitchen.track` : un caissier ou un serveur passait une
-- commande "en preparation", et retirer `kitchen.track` a un equipier ne
-- changeait rien (audit de conformite M2). Le declencheur
-- `garder_statut_cuisine` juge la VALEUR ecrite. Servir (`delivered`,
-- `served`) reste ouvert a la salle : c'est le metier du serveur.
--
-- Le declencheur est SECURITY INVOKER : il lit `current_user`. Le test le
-- verifie, car en DEFINER la garde ne se declencherait jamais et tous les refus
-- ci-dessous seraient impossibles a obtenir.
--
-- TEMOINS. La meme requete passe pour un cuisinier ; un serveur a qui le
-- proprietaire DONNE `kitchen.track` passe ; un equipier a qui il le RETIRE est
-- refuse alors que `orders.take` lui ouvre toujours la politique.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- 1 caissier, 2 serveur, 3 cuisinier, 4 serveur avec kitchen.track donne,
-- 5 equipier polyvalent a qui kitchen.track est retire.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('ac000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'statut' || g || '@test.local', 'x', now(), now()
from generate_series(1, 5) g;
insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('ac000000-0000-4000-8000-000000000001', 'tenant-statut', 'Tenant Statut', true, 'business', 'active');
insert into public.admin_users (tenant_id, user_id, email, postes, permission_overrides, is_active) values
  ('ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000101', 'statut1@test.local', '{cashier}', null, true),
  ('ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000102', 'statut2@test.local', '{waiter}', null, true),
  ('ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000103', 'statut3@test.local', '{cook}', null, true),
  ('ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000104', 'statut4@test.local', '{waiter}', '{"kitchen.track": true}', true),
  ('ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000105', 'statut5@test.local', '{crew}', '{"kitchen.track": false}', true);

insert into public.categories (id, tenant_id, name)
values ('ac000000-0000-4000-8000-000000000201', 'ac000000-0000-4000-8000-000000000001', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price)
values ('ac000000-0000-4000-8000-000000000202', 'ac000000-0000-4000-8000-000000000001',
        'ac000000-0000-4000-8000-000000000201', 'Riz gras', 2500);
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, tip_amount, status, payment_status)
values ('ac000000-0000-4000-8000-000000000203', 'ac000000-0000-4000-8000-000000000001',
        'takeaway', 'S-01', 2500, 2500, 0, 'pending', 'pending');
insert into public.order_items (id, tenant_id, order_id, menu_item_id, quantity, price_at_order, item_name)
values ('ac000000-0000-4000-8000-000000000204', 'ac000000-0000-4000-8000-000000000001',
        'ac000000-0000-4000-8000-000000000203', 'ac000000-0000-4000-8000-000000000202', 1, 2500, 'Riz gras');

select is((select p.prosecdef from pg_proc p where p.oid = 'public.garder_statut_cuisine()'::regprocedure), false,
  'garder_statut_cuisine est SECURITY INVOKER (en DEFINER elle ne se declencherait jamais)');

set local role authenticated;

-- ===========================================================================
-- Caissier et serveur : pas de statut de cuisine
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000101"}';
select throws_ok(
  $$update public.orders set status = 'preparing' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  '42501', 'setting a kitchen status requires the kitchen.track permission',
  'caissier: passer une commande "en preparation" est REFUSE');
select throws_ok(
  $$update public.orders set status = 'ready' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  '42501', 'setting a kitchen status requires the kitchen.track permission',
  'caissier: passer une commande "prete" est REFUSE');

set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000102"}';
select throws_ok(
  $$update public.orders set status = 'preparing' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  '42501', 'setting a kitchen status requires the kitchen.track permission',
  'serveur: passer une commande "en preparation" est REFUSE');
select throws_ok(
  $$update public.order_items set item_status = 'preparing' where id = 'ac000000-0000-4000-8000-000000000204'$$,
  '42501', 'setting a kitchen status requires the kitchen.track permission',
  'serveur: passer une LIGNE "en preparation" est REFUSE');
select throws_ok(
  $$update public.order_items set item_status = 'ready' where id = 'ac000000-0000-4000-8000-000000000204'$$,
  '42501', 'setting a kitchen status requires the kitchen.track permission',
  'serveur: passer une ligne "prete" est REFUSE');

-- Equipier a qui le proprietaire a retire kitchen.track : `orders.take` lui
-- ouvre toujours la politique, seule la garde par valeur le refuse.
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000105"}';
select throws_ok(
  $$update public.orders set status = 'ready' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  '42501', 'setting a kitchen status requires the kitchen.track permission',
  'equipier sans kitchen.track (reglage par personne): "prete" est REFUSE');

reset role;
select is((select status from public.orders where id = 'ac000000-0000-4000-8000-000000000203'), 'pending',
  'apres tous les refus, le statut de la commande est intact');
select is((select item_status::text from public.order_items where id = 'ac000000-0000-4000-8000-000000000204'), 'pending',
  'apres tous les refus, le statut de la ligne est intact');

-- ===========================================================================
-- Temoins : la cuisine pose ces statuts, et un reglage les donne
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000103"}';
select lives_ok(
  $$update public.orders set status = 'preparing' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  'temoin: un cuisinier passe la commande "en preparation"');
select lives_ok(
  $$update public.order_items set item_status = 'ready' where id = 'ac000000-0000-4000-8000-000000000204'$$,
  'temoin: un cuisinier passe la ligne "prete"');
select lives_ok(
  $$update public.orders set status = 'ready' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  'temoin: un cuisinier passe la commande "prete"');
reset role;
select is((select o.status || '/' || i.item_status from public.orders o
             join public.order_items i on i.order_id = o.id
            where o.id = 'ac000000-0000-4000-8000-000000000203'), 'ready/ready',
  'temoin: les ecritures du cuisinier ont bien eu lieu (la garde ne bloque pas tout)');

update public.orders set status = 'pending' where id = 'ac000000-0000-4000-8000-000000000203';
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000104"}';
select lives_ok(
  $$update public.orders set status = 'preparing' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  'temoin: un serveur a qui le proprietaire DONNE kitchen.track pose "en preparation"');
reset role;
select is((select status from public.orders where id = 'ac000000-0000-4000-8000-000000000203'), 'preparing',
  'temoin: son ecriture a bien eu lieu');

-- ===========================================================================
-- Servir reste le geste de la salle
-- ===========================================================================
update public.orders set status = 'ready' where id = 'ac000000-0000-4000-8000-000000000203';
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-000000000102"}';
select lives_ok(
  $$update public.order_items set item_status = 'served' where id = 'ac000000-0000-4000-8000-000000000204'$$,
  'serveur: marquer une ligne "servie" passe');
select lives_ok(
  $$update public.orders set status = 'delivered' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  'serveur: marquer une commande "servie" passe (orders.take)');
select lives_ok(
  $$update public.orders set status = 'delivered', order_number = 'S-01' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  'serveur: reecrire le MEME statut avec une autre colonne passe (un formulaire renvoie toutes les colonnes)');
reset role;
select is((select o.status || '/' || i.item_status from public.orders o
             join public.order_items i on i.order_id = o.id
            where o.id = 'ac000000-0000-4000-8000-000000000203'), 'delivered/served',
  'serveur: la commande et sa ligne sont bien servies');

-- Une commande deja "prete" : le serveur qui renvoie `ready` inchange passe.
update public.orders set status = 'ready' where id = 'ac000000-0000-4000-8000-000000000203';
set local role authenticated;
select lives_ok(
  $$update public.orders set status = 'ready' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  'serveur: renvoyer un statut de cuisine INCHANGE passe (la garde juge le changement)');
reset role;

-- ===========================================================================
-- service_role : hors de la garde
-- ===========================================================================
update public.orders set status = 'pending' where id = 'ac000000-0000-4000-8000-000000000203';
set local role service_role;
select lives_ok(
  $$update public.orders set status = 'preparing' where id = 'ac000000-0000-4000-8000-000000000203'$$,
  'service_role: pose un statut de cuisine sans ligne de membre');
reset role;
select is((select status from public.orders where id = 'ac000000-0000-4000-8000-000000000203'), 'preparing',
  'service_role: son ecriture a bien eu lieu');

select * from finish();
rollback;

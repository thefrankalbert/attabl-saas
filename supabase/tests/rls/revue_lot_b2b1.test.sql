-- Revue ligne par ligne, lot B2b-1: defauts restants cote base de donnees
-- (migrations 20261124150000 a 20261124151400).
--
-- CE QUE CE TEST VERROUILLE (une section par constat):
--   B144 une commande annulee ne revient pas (aucun client);
--   B138 le chef fait avancer une commande offerte; offrir reste reserve a
--        l'autorite sur l'argent;
--   B123 restock_order idempotent et verrouille par commande;
--   B142 pertes et ajustements justes sur un stock negatif;
--   B143 enregistrer une recette ne rallume pas un plat retire a la main;
--   B122 commande d'un QR rattachee a la table par son NUMERO; nom egal au
--        numero d'une autre table refuse;
--   B133 changer de table vers une table inexistante refuse;
--   B119 un visiteur CONNECTE lit les supplements de la vitrine d'un autre
--        restaurant (comme un anonyme);
--   B127 lecture du stock = `inventory.view`;
--   B135 deplacer un etablissement juge les deux plafonds;
--   B76  remise a zero `all` possible, registre concordant;
--   B68  (en base) une commande payee ne passe pas a `cancelled` pour un client;
--   B67  (en base) le compteur d'un coupon ne se touche plus depuis une session;
--   B124 nom unique aussi au passage en etabli;
--   B125 lecture publique des annonces actives versionnee;
--   B132 get_daily_comps supprimee (tenants.banner_url GARDEE);
--   B113/B114 espaces de fichiers (schema storage minimal pose par le test).
--
-- Chaque refus a son temoin positif. Sans les migrations du lot, les
-- assertions marquees "(avant: ...)" echouent.
--
-- Execution: scripts/run-pgtap.sh --local (ou --db-url)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(102);

-- ---------------------------------------------------------------------------
-- Donnees
-- ---------------------------------------------------------------------------
-- T1 restaurant principal (business actif), T2 autre restaurant (vitrine),
-- T3 restaurant starter (plafond d'un etablissement).
insert into public.tenants (id, slug, name, is_active, currency, subscription_status, subscription_plan) values
  ('b2b10000-0000-4000-8000-000000000001', 'b2b1-un', 'B2B1 Un', true, 'XOF', 'active', 'business'),
  ('b2b10000-0000-4000-8000-000000000002', 'b2b1-deux', 'B2B1 Deux', true, 'XOF', 'active', 'business'),
  ('b2b10000-0000-4000-8000-000000000003', 'b2b1-trois', 'B2B1 Trois', true, 'XOF', 'active', 'starter');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('b2b10000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       e, 'x', now(), now()
from (values (1, 'patron@b2b1.test'), (2, 'gerant@b2b1.test'), (3, 'caissier@b2b1.test'),
             (4, 'chef@b2b1.test'), (5, 'serveur@b2b1.test'), (6, 'caissier-stock@b2b1.test'),
             (7, 'patron-deux@b2b1.test')) v(n, e);

insert into public.admin_users (id, user_id, tenant_id, email, role, is_active, custom_permissions) values
  ('b2b10000-0000-4000-8000-000000000201', 'b2b10000-0000-4000-8000-000000000101', 'b2b10000-0000-4000-8000-000000000001', 'patron@b2b1.test', 'owner', true, null),
  ('b2b10000-0000-4000-8000-000000000202', 'b2b10000-0000-4000-8000-000000000102', 'b2b10000-0000-4000-8000-000000000001', 'gerant@b2b1.test', 'manager', true, null),
  ('b2b10000-0000-4000-8000-000000000203', 'b2b10000-0000-4000-8000-000000000103', 'b2b10000-0000-4000-8000-000000000001', 'caissier@b2b1.test', 'cashier', true, null),
  ('b2b10000-0000-4000-8000-000000000204', 'b2b10000-0000-4000-8000-000000000104', 'b2b10000-0000-4000-8000-000000000001', 'chef@b2b1.test', 'chef', true, null),
  ('b2b10000-0000-4000-8000-000000000205', 'b2b10000-0000-4000-8000-000000000105', 'b2b10000-0000-4000-8000-000000000001', 'serveur@b2b1.test', 'waiter', true, null),
  ('b2b10000-0000-4000-8000-000000000206', 'b2b10000-0000-4000-8000-000000000106', 'b2b10000-0000-4000-8000-000000000001', 'caissier-stock@b2b1.test', 'cashier', true, '{"inventory.view": true}'::jsonb),
  -- Proprietaire de T2 ET de T3 (deplacements d'etablissements).
  ('b2b10000-0000-4000-8000-000000000207', 'b2b10000-0000-4000-8000-000000000107', 'b2b10000-0000-4000-8000-000000000002', 'patron-deux@b2b1.test', 'owner', true, null),
  ('b2b10000-0000-4000-8000-000000000208', 'b2b10000-0000-4000-8000-000000000107', 'b2b10000-0000-4000-8000-000000000003', 'patron-deux@b2b1.test', 'owner', true, null);

-- Commandes: 301 annulee, 302 offerte en preparation, 303 en attente.
insert into public.orders (id, tenant_id, order_number, status, payment_status, subtotal, total) values
  ('b2b10000-0000-4000-8000-000000000301', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-1', 'cancelled', 'pending', 5000, 5000),
  ('b2b10000-0000-4000-8000-000000000302', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-2', 'preparing', 'pending', 5000, 5000),
  ('b2b10000-0000-4000-8000-000000000303', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-3', 'pending', 'pending', 5000, 5000),
  ('b2b10000-0000-4000-8000-000000000304', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-4', 'pending', 'pending', 5000, 5000),
  ('b2b10000-0000-4000-8000-000000000305', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-5', 'served', 'paid', 5000, 5000),
  ('b2b10000-0000-4000-8000-000000000306', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-6', 'pending', 'pending', 5000, 5000);
-- Statut de paiement NULL (colonne nullable; l'application le tient pour pending).
update public.orders set payment_status = null where id = 'b2b10000-0000-4000-8000-000000000306';
update public.orders
   set payment_status = 'comp', is_comp = true, comp_reason = 'Geste', comp_amount = 5000, comped_at = now()
 where id = 'b2b10000-0000-4000-8000-000000000302';

-- ===========================================================================
-- B144: une commande annulee ne revient pas
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000105","role":"authenticated"}';
select throws_ok(
  $$update public.orders set status = 'pending' where id = 'b2b10000-0000-4000-8000-000000000301'$$,
  '42501', null, 'B144: un serveur ne remet pas en attente une commande annulee (avant: accepte)');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select throws_ok(
  $$update public.orders set status = 'preparing' where id = 'b2b10000-0000-4000-8000-000000000301'$$,
  '42501', null, 'B144: meme un gerant ne fait pas revenir une commande annulee (avant: accepte)');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000105","role":"authenticated"}';
select lives_ok(
  $$update public.orders set status = 'delivered' where id = 'b2b10000-0000-4000-8000-000000000303'$$,
  'B144 temoin: le serveur fait avancer une commande non annulee (il la sert)');
reset role;
select is((select status from public.orders where id = 'b2b10000-0000-4000-8000-000000000301'), 'cancelled',
  'B144: la commande annulee reste annulee (effet)');
select is((select status from public.orders where id = 'b2b10000-0000-4000-8000-000000000303'), 'delivered',
  'B144 temoin: la commande avancee est bien servie (effet)');

-- ===========================================================================
-- B68 en base: une commande payee ne s'annule pas (elle se rembourse)
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000103","role":"authenticated"}';
select throws_ok(
  $$update public.orders set status = 'cancelled' where id = 'b2b10000-0000-4000-8000-000000000305'$$,
  '42501', null, 'B68: un caissier ne met pas une commande PAYEE en cancelled par appel direct (avant: accepte)');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000101","role":"authenticated"}';
select throws_ok(
  $$update public.orders set status = 'cancelled' where id = 'b2b10000-0000-4000-8000-000000000305'$$,
  '42501', null, 'B68: meme le proprietaire n annule pas une commande payee par appel direct');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000103","role":"authenticated"}';
select lives_ok(
  $$update public.orders set status = 'cancelled' where id = 'b2b10000-0000-4000-8000-000000000306'
      and status <> 'cancelled' and (payment_status is null or payment_status <> 'paid')$$,
  'B68 temoin: le caissier annule une commande impayee (statut de paiement NULL, filtres de cancelOrder)');
reset role;
select is((select status || '/' || payment_status from public.orders where id = 'b2b10000-0000-4000-8000-000000000305'),
  'served/paid', 'B68: la commande payee reste servie et payee (effet)');
select is((select status from public.orders where id = 'b2b10000-0000-4000-8000-000000000306'), 'cancelled',
  'B68 temoin: la commande a statut NULL est annulee (effet)');

-- ===========================================================================
-- B67 en base: le compteur d'un coupon ne se touche plus depuis une session
-- ===========================================================================
insert into public.coupons (id, tenant_id, code, discount_type, discount_value, current_uses, max_uses) values
  ('b2b10000-0000-4000-8000-000000000c01', 'b2b10000-0000-4000-8000-000000000001', 'B2B1', 'percentage', 10, 3, 5);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000103","role":"authenticated"}';
select throws_ok(
  $$select public.unclaim_coupon_usage('b2b10000-0000-4000-8000-000000000c01')$$,
  '42501', null, 'B67: un caissier ne rend pas d utilisation de coupon par appel direct (avant: rendue a chaque appel)');
select throws_ok(
  $$select public.claim_coupon_usage('b2b10000-0000-4000-8000-000000000c01')$$,
  '42501', null, 'B67: un caissier ne brule pas d utilisation de coupon par appel direct');
reset role;
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select lives_ok(
  $$select public.unclaim_coupon_usage('b2b10000-0000-4000-8000-000000000c01')$$,
  'B67 temoin: le serveur applicatif (service_role) rend le coupon apres une annulation reelle');
reset role;
select is((select current_uses from public.coupons where id = 'b2b10000-0000-4000-8000-000000000c01'), 2,
  'B67: une seule utilisation rendue, celle du serveur applicatif (effet)');

-- Contre-audit 2: le rendu part de la COMMANDE (rendre_coupon_commande).
insert into public.coupons (id, tenant_id, code, discount_type, discount_value, current_uses, max_uses) values
  ('b2b10000-0000-4000-8000-000000000c02', 'b2b10000-0000-4000-8000-000000000002', 'B2B1-B', 'percentage', 10, 4, 9),
  ('b2b10000-0000-4000-8000-000000000c03', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-AUTRE', 'percentage', 10, 4, 9);
insert into public.orders (id, tenant_id, order_number, status, payment_status, subtotal, total, coupon_id) values
  ('b2b10000-0000-4000-8000-000000000307', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-7', 'pending', 'pending', 5000, 5000, 'b2b10000-0000-4000-8000-000000000c01'),
  ('b2b10000-0000-4000-8000-000000000308', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-8', 'pending', 'pending', 5000, 5000, null);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000103","role":"authenticated"}';
select throws_ok(
  $$update public.orders set coupon_id = 'b2b10000-0000-4000-8000-000000000c02' where id = 'b2b10000-0000-4000-8000-000000000308'$$,
  '42501', null, 'B67: un caissier n ecrit pas sur sa commande le coupon d un AUTRE restaurant (avant: accepte)');
select throws_ok(
  $$update public.orders set coupon_id = 'b2b10000-0000-4000-8000-000000000c03' where id = 'b2b10000-0000-4000-8000-000000000307'$$,
  '42501', null, 'B67: un caissier ne remplace pas le coupon de sa commande par un autre du meme restaurant');
select throws_ok(
  $$update public.orders set coupon_rendu_at = now() where id = 'b2b10000-0000-4000-8000-000000000307'$$,
  '42501', null, 'B67: un caissier ne touche pas la trace du rendu');
select lives_ok(
  $$update public.orders set status = 'cancelled' where id = 'b2b10000-0000-4000-8000-000000000307'$$,
  'B67 temoin: le caissier annule sa commande avec coupon');
reset role;
-- Le volet "fonction" est prouve seul: commande annulee portant, par une
-- ecriture du proprietaire de la base, le coupon d'un autre restaurant.
update public.orders set coupon_id = 'b2b10000-0000-4000-8000-000000000c02', status = 'cancelled'
 where id = 'b2b10000-0000-4000-8000-000000000308';
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select is(public.rendre_coupon_commande('b2b10000-0000-4000-8000-000000000308', 'b2b10000-0000-4000-8000-000000000001'),
  false, 'B67: le rendu refuse un coupon d un autre restaurant');
select is(public.rendre_coupon_commande('b2b10000-0000-4000-8000-000000000307', 'b2b10000-0000-4000-8000-000000000001'),
  true, 'B67 temoin: le coupon de la commande annulee est rendu');
select is(public.rendre_coupon_commande('b2b10000-0000-4000-8000-000000000307', 'b2b10000-0000-4000-8000-000000000001'),
  false, 'B67: rejouer le rendu ne rend rien une seconde fois');
select is(public.rendre_coupon_commande('b2b10000-0000-4000-8000-000000000304', 'b2b10000-0000-4000-8000-000000000001'),
  false, 'B67: une commande non annulee ne rend rien');
reset role;
select is((select current_uses from public.coupons where id = 'b2b10000-0000-4000-8000-000000000c02'), 4,
  'B67: le compteur du coupon de l autre restaurant ne bouge pas (avant: 3)');
select is((select current_uses from public.coupons where id = 'b2b10000-0000-4000-8000-000000000c01'), 1,
  'B67: le coupon du restaurant est rendu une seule fois (2 -> 1)');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000101","role":"authenticated"}';
select throws_ok(
  $$select public.rendre_coupon_commande('b2b10000-0000-4000-8000-000000000307', 'b2b10000-0000-4000-8000-000000000001')$$,
  '42501', null, 'B67: meme le proprietaire n appelle pas le rendu depuis sa session');
reset role;

-- Reprise BORNEE de 20261124151500: une annulation anterieure a l'instant en
-- dur est marquee rendue (l'ancien code avait rendu son coupon), une
-- posterieure ne l'est pas. La migration est rejouee telle quelle.
insert into public.orders (id, tenant_id, order_number, status, payment_status, subtotal, total, coupon_id, created_at, updated_at) values
  ('b2b10000-0000-4000-8000-000000000309', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-9', 'cancelled', 'pending', 5000, 5000,
   'b2b10000-0000-4000-8000-000000000c03', '2026-11-24 00:30:00+00', '2026-11-24 01:30:00+00'),
  ('b2b10000-0000-4000-8000-000000000310', 'b2b10000-0000-4000-8000-000000000001', 'B2B1-10', 'cancelled', 'pending', 5000, 5000,
   'b2b10000-0000-4000-8000-000000000c03', '2026-11-24 00:30:00+00', '2026-11-24 02:30:00+00');
-- ALTER TABLE refuse une table qui a des evenements de declencheurs reportes en
-- attente (declencheurs B150, mis en file par les insertions du test): on les
-- execute d'abord, en proprietaire de la base (ils ne jugent que les clients).
set constraints all immediate;
\ir ../../migrations/20261124151500_coupon_rendu_par_commande.sql
select ok((select coupon_rendu_at is not null from public.orders where id = 'b2b10000-0000-4000-8000-000000000309'),
  'B67 reprise: une annulation anterieure a l instant en dur est marquee rendue');
select ok((select coupon_rendu_at is null from public.orders where id = 'b2b10000-0000-4000-8000-000000000310'),
  'B67 reprise: une annulation posterieure a l instant en dur n est pas marquee (son rendu reste possible)');
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select is(public.rendre_coupon_commande('b2b10000-0000-4000-8000-000000000310', 'b2b10000-0000-4000-8000-000000000001'),
  true, 'B67 reprise: l annulation posterieure est rendue par la fonction, une fois');
select is(public.rendre_coupon_commande('b2b10000-0000-4000-8000-000000000309', 'b2b10000-0000-4000-8000-000000000001'),
  false, 'B67 reprise: l annulation anterieure (deja rendue par l ancien code) ne l est pas une seconde fois');
reset role;

-- ===========================================================================
-- B138: offert et suivi de cuisine
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000104","role":"authenticated"}';
select lives_ok(
  $$update public.orders set status = 'ready' where id = 'b2b10000-0000-4000-8000-000000000302'$$,
  'B138: le chef passe une commande offerte a prete (avant: new row violates row-level security policy)');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000105","role":"authenticated"}';
select lives_ok(
  $$update public.orders set status = 'delivered', served_at = now() where id = 'b2b10000-0000-4000-8000-000000000302'$$,
  'B138: le serveur la marque servie (avant: refus RLS)');
reset role;
select is((select status from public.orders where id = 'b2b10000-0000-4000-8000-000000000302'), 'delivered',
  'B138: la commande offerte est bien servie (effet)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000103","role":"authenticated"}';
select throws_ok(
  $$update public.orders set payment_status = 'comp', is_comp = true where id = 'b2b10000-0000-4000-8000-000000000304'$$,
  '42501', null, 'B138: un caissier (sans autorite sur l argent) n offre pas une commande');
select throws_ok(
  $$update public.orders set comp_reason = 'Autre' where id = 'b2b10000-0000-4000-8000-000000000302'$$,
  '42501', null, 'B138: un caissier ne retouche pas une commande offerte');
select throws_ok(
  $$update public.orders set status = 'cancelled' where id = 'b2b10000-0000-4000-8000-000000000302'$$,
  '42501', null, 'B138: un caissier n annule pas une commande offerte');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select lives_ok(
  $$update public.orders set comp_reason = 'Corrige par le gerant' where id = 'b2b10000-0000-4000-8000-000000000302'$$,
  'B138 temoin: le gerant (autorite sur l argent) retouche une commande offerte');
reset role;
select is((select comp_reason from public.orders where id = 'b2b10000-0000-4000-8000-000000000302'), 'Corrige par le gerant',
  'B138 temoin: la retouche du gerant est enregistree (effet)');
select is((select payment_status from public.orders where id = 'b2b10000-0000-4000-8000-000000000304'), 'pending',
  'B138: la commande que le caissier voulait offrir reste a encaisser (effet)');
select ok(
  (select pg_get_expr(polwithcheck, polrelid) from pg_policy
    where polrelid = 'public.orders'::regclass and polname = 'Order managers can update own tenant orders')
  not like '%has_tenant_money_permission%',
  'B138: le WITH CHECK de la politique UPDATE ne demande plus que orders.manage');

-- ===========================================================================
-- Catalogue et stock de T1
-- ===========================================================================
insert into public.categories (id, tenant_id, name) values
  ('b2b10000-0000-4000-8000-000000000401', 'b2b10000-0000-4000-8000-000000000001', 'Plats'),
  ('b2b10000-0000-4000-8000-000000000402', 'b2b10000-0000-4000-8000-000000000002', 'Plats B');
insert into public.menu_items (id, tenant_id, category_id, name, price, is_available) values
  ('b2b10000-0000-4000-8000-000000000501', 'b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000401', 'Plat retire a la main', 1000, false),
  ('b2b10000-0000-4000-8000-000000000502', 'b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000401', 'Plat du moteur', 1000, true),
  ('b2b10000-0000-4000-8000-000000000503', 'b2b10000-0000-4000-8000-000000000002', 'b2b10000-0000-4000-8000-000000000402', 'Plat de B', 1000, true),
  ('b2b10000-0000-4000-8000-000000000504', 'b2b10000-0000-4000-8000-000000000002', 'b2b10000-0000-4000-8000-000000000402', 'Plat de B indisponible', 1000, false);
insert into public.ingredients (id, tenant_id, name, unit, current_stock) values
  ('b2b10000-0000-4000-8000-000000000601', 'b2b10000-0000-4000-8000-000000000001', 'Riz', 'kg', -5),
  ('b2b10000-0000-4000-8000-000000000602', 'b2b10000-0000-4000-8000-000000000001', 'Huile', 'kg', 10),
  ('b2b10000-0000-4000-8000-000000000603', 'b2b10000-0000-4000-8000-000000000001', 'Sel', 'kg', 3),
  ('b2b10000-0000-4000-8000-000000000604', 'b2b10000-0000-4000-8000-000000000001', 'Poisson', 'kg', 1);

-- ===========================================================================
-- B142: stock negatif
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select is(public.record_loss_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000601', 1, 'breakage'),
  -6.000::numeric, 'B142: une perte de 1 sur un stock de -5 le descend a -6 (avant: 0)');
select is(public.adjust_ingredient_stock_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000601', 3, 'manual_add'),
  -3.000::numeric, 'B142: une reception de 3 sur -6 donne -3 (avant: 0)');
select is(public.adjust_ingredient_stock_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000601', -1, 'manual_remove'),
  -4.000::numeric, 'B142: un retrait manuel de 1 sur -3 le descend a -4, meme regle que la perte (avant: 0)');
select is(public.record_loss_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000602', 1, 'breakage'),
  9.000::numeric, 'B142 temoin: perte de 1 sur un stock de 10 donne 9');
select is(public.record_loss_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000603', 10, 'expired'),
  -7.000::numeric, 'B142: une perte plus grande que le stock est inscrite en entier, le stock descend sous zero comme a la vente');
reset role;
select is(
  (select array_agg(quantity order by created_at, quantity) from public.stock_movements
    where ingredient_id = 'b2b10000-0000-4000-8000-000000000601'),
  array[-1.000, -1.000, 3.000]::numeric[],
  'B142: le registre inscrit -1 (perte), +3 (reception), -1 (retrait) (avant: +5, +3, -1)');
select is((select current_stock from public.ingredients where id = 'b2b10000-0000-4000-8000-000000000601'),
  -4.000::numeric, 'B142: stock et registre concordent (effet)');
insert into public.ingredients (id, tenant_id, name, unit, current_stock) values
  ('b2b10000-0000-4000-8000-000000000606', 'b2b10000-0000-4000-8000-000000000001', 'Farine', 'kg', 8);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select is(public.adjust_ingredient_stock_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000606', -9, 'manual_remove'),
  -1.000::numeric, 'B142: retrait manuel de 9 sur 8 donne -1, comme une perte (avant: 0)');
reset role;
select is((select quantity from public.stock_movements where ingredient_id = 'b2b10000-0000-4000-8000-000000000606'),
  -9.000::numeric, 'B142: le mouvement du retrait porte la quantite reelle (avant: -8)');
select is((select total_qty from public.get_losses_by_reason('b2b10000-0000-4000-8000-000000000001')
            where reason_code = 'breakage'),
  2.000::numeric, 'B142: la perte sur stock negatif apparait au rapport des pertes: 1 + 1 du temoin (avant: 0 + 1)');

-- ===========================================================================
-- B143: masquage manuel contre masquage par le stock
-- ===========================================================================
-- 502 depend du Poisson; une perte le met en rupture: le MOTEUR masque 502.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select public.set_recipe_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000502',
  '[{"ingredient_id":"b2b10000-0000-4000-8000-000000000604","quantity_needed":1}]'::jsonb);
select public.record_loss_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000604', 1, 'expired');
reset role;
select is((select is_available::text || '/' || masque_par_stock::text from public.menu_items where id = 'b2b10000-0000-4000-8000-000000000502'),
  'false/true', 'B143: le moteur masque le plat en rupture et note la cause');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select public.set_recipe_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000501', '[]'::jsonb);
reset role;
select is((select is_available from public.menu_items where id = 'b2b10000-0000-4000-8000-000000000501'), false,
  'B143: enregistrer (vider) la recette d un plat retire a la main ne le remet pas a la carte (avant: true)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select public.set_recipe_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000502', '[]'::jsonb);
reset role;
select is((select is_available::text || '/' || masque_par_stock::text from public.menu_items where id = 'b2b10000-0000-4000-8000-000000000502'),
  'true/false', 'B143 temoin: le plat masque PAR LE STOCK revient quand sa recette n a plus de rupture');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
update public.menu_items set is_available = false where id = 'b2b10000-0000-4000-8000-000000000502';
select public.set_recipe_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000502', '[]'::jsonb);
reset role;
select is((select is_available from public.menu_items where id = 'b2b10000-0000-4000-8000-000000000502'), false,
  'B143: retire ensuite a la main par le restaurateur, il reste retire (le choix efface la cause stock)');

-- Plat deja indisponible AVANT la migration (pas de reprise): son ingredient
-- revient en stock, il ne revient pas seul.
insert into public.menu_items (id, tenant_id, category_id, name, price, is_available) values
  ('b2b10000-0000-4000-8000-000000000505', 'b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000401', 'Plat ancien indisponible', 1000, false);
insert into public.ingredients (id, tenant_id, name, unit, current_stock) values
  ('b2b10000-0000-4000-8000-000000000605', 'b2b10000-0000-4000-8000-000000000001', 'Mais', 'kg', 0);
insert into public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed) values
  ('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000505', 'b2b10000-0000-4000-8000-000000000605', 1);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select public.adjust_ingredient_stock_tx('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000605', 5, 'manual_add');
reset role;
select is((select is_available from public.menu_items where id = 'b2b10000-0000-4000-8000-000000000505'), false,
  'B143: un plat indisponible d avant (cause inconnue, masque_par_stock = false) ne revient pas seul au retour du stock');

-- ===========================================================================
-- B127: lecture du stock = inventory.view
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000105","role":"authenticated"}';
select throws_ok($$select * from public.get_losses_by_reason('b2b10000-0000-4000-8000-000000000001')$$,
  '42501', null, 'B127: un serveur ne lit pas le rapport des pertes (avant: lu)');
select throws_ok($$select * from public.get_stock_movements_page('b2b10000-0000-4000-8000-000000000001')$$,
  '42501', null, 'B127: un serveur ne lit pas l historique des mouvements (avant: lu)');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000103","role":"authenticated"}';
select throws_ok($$select * from public.get_stock_status('b2b10000-0000-4000-8000-000000000001')$$,
  '42501', null, 'B127: un caissier ne lit pas l etat du stock (avant: lu)');
select throws_ok($$select * from public.verify_stock_ledger('b2b10000-0000-4000-8000-000000000001')$$,
  '42501', null, 'B127: un caissier ne lit pas le controle du registre (avant: lu)');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000104","role":"authenticated"}';
select ok((select count(*) from public.get_stock_status('b2b10000-0000-4000-8000-000000000001')) = 6,
  'B127 temoin: le chef (inventory.view par defaut) lit l etat du stock');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000106","role":"authenticated"}';
select ok((select count(*) from public.get_losses_by_reason('b2b10000-0000-4000-8000-000000000001')) >= 1,
  'B127 temoin: un caissier a qui le proprietaire a delegue inventory.view lit les pertes');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000107","role":"authenticated"}';
select throws_ok($$select * from public.get_stock_status('b2b10000-0000-4000-8000-000000000001')$$,
  '42501', null, 'B127 temoin: le proprietaire d un AUTRE restaurant reste refuse');
reset role;

-- ===========================================================================
-- B123: restock_order
-- ===========================================================================
insert into public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id)
values ('b2b10000-0000-4000-8000-000000000001', 'b2b10000-0000-4000-8000-000000000602', 'order_destock', -2,
        'b2b10000-0000-4000-8000-000000000304');
update public.ingredients set current_stock = current_stock - 2 where id = 'b2b10000-0000-4000-8000-000000000602';
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select is(public.restock_order('b2b10000-0000-4000-8000-000000000304', 'b2b10000-0000-4000-8000-000000000001'), 1,
  'B123 temoin: la premiere annulation rend le stock');
select is(public.restock_order('b2b10000-0000-4000-8000-000000000304', 'b2b10000-0000-4000-8000-000000000001'), 0,
  'B123: la seconde ne rend rien');
reset role;
select is((select current_stock from public.ingredients where id = 'b2b10000-0000-4000-8000-000000000602'), 9.000::numeric,
  'B123: le stock revient une seule fois (effet)');
select ok(position('restock_order:' in pg_get_functiondef('public.restock_order(uuid,uuid,uuid)'::regprocedure)) > 0
  and position('pg_advisory_xact_lock' in pg_get_functiondef('public.restock_order(uuid,uuid,uuid)'::regprocedure)) > 0,
  'B123: verrou par commande en tete de restock_order (concurrence prouvee par essai a deux sessions, voir le rapport)');

-- ===========================================================================
-- B122 et B133: tables
-- ===========================================================================
insert into public.venues (id, tenant_id, slug, name) values
  ('b2b10000-0000-4000-8000-000000000701', 'b2b10000-0000-4000-8000-000000000001', 'b2b1-salle', 'Salle');
insert into public.zones (id, venue_id, tenant_id, name, prefix) values
  ('b2b10000-0000-4000-8000-000000000711', 'b2b10000-0000-4000-8000-000000000701', 'b2b10000-0000-4000-8000-000000000001', 'Terrasse', 'TER');
-- Etat ANCIEN (cree avant la garde): la table TER-2 porte le nom "TER-1".
alter table public.tables disable trigger trg_tables_nom_pas_numero_autre;
insert into public.tables (id, zone_id, tenant_id, table_number, display_name) values
  -- Ordre d'insertion choisi pour que l'ancienne recherche (sans ORDER BY)
  -- tombe sur la mauvaise table avec le plan mesure (jointure par hachage).
  ('b2b10000-0000-4000-8000-000000000721', 'b2b10000-0000-4000-8000-000000000711', 'b2b10000-0000-4000-8000-000000000001', 'TER-1', 'Terrasse 1'),
  ('b2b10000-0000-4000-8000-000000000722', 'b2b10000-0000-4000-8000-000000000711', 'b2b10000-0000-4000-8000-000000000001', 'TER-2', 'TER-1'),
  ('b2b10000-0000-4000-8000-000000000723', 'b2b10000-0000-4000-8000-000000000711', 'b2b10000-0000-4000-8000-000000000001', 'TER-3', 'Fond');
-- Seconde paire, inseree dans l'ORDRE INVERSE (le faux homonyme d'abord).
insert into public.tables (id, zone_id, tenant_id, table_number, display_name) values
  ('b2b10000-0000-4000-8000-000000000732', 'b2b10000-0000-4000-8000-000000000711', 'b2b10000-0000-4000-8000-000000000001', 'BAR-2', 'BAR-1'),
  ('b2b10000-0000-4000-8000-000000000731', 'b2b10000-0000-4000-8000-000000000711', 'b2b10000-0000-4000-8000-000000000001', 'BAR-1', 'Comptoir');
alter table public.tables enable trigger trg_tables_nom_pas_numero_autre;
insert into public.tables (id, zone_id, tenant_id, table_number, display_name) values
  ('b2b10000-0000-4000-8000-000000000724', 'b2b10000-0000-4000-8000-000000000711', 'b2b10000-0000-4000-8000-000000000001', 'TER-4', 'Bar');

set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select set_config('b2b1.qr1', public.create_order_with_items(
  p_tenant_id => 'b2b10000-0000-4000-8000-000000000001', p_order_number => 'B2B1-QR1', p_total => 1000,
  p_table_number => 'TER-1', p_display_currency => 'XOF')->>'orderId', true);
select set_config('b2b1.qr3', public.create_order_with_items(
  p_tenant_id => 'b2b10000-0000-4000-8000-000000000001', p_order_number => 'B2B1-QR3', p_total => 1000,
  p_table_number => 'BAR-1', p_display_currency => 'XOF', p_service_type => 'takeaway')->>'orderId', true);
select set_config('b2b1.qr2', public.create_order_with_items(
  p_tenant_id => 'b2b10000-0000-4000-8000-000000000001', p_order_number => 'B2B1-QR2', p_total => 1000,
  p_table_number => 'Fond', p_display_currency => 'XOF', p_service_type => 'takeaway')->>'orderId', true);
reset role;
select is((select table_id from public.orders where id = current_setting('b2b1.qr1')::uuid),
  'b2b10000-0000-4000-8000-000000000721'::uuid,
  'B122: le QR de TER-1 rattache la commande a la table numero TER-1, pas a celle nommee "TER-1" (avant: aleatoire)');
select is((select table_id from public.orders where id = current_setting('b2b1.qr3')::uuid),
  'b2b10000-0000-4000-8000-000000000731'::uuid,
  'B122: seconde paire inseree dans l ordre inverse: BAR-1 va encore a la table numero BAR-1');
select ok(position('ORDER BY (t.table_number = p_table_number) DESC, t.table_number, t.id'
                   in pg_get_functiondef('public.create_order_with_items(uuid,text,bigint,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,uuid,uuid,text,text,jsonb,uuid)'::regprocedure)) > 0,
  'B122: la recherche de table a un ordre total, le numero d abord (verification du corps, independante du plan)');
select is((select table_id from public.orders where id = current_setting('b2b1.qr2')::uuid),
  'b2b10000-0000-4000-8000-000000000723'::uuid,
  'B122 temoin: a defaut de numero, le nom affiche trouve encore la table');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000102","role":"authenticated"}';
select throws_ok(
  $$update public.tables set display_name = 'TER-1' where id = 'b2b10000-0000-4000-8000-000000000723'$$,
  '23505', null, 'B122: renommer une table avec le numero d une autre est refuse (avant: accepte)');
select lives_ok(
  $$update public.tables set display_name = 'Coin calme' where id = 'b2b10000-0000-4000-8000-000000000723'$$,
  'B122 temoin: un autre nom passe');
select lives_ok(
  $$update public.tables set display_name = 'TER-3' where id = 'b2b10000-0000-4000-8000-000000000723'$$,
  'B122 temoin: une table peut porter son propre numero comme nom');
select throws_ok(
  $$update public.tables set table_number = 'Terrasse 1' where id = 'b2b10000-0000-4000-8000-000000000724'$$,
  '23505', null, 'B122: changer un numero pour qu il egale le nom d une autre table est refuse (sens inverse)');

-- B133
update public.orders set service_type = 'dine_in', table_number = 'TER-1'
 where id = 'b2b10000-0000-4000-8000-000000000303';
select throws_ok(
  $$select public.reassign_order_table('b2b10000-0000-4000-8000-000000000303', 'b2b10000-0000-4000-8000-000000000001', 'ZZ-99')$$,
  'P0002', 'Destination table not found', 'B133: deplacer vers une table inexistante est refuse (avant: session fantome)');
select lives_ok(
  $$select public.reassign_order_table('b2b10000-0000-4000-8000-000000000303', 'b2b10000-0000-4000-8000-000000000001', 'TER-3')$$,
  'B133 temoin: deplacer vers une table du restaurant passe');
reset role;
select is((select table_number from public.orders where id = 'b2b10000-0000-4000-8000-000000000303'), 'TER-3',
  'B133 temoin: la commande est sur TER-3 (effet)');
select ok(not exists (select 1 from public.table_sessions
                       where tenant_id = 'b2b10000-0000-4000-8000-000000000001' and table_number = 'ZZ-99'),
  'B133: aucune session ouverte pour la table inexistante');

-- ===========================================================================
-- B119: vitrine d un autre restaurant, visiteur connecte
-- ===========================================================================
insert into public.item_modifiers (tenant_id, menu_item_id, name) values
  ('b2b10000-0000-4000-8000-000000000002', 'b2b10000-0000-4000-8000-000000000503', 'Supplement piment'),
  ('b2b10000-0000-4000-8000-000000000002', 'b2b10000-0000-4000-8000-000000000504', 'Supplement cache');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000105","role":"authenticated"}';
select is((select count(*)::int from public.item_modifiers where menu_item_id = 'b2b10000-0000-4000-8000-000000000503'), 1,
  'B119: un employe de T1, connecte, voit le supplement d un plat de la vitrine de T2 (avant: 0)');
select is((select count(*)::int from public.item_modifiers where menu_item_id = 'b2b10000-0000-4000-8000-000000000504'), 0,
  'B119: il ne voit pas celui d un plat indisponible (meme regle que l anonyme)');
reset role;
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select is((select count(*)::int from public.item_modifiers where menu_item_id = 'b2b10000-0000-4000-8000-000000000503'), 1,
  'B119 temoin: le visiteur anonyme voit le meme supplement');
reset role;

-- ===========================================================================
-- B135: deplacement d un etablissement
-- ===========================================================================
-- T2 (business) a 2 etablissements actifs; T3 (starter) en a 1 (plafond 1).
insert into public.venues (id, tenant_id, slug, name) values
  ('b2b10000-0000-4000-8000-000000000801', 'b2b10000-0000-4000-8000-000000000002', 'b2b1-deux-a', 'Deux A'),
  ('b2b10000-0000-4000-8000-000000000802', 'b2b10000-0000-4000-8000-000000000002', 'b2b1-deux-b', 'Deux B'),
  ('b2b10000-0000-4000-8000-000000000803', 'b2b10000-0000-4000-8000-000000000003', 'b2b1-trois-a', 'Trois A');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000107","role":"authenticated"}';
select throws_ok(
  $$update public.venues set tenant_id = 'b2b10000-0000-4000-8000-000000000003' where id = 'b2b10000-0000-4000-8000-000000000802'$$,
  '23514', null, 'B135: T3 (starter, plafond 1) ne recoit pas un second etablissement actif (avant: accepte)');
select throws_ok(
  $$update public.venues set tenant_id = 'b2b10000-0000-4000-8000-000000000002' where id = 'b2b10000-0000-4000-8000-000000000803'$$,
  '23514', null, 'B135: T3 ne perd pas son unique etablissement actif en le deplacant (avant: accepte)');
reset role;
select is((select count(*)::int from public.venues where tenant_id = 'b2b10000-0000-4000-8000-000000000003' and is_active), 1,
  'B135: T3 garde exactement un etablissement actif (effet)');
insert into public.venues (id, tenant_id, slug, name, is_active) values
  ('b2b10000-0000-4000-8000-000000000804', 'b2b10000-0000-4000-8000-000000000003', 'b2b1-trois-b', 'Trois B', false);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000107","role":"authenticated"}';
select lives_ok(
  $$update public.venues set tenant_id = 'b2b10000-0000-4000-8000-000000000002' where id = 'b2b10000-0000-4000-8000-000000000804'$$,
  'B135 temoin: un etablissement inactif, sans carte, change de restaurant');
reset role;

-- ===========================================================================
-- B76: remise a zero complete
-- ===========================================================================
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select lives_ok(
  $$select public.reset_tenant_data('b2b10000-0000-4000-8000-000000000001', 'all')$$,
  'B76: la remise a zero complete s execute (avant: relation inventory_movements does not exist)');
reset role;
select is((select count(*)::int from public.orders where tenant_id = 'b2b10000-0000-4000-8000-000000000001'), 0,
  'B76: les commandes du restaurant sont supprimees (effet)');
select is(
  (select count(*)::int from public.stock_movements
    where tenant_id = 'b2b10000-0000-4000-8000-000000000001' and movement_type <> 'opening'), 0,
  'B76: les mouvements de stock sont supprimes (effet)');
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select is((select count(*)::int from public.verify_stock_ledger('b2b10000-0000-4000-8000-000000000001')), 0,
  'B76: le registre repart du stock actuel, aucun ecart (lignes d ouverture)');
reset role;
select is((select count(*)::int from public.stock_movements where tenant_id = 'b2b10000-0000-4000-8000-000000000002'), 0,
  'B76 temoin: rien n est touche chez un autre restaurant');

-- ===========================================================================
-- B124: nom unique au passage en etabli
-- ===========================================================================
insert into public.restaurant_groups (id, owner_user_id, name) values
  ('b2b10000-0000-4000-8000-000000000a01', 'b2b10000-0000-4000-8000-000000000101', 'G1'),
  ('b2b10000-0000-4000-8000-000000000a02', 'b2b10000-0000-4000-8000-000000000107', 'G2');
insert into public.tenants (id, slug, name, is_active, group_id, onboarding_completed) values
  ('b2b10000-0000-4000-8000-000000000b01', 'b2b1-baobab-1', 'Le Baobab', true, 'b2b10000-0000-4000-8000-000000000a01', false),
  ('b2b10000-0000-4000-8000-000000000b02', 'b2b1-baobab-2', 'le baobab ', true, 'b2b10000-0000-4000-8000-000000000a02', false);
select lives_ok(
  $$update public.tenants set onboarding_completed = true where id = 'b2b10000-0000-4000-8000-000000000b01'$$,
  'B124 temoin: le premier qui termine devient etabli');
select throws_ok(
  $$update public.tenants set onboarding_completed = true where id = 'b2b10000-0000-4000-8000-000000000b02'$$,
  '23505', 'tenant_name_cross_group_conflict', 'B124: le second ne devient pas etabli avec le meme nom (avant: accepte)');
select lives_ok(
  $$update public.tenants set tax_rate = 18 where id = 'b2b10000-0000-4000-8000-000000000b02'$$,
  'B124 temoin: une mise a jour sans rapport reste possible');
select lives_ok(
  $$update public.tenants set deleted_at = now() where id = 'b2b10000-0000-4000-8000-000000000b02'$$,
  'B124 temoin: fermer un restaurant au nom en conflit reste possible');

-- ===========================================================================
-- B125: lecture publique des annonces actives
-- ===========================================================================
insert into public.announcements (tenant_id, title, is_active) values
  ('b2b10000-0000-4000-8000-000000000002', 'Annonce active', true),
  ('b2b10000-0000-4000-8000-000000000002', 'Annonce inactive', false);
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select is((select count(*)::int from public.announcements where tenant_id = 'b2b10000-0000-4000-8000-000000000002'), 1,
  'B125: un visiteur lit l annonce active, pas l inactive (politique versionnee)');
reset role;

-- ===========================================================================
-- B132: code mort supprime
-- ===========================================================================
select hasnt_function('public', 'get_daily_comps', 'B132: get_daily_comps n existe plus');
select has_column('public', 'tenants', 'banner_url', 'B132: tenants.banner_url est gardee (un restaurant a une banniere)');

-- ===========================================================================
-- B113 / B114: espaces de fichiers
-- ===========================================================================
-- Le banc n'a pas de schema storage: schema minimal (les colonnes utiles de
-- Supabase Storage), puis la migration est rejouee telle quelle.
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid);
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
insert into storage.buckets (id, name, public) values ('qr-designs', 'qr-designs', true)
on conflict (id) do nothing;
\ir ../../migrations/20261124151100_espaces_fichiers_sons_et_qr.sql

select is((select file_size_limit::text || '/' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'tenant-sounds'),
  '2097152/audio/mpeg,audio/wav,audio/ogg,audio/mp3', 'B113: l espace tenant-sounds existe, borne a 2 Mo et aux types audio');
select is((select file_size_limit::text || '/' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'qr-designs'),
  '5242880/image/jpeg,image/png,image/webp', 'B114: qr-designs borne a 5 Mo et aux trois types d image');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000105","role":"authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('tenant-sounds', 'b2b10000-0000-4000-8000-000000000001/custom-notification.mp3')$$,
  '42501', null, 'B113: un serveur ne remplace pas le son d alerte du restaurant (avant: accepte)');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000101","role":"authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('tenant-sounds', 'b2b10000-0000-4000-8000-000000000001/custom-notification.mp3')$$,
  'B113 temoin: le proprietaire (settings.edit) depose le son');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('tenant-sounds', 'b2b10000-0000-4000-8000-000000000002/custom-notification.mp3')$$,
  '42501', null, 'B113: personne ne depose dans le dossier d un autre restaurant');
set local "request.jwt.claims" = '{"sub":"b2b10000-0000-4000-8000-000000000105","role":"authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'tenant-sounds'), 1,
  'B113: un membre vivant lit le son de son restaurant (relecture de l envoi avec upsert)');
reset role;

select * from finish();
rollback;

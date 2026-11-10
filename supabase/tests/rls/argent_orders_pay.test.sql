-- L'ARGENT EST UNE PERMISSION A PART: `orders.pay` (20261109200000).
--
-- Decision du proprietaire (2026-11-09): le serveur fait avancer les commandes
-- et le chef suit la cuisine, mais ni l'un ni l'autre ne touche a l'argent. Le
-- caissier encaisse. Rembourser par la RPC record_refund exige aussi ce droit.
-- Ajouter un article, en changer le prix ou la quantite, ou sortir une commande
-- de la note d'une table aussi (section 7).
--
-- Mesure avant correction: un chef enregistrait un paiement (seul
-- `orders.manage` etait demande). Rendre `orders.manage` au serveur, sans la
-- garde, lui aurait ouvert la meme porte par l'API directe.
--
-- MESURE ANTI-FAUX-VERT: chaque succes attendu est verifie par l'ETAT relu,
-- et chaque refus par le code 42501, pas par une ligne masquee.
--
-- Execution: scripts/run-pgtap.sh --local (ou la CI .github/workflows/pgtap.yml)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(53);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur.pay@test.local', 'x', now(), now()),
  ('f2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'chef.pay@test.local', 'x', now(), now()),
  ('f3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier.pay@test.local', 'x', now(), now()),
  ('f4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier.retire@test.local', 'x', now(), now()),
  ('f7777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant.pay@test.local', 'x', now(), now()),
  ('f8888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant.retire@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('f5555555-5555-4555-8555-555555555555', 'tenant-orders-pay', 'Tenant Pay', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  (gen_random_uuid(), 'f5555555-5555-4555-8555-555555555555',
   'f1111111-1111-1111-1111-111111111111', 'serveur.pay@test.local', 'waiter', true, null),
  (gen_random_uuid(), 'f5555555-5555-4555-8555-555555555555',
   'f2222222-2222-2222-2222-222222222222', 'chef.pay@test.local', 'chef', true, null),
  (gen_random_uuid(), 'f5555555-5555-4555-8555-555555555555',
   'f3333333-3333-3333-3333-333333333333', 'caissier.pay@test.local', 'cashier', true, null),
  -- Caissier a qui le proprietaire a RETIRE l'argent: la surcharge tranche.
  (gen_random_uuid(), 'f5555555-5555-4555-8555-555555555555',
   'f4444444-4444-4444-4444-444444444444', 'caissier.retire@test.local', 'cashier', true,
   '{"orders.pay": false}'::jsonb),
  (gen_random_uuid(), 'f5555555-5555-4555-8555-555555555555',
   'f7777777-7777-7777-7777-777777777777', 'gerant.pay@test.local', 'manager', true, null),
  -- Gerant a qui le proprietaire a RETIRE l'argent: il garde orders.manage.
  (gen_random_uuid(), 'f5555555-5555-4555-8555-555555555555',
   'f8888888-8888-8888-8888-888888888888', 'gerant.retire@test.local', 'manager', true,
   '{"orders.pay": false}'::jsonb);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status)
values
  ('f6000000-0000-4000-8000-000000000001', 'f5555555-5555-4555-8555-555555555555',
   'CMD-PAY-1', 5000, 5000, 'ready', 'pending'),
  ('f6000000-0000-4000-8000-000000000002', 'f5555555-5555-4555-8555-555555555555',
   'CMD-PAY-2', 3000, 3000, 'preparing', 'pending');

-- Un coupon epuise (section 8).
insert into public.coupons (id, tenant_id, code, discount_type, discount_value, max_uses, current_uses)
values ('f6600000-0000-4000-8000-000000000001', 'f5555555-5555-4555-8555-555555555555',
        'EPUISE', 'percentage', 50, 1, 1);

-- Une table ouverte et sa commande impayee (section 7).
insert into public.table_sessions (id, tenant_id, table_number)
values ('f6500000-0000-4000-8000-000000000001', 'f5555555-5555-4555-8555-555555555555', 'T1');
insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status,
                           session_id, table_number)
values ('f6000000-0000-4000-8000-000000000003', 'f5555555-5555-4555-8555-555555555555',
        'CMD-PAY-3', 4000, 4000, 'preparing', 'pending',
        'f6500000-0000-4000-8000-000000000001', 'T1');

insert into public.house_accounts (id, tenant_id, name)
values ('f6400000-0000-4000-8000-000000000001', 'f5555555-5555-4555-8555-555555555555',
        'Ardoise client');

insert into public.categories (id, tenant_id, name)
values ('f6100000-0000-4000-8000-000000000001', 'f5555555-5555-4555-8555-555555555555', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price)
values ('f6200000-0000-4000-8000-000000000001', 'f5555555-5555-4555-8555-555555555555',
        'f6100000-0000-4000-8000-000000000001', 'Poulet DG', 5000);
insert into public.order_items (id, tenant_id, order_id, menu_item_id, quantity, price_at_order, item_name)
values ('f6300000-0000-4000-8000-000000000001', 'f5555555-5555-4555-8555-555555555555',
        'f6000000-0000-4000-8000-000000000001', 'f6200000-0000-4000-8000-000000000001',
        1, 5000, 'Poulet DG');

set local role authenticated;

-- ===========================================================================
-- 1. LE SERVEUR: il fait avancer, il n'encaisse pas, il n'annule pas (7)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';

select ok(
  public.has_tenant_write_permission('f5555555-5555-4555-8555-555555555555', 'orders.manage'),
  'matrice: un serveur detient orders.manage par defaut'
);
select ok(
  NOT public.has_tenant_write_permission('f5555555-5555-4555-8555-555555555555', 'orders.pay'),
  'matrice: un serveur ne detient PAS orders.pay'
);

select lives_ok(
  $$update public.orders set status = 'delivered'
    where id = 'f6000000-0000-4000-8000-000000000001'$$,
  'serveur: marque une commande servie'
);
select is(
  (select status from public.orders where id = 'f6000000-0000-4000-8000-000000000001'),
  'delivered',
  'serveur: la commande a REELLEMENT avance'
);

select throws_ok(
  $$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
    where id = 'f6000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'serveur: ne marque PAS une commande payee'
);
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('f5555555-5555-4555-8555-555555555555',
            'f6000000-0000-4000-8000-000000000001', 5000, 'cash', 'completed')$$,
  '42501',
  null,
  'serveur: n ecrit PAS au ledger des paiements'
);
select throws_ok(
  $$update public.orders set status = 'cancelled'
    where id = 'f6000000-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'serveur: n annule PAS une commande (note impayee)'
);

-- Vider les articles d'une commande = detruire la note: autorite argent.
-- Un DELETE refuse par la RLS ne leve rien: on relit l'etat en role postgres.
delete from public.order_items where id = 'f6300000-0000-4000-8000-000000000001';
reset role;
select is(
  (select count(*)::int from public.order_items where id = 'f6300000-0000-4000-8000-000000000001'),
  1,
  'serveur: ne supprime PAS les articles d une commande (API directe)'
);
set local role authenticated;

-- ===========================================================================
-- 2. LE CHEF: la cuisine, pas l'argent (5)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';

select lives_ok(
  $$update public.orders set status = 'ready'
    where id = 'f6000000-0000-4000-8000-000000000002'$$,
  'chef: fait avancer une commande'
);
select is(
  (select status from public.orders where id = 'f6000000-0000-4000-8000-000000000002'),
  'ready',
  'chef: la commande a REELLEMENT avance'
);
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('f5555555-5555-4555-8555-555555555555',
            'f6000000-0000-4000-8000-000000000002', 3000, 'cash', 'completed')$$,
  '42501',
  null,
  'chef: n encaisse PAS (le chemin mesure avant correction)'
);
select throws_ok(
  $$update public.orders set tip_amount = 500
    where id = 'f6000000-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'chef: ne pose PAS de pourboire'
);
select throws_ok(
  $$update public.orders set status = 'cancelled'
    where id = 'f6000000-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'chef: n annule PAS une commande'
);

delete from public.order_items where id = 'f6300000-0000-4000-8000-000000000001';
reset role;
select is(
  (select count(*)::int from public.order_items where id = 'f6300000-0000-4000-8000-000000000001'),
  1,
  'chef: ne supprime PAS les articles d une commande (API directe)'
);
set local role authenticated;

-- ===========================================================================
-- 3. LE CAISSIER: il encaisse (4)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333"}';

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('f5555555-5555-4555-8555-555555555555',
            'f6000000-0000-4000-8000-000000000001', 5000, 'cash', 'completed')$$,
  'caissier: encaisse un tender'
);
select lives_ok(
  $$update public.orders set payment_status = 'paid', payment_method = 'cash', paid_at = now()
    where id = 'f6000000-0000-4000-8000-000000000001'$$,
  'caissier: marque la commande payee'
);
select is(
  (select payment_status::text from public.orders
    where id = 'f6000000-0000-4000-8000-000000000001'),
  'paid',
  'caissier: la commande est REELLEMENT payee'
);
select lives_ok(
  $$update public.orders set status = 'cancelled'
    where id = 'f6000000-0000-4000-8000-000000000002'$$,
  'caissier: annule une commande impayee'
);

-- ===========================================================================
-- 4. LE PROPRIETAIRE RETIRE L'ARGENT A UN CAISSIER: la base suit (3)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"f4444444-4444-4444-4444-444444444444"}';

select ok(
  NOT public.has_tenant_write_permission('f5555555-5555-4555-8555-555555555555', 'orders.pay'),
  'retrait: un caissier a qui on retire orders.pay ne le detient plus'
);
select ok(
  public.has_tenant_write_permission('f5555555-5555-4555-8555-555555555555', 'orders.manage'),
  'retrait: il garde orders.manage (il fait toujours avancer les commandes)'
);
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('f5555555-5555-4555-8555-555555555555',
            'f6000000-0000-4000-8000-000000000001', 100, 'cash', 'completed')$$,
  '42501',
  null,
  'retrait: il n encaisse plus'
);

-- ===========================================================================
-- 5. record_refund (SECURITY DEFINER, hors RLS): rembourser = orders.pay (3)
-- ===========================================================================
-- La commande 1 porte un tender de 5000 (section 3).
set local request.jwt.claims = '{"sub":"f8888888-8888-8888-8888-888888888888"}';

select throws_ok(
  $$select public.record_refund('f6000000-0000-4000-8000-000000000001',
      'f5555555-5555-4555-8555-555555555555', 1000, 'cash')$$,
  '42501',
  null,
  'retrait: un gerant sans orders.pay ne rembourse PAS par la RPC directe'
);

set local request.jwt.claims = '{"sub":"f7777777-7777-7777-7777-777777777777"}';

select lives_ok(
  $$select public.record_refund('f6000000-0000-4000-8000-000000000001',
      'f5555555-5555-4555-8555-555555555555', 1000, 'cash')$$,
  'gerant: rembourse (orders.pay par defaut)'
);
select is(
  (select count(*)::int from public.payments
    where order_id = 'f6000000-0000-4000-8000-000000000001' and status = 'refunded'),
  1,
  'remboursement: UNE seule ligne, celle du gerant habilite'
);

-- ===========================================================================
-- 6. CREER une commande sur une ardoise, avec pourboire (7)
-- ===========================================================================
-- La policy INSERT ne bloquait que l'offert et le declencheur de la section 4
-- ne joue qu'a l'UPDATE: avec `orders.manage`, le serveur creait une commande
-- sur l'ardoise de n'importe quel client. Un refus RLS a l'INSERT leve 42501;
-- on RELIT en plus la table en role postgres.
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';
select throws_ok(
  $$insert into public.orders (id, tenant_id, order_number, subtotal, total, status,
      payment_status, house_account_id, tip_amount)
    values ('f6000000-0000-4000-8000-000000000011', 'f5555555-5555-4555-8555-555555555555',
            'CMD-PAY-11', 90000, 90000, 'pending', 'pending',
            'f6400000-0000-4000-8000-000000000001', 5000)$$,
  '42501',
  null,
  'serveur: ne cree PAS de commande sur l ardoise d un client (API directe)'
);

set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$insert into public.orders (id, tenant_id, order_number, subtotal, total, status,
      payment_status, house_account_id, tip_amount)
    values ('f6000000-0000-4000-8000-000000000012', 'f5555555-5555-4555-8555-555555555555',
            'CMD-PAY-12', 90000, 90000, 'pending', 'pending',
            'f6400000-0000-4000-8000-000000000001', 5000)$$,
  '42501',
  null,
  'chef: ne cree PAS de commande sur l ardoise d un client (API directe)'
);

-- Temoin positif: le caissier detient orders.pay, il garde ce geste.
set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333"}';
select lives_ok(
  $$insert into public.orders (id, tenant_id, order_number, subtotal, total, status,
      payment_status, house_account_id, tip_amount)
    values ('f6000000-0000-4000-8000-000000000013', 'f5555555-5555-4555-8555-555555555555',
            'CMD-PAY-13', 2000, 2000, 'pending', 'pending',
            'f6400000-0000-4000-8000-000000000001', 500)$$,
  'caissier: cree une commande sur une ardoise'
);

reset role;
select is(
  (select count(*)::int from public.orders where id = 'f6000000-0000-4000-8000-000000000011'),
  0,
  'serveur: aucune commande ecrite (relu)'
);
select is(
  (select count(*)::int from public.orders where id = 'f6000000-0000-4000-8000-000000000012'),
  0,
  'chef: aucune commande ecrite (relu)'
);
select is(
  (select coalesce(sum(o.total + coalesce(o.tip_amount, 0)), 0)::int from public.orders o
    where o.house_account_id = 'f6400000-0000-4000-8000-000000000001'),
  2500,
  'ardoise: seule la commande du caissier compte dans la dette du client'
);
select is(
  (select house_account_id from public.orders where id = 'f6000000-0000-4000-8000-000000000013'),
  'f6400000-0000-4000-8000-000000000001'::uuid,
  'caissier: la commande est REELLEMENT sur l ardoise (la garde ne bloque pas tout)'
);

-- ===========================================================================
-- 7. LES ARTICLES ET LA NOTE DE TABLE (16)
-- ===========================================================================
-- Mesure avant correction: avec `orders.manage`, serveur et chef ajoutaient
-- par l'API directe un article a une commande PAYEE (le total ne bouge pas, la
-- cuisine prepare, le stock part), reecrivaient `quantity` et
-- `price_at_order` (le chiffre d'affaires par plat en depend), et sortaient
-- une commande impayee de la note d'une table. La commande 1 est payee
-- (section 3).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$insert into public.order_items (id, tenant_id, order_id, menu_item_id, quantity,
      price_at_order, item_name)
    values ('f6300000-0000-4000-8000-000000000011', 'f5555555-5555-4555-8555-555555555555',
            'f6000000-0000-4000-8000-000000000001', 'f6200000-0000-4000-8000-000000000001',
            3, 5000, 'Poulet DG')$$,
  '42501',
  null,
  'serveur: n ajoute PAS d article a une commande payee (API directe)'
);
select throws_ok(
  $$update public.order_items set price_at_order = 1
    where id = 'f6300000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'serveur: ne reecrit PAS le prix d un article'
);
select throws_ok(
  $$update public.order_items set quantity = 9
    where id = 'f6300000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'serveur: ne reecrit PAS la quantite d un article'
);
select lives_ok(
  $$update public.order_items set item_status = 'served'
    where id = 'f6300000-0000-4000-8000-000000000001'$$,
  'serveur: marque un article servi (suivi de cuisine)'
);
select lives_ok(
  $$update public.order_items set held = true, course = 'main'
    where id = 'f6300000-0000-4000-8000-000000000001'$$,
  'serveur: retient un plat et change son service (suivi de cuisine)'
);
select throws_ok(
  $$update public.orders set session_id = null
    where id = 'f6000000-0000-4000-8000-000000000003'$$,
  '42501',
  null,
  'serveur: ne sort PAS une commande impayee de la note de sa table'
);
select throws_ok(
  $$update public.orders set table_number = 'T9'
    where id = 'f6000000-0000-4000-8000-000000000003'$$,
  '42501',
  null,
  'serveur: ne change PAS le numero de table d une commande (API directe)'
);
select throws_ok(
  $$update public.orders set wave_checkout_id = 'cs_vole'
    where id = 'f6000000-0000-4000-8000-000000000003'$$,
  '42501',
  null,
  'serveur: ne reecrit PAS le lien de paiement mobile (liste blanche)'
);
select lives_ok(
  $$update public.orders set server_id = null
    where id = 'f6000000-0000-4000-8000-000000000003'$$,
  'serveur: prend ou rend une commande (server_id reste permis)'
);

set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$insert into public.order_items (id, tenant_id, order_id, menu_item_id, quantity,
      price_at_order, item_name)
    values ('f6300000-0000-4000-8000-000000000012', 'f5555555-5555-4555-8555-555555555555',
            'f6000000-0000-4000-8000-000000000001', 'f6200000-0000-4000-8000-000000000001',
            3, 5000, 'Poulet DG')$$,
  '42501',
  null,
  'chef: n ajoute PAS d article a une commande payee (API directe)'
);
select throws_ok(
  $$update public.order_items set quantity = 9
    where id = 'f6300000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'chef: ne reecrit PAS la quantite d un article'
);
select throws_ok(
  $$update public.orders set session_id = null
    where id = 'f6000000-0000-4000-8000-000000000003'$$,
  '42501',
  null,
  'chef: ne sort PAS une commande impayee de la note de sa table'
);

-- Temoins positifs: le caissier detient orders.pay, il garde ces gestes.
set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333"}';
select lives_ok(
  $$insert into public.order_items (id, tenant_id, order_id, menu_item_id, quantity,
      price_at_order, item_name)
    values ('f6300000-0000-4000-8000-000000000013', 'f5555555-5555-4555-8555-555555555555',
            'f6000000-0000-4000-8000-000000000001', 'f6200000-0000-4000-8000-000000000001',
            1, 5000, 'Poulet DG')$$,
  'caissier: ajoute un article'
);
select lives_ok(
  $$update public.order_items set quantity = 2
    where id = 'f6300000-0000-4000-8000-000000000001'$$,
  'caissier: corrige la quantite d un article'
);

reset role;
select is(
  (select array_agg(id::text order by id) from public.order_items
    where order_id = 'f6000000-0000-4000-8000-000000000001'),
  array['f6300000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000013'],
  'articles: seuls l original et celui du caissier existent (relu)'
);
select is(
  (select quantity::text || '/' || price_at_order::text from public.order_items
    where id = 'f6300000-0000-4000-8000-000000000001'),
  '2/5000',
  'article: quantite du caissier, prix intact (relu)'
);
select is(
  (select item_status::text || '/' || held::text || '/' || course::text from public.order_items
    where id = 'f6300000-0000-4000-8000-000000000001'),
  'served/true/main',
  'article: le suivi de cuisine du serveur a REELLEMENT ete ecrit (relu)'
);
select is(
  (select coalesce(session_id::text, 'NULL') || '/' || coalesce(table_number, 'NULL')
    from public.orders where id = 'f6000000-0000-4000-8000-000000000003'),
  'f6500000-0000-4000-8000-000000000001/T1',
  'note de table: la commande impayee y est toujours (relu)'
);

-- ===========================================================================
-- 8. RENDRE UNE UTILISATION A UN COUPON EPUISE (4)
-- ===========================================================================
-- unclaim_coupon_usage est SECURITY DEFINER: n'importe quel membre le
-- rappelait en direct et rendait un coupon epuise reutilisable comme remise.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';
select throws_ok(
  $$select public.unclaim_coupon_usage('f6600000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'serveur: ne rend PAS d utilisation a un coupon epuise (RPC directe)'
);
set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$select public.unclaim_coupon_usage('f6600000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'chef: ne rend PAS d utilisation a un coupon epuise (RPC directe)'
);
reset role;
select is(
  (select current_uses from public.coupons where id = 'f6600000-0000-4000-8000-000000000001'),
  1,
  'coupon: toujours epuise (relu)'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333"}';
select lives_ok(
  $$select public.unclaim_coupon_usage('f6600000-0000-4000-8000-000000000001')$$,
  'caissier: libere le coupon (annulation d une commande)'
);
reset role;

select * from finish();
rollback;

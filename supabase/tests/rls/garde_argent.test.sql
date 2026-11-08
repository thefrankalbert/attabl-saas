-- LA CAISSE REVIENT AU CAISSIER, ET LES MONTANTS DEVIENNENT INTOUCHABLES.
--
-- POURQUOI CE TEST EXISTE, ET POURQUOI IL A CHANGE DE PREMISE DEUX FOIS.
--
-- 1. `20261107120000` a exige `orders.manage` pour inserer dans `payments`.
--    Le defaut de la base n'accordait `orders.manage` qu'a admin/manager,
--    alors que la matrice du produit (DEFAULT_PERMISSIONS) l'accorde AUSSI au
--    caissier et au chef. Resultat MESURE en production: un caissier encaissait
--    depuis l'ecran POS (qui ecrit avec le client admin, donc hors RLS) mais
--    etait refuse en encaissant depuis la note (qui ecrit avec son jeton, donc
--    sous RLS). La caisse etait a moitie cassee.
--
-- 2. Une version precedente de ce test affirmait l'inverse - qu'un caissier
--    delegue DOIT etre refuse - parce que la migration d'alors retirait
--    `orders.manage` de la delegation, faute de savoir fermer le chemin des
--    montards. Cette migration n'a jamais ete appliquee et contredisait le
--    produit: `src/lib/admin-roles.ts` documente qu'un caissier detient
--    `orders.manage`, et qu'une garde plus etroite que la matrice est un defaut
--    deja vecu. Elle a ete supprimee.
--
-- CE QUE `20261107210000` FAIT, ET QUE CE TEST PROUVE:
--   1. le defaut de la base EGALE la matrice du produit, permission par
--      permission - dans les deux sens, car la base etait aussi PLUS
--      permissive que l'app sur `settings.edit` (un gerant pouvait ecrire les
--      reglages par l'API alors que l'app le lui refuse);
--   2. la caisse du caissier fonctionne SANS aucune delegation: avancer une
--      commande, encaisser un tender positif, marquer paye;
--   3. mais les QUATRE colonnes de montants ne se reecrivent plus - c'est ce
--      qui remplace le resserrage abandonne, et ca ferme le chemin `total = 0`
--      qu'aucune policy ne pouvait fermer;
--   4. `tip_amount` reste ecrivable - c'est le seul montant qu'un chemin
--      applicatif modifie apres creation (`markPaid`);
--   5. les chemins de CONFIANCE restent exempts: la caisse POS (service_role)
--      et les migrations (postgres) ecrivent encore les montants. Sans cette
--      preuve, le declencheur casserait l'encaissement en production;
--   6. offrir et rembourser restent au gerant - un test qui ne verifierait que
--      les refus laisserait passer un correctif qui bloque la caisse, et un
--      test qui ne verifierait que la caisse laisserait passer la fraude.
--
-- MESURE ANTI-FAUX-VERT: chaque ecriture attendue en SUCCES est verifiee par
-- son EFFET (`is` sur la valeur resultante), jamais par le seul fait qu'elle
-- n'a pas leve. Un refus RLS par `USING` MASQUE la ligne au lieu de lever: un
-- `lives_ok` seul passerait donc a vide sur une regression.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/garde_argent.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('b1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier@test.local', 'x', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant@test.local', 'x', now(), now()),
  ('b7777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'chef@test.local', 'x', now(), now()),
  ('b9999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur@test.local', 'x', now(), now()),
  ('b8888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-limite@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('b3333333-3333-3333-3333-333333333333', 'tenant-argent', 'Tenant Argent', true);

-- Lieu de reference: `zones.venue_id` est NOT NULL. Insere ici, hors de tout
-- `set role`, pour que la creation du lieu ne soit pas elle-meme un sujet de
-- test - seule la creation de ZONE est mesuree plus bas.
insert into public.venues (id, tenant_id, slug, name)
values ('ba000000-0000-4000-8000-00000000000a', 'b3333333-3333-3333-3333-333333333333',
        'lieu-argent', 'Lieu Argent');

-- AUCUNE ligne dans `role_permissions` pour ce tenant, et aucune
-- `custom_permissions` sauf pour le gerant limite. C'est tout l'interet du
-- test: la caisse doit fonctionner sur le DEFAUT, sans qu'un proprietaire ait
-- eu a deleguer quoi que ce soit.
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b1111111-1111-1111-1111-111111111111', 'caissier@test.local', 'cashier', true, null),
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b2222222-2222-2222-2222-222222222222', 'gerant@test.local', 'manager', true, null),
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b7777777-7777-7777-7777-777777777777', 'chef@test.local', 'chef', true, null),
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b9999999-9999-9999-9999-999999999999', 'serveur@test.local', 'waiter', true, null),
  -- Gerant a qui le proprietaire a explicitement RETIRE la gestion des
  -- commandes. Temoin: la nouvelle matrice par defaut ne doit pas le faire
  -- repasser par la branche de role.
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b8888888-8888-8888-8888-888888888888', 'gerant-limite@test.local', 'manager', true,
   '{"orders.manage": false}'::jsonb);

insert into public.orders
  (id, tenant_id, order_number, subtotal, total, status, payment_status)
values ('b4444444-4444-4444-4444-444444444444', 'b3333333-3333-3333-3333-333333333333',
        'CMD-ARGENT-1', 10000, 10000, 'preparing', 'pending');

-- Commande dediee aux assertions de SUPPRESSION. Elle a sa propre ligne expres:
-- si une garde DELETE regresse, la suppression reussit, et une assertion qui
-- aurait partage la commande principale la ferait disparaitre - toutes les
-- assertions suivantes tomberaient en cascade, pour une cause qui n'est pas la
-- leur. Mesure faite: c'est exactement ce qui s'est produit a la premiere
-- ecriture de ce test.
insert into public.orders
  (id, tenant_id, order_number, subtotal, total, status, payment_status)
values ('b6666666-6666-6666-6666-666666666666', 'b3333333-3333-3333-3333-333333333333',
        'CMD-A-SUPPRIMER', 7000, 7000, 'preparing', 'pending');


-- ===========================================================================
-- 1. LA CAISSE DU CAISSIER, sur le DEFAUT, sans aucune delegation (9)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111"}';

select ok(
  public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'orders.manage'),
  'matrice: un caissier detient orders.manage PAR DEFAUT, comme dans l app'
);

select lives_ok(
  $$update public.orders set status = 'ready'
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  'caisse: un caissier fait avancer une commande'
);
select is(
  (select status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'ready',
  'caisse: la commande a REELLEMENT avance (pas un refus masque)'
);

-- LE point qui etait casse en production: encaisser depuis la note.
select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('b3333333-3333-3333-3333-333333333333',
            'b4444444-4444-4444-4444-444444444444', 10000, 'cash', 'completed')$$,
  'caisse: un caissier ENCAISSE un tender positif depuis la note'
);

-- La FORME EXACTE de `markPaid`: le pourboire s'ecrit dans le MEME UPDATE que
-- la bascule `pending -> paid`. Important, parce que la borne de la section 2
-- refuse une reecriture du pourboire sur une commande DEJA payee: si ce test
-- marquait payee d'abord puis ecrivait le pourboire ensuite, il mesurerait un
-- artefact de test au lieu du flux reel. Erreur faite, puis corrigee.
select lives_ok(
  $$update public.orders set payment_status = 'paid', tip_amount = 500
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  'caisse: un caissier marque payee EN enregistrant le pourboire, comme markPaid'
);
select is(
  (select payment_status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'paid',
  'caisse: la commande est REELLEMENT payee'
);

select ok(
  NOT public.has_tenant_money_permission('b3333333-3333-3333-3333-333333333333'),
  'separation des pouvoirs: un caissier n a AUCUNE autorite argent'
);

-- L'INSERT et le WITH CHECK levent (42501); seul un refus par USING masque.
select throws_ok(
  $$update public.orders set payment_status = 'comp', is_comp = true
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'separation des pouvoirs: un caissier n OFFRE PAS une commande'
);

select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('b3333333-3333-3333-3333-333333333333',
            'b4444444-4444-4444-4444-444444444444', -5000, 'cash', 'completed')$$,
  '42501',
  null,
  'separation des pouvoirs: un caissier ne REMBOURSE PAS'
);

-- ===========================================================================
-- 2. LES MONTANTS NE SE REECRIVENT PLUS (6)
--    C'est ce qui remplace le resserrage abandonne: le chemin `total = 0`
--    donnait l'effet economique d'un offert en contournant la garde de
--    l'offert, et aucune policy ne pouvait le fermer.
-- ===========================================================================

select throws_ok(
  $$update public.orders set total = 0
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'montants: un caissier ne met PAS total a zero'
);

select throws_ok(
  $$update public.orders set subtotal = 0
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'montants: subtotal est protege aussi'
);

select throws_ok(
  $$update public.orders set discount_amount = 9999
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'montants: une remise ne s invente pas apres coup'
);

select throws_ok(
  $$update public.orders set service_charge_amount = 9999
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'montants: le service ne se reecrit pas apres coup'
);

-- `tip_amount` DOIT rester ecrivable au moment de l'encaissement: c'est le seul
-- montant qu'un chemin applicatif modifie apres creation. Un declencheur trop
-- large casserait le pourboire. Preuve que celui-ci ne le casse pas:
select is(
  (select tip_amount from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  500::bigint,
  'montants: le POURBOIRE enregistre par l encaissement a bien porte'
);

-- Mais il ne se reecrit plus APRES: un pourboire gonfle apres encaissement est
-- de l'argent cree. Les deux chemins applicatifs filtrent
-- `payment_status = pending`, donc cette borne ne retire aucune capacite reelle.
select throws_ok(
  $$update public.orders set tip_amount = 999999
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'montants: le pourboire ne se REECRIT PAS sur une commande deja payee'
);

-- ===========================================================================
-- 3. LE DEFAUT DE LA BASE EGALE LA MATRICE DU PRODUIT (6)
--    Si quelqu'un modifie DEFAULT_PERMISSIONS sans toucher la migration, ces
--    assertions tombent. C'est le garde-fou contre la derive des deux sources.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b7777777-7777-7777-7777-777777777777"}';

select ok(
  public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'orders.manage'),
  'matrice: un chef detient orders.manage par defaut'
);
select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'menu.edit'),
  'matrice: un chef ne modifie PAS le menu'
);
select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'inventory.edit'),
  'matrice: un chef ne modifie PAS les stocks par defaut (il faut une delegation)'
);

set local request.jwt.claims = '{"sub":"b9999999-9999-9999-9999-999999999999"}';
select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'orders.manage'),
  'matrice: un serveur ne gere PAS les commandes par defaut'
);

set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222"}';
-- L'ecart qui allait dans le sens d'une PERMISSION DE TROP: la base laissait
-- un gerant ecrire les reglages alors que l'app le lui refuse.
select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'settings.edit'),
  'matrice: un gerant n ecrit PAS les reglages (la base etait trop permissive)'
);
select ok(
  public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'menu.edit'),
  'matrice: un gerant modifie bien le menu'
);

-- ===========================================================================
-- 4. UN RETRAIT EXPLICITE RETIRE TOUJOURS (2)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b8888888-8888-8888-8888-888888888888"}';

select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'orders.manage'),
  'retrait: un gerant a qui on RETIRE orders.manage reste refuse'
);
select ok(
  NOT public.has_tenant_money_permission('b3333333-3333-3333-3333-333333333333'),
  'retrait: ce gerant perd aussi l autorite argent'
);

-- ===========================================================================
-- 5. LES CHEMINS DE CONFIANCE RESTENT EXEMPTS DU DECLENCHEUR (4)
--    Sans cette preuve, le declencheur casserait la caisse POS en production:
--    `/api/orders/pos` ecrit avec le client admin (service_role).
--
--    PIEGE D'ENVIRONNEMENT, rencontre en CI. Une premiere version assertait que
--    l'ecriture de `service_role` MODIFIE reellement `total`. Vert en local,
--    ROUGE en CI: `service_role` porte `bypassrls=true` sur une stack Supabase
--    mais PAS sur la base que la CI construit, si bien que la RLS y masque la
--    ligne et que `total` ne bouge pas. L'assertion mesurait un attribut de
--    role, pas le declencheur.
--
--    On asserte donc le MECANISME, qui est identique partout: le declencheur
--    decide sur `current_user`, et il ne contraint que `authenticated` et
--    `anon`. Que la RLS masque ou non la ligne par ailleurs ne change pas la
--    question posee ici.
-- ===========================================================================
set local role service_role;

-- Ce que le declencheur LIT pour exempter. Deterministe dans tout
-- environnement, contrairement a `rolbypassrls`.
select is(
  current_user::text,
  'service_role',
  'exemption: la caisse POS se presente avec un current_user hors des roles contraints'
);

-- Le declencheur n'a qu'un seul effet possible: LEVER. S'il levait pour la
-- caisse POS, cet appel echouerait - c'est verifie par mutation (en retirant
-- l'exemption, cette assertion tombe).
select lives_ok(
  $$update public.orders set total = 11000
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  'exemption: le declencheur ne leve PAS pour la caisse POS'
);

-- `postgres` est superutilisateur en CI et porte bypassrls en local: la ligne
-- est donc reellement atteinte dans les deux cas, et le `is` ci-dessous n'est
-- pas a vide. C'est le chemin des migrations et des fonctions SECURITY DEFINER.
reset role;
select lives_ok(
  $$update public.orders set total = 12000
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  'exemption: une migration (postgres) ecrit encore les montants'
);
select is(
  (select total from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  12000::bigint,
  'exemption: l ecriture de migration a REELLEMENT porte'
);

-- ===========================================================================
-- 6. LE GERANT GARDE TOUTE SON AUTORITE (7)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222"}';

select lives_ok(
  $$update public.orders set status = 'served'
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  'gerant: fait avancer une commande'
);
select is(
  (select status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'served',
  'gerant: la commande a REELLEMENT avance'
);

select lives_ok(
  $$update public.orders set payment_status = 'comp', is_comp = true
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  'gerant: OFFRE une commande'
);
select is(
  (select payment_status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'comp',
  'gerant: la commande est REELLEMENT offerte'
);

select lives_ok(
  $$delete from public.orders
    where id = 'b6666666-6666-6666-6666-666666666666'$$,
  'gerant: SUPPRIME une commande'
);
select is(
  (select count(*)::int from public.orders where id = 'b6666666-6666-6666-6666-666666666666'),
  0,
  'gerant: la commande est REELLEMENT supprimee'
);

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('b3333333-3333-3333-3333-333333333333',
            'b4444444-4444-4444-4444-444444444444', -5000, 'cash', 'completed')$$,
  'gerant: REMBOURSE (montant negatif)'
);

-- ===========================================================================
-- 7. LA CONFIGURATION DE SALLE RESTE AU GERANT (5)
--    Rendre `orders.manage` au caissier aurait suffi a lui ouvrir la
--    suppression de tables et de zones: ces neuf policies etaient gardees par
--    `orders.manage` seul, alors que l'application exige EN PLUS la liste de
--    roles de gestion. Les deux coincidaient par accident tant que le defaut
--    de la base etait admin/manager.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111"}';

select ok(
  NOT public.has_tenant_floor_permission('b3333333-3333-3333-3333-333333333333'),
  'salle: un caissier n a PAS l autorite de configuration de salle'
);

-- L'INSERT leve sur violation de WITH CHECK: pas de refus masque ici.
select throws_ok(
  $$insert into public.zones (tenant_id, venue_id, name, prefix)
    values ('b3333333-3333-3333-3333-333333333333',
            'ba000000-0000-4000-8000-00000000000a', 'Zone pirate', 'ZP')$$,
  '42501',
  null,
  'salle: un caissier ne CREE PAS de zone, meme avec orders.manage'
);

set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222"}';

select ok(
  public.has_tenant_floor_permission('b3333333-3333-3333-3333-333333333333'),
  'salle: un gerant garde l autorite de configuration de salle'
);

select lives_ok(
  $$insert into public.zones (tenant_id, venue_id, name, prefix)
    values ('b3333333-3333-3333-3333-333333333333',
            'ba000000-0000-4000-8000-00000000000a', 'Terrasse', 'TR')$$,
  'salle: un gerant CREE une zone'
);
select is(
  (select count(*)::int from public.zones
   where tenant_id = 'b3333333-3333-3333-3333-333333333333'),
  1,
  'salle: la zone du gerant a REELLEMENT ete creee, et celle du caissier NON'
);

-- ===========================================================================
-- 8. LES BORNES DE LA CREATION (2)
--    Le declencheur de la section 2 ne garde que l'UPDATE. A la CREATION, le
--    porteur de `orders.manage` fournit les montants, et `orders` ne portait
--    AUCUN CHECK sur ses colonnes d'argent.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111"}';

-- 23514 = check_violation. Un total negatif creerait une recette negative dans
-- les rapports, et un remboursement deguise hors du ledger `payments`.
select throws_ok(
  $$insert into public.orders (tenant_id, order_number, subtotal, total, payment_status)
    values ('b3333333-3333-3333-3333-333333333333', 'CMD-NEGATIVE', -1, -1, 'pending')$$,
  '23514',
  null,
  'creation: un montant NEGATIF est refuse par la base'
);

-- TEMOIN DE NON-REGRESSION, et il compte autant que les refus: une commande a
-- zero est LEGITIME (coupon de 100 %). Si un futur resserrage exigeait
-- `total > 0`, cette assertion tomberait et dirait pourquoi.
select lives_ok(
  $$insert into public.orders (tenant_id, order_number, subtotal, total, payment_status)
    values ('b3333333-3333-3333-3333-333333333333', 'CMD-COUPON-100', 0, 0, 'pending')$$,
  'creation: une commande a ZERO reste permise (coupon de 100 pour cent)'
);

select * from finish();
rollback;

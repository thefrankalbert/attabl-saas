-- record_refund - la RPC doit se defendre elle-meme.
--
-- Ce que ce test prouve, et que rien d'autre ne peut prouver: le refus vient de
-- la FONCTION en base, atteinte avec le role `authenticated` et un JWT, comme le
-- ferait un appel direct a /rest/v1/rpc/record_refund. Un test a Supabase simule
-- ne peut pas en rendre compte: il remplace justement la couche qui refuse.
--
-- Le constat qu'il verrouille (mesure en production le 2026-11-05): la fonction
-- est SECURITY DEFINER, son EXECUTE est accorde a `authenticated`, et son corps
-- ne contenait ni `assert_tenant_member` ni `auth.uid()`. Elle croyait donc sur
-- parole les parametres `p_tenant_id` et `p_created_by` de son appelant, sur un
-- chemin de remboursement. L'action serveur `actionRefundOrder` etait bien
-- gardee, mais elle n'est pas la seule porte.
--
-- Il protege les DEUX sens:
--   - l'appel illegitime est refuse (correction, cas 1, 2, 3, 6);
--   - un remboursement legitime passe toujours, la piste d'audit est juste, et
--     les garde-fous de caisse d'origine tiennent (non-regression, cas 4, 5, 7,
--     8) - c'est ce qui empeche de "corriger" en cassant la caisse.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/record_refund_tenant_guard.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

-- Jeu d essai: DEUX restaurants. Le second est la victime du croisement.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron-a@test.local', 'x', now(), now()),
  ('dddddddd-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-a@test.local', 'x', now(), now()),
  ('dddddddd-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron-b@test.local', 'x', now(), now()),
  ('dddddddd-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'suspendu-a@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values
  ('eeeeeeee-0000-0000-0000-00000000000a', 'tenant-refund-a', 'Restaurant A', true),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'tenant-refund-b', 'Restaurant B', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  -- Restaurant A: un patron, un serveur, et un manager suspendu.
  ('ffffffff-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000a',
   'dddddddd-0000-0000-0000-000000000001', 'patron-a@test.local', 'owner', true),
  ('ffffffff-0000-0000-0000-00000000000c', 'eeeeeeee-0000-0000-0000-00000000000a',
   'dddddddd-0000-0000-0000-000000000002', 'serveur-a@test.local', 'waiter', true),
  ('ffffffff-0000-0000-0000-00000000000d', 'eeeeeeee-0000-0000-0000-00000000000a',
   'dddddddd-0000-0000-0000-000000000004', 'suspendu-a@test.local', 'manager', false),
  -- Restaurant B: son patron, qui n a rien a voir avec A.
  ('ffffffff-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b',
   'dddddddd-0000-0000-0000-000000000003', 'patron-b@test.local', 'owner', true);

-- UNE COMMANDE PAR GROUPE DE CAS, et c est deliberé. Avec une seule commande
-- partagee, un appel illegitime qui PASSE (l etat d avant le correctif)
-- consomme le net encaisse, et les cas suivants echouent alors sur 23514
-- "montant superieur au net" au lieu du refus attendu: le harnais devient
-- illisible au moment precis ou il doit prouver quelque chose. Mesure a
-- l appui: avant correctif, les cas 1 et 2 sortaient 5000 chacun des 10000
-- encaisses, et le cas 3 echouait pour cette raison, pas pour la bonne.
-- Montants en unites mineures (bigint), comme en production.
insert into public.orders (id, tenant_id, order_number, subtotal, total)
values
  ('11111111-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-00000000000a',
   'A-ATTAQUE', 10000, 10000),
  ('11111111-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-00000000000a',
   'A-LEGITIME', 10000, 10000),
  ('11111111-0000-0000-0000-0000000000a3', 'eeeeeeee-0000-0000-0000-00000000000a',
   'A-NET', 10000, 10000),
  ('11111111-0000-0000-0000-0000000000a4', 'eeeeeeee-0000-0000-0000-00000000000a',
   'A-REJEU', 10000, 10000),
  ('11111111-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b',
   'B-001', 20000, 20000);

insert into public.payments (id, tenant_id, order_id, amount, method, status)
values
  ('22222222-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-00000000000a',
   '11111111-0000-0000-0000-0000000000a1', 10000, 'cash', 'completed'),
  ('22222222-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-00000000000a',
   '11111111-0000-0000-0000-0000000000a2', 10000, 'cash', 'completed'),
  ('22222222-0000-0000-0000-0000000000a3', 'eeeeeeee-0000-0000-0000-00000000000a',
   '11111111-0000-0000-0000-0000000000a3', 10000, 'cash', 'completed'),
  ('22222222-0000-0000-0000-0000000000a4', 'eeeeeeee-0000-0000-0000-00000000000a',
   '11111111-0000-0000-0000-0000000000a4', 10000, 'cash', 'completed'),
  ('22222222-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b',
   '11111111-0000-0000-0000-00000000000b', 20000, 'cash', 'completed');

-- ----------------------------------------------------------------- correction
-- 1. LE CONSTAT LUI-MEME. Le patron de B rembourse dans la caisse de A.
--    C est l appel exact qu un attaquant passerait a /rest/v1/rpc, avec le
--    tenant_id de A et un order_id de A - un identifiant qui circule sur les
--    tickets et dans les reponses d API, ce n est pas un secret.
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000003"}';

select throws_ok(
  $$select public.record_refund(
      '11111111-0000-0000-0000-0000000000a1',
      'eeeeeeee-0000-0000-0000-00000000000a',
      5000, 'cash', null, null)$$,
  '42501',
  null,
  'record_refund: un membre d un AUTRE restaurant est refuse (42501)'
);

-- 2. ELEVATION INTERNE. Le serveur de A est bien chez A, mais `actionRefundOrder`
--    exige un role parmi owner/admin/manager. Sans garde dans la fonction, il
--    contournait cette exigence en appelant la RPC en direct.
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002"}';

select throws_ok(
  $$select public.record_refund(
      '11111111-0000-0000-0000-0000000000a1',
      'eeeeeeee-0000-0000-0000-00000000000a',
      5000, 'cash', null, null)$$,
  '42501',
  null,
  'record_refund: un waiter de son propre restaurant est refuse (42501)'
);

-- 3. COMPTE SUSPENDU. Role manager, donc autorise par la liste de roles, mais
--    `is_active = false`: un compte desactive ne doit pas sortir d argent.
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000004"}';

select throws_ok(
  $$select public.record_refund(
      '11111111-0000-0000-0000-0000000000a1',
      'eeeeeeee-0000-0000-0000-00000000000a',
      5000, 'cash', null, null)$$,
  '42501',
  null,
  'record_refund: un membre desactive est refuse meme avec un role autorise (42501)'
);

-- ------------------------------------------------------------- non-regression
-- 4. LE CHEMIN LEGITIME PASSE TOUJOURS. Sans ce cas, on pourrait "corriger" en
--    refusant tout le monde et le test resterait vert.
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001"}';

select isnt(
  (select public.record_refund(
      '11111111-0000-0000-0000-0000000000a2',
      'eeeeeeee-0000-0000-0000-00000000000a',
      3000, 'cash', 'ffffffff-0000-0000-0000-00000000000a', null)),
  null,
  'record_refund non-regression: le patron de A rembourse bien chez A'
);

-- 5. PISTE D AUDIT NON FALSIFIABLE. Le patron attribue son remboursement au
--    SERVEUR. `created_by` doit rester le sien, derive de auth.uid().
--
--    L APPEL EST DANS SON PROPRE STATEMENT, et ce n est pas un detail de style.
--    Ecrit en une seule requete - la fonction appelee dans le `where` d un
--    parcours de `payments` - le test renvoyait NULL et echouait: l instantane
--    du parcours est pris AVANT l appel, donc la ligne que la fonction insere
--    n y est pas visible. Le code etait correct, le test non. C est l executant
--    CI qui l a trouve, des sa premiere execution reelle.
create temporary table _refund_audit as
  select public.record_refund(
    '11111111-0000-0000-0000-0000000000a2',
    'eeeeeeee-0000-0000-0000-00000000000a',
    1000, 'cash',
    'ffffffff-0000-0000-0000-00000000000c',  -- l id du SERVEUR
    null) as id;

select is(
  (select p.created_by
     from public.payments p
    where p.tenant_id = 'eeeeeeee-0000-0000-0000-00000000000a'
      and p.id = (select id from _refund_audit)),
  'ffffffff-0000-0000-0000-00000000000a'::uuid,       -- celui du PATRON
  'record_refund: created_by est derive de l appelant, pas du parametre'
);

-- 6. AUCUNE ECRITURE N A ABOUTI. La victime des cas 1 a 3 est le restaurant A
--    sur sa commande A-ATTAQUE: c est LA qu un remboursement illegitime
--    s ecrivait. Surveiller le restaurant B ne prouverait rien - aucun cas
--    n ecrit chez B - et le test resterait vert meme sans correctif. Mesure
--    avant correctif: 2 lignes illegitimes ici.
select is(
  (select count(*)::int from public.payments
    where order_id = '11111111-0000-0000-0000-0000000000a1'
      and status = 'refunded'),
  0,
  'record_refund: aucun remboursement illegitime n a ete ecrit chez la victime'
);

-- 7. GARDE-FOU DE CAISSE D ORIGINE: le montant ne peut pas depasser le net
--    encaisse. Deja rembourse 3000 + 1000 sur 10000 encaisses, donc net = 6000.
select throws_ok(
  $$select public.record_refund(
      '11111111-0000-0000-0000-0000000000a3',
      'eeeeeeee-0000-0000-0000-00000000000a',
      19000, 'cash', null, null)$$,
  '23514',
  null,
  'record_refund non-regression: un montant superieur au net encaisse est refuse'
);

-- 8. GARDE-FOU DE CAISSE D ORIGINE: le rejeu par client_request_id rend la
--    MEME ligne, sans second mouvement de caisse.
select is(
  (select public.record_refund(
      '11111111-0000-0000-0000-0000000000a4',
      'eeeeeeee-0000-0000-0000-00000000000a',
      500, 'cash', null, '33333333-0000-0000-0000-000000000001')),
  (select public.record_refund(
      '11111111-0000-0000-0000-0000000000a4',
      'eeeeeeee-0000-0000-0000-00000000000a',
      500, 'cash', null, '33333333-0000-0000-0000-000000000001')),
  'record_refund non-regression: le rejeu rend la meme ligne (idempotence)'
);

select * from finish();
rollback;

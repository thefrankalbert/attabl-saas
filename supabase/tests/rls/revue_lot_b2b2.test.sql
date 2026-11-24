-- Revue ligne par ligne, lot B2b-2: defauts corriges cote base de donnees
-- (migrations 20261124160000 a 20261124160200).
--
-- CE QUE CE TEST VERROUILLE:
--   B8  un meme appareil (endpoint) peut etre abonne aux alertes de DEUX
--       restaurants; jamais deux fois au meme; jamais a un restaurant dont on
--       n'est pas membre;
--   B95 la regeneration automatique des suggestions garde celles creees a la
--       main, remplace les seules suggestions generees, en une transaction
--       (une erreur ne laisse pas le restaurant sans suggestion), et reste
--       soumise a `menu.edit` (SECURITY INVOKER, RLS); une suggestion generee
--       puis modifiee a la main devient manuelle (contre-audit 1).
--
-- Chaque refus a son temoin positif. Sans les migrations du lot, les
-- assertions marquees "(avant: ...)" echouent.
--
-- Execution: scripts/run-pgtap.sh --local (ou --db-url)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- Donnees: T1 et T2 (le proprietaire de T1 l'est aussi de T2), T3 sans lui.
-- ---------------------------------------------------------------------------
insert into public.tenants (id, slug, name, is_active, currency, subscription_status, subscription_plan) values
  ('b2b20000-0000-4000-8000-000000000001', 'b2b2-un', 'B2B2 Un', true, 'XOF', 'active', 'business'),
  ('b2b20000-0000-4000-8000-000000000002', 'b2b2-deux', 'B2B2 Deux', true, 'XOF', 'active', 'business'),
  ('b2b20000-0000-4000-8000-000000000003', 'b2b2-trois', 'B2B2 Trois', true, 'XOF', 'active', 'business');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('b2b20000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patron@b2b2.test', 'x', now(), now()),
  ('b2b20000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur@b2b2.test', 'x', now(), now());

insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('b2b20000-0000-4000-8000-000000000201', 'b2b20000-0000-4000-8000-000000000101', 'b2b20000-0000-4000-8000-000000000001', 'patron@b2b2.test', 'owner', true),
  ('b2b20000-0000-4000-8000-000000000202', 'b2b20000-0000-4000-8000-000000000101', 'b2b20000-0000-4000-8000-000000000002', 'patron@b2b2.test', 'owner', true),
  ('b2b20000-0000-4000-8000-000000000203', 'b2b20000-0000-4000-8000-000000000102', 'b2b20000-0000-4000-8000-000000000001', 'serveur@b2b2.test', 'waiter', true);

-- ===========================================================================
-- B8: un appareil, plusieurs restaurants
-- ===========================================================================
select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.push_subscriptions'::regclass
             and conname = 'push_subscriptions_tenant_user_endpoint_key'),
  'B8: unicite (tenant_id, user_id, endpoint) posee');
select ok(
  not exists (select 1 from pg_constraint
               where conrelid = 'public.push_subscriptions'::regclass
                 and conname = 'push_subscriptions_user_id_endpoint_key'),
  'B8: ancienne unicite (user_id, endpoint) retiree (avant: presente)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b20000-0000-4000-8000-000000000101","role":"authenticated"}';
select lives_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000101',
            'https://fcm.googleapis.com/fcm/send/b2b2', 'k', 'a')$$,
  'B8 temoin: abonnement de l appareil au restaurant T1');
select lives_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('b2b20000-0000-4000-8000-000000000002', 'b2b20000-0000-4000-8000-000000000101',
            'https://fcm.googleapis.com/fcm/send/b2b2', 'k', 'a')
    on conflict (tenant_id, user_id, endpoint) do update set last_used_at = now()$$,
  'B8: le MEME appareil s abonne aussi a T2, upsert de la route (avant: 23505 / deplacement)');
select throws_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000101',
            'https://fcm.googleapis.com/fcm/send/b2b2', 'k', 'a')$$,
  '23505', null, 'B8: pas deux lignes pour le meme appareil au meme restaurant');
select throws_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('b2b20000-0000-4000-8000-000000000003', 'b2b20000-0000-4000-8000-000000000101',
            'https://fcm.googleapis.com/fcm/send/b2b2', 'k', 'a')$$,
  '42501', null, 'B8: toujours refuse pour un restaurant dont on n est pas membre (WITH CHECK intact)');
-- La route DELETE ne retire que la ligne du restaurant courant.
delete from public.push_subscriptions
 where tenant_id = 'b2b20000-0000-4000-8000-000000000002'
   and user_id = 'b2b20000-0000-4000-8000-000000000101'
   and endpoint = 'https://fcm.googleapis.com/fcm/send/b2b2';
reset role;
select is(
  (select array_agg(tenant_id::text order by tenant_id) from public.push_subscriptions
    where endpoint = 'https://fcm.googleapis.com/fcm/send/b2b2'),
  array['b2b20000-0000-4000-8000-000000000001'],
  'B8: se desabonner de T2 laisse T1 abonne (effet)');

-- ===========================================================================
-- B95: suggestions manuelles gardees, regeneration en une transaction
-- ===========================================================================
insert into public.categories (id, tenant_id, name) values
  ('b2b20000-0000-4000-8000-000000000401', 'b2b20000-0000-4000-8000-000000000001', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price, is_available) values
  ('b2b20000-0000-4000-8000-000000000501', 'b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000401', 'Poulet', 5000, true),
  ('b2b20000-0000-4000-8000-000000000502', 'b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000401', 'Poisson', 5500, true),
  ('b2b20000-0000-4000-8000-000000000503', 'b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000401', 'Jus', 1000, true);

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'item_suggestions' and column_name = 'source'),
  '''manual''::text',
  'B95: colonne source, manual par defaut (une creation a la main reste manuelle)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b20000-0000-4000-8000-000000000101","role":"authenticated"}';
-- Creee a la main (sans source), et une suggestion deja generee.
insert into public.item_suggestions (tenant_id, menu_item_id, suggested_item_id, suggestion_type)
values ('b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000501',
        'b2b20000-0000-4000-8000-000000000503', 'pairing');
insert into public.item_suggestions (tenant_id, menu_item_id, suggested_item_id, suggestion_type, source)
values ('b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000502',
        'b2b20000-0000-4000-8000-000000000503', 'pairing', 'auto');

select is(
  public.regenerate_auto_suggestions(
    'b2b20000-0000-4000-8000-000000000001',
    '[{"menu_item_id":"b2b20000-0000-4000-8000-000000000501","suggested_item_id":"b2b20000-0000-4000-8000-000000000502","suggestion_type":"alternative","display_order":0},
      {"menu_item_id":"b2b20000-0000-4000-8000-000000000501","suggested_item_id":"b2b20000-0000-4000-8000-000000000503","suggestion_type":"pairing","display_order":1}]'::jsonb),
  1,
  'B95: une seule nouvelle suggestion inseree (la paire deja manuelle est sautee)');
reset role;
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001' and source = 'manual'),
  1, 'B95: la suggestion creee a la main est gardee (avant: effacee)');
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001'
      and menu_item_id = 'b2b20000-0000-4000-8000-000000000502'),
  0, 'B95: l ancienne suggestion generee est remplacee');
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001' and source = 'auto'
      and menu_item_id = 'b2b20000-0000-4000-8000-000000000501'
      and suggested_item_id = 'b2b20000-0000-4000-8000-000000000502'),
  1, 'B95: la nouvelle suggestion generee est enregistree en auto');
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001'
      and menu_item_id = 'b2b20000-0000-4000-8000-000000000501'
      and suggested_item_id = 'b2b20000-0000-4000-8000-000000000503'),
  1, 'B95: pas de doublon de la paire manuelle');

-- Atomicite: une ligne invalide annule tout, l'ancienne generation reste.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b20000-0000-4000-8000-000000000101","role":"authenticated"}';
select throws_ok(
  $$select public.regenerate_auto_suggestions(
      'b2b20000-0000-4000-8000-000000000001',
      '[{"menu_item_id":"b2b20000-0000-4000-8000-000000000502","suggested_item_id":"b2b20000-0000-4000-8000-000000000501","suggestion_type":"inconnu","display_order":0}]'::jsonb)$$,
  '23514', null, 'B95: une ligne invalide fait echouer la regeneration');
reset role;
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001' and source = 'auto'),
  1, 'B95: apres l echec, les suggestions generees precedentes sont toujours la (avant: effacees)');

-- Droits: un serveur (sans menu.edit) ne regenere rien.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b20000-0000-4000-8000-000000000102","role":"authenticated"}';
select throws_ok(
  $$select public.regenerate_auto_suggestions(
      'b2b20000-0000-4000-8000-000000000001',
      '[{"menu_item_id":"b2b20000-0000-4000-8000-000000000502","suggested_item_id":"b2b20000-0000-4000-8000-000000000501","suggestion_type":"pairing","display_order":0}]'::jsonb)$$,
  '42501', null, 'B95: un serveur sans menu.edit est refuse (RLS appliquee)');
reset role;
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001'),
  2, 'B95: rien n a ete efface par le serveur refuse (effet)');

-- Un autre restaurant n'est pas touche: le proprietaire de T1 regenere T1,
-- une suggestion generee de T2 reste.
insert into public.categories (id, tenant_id, name) values
  ('b2b20000-0000-4000-8000-000000000402', 'b2b20000-0000-4000-8000-000000000002', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price, is_available) values
  ('b2b20000-0000-4000-8000-000000000511', 'b2b20000-0000-4000-8000-000000000002', 'b2b20000-0000-4000-8000-000000000402', 'Riz', 2000, true),
  ('b2b20000-0000-4000-8000-000000000512', 'b2b20000-0000-4000-8000-000000000002', 'b2b20000-0000-4000-8000-000000000402', 'Soda', 500, true);
insert into public.item_suggestions (tenant_id, menu_item_id, suggested_item_id, suggestion_type, source)
values ('b2b20000-0000-4000-8000-000000000002', 'b2b20000-0000-4000-8000-000000000511',
        'b2b20000-0000-4000-8000-000000000512', 'pairing', 'auto');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b20000-0000-4000-8000-000000000101","role":"authenticated"}';
select lives_ok(
  $$select public.regenerate_auto_suggestions('b2b20000-0000-4000-8000-000000000001', '[]'::jsonb)$$,
  'B95 temoin: regeneration vide de T1');
reset role;
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000002' and source = 'auto'),
  1, 'B95: les suggestions generees d un autre restaurant ne sont pas touchees');
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001' and source = 'manual'),
  1, 'B95: la suggestion manuelle de T1 survit aussi a une regeneration vide');

-- Generee puis MODIFIEE a la main: devient manuelle, survit a la generation.
insert into public.item_suggestions (tenant_id, menu_item_id, suggested_item_id, suggestion_type, source)
values ('b2b20000-0000-4000-8000-000000000001', 'b2b20000-0000-4000-8000-000000000502',
        'b2b20000-0000-4000-8000-000000000501', 'pairing', 'auto');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b20000-0000-4000-8000-000000000101","role":"authenticated"}';
update public.item_suggestions set display_order = 7
 where tenant_id = 'b2b20000-0000-4000-8000-000000000001' and source = 'auto';
-- Temoin: une mise a jour qui ne change rien (meme ordre) garde l'origine.
update public.item_suggestions set display_order = display_order
 where tenant_id = 'b2b20000-0000-4000-8000-000000000002';
reset role;
select is(
  (select source from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001'
      and menu_item_id = 'b2b20000-0000-4000-8000-000000000502'
      and suggested_item_id = 'b2b20000-0000-4000-8000-000000000501'),
  'manual', 'B95: une suggestion generee modifiee a la main devient manuelle (avant: restait auto)');
select is(
  (select source from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000002'),
  'auto', 'B95 temoin: une mise a jour sans changement garde l origine auto');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2b20000-0000-4000-8000-000000000101","role":"authenticated"}';
select public.regenerate_auto_suggestions('b2b20000-0000-4000-8000-000000000001', '[]'::jsonb);
select public.regenerate_auto_suggestions('b2b20000-0000-4000-8000-000000000002', '[]'::jsonb);
reset role;
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000001'
      and menu_item_id = 'b2b20000-0000-4000-8000-000000000502'
      and suggested_item_id = 'b2b20000-0000-4000-8000-000000000501'),
  1, 'B95: la suggestion modifiee a la main survit a la generation suivante');
select is(
  (select count(*)::int from public.item_suggestions
    where tenant_id = 'b2b20000-0000-4000-8000-000000000002'),
  0, 'B95 temoin: la suggestion generee non modifiee est remplacee');

select ok(
  not has_function_privilege('anon', 'public.regenerate_auto_suggestions(uuid, jsonb)', 'EXECUTE'),
  'B95: anon ne peut pas appeler la fonction');
select ok(
  has_function_privilege('authenticated', 'public.regenerate_auto_suggestions(uuid, jsonb)', 'EXECUTE'),
  'B95 temoin: authenticated peut l appeler (la RLS juge ensuite)');

select * from finish();
rollback;

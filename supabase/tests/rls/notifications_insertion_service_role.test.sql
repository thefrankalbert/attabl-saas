-- Plus aucune session utilisateur n'insere de notification (audit B118).
--
-- CE QUE CE TEST VERROUILLE. La politique "Admins can insert notifications"
-- laissait tout membre actif, meme un serveur, fabriquer une fausse alerte
-- affichee a l'equipe comme venant du systeme. Toutes les insertions de
-- l'application passent par service_role. Migration 20261123100500.
--
-- Execution: scripts/run-pgtap.sh --local

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

insert into public.tenants (id, slug, name, is_active, currency, subscription_status) values
  ('b1180000-0000-0000-0000-00000000000a', 'b118-resto', 'Resto B118', true, 'XOF', 'active');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('e1180000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'serveur-b118@exemple.test', 'x', now(), now());
insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('d1180000-0000-0000-0000-00000000000a', 'e1180000-0000-0000-0000-00000000000a',
   'b1180000-0000-0000-0000-00000000000a', 'serveur-b118@exemple.test', 'waiter', true);

select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.notifications'::regclass and polcmd = 'a'),
  0,
  'aucune politique d insertion sur notifications');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e1180000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$insert into public.notifications (tenant_id, type, title, body)
    values ('b1180000-0000-0000-0000-00000000000a', 'warning', 'Paiement refuse', 'Appelez le support')$$,
  '42501', NULL,
  'un serveur ne peut plus inserer de fausse alerte dans son restaurant');

reset role;

-- Temoin. Sur Supabase, `service_role` a l'attribut BYPASSRLS: la RLS ne le
-- concerne pas, il lui faut seulement le droit d'insertion sur la table. Le
-- bootstrap local cree ce role sans cet attribut, donc on verifie ici le droit,
-- et l'insertion par le proprietaire de la table (le chemin des fonctions
-- SECURITY DEFINER), qui ne depend pas d'une politique.
select ok(
  has_table_privilege('service_role', 'public.notifications', 'insert'),
  'temoin: service_role garde le droit d insertion (chemin de l application)');

select lives_ok(
  $$insert into public.notifications (tenant_id, type, title, body)
    values ('b1180000-0000-0000-0000-00000000000a', 'info', 'Nouveau membre', 'Bienvenue')$$,
  'temoin: le proprietaire de la table insere toujours (fonctions SECURITY DEFINER)');

select * from finish();
rollback;

-- Un numero de commande ne se reutilise JAMAIS, meme apres suppression.
--
-- Ce que ce test prouve, et qu'aucun test applicatif ne peut prouver: la
-- sequence vit dans la base. Un test a Supabase simule verifierait seulement que
-- notre code appelle la bonne fonction, pas que la fonction ne rend jamais deux
-- fois le meme numero.
--
-- LE DEFAUT VERROUILLE ICI. `next_order_number` calculait le prochain numero par
-- un MAX sur `orders`. Supprimer la derniere commande du jour - un geste offert
-- par l'interface admin - faisait retomber le MAX, et la commande suivante
-- reprenait le numero libere: deux tickets imprimes avec le MEME numero, dont un
-- qui n'existe plus en base. L'index unique ne l'empechait pas, puisque la ligne
-- d'origine avait disparu.
--
-- Mesure en production avant correction (2026-11-07): aucun trou, aucun doublon
-- sur 732 commandes. Le defaut etait donc LATENT - on corrige avant l'incident.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/numerotation_commandes.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into public.tenants (id, slug, name, is_active, currency, subscription_status)
values ('bbbb1111-0000-0000-0000-00000000000a', 'numerotation', 'Resto Numero', true, 'XOF', 'active');

-- ===========================================================================
-- La sequence avance, et chaque numero est unique
-- ===========================================================================
select is(
  public.next_order_number('bbbb1111-0000-0000-0000-00000000000a'),
  'CMD-' || to_char((now() at time zone 'UTC')::date, 'YYYYMMDD') || '-001',
  'le premier numero de la journee est 001');

select is(
  public.next_order_number('bbbb1111-0000-0000-0000-00000000000a'),
  'CMD-' || to_char((now() at time zone 'UTC')::date, 'YYYYMMDD') || '-002',
  'le numero suivant est 002, sans lire la table des commandes');

-- ===========================================================================
-- LE CONSTAT: supprimer une commande ne libere pas son numero
-- ===========================================================================
insert into public.orders (tenant_id, order_number, status, payment_status, subtotal, total)
values ('bbbb1111-0000-0000-0000-00000000000a',
        'CMD-' || to_char((now() at time zone 'UTC')::date, 'YYYYMMDD') || '-002',
        'pending', 'pending', 5000, 5000);

delete from public.orders
 where tenant_id = 'bbbb1111-0000-0000-0000-00000000000a';

select is(
  public.next_order_number('bbbb1111-0000-0000-0000-00000000000a'),
  'CMD-' || to_char((now() at time zone 'UTC')::date, 'YYYYMMDD') || '-003',
  'apres suppression de TOUTES les commandes, la sequence continue a 003');

-- Et le compteur lui-meme n'a pas bouge vers le bas.
select is(
  (select dernier from public.order_number_counters
    where tenant_id = 'bbbb1111-0000-0000-0000-00000000000a'
      and jour = (now() at time zone 'UTC')::date),
  3,
  'le compteur ne redescend pas');

-- ===========================================================================
-- Un restaurant inconnu n obtient pas de numero
-- ===========================================================================
-- Sans ce controle, la fonction etant executable par `anon`, n'importe qui
-- pourrait faire monter le compteur d'un identifiant invente.
select throws_ok(
  $q$ select public.next_order_number('bbbb1111-0000-0000-0000-0000000000ff') $q$,
  '23503',
  null,
  'un identifiant de restaurant inconnu est refuse');

-- ===========================================================================
-- Le compteur est hors de portee des clients
-- ===========================================================================
-- RLS active SANS policy, et droits retires: ni lecture ni ecriture par
-- PostgREST. Seule la fonction SECURITY DEFINER y touche.
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1111-0000-0000-0000-0000000000aa"}';

select throws_ok(
  $q$ select count(*) from public.order_number_counters $q$,
  '42501',
  null,
  'un utilisateur connecte ne peut pas LIRE le compteur');

select throws_ok(
  $q$ update public.order_number_counters set dernier = 0 $q$,
  '42501',
  null,
  'un utilisateur connecte ne peut pas ECRIRE dans le compteur');

reset role;

-- ===========================================================================
-- LES DROITS: service_role SEULEMENT
-- ===========================================================================
-- L'ancienne fonction etait executable par `anon` et `authenticated`. Ces trois
-- assertions figent le resserrage: une PR qui rendrait les droits a un role
-- client les ferait tomber. Verifie chemin par chemin avant de resserrer: les
-- trois routes qui creent une commande passent toutes par service_role, et les
-- deux composants navigateur n'appellent que des lectures.
select is(
  has_function_privilege('anon', 'public.next_order_number(uuid)', 'execute'),
  false,
  'droits: anon ne peut PLUS appeler la numerotation');

select is(
  has_function_privilege('authenticated', 'public.next_order_number(uuid)', 'execute'),
  false,
  'droits: authenticated ne peut PLUS appeler la numerotation');

-- NON-REGRESSION, et elle compte autant: c'est le role par lequel passent les
-- trois routes de creation de commande. Sans elle, revoquer tout le monde
-- passerait le test.
select is(
  has_function_privilege('service_role', 'public.next_order_number(uuid)', 'execute'),
  true,
  'droits non-regression: service_role appelle toujours la numerotation');

select * from finish();
rollback;

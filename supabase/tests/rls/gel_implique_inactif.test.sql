-- Un restaurant gele ne peut plus etre actif: la base doit le REFUSER.
--
-- Ce que ce test prouve, et qu'aucun test applicatif ne peut prouver: le refus
-- vient de la BASE, pas du code. Un test a Supabase simule verifierait seulement
-- que NOS chemins respectent la regle - or le probleme etait justement ailleurs:
-- une ecriture depuis le tableau de bord, un futur chemin oublie, un correctif
-- mal relu. La contrainte couvre tous les chemins, y compris ceux qui n'existent
-- pas encore.
--
-- Le constat verrouille: des lignes se sont deja retrouvees `frozen` ET
-- `is_active`. `get_tenant_by_slug` filtrant sur `is_active = true`, la vitrine
-- d'un restaurant gele continuait alors de servir son menu. Le gel ne gelait rien.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/gel_implique_inactif.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into public.tenants (id, slug, name, is_active, currency, subscription_status)
values
  ('aaaa3333-0000-0000-0000-00000000000a', 'gel-actif', 'Resto Actif', true, 'XOF', 'active'),
  ('aaaa3333-0000-0000-0000-00000000000b', 'gel-gele',  'Resto Gele',  false, 'XOF', 'frozen');

-- 1. LE CONSTAT. Geler sans desactiver doit etre refuse par la base.
select throws_ok(
  $q$ update public.tenants set subscription_status = 'frozen'
      where slug = 'gel-actif' $q$,
  '23514',
  null,
  'geler un tenant actif sans le desactiver est refuse');

-- 2. Le chemin correct passe: on gele ET on desactive dans la meme ecriture.
select lives_ok(
  $q$ update public.tenants set subscription_status = 'frozen', is_active = false
      where slug = 'gel-actif' $q$,
  'geler ET desactiver ensemble est accepte');

-- 3. L autre sens compte autant: reactiver un tenant RESTE gele doit etre
--    refuse. C est le chemin qu un operateur presse prendrait pour "debloquer"
--    un restaurant qui se plaint, sans toucher a son statut d abonnement.
select throws_ok(
  $q$ update public.tenants set is_active = true where slug = 'gel-gele' $q$,
  '23514',
  null,
  'reactiver un tenant encore gele est refuse');

-- 4. NON-REGRESSION. Lever le gel ET reactiver ensemble reste possible, sinon
--    on aurait rendu les restaurants geles irrecuperables.
select lives_ok(
  $q$ update public.tenants set subscription_status = 'active', is_active = true
      where slug = 'gel-gele' $q$,
  'lever le gel et reactiver ensemble est accepte');

-- 5. NON-REGRESSION. Les autres statuts non entitlants ne sont PAS concernes:
--    'cancelled' et 'paused' peuvent coexister avec is_active, et la contrainte
--    ne doit pas les bloquer - elle ne parle que du gel.
select lives_ok(
  $q$ update public.tenants set subscription_status = 'cancelled', is_active = true
      where slug = 'gel-actif' $q$,
  'un tenant annule peut rester actif: la contrainte ne vise que le gel');

select * from finish();
rollback;

-- Un abonnement inutilisable implique un restaurant inactif: la base doit le
-- REFUSER, pour TOUS les statuts non entitlants.
--
-- Ce que ce test prouve, et qu'aucun test applicatif ne peut prouver: le refus
-- vient de la BASE, pas du code. Un test a Supabase simule verifierait seulement
-- que NOS chemins respectent la regle - or le probleme etait justement ailleurs:
-- une ecriture depuis le tableau de bord, un futur chemin oublie, un correctif
-- mal relu. La contrainte couvre tous les chemins, y compris ceux qui n'existent
-- pas encore.
--
-- Le constat verrouille, en deux temps:
--
--   1. Des lignes se sont deja retrouvees `frozen` ET `is_active`.
--      `get_tenant_by_slug` filtrant sur `is_active = true`, la vitrine d'un
--      restaurant gele continuait alors de servir son menu. Le gel ne gelait
--      rien. (Contrainte posee le 2026-11-05, etroite: le gel seulement.)
--   2. `cancelled` et `paused` ne donnent pas plus droit au service - 
--      `isSubscriptionUsable` n'autorise que `trial`, `active` et `past_due` -
--      mais passaient la contrainte etroite. Et DEUX chemins super-admin
--      ecrivent `is_active: true` sans toucher au statut (`unsuspendTenant`,
--      `restoreTenant`): "reactiver" un restaurant resilie le remettait en
--      service. (Contrainte elargie le 2026-11-07.)
--
-- CE TEST EST AUSSI LE GARDE-FOU DE LA DUPLICATION. La liste des statuts
-- entitlants est ecrite en dur dans la contrainte (une contrainte ne peut pas
-- appeler une fonction volatile) ET dans `isSubscriptionUsable`
-- (src/lib/plans/features.ts). Les assertions de non-regression ci-dessous
-- echouent en CI si les deux listes divergent.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/abonnement_inutilisable_implique_inactif.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into public.tenants (id, slug, name, is_active, currency, subscription_status)
values
  ('aaaa3333-0000-0000-0000-00000000000a', 'gel-actif', 'Resto Actif', true, 'XOF', 'active'),
  ('aaaa3333-0000-0000-0000-00000000000b', 'gel-gele',  'Resto Gele',  false, 'XOF', 'frozen');

-- ===========================================================================
-- Le gel: le constat d'origine
-- ===========================================================================
-- 1. Geler sans desactiver doit etre refuse par la base.
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

-- ===========================================================================
-- La resiliation et la pause: ce que la contrainte etroite laissait passer
-- ===========================================================================
-- `gel-gele` est maintenant 'active' + is_active = true.
--
-- 5. Resilier sans desactiver etait ACCEPTE par la contrainte du 2026-11-05.
--    C'est exactement l'assertion que cette version du test inverse: elle
--    figeait l'ancienne demi-mesure ("un tenant annule peut rester actif").
select throws_ok(
  $q$ update public.tenants set subscription_status = 'cancelled'
      where slug = 'gel-gele' $q$,
  '23514',
  null,
  'resilier un tenant actif sans le desactiver est refuse');

-- 6. Meme chose pour la pause: un abonnement en pause ne sert pas.
select throws_ok(
  $q$ update public.tenants set subscription_status = 'paused'
      where slug = 'gel-gele' $q$,
  '23514',
  null,
  'mettre en pause un tenant actif sans le desactiver est refuse');

-- 7. Le chemin correct passe aussi pour la resiliation.
select lives_ok(
  $q$ update public.tenants set subscription_status = 'cancelled', is_active = false
      where slug = 'gel-gele' $q$,
  'resilier ET desactiver ensemble est accepte');

-- ===========================================================================
-- NON-REGRESSION: les statuts qui DOIVENT rester actifs
-- ===========================================================================
-- Ces deux assertions sont le garde-fou contre une contrainte trop serree. Si
-- elles tombent, un restaurant qui paie se retrouve coupe - exactement le genre
-- de regression qu'une correction de securite ne doit pas produire.
--
-- 8. `past_due` reste entitlant: c'est la fenetre de relance (Stripe Smart
--    Retries, environ trois a quatre semaines). Couper a la premiere carte
--    refusee coupe des clients qui vont payer.
select lives_ok(
  $q$ update public.tenants set subscription_status = 'past_due', is_active = true
      where slug = 'gel-actif' $q$,
  'non-regression: un tenant en relance (past_due) reste actif');

-- 9. `trial` aussi, evidemment: c'est l'etat de naissance d'un restaurant.
select lives_ok(
  $q$ update public.tenants set subscription_status = 'trial'
      where slug = 'gel-actif' $q$,
  'non-regression: un tenant en essai reste actif');

select * from finish();
rollback;

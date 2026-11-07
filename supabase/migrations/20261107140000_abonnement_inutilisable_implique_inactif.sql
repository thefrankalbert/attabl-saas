-- Un abonnement inutilisable implique un restaurant inactif. Pour TOUS les
-- statuts, plus seulement le gel.
--
-- CE QUE CETTE MIGRATION CORRIGE, ET POURQUOI C'EST UNE DEMI-MESURE QU'ON FINIT.
--
-- La migration 20261105200000 a pose `tenants_gel_implique_inactif`:
--
--     check (subscription_status <> 'frozen' or is_active = false)
--
-- Elle ne parle que du gel. Or trois statuts ne donnent PAS droit au service -
-- `isSubscriptionUsable` (src/lib/plans/features.ts) n'autorise que `trial`,
-- `active` et `past_due`. Les deux autres, `cancelled` et `paused`, pouvaient
-- donc coexister en base avec `is_active = true`, et rien ne protestait.
--
-- CE QUE CELA COUTERAIT, mesure sur le code et non suppose: `is_active` est le
-- verrou que lit `isTenantAccessLocked` (src/proxy.ts) ET le filtre de
-- `get_tenant_by_slug`. Une ligne `cancelled` avec `is_active = true` rouvre
-- donc a la fois les pages du tableau de bord et la vitrine client d'un
-- restaurant qui ne paie plus.
--
-- POURQUOI MAINTENANT, alors que le code tient deja la regle. Tous les chemins
-- d'ecriture de statut passent par `isActiveUnlessLocked`, qui pose `is_active`
-- a partir de `isSubscriptionUsable`: la regle est donc respectee partout
-- aujourd'hui, et la mesure en production le confirme (zero ligne dans cet
-- etat). Mais DEUX chemins ecrivent `is_active: true` sans toucher au statut -
-- `unsuspendTenant` et `restoreTenant`, cote super-admin - et leur garde ne
-- refusait que le gel. Un restaurant resilie que l'on "reactive" depuis la
-- console repassait donc en service. La garde applicative est elargie dans le
-- meme lot; cette contrainte est la seconde barriere, celle qui couvre aussi
-- une ecriture depuis le tableau de bord Supabase et les chemins qui n'existent
-- pas encore.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS. L'invariant `freeze_reason` non nulle si
-- et seulement si `frozen` reste non impose, pour la raison deja ecrite dans
-- 20261105200000: quelques lignes le violent, dont une ligne interne gelee par
-- conception et sans cause a declarer, et `charge.dispute.closed` lit cette
-- colonne pour decider quel gel il a le droit de lever.
--
-- Rollback: en fin de fichier.

-- 1. Normaliser l'existant AVANT d'imposer la regle. Mesure en production le
--    2026-11-07: aucune ligne concernee. Cette ecriture est donc un filet pour
--    les autres environnements et pour les donnees d'essai, pas une correction
--    de donnees reelles.
update public.tenants
   set is_active = false
 where subscription_status not in ('trial', 'active', 'past_due')
   and is_active = true;

-- 2. Remplacer la contrainte etroite par la contrainte complete. L'ancienne
--    devient redondante: 'frozen' fait partie des statuts vises ici.
alter table public.tenants
  drop constraint if exists tenants_gel_implique_inactif;

-- Rejouable: sans ce drop, un second passage echouerait sur
-- `constraint ... already exists`. Mesure faite sur les migrations RLS du meme
-- jour, qui n'etaient PAS rejouables et dont le rejeu annulait toute la
-- transaction avec un message alarmant pour rien.
alter table public.tenants
  drop constraint if exists tenants_abonnement_inutilisable_implique_inactif;

-- La liste des statuts entitlants est ECRITE EN DUR, et c'est voulu: une
-- contrainte ne peut pas appeler une fonction volatile, et un sous-select rendrait
-- la verification non immuable. Elle doit rester alignee sur
-- `isSubscriptionUsable` dans src/lib/plans/features.ts - le test pgTAP
-- gel_implique_inactif.test.sql fige les deux sens pour que la divergence se
-- voie en CI.
alter table public.tenants
  add constraint tenants_abonnement_inutilisable_implique_inactif
  check (
    subscription_status = any (array['trial', 'active', 'past_due'])
    or is_active = false
  );

comment on constraint tenants_abonnement_inutilisable_implique_inactif on public.tenants is
  'Un restaurant dont l abonnement n est pas utilisable (ni trial, ni active, ni past_due) ne peut pas rester actif. is_active est le verrou lu par isTenantAccessLocked (proxy) et le filtre de get_tenant_by_slug (vitrine): laisser is_active=true sur un statut non entitlant rouvre le tableau de bord ET la vitrine d un restaurant qui ne paie plus. Remplace tenants_gel_implique_inactif, qui ne couvrait que le gel.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table public.tenants
--   drop constraint tenants_abonnement_inutilisable_implique_inactif;
-- alter table public.tenants
--   add constraint tenants_gel_implique_inactif
--   check (subscription_status <> 'frozen' or is_active = false);

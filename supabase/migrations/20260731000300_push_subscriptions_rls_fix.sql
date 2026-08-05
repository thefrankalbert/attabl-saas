-- DB-01 - public.push_subscriptions: les credentials Web Push de tous les tenants
-- sont lisibles par un anonyme.
--
-- La table porte endpoint, p256dh et auth, soit le triplet complet permettant de
-- chiffrer et d'envoyer une notification Web Push. Un attaquant pourrait pousser
-- des notifications arbitraires sur les tablettes des restaurateurs ("nouvelle
-- commande, cliquez ici") et correler tenant_id / user_id.
--
-- Etat verifie le 2026-07-31 sur un snapshot du schema de production:
--   policy "Service can read all push subscriptions" FOR SELECT USING (true),
--   sans clause TO, donc role public (anon inclus). La migration corrective
--   20260309000001_fix_rls_policies.sql existe dans le depot mais son effet est
--   ABSENT du schema reel: elle n'a jamais ete appliquee, ou a ete annulee hors
--   bande. A reverifier explicitement apres deploiement.
--
-- La table est vide en production aujourd'hui (0 ligne), donc la requete anonyme
-- renvoie une liste vide: la fuite est latente, pas encore materialisee. Elle
-- s'ouvre des que quelqu'un active les notifications.
--
-- service_role contourne la RLS: aucune policy de lecture ne lui est necessaire.
--
-- Rollback:
--   create policy "Service can read all push subscriptions"
--     on public.push_subscriptions for select using (true);

drop policy if exists "Service can read all push subscriptions" on public.push_subscriptions;

-- La policy de gestion existante n'a pas de clause TO (role public). On la recree
-- restreinte a authenticated, avec le with check manquant cote ecriture.
drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;

create policy "Users can manage own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from anon;

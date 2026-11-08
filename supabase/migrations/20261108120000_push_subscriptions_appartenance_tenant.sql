-- PUSH-RLS - un titulaire de compte pouvait s'abonner aux commandes d'un AUTRE
-- restaurant.
--
-- Etat mesure en production le 2026-11-08, avant correction:
--
--   policy "Users can manage own push subscriptions" | for all | authenticated
--     using  (user_id = (select auth.uid()))
--     check  (user_id = (select auth.uid()))
--   grants authenticated: SELECT INSERT UPDATE DELETE TRUNCATE TRIGGER REFERENCES
--   lignes: 0
--
-- Le `with check` ne contraint que `user_id`. JAMAIS `tenant_id`. La route
-- /api/push-subscriptions derive bien le tenant de la session, mais elle n'est
-- pas le seul chemin: la cle anon est dans le bundle du navigateur, donc un
-- utilisateur authentifie peut ecrire directement dans PostgREST avec son
-- propre jeton. Il lui suffit alors d'inserer une ligne portant le `tenant_id`
-- d'un autre restaurant et son propre appareil pour recevoir, a chaque commande
-- de ce restaurant, le numero de table, le nombre d'articles et le MONTANT -
-- soit l'activite et le chiffre d'affaires d'un concurrent en temps reel.
--
-- La fuite etait LATENTE jusqu'au 2026-11-08: aucun code n'envoyait de
-- notification, donc la ligne inseree ne produisait rien. Le service d'envoi
-- l'arme. Zero ligne en base: rien n'a ete exploite.
--
-- TRUNCATE accorde a `authenticated` est un second defaut: la RLS ne protege
-- PAS contre TRUNCATE, donc n'importe quel compte connecte pouvait vider la
-- table de tous les restaurants d'un coup. TRIGGER et REFERENCES n'ont aucune
-- raison d'etre non plus.
--
-- Defense en profondeur: le service d'envoi ne contacte de toute facon que les
-- membres vivants du restaurant (`push.service.ts`), donc une ligne usurpee ne
-- recevrait rien meme sans cette migration. On ferme quand meme a la source.
--
-- `get_my_tenant_ids()` est le helper SECURITY DEFINER deja utilise ailleurs
-- dans ce schema (sans lui, la sous-requete sur `admin_users` subirait la RLS
-- de cette table et la policy se bloquerait elle-meme). Nuance assumee: il
-- filtre `is_active` mais pas `deleted_at`; le service d'envoi, lui, filtre les
-- deux, donc un membre supprime en douceur peut encore ecrire une ligne inutile
-- mais ne recoit rien.
--
-- Rollback:
--   drop policy if exists "Un membre gere ses abonnements push de son restaurant"
--     on public.push_subscriptions;
--   create policy "Users can manage own push subscriptions"
--     on public.push_subscriptions for all to authenticated
--     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
--   grant truncate, trigger, references on table public.push_subscriptions to authenticated;

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
drop policy if exists "Un membre gere ses abonnements push de son restaurant" on public.push_subscriptions;

create policy "Un membre gere ses abonnements push de son restaurant"
  on public.push_subscriptions
  for all
  to authenticated
  using (
    user_id = (select auth.uid())
    and tenant_id in (select public.get_my_tenant_ids())
  )
  with check (
    user_id = (select auth.uid())
    and tenant_id in (select public.get_my_tenant_ids())
  );

revoke truncate, trigger, references on table public.push_subscriptions from authenticated;

-- `anon` n'a plus rien sur cette table depuis 20260731000300; on le redit pour
-- que l'etat vise soit lisible dans un seul fichier.
revoke all on table public.push_subscriptions from anon;

-- DB-03 - un employe desactive conserve tous ses droits en base.
--
-- Etat verifie le 2026-07-31 sur un snapshot du schema de production:
--   CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array() ...
--     SELECT COALESCE(array_agg(tenant_id), '{}')
--     FROM admin_users
--     WHERE user_id = auth.uid()          -- aucun filtre is_active
--
-- Ces deux helpers sont references par 66 policies (mesure en base), et par
-- assert_tenant_member(), qui garde a son tour les RPC SECURITY DEFINER de stock,
-- de reporting et de caisse.
--
-- Consequence: desactiver un employe ne supprime pas sa ligne admin_users, donc
-- tant que son compte auth.users existe il garde un acces complet en lecture ET
-- en ecriture a orders, payments, menu_items, ingredients, stock_movements,
-- settings et coupons, via PostgREST comme via les RPC. Le filtrage is_active
-- n'existait qu'en couche applicative.
--
-- Le projet avait diagnostique ce probleme et l'avait corrige pour UNE seule
-- table (20260712000000_qr_designs_rls_active_member.sql). Le correctif n'a
-- jamais ete remonte dans le helper.
--
-- Sur COALESCE(is_active, true): l'audit le presentait comme indispensable, au
-- motif que des lignes historiques pourraient porter NULL. Verifie le 2026-07-31,
-- c'est FAUX sur le schema actuel: admin_users.is_active est NOT NULL DEFAULT true,
-- une ligne NULL est donc impossible (l'insertion echoue sur la contrainte).
-- Le COALESCE est conserve malgre tout, en ceinture-bretelles: il ne coute rien
-- et il evite que ce helper coupe silencieusement l'acces de tout le monde si un
-- jour quelqu'un retire le NOT NULL. Il ne faut simplement pas croire qu'il
-- protege un cas existant aujourd'hui.
--
-- Hors perimetre, constate en passant et NON corrige ici: ces helpers ne filtrent
-- pas non plus deleted_at. Un membre supprime conserve donc ses droits en base.
-- A traiter comme un constat distinct, avec son propre test de non-regression.
--
-- Rollback: retirer la ligne COALESCE des deux corps de fonction.

create or replace function public.get_my_tenant_ids_array()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(tenant_id), '{}')
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
$function$;

create or replace function public.get_my_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select tenant_id
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
$function$;

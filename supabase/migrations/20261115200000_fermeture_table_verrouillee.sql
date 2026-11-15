-- ============================================================================
-- Fermeture d'une table SANS course avec une nouvelle commande.
-- ============================================================================
--
-- LE DEFAUT. L'application fermait une session de table en deux requetes:
-- (1) compter les commandes non soldees, (2) passer la session a 'closed'.
-- create_order_with_items, lui, verrouille la table (pg_advisory_xact_lock sur
-- 'table_session:<tenant>:<table>') pour retrouver ou creer la session ouverte
-- puis y inserer la commande. La fermeture ne prenait PAS ce verrou: une
-- commande inseree entre (1) et (2) se retrouvait sur une session fermee - une
-- note impayee rattachee a une table "libre", que la salle ne voyait plus.
--
-- LE CORRECTIF. Une seule fonction, transactionnelle, qui prend LE MEME verrou
-- que create_order_with_items, puis verifie et ferme dans la meme transaction.
-- Une commande concurrente attend la fin de la fermeture (et ouvre alors une
-- nouvelle session), ou la fermeture attend la fin de la commande (et la voit).
--
-- Regle de "soldee" (decision du proprietaire du 2026-11-15, usage du marche):
-- une table reste occupee tant qu'une commande non annulee est impayee ou
-- partiellement payee, ou n'est pas servie - sauf si elle a ete creee avant
-- p_stale_before (commande payee jamais marquee servie: liberee apres le delai
-- fixe par l'application, 2 h). Seul le service_role choisit ce delai; pour un
-- employe connecte il vaut toujours 2 h, calcule ici. p_require_served = false sert au bouton "Liberer la
-- table": seul l'argent du compte, et il est reserve au service_role (l'action
-- serveur controle la permission `orders.manage` avant d'appeler).
--
-- Retour: 'closed' (fermee par cet appel), 'unsettled' (il reste quelque chose
-- a regler ou a servir, rien n'est change), 'not_open' (session deja fermee ou
-- introuvable pour ce restaurant).
--
-- Rollback: drop function public.close_table_session_if_settled(uuid, uuid, timestamptz, boolean);
-- ============================================================================

create or replace function public.close_table_session_if_settled(
  p_session_id uuid,
  p_tenant_id uuid,
  p_stale_before timestamptz default null,
  p_require_served boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_number text;
  v_stale_before timestamptz;
begin
  -- Membre du restaurant, super admin ou service_role; refus sinon.
  perform public.assert_tenant_member(p_tenant_id);

  if coalesce(auth.role(), '') <> 'service_role' then
    if not p_require_served then
      raise exception 'access denied: manual table release is server-side only'
        using errcode = '42501';
    end if;
    -- Meme droit que la policy UPDATE de table_sessions: un employe connecte
    -- ne ferme une table que s'il peut encaisser. Les gestes de cuisine et de
    -- salle passent par le serveur applicatif (service_role).
    if not public.has_tenant_write_permission(p_tenant_id, 'orders.pay') then
      raise exception 'access denied: closing a table requires orders.pay'
        using errcode = '42501';
    end if;
  end if;

  -- Le delai "commande payee jamais servie" ne se negocie pas: seul le serveur
  -- applicatif (service_role) le fournit. Un employe connecte qui passerait sa
  -- propre limite (ex: now()) liberait une table payee encore en cuisine.
  v_stale_before := case
    when coalesce(auth.role(), '') = 'service_role' then p_stale_before
    -- Meme valeur que STALE_PAID_ORDER_MS (src/services/order/order-lifecycle.ts).
    else now() - interval '2 hours'
  end;

  select table_number into v_table_number
  from public.table_sessions
  where id = p_session_id and tenant_id = p_tenant_id and status = 'open';
  if v_table_number is null then
    return 'not_open';
  end if;

  -- MEME cle que create_order_with_items: les deux s'excluent mutuellement.
  perform pg_advisory_xact_lock(
    hashtext('table_session:' || p_tenant_id::text || ':' || v_table_number)
  );

  if exists (
    select 1
    from public.orders o
    where o.tenant_id = p_tenant_id
      and o.session_id = p_session_id
      and o.status <> 'cancelled'
      and (
        coalesce(o.payment_status, 'pending') in ('pending', 'partial')
        or (
          p_require_served
          and o.status not in ('delivered', 'served')
          and (v_stale_before is null or o.created_at > v_stale_before)
        )
      )
  ) then
    return 'unsettled';
  end if;

  update public.table_sessions
  set status = 'closed', closed_at = now()
  where id = p_session_id and tenant_id = p_tenant_id and status = 'open';

  return case when found then 'closed' else 'not_open' end;
end;
$$;

revoke all on function public.close_table_session_if_settled(uuid, uuid, timestamptz, boolean)
  from public, anon;
grant execute on function public.close_table_session_if_settled(uuid, uuid, timestamptz, boolean)
  to authenticated, service_role;

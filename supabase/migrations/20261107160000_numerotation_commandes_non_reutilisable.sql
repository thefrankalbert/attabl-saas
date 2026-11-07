-- Un numero de commande ne doit JAMAIS etre reutilise.
--
-- LE DEFAUT, mesure sur le corps STOCKE de la fonction en production (pas sur
-- une migration qui la nomme). `next_order_number` calculait le prochain numero
-- par un MAX sur la table `orders`:
--
--     SELECT COALESCE(MAX(SUBSTRING(order_number FROM 'CMD-\d{8}-(\d+)')::int), 0) + 1
--       FROM orders WHERE tenant_id = ... AND order_number LIKE 'CMD-<jour>-%'
--
-- Trois consequences, la premiere etant la plus grave:
--
--   1. REUTILISATION APRES SUPPRESSION. Supprimer la derniere commande du jour
--      (c'est un geste offert par l'interface admin) fait retomber le MAX, et la
--      commande suivante reprend le numero libere. Deux tickets imprimes portent
--      alors le MEME numero, dont un qui n'existe plus en base. Pour une piece
--      comptable, c'est redhibitoire. L'index unique (tenant_id, order_number)
--      ne l'empeche pas: la ligne d'origine a disparu.
--   2. LA FONCTION EST EN DROITS APPELANT (`SECURITY INVOKER`) et executable par
--      `anon` ET `authenticated`. Son MAX passe donc par RLS: un appelant qui ne
--      voit qu'une partie des commandes calcule un MAX trop bas, et le numero
--      rendu entre en collision avec l'index unique. Les droits sont resserres
--      a `service_role` seul (voir la section 4), apres verification que c'est
--      le seul role qui cree des commandes.
--   3. Cout qui grandit avec la journee: un scan par commande creee.
--
-- MESURE EN PRODUCTION AVANT CORRECTION (2026-11-07): aucun trou et aucun
-- doublon sur 732 commandes - donc le defaut 1 ne s'est pas encore produit. En
-- revanche le secours applicatif, lui, A DEJA SERVI: 7 commandes du 2026-05-02
-- portent un numero hors sequence (`CMD-` + horodatage base36), signe que la RPC
-- avait echoue. On corrige donc avant l'incident, pas apres.
--
-- LA CORRECTION: un compteur dedie, incremente atomiquement. Il ne redescend
-- jamais, quoi qu'il arrive aux lignes de `orders`.
--
-- Rollback: en fin de fichier.

-- ---------------------------------------------------------------------------
-- 1. Le compteur
-- ---------------------------------------------------------------------------
-- Une ligne par restaurant et par jour, comme le format `CMD-<jour>-<seq>` qui
-- repart a 1 chaque matin. `dernier` ne decroit jamais.
create table if not exists public.order_number_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  jour date not null,
  dernier integer not null default 0,
  primary key (tenant_id, jour)
);

comment on table public.order_number_counters is
  'Compteur de numerotation des commandes, par restaurant et par jour. Remplace le calcul par MAX sur orders, qui reutilisait le numero d une commande supprimee et dependait de RLS. Ecrit UNIQUEMENT par next_order_number (SECURITY DEFINER): aucun role client n a de droit dessus.';

-- RLS active SANS AUCUNE policy: personne n'y accede par PostgREST. Seule la
-- fonction SECURITY DEFINER ci-dessous la touche. C'est voulu - une table de
-- numerotation n'a aucune raison d'etre lisible ou modifiable par un client.
alter table public.order_number_counters enable row level security;

revoke all on table public.order_number_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reprendre la numerotation du jour la ou elle en est
-- ---------------------------------------------------------------------------
-- Sans cette reprise, la premiere commande suivant la migration repartirait a 1
-- et heurterait l'index unique. On ne remonte que les journees qui ont des
-- commandes au format attendu.
insert into public.order_number_counters (tenant_id, jour, dernier)
select o.tenant_id,
       to_date(substring(o.order_number from 'CMD-([0-9]{8})-'), 'YYYYMMDD'),
       max(substring(o.order_number from 'CMD-[0-9]{8}-([0-9]+)')::integer)
  from public.orders o
 where o.order_number ~ '^CMD-[0-9]{8}-[0-9]+$'
 group by 1, 2
    on conflict (tenant_id, jour)
    do update set dernier = greatest(public.order_number_counters.dernier, excluded.dernier);

-- ---------------------------------------------------------------------------
-- 3. La fonction
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, pour deux raisons distinctes: le compteur n'est accessible
-- a aucun role client, et le resultat ne doit plus dependre de ce que l'appelant
-- a le droit de voir dans `orders`.
--
-- L'`insert ... on conflict do update ... returning` est atomique: deux
-- commandes simultanees obtiennent deux numeros differents sans verrou
-- consultatif, et sans jamais lire `orders`.
create or replace function public.next_order_number(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jour date := (now() at time zone 'UTC')::date;
  v_seq integer;
begin
  -- Un restaurant inexistant ou supprime n'obtient pas de numero. Deuxieme
  -- barriere seulement: depuis le resserrage des droits ci-dessous, seul
  -- `service_role` peut appeler cette fonction. Ce controle reste parce qu'un
  -- futur chemin pourrait lui rendre des droits sans y penser.
  if not exists (
    select 1 from public.tenants t
     where t.id = p_tenant_id and t.deleted_at is null
  ) then
    raise exception 'Restaurant inconnu' using errcode = 'foreign_key_violation';
  end if;

  insert into public.order_number_counters (tenant_id, jour, dernier)
  values (p_tenant_id, v_jour, 1)
      on conflict (tenant_id, jour)
      do update set dernier = public.order_number_counters.dernier + 1
   returning dernier into v_seq;

  return 'CMD-' || to_char(v_jour, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Les droits: service_role SEULEMENT
-- ---------------------------------------------------------------------------
-- L'ancienne fonction etait executable par `anon` et `authenticated`. Une
-- premiere version de cette migration gardait ces droits en documentant le
-- risque comme un residu assume. La relecture de securite a eu raison de le
-- refuser: un residu qu'on peut fermer n'est pas un residu.
--
-- VERIFIE, CHEMIN PAR CHEMIN, avant de retirer quoi que ce soit:
--   - les TROIS routes qui creent une commande (`/api/orders` pour la commande
--     d'un client, `/api/orders/pos` pour la caisse, `/api/orders/preview`)
--     construisent toutes `createOrderService(createAdminClient())`, donc
--     service_role;
--   - les deux composants navigateur qui construisent le service
--     (`POSClient`, `ServiceManager`) n'appellent QUE des methodes de lecture
--     (`getCurrentOrderForTable`, `listReadyOrdersToday`), jamais la
--     numerotation;
--   - aucun composant de la vitrine ne construit ce service;
--   - un seul endroit appelle la RPC: `generateOrderNumber` dans
--     `src/services/order/order-creation.ts`, atteint uniquement par ces routes.
--
-- Donc ni `anon` ni `authenticated` n'en ont besoin. Si un futur chemin en
-- manquait, il n'ecrirait PAS un mauvais numero: il tomberait sur le secours
-- `CMD-HS-`, visible en comptabilite et journalise en erreur.
revoke execute on function public.next_order_number(uuid) from public, anon, authenticated;
grant execute on function public.next_order_number(uuid) to service_role;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Reposer la version d'origine (relevee sur le corps stocke en production le
-- 2026-11-07), puis retirer le compteur:
--
-- create or replace function public.next_order_number(p_tenant_id uuid)
-- returns text language plpgsql set search_path to 'public' as $$
-- declare v_date text; v_seq integer; v_lock_key bigint;
-- begin
--   v_date := to_char(now(), 'YYYYMMDD');
--   v_lock_key := ('x' || left(md5(p_tenant_id::text || v_date), 15))::bit(60)::bigint;
--   perform pg_advisory_xact_lock(v_lock_key);
--   select coalesce(max(nullif(substring(order_number from 'CMD-\d{8}-(\d+)')::integer, 0)), 0) + 1
--     into v_seq from orders
--    where tenant_id = p_tenant_id and order_number like 'CMD-' || v_date || '-%';
--   return 'CMD-' || v_date || '-' || lpad(v_seq::text, 3, '0');
-- end; $$;
-- drop table if exists public.order_number_counters;

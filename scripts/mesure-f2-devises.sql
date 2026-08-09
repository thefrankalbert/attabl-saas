-- Mesure F2: combien de commandes portent une devise de comptabilisation qui
-- n'est pas celle de leur tenant ?
--
-- A JOUER AVANT d'ecrire la moindre migration corrective de donnees. Le dossier
-- l'exige, et l'experience de F1 le confirme: la migration corrective ecrite
-- SANS ce comptage aurait gele la demo et BLU TABLE. Une correction de montants
-- ecrite a l'aveugle reecrit des ecritures financieres justes.
--
-- Lecture seule. A jouer avec psql sur la base de production:
--   psql "$DATABASE_URL" -f scripts/mesure-f2-devises.sql

\echo '=== 1. Commandes dont display_currency differe de la devise du tenant ==='
-- Si ce compte est 0, AUCUNE migration corrective n'est necessaire: le correctif
-- de code suffit, et on s'arrete la.
select t.slug,
       t.currency            as devise_tenant,
       o.display_currency    as devise_commande,
       count(*)              as nb_commandes,
       min(o.created_at)     as premiere,
       max(o.created_at)     as derniere,
       sum(o.total)          as somme_stockee_unites_mineures
from public.orders o
join public.tenants t on t.id = o.tenant_id
where coalesce(o.display_currency, 'XAF') is distinct from coalesce(t.currency, 'XAF')
group by 1, 2, 3
order by nb_commandes desc;

\echo ''
\echo '=== 2. Commandes SANS display_currency (repli silencieux sur XAF) ==='
-- Chemin POS avant correctif. Pour un tenant a deux decimales, le montant
-- stocke a ete divise par 100 a l'ecriture: 12,50 EUR ecrit 13.
select t.slug,
       t.currency as devise_tenant,
       count(*)   as nb_commandes,
       min(o.created_at) as premiere,
       max(o.created_at) as derniere
from public.orders o
join public.tenants t on t.id = o.tenant_id
where o.display_currency is null
group by 1, 2
order by nb_commandes desc;

\echo ''
\echo '=== 3. Incoherence detail / total (controle croise F8) ==='
-- SUM(price_at_order * quantity) doit retomber sur orders.total hors taxes,
-- remises et service. Un ecart massif sur une commande a variantes est la
-- signature du constat F8 (prix indexe par article et non par ligne).
select o.id,
       o.order_number,
       t.slug,
       o.total                                              as total_commande,
       sum(oi.price_at_order * oi.quantity)                 as somme_lignes,
       o.discount_amount,
       o.tax_amount,
       o.service_charge_amount
from public.orders o
join public.tenants t on t.id = o.tenant_id
join public.order_items oi on oi.order_id = o.id
group by o.id, o.order_number, t.slug, o.total, o.discount_amount, o.tax_amount,
         o.service_charge_amount
having abs(
         sum(oi.price_at_order * oi.quantity)
         - (o.total + coalesce(o.discount_amount, 0)
            - coalesce(o.tax_amount, 0) - coalesce(o.service_charge_amount, 0))
       ) > 1
order by o.created_at desc
limit 50;

\echo ''
\echo '=== 4. Tenants et leur devise (contexte de lecture des blocs ci-dessus) ==='
select slug, currency, subscription_plan, subscription_status, is_active
from public.tenants
where deleted_at is null
order by slug;

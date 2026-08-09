\echo '=== F1: tenants payants SANS abonnement Stripe (fraude possible) ==='
select subscription_plan,
       subscription_status,
       count(*) as nb
from public.tenants
where deleted_at is null
  and stripe_subscription_id is null
group by 1, 2
order by nb desc;

\echo ''
\echo '=== F1bis: total tenants actifs, pour rapporter les chiffres ci-dessus ==='
select count(*) as tenants_actifs from public.tenants where deleted_at is null;

\echo ''
\echo '=== F2: commandes dont la devise affichee DIFFERE de celle du tenant ==='
select t.currency        as devise_tenant,
       o.display_currency as devise_commande,
       count(*)          as nb_commandes,
       min(o.created_at) as premiere,
       max(o.created_at) as derniere
from public.orders o
join public.tenants t on t.id = o.tenant_id
where o.display_currency is not null
  and o.display_currency <> t.currency
group by 1, 2
order by nb_commandes desc;

\echo ''
\echo '=== F2bis: total commandes, pour rapporter ==='
select count(*) as total_commandes from public.orders;

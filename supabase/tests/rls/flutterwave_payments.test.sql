-- Paiements Flutterwave: privileges, lecture cloisonnee, application ATOMIQUE
-- d'un paiement a l'abonnement, et horloge de renouvellement.
--
-- CE QUE CE TEST VERROUILLE. La table porte le prix attendu et l'etat regle d'un
-- paiement d'abonnement; la fonction apply_flutterwave_payment reserve le
-- paiement ET prolonge l'abonnement en UNE transaction. Si un role client pouvait
-- ecrire dans la table ou appeler les fonctions, un restaurant pourrait se faire
-- prolonger sans payer. Les privileges par defaut du schema accordent tout a
-- anon et authenticated (y compris EXECUTE sur les fonctions): la migration les
-- retire, et ce test mesure que c'est bien le cas, sur le COMPORTEMENT.
-- Les regles de decision (periode, plan, Stripe, expiration, gel) vivent en SQL
-- et ne sont mesurables qu'ici.
--
-- Execution: psql "$LOCAL_DB" -X -A -t -f supabase/tests/rls/flutterwave_payments.test.sql
-- (PAS `psql -q`: il formate le TAP en tableau et masque les echecs.)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(81);

-- ---------------------------------------------------------------------------
-- Aides (temporaires, detruites avec la transaction)
-- ---------------------------------------------------------------------------
create function pg_temp.tid(n int) returns uuid language sql as
  $$ select ('ffff0000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n int) returns uuid language sql as
  $$ select ('eeee0000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.mk_tenant(
  n int, p_status text, p_plan text, p_end timestamptz,
  p_trial timestamptz default null, p_stripe text default null,
  p_reason text default null, p_suspended timestamptz default null,
  p_deleted timestamptz default null
) returns void language sql as $$
  insert into public.tenants
    (id, slug, name, currency, subscription_status, subscription_plan,
     subscription_current_period_end, trial_ends_at, stripe_subscription_id,
     freeze_reason, suspended_at, deleted_at, is_active)
  values
    (pg_temp.tid(n), 'flw-' || n, 'Resto ' || n, 'XOF', p_status, p_plan,
     p_end, coalesce(p_trial, '2026-01-01T00:00:00Z'), p_stripe, p_reason, p_suspended, p_deleted,
     p_status in ('trial', 'active', 'past_due') and p_suspended is null and p_deleted is null)
$$;

create function pg_temp.mk_pending(
  n int, p_plan text, p_interval text, p_amount bigint,
  p_created timestamptz default '2026-11-14T10:00:00Z'
) returns void language sql as $$
  insert into public.flutterwave_payments
    (id, tenant_id, tx_ref, plan, billing_interval, amount, currency, status, created_at)
  values (pg_temp.pid(n), pg_temp.tid(n), 'atb_t' || n, p_plan, p_interval, p_amount, 'XOF', 'pending', p_created)
$$;

create function pg_temp.go(
  n int, p_flw bigint, p_paid bigint, p_price bigint,
  p_live boolean default false, p_now timestamptz default '2026-11-15T10:00:00Z'
) returns jsonb language sql as $$
  select public.apply_flutterwave_payment(pg_temp.pid(n), p_flw, p_paid, p_price, p_live, p_now)
$$;

create function pg_temp.pay(n int) returns public.flutterwave_payments language sql as
  $$ select * from public.flutterwave_payments where id = pg_temp.pid(n) $$;
create function pg_temp.ten(n int) returns public.tenants language sql as
  $$ select * from public.tenants where id = pg_temp.tid(n) $$;

-- ===========================================================================
-- 1. Forme: table, RLS, privileges, fonctions
-- ===========================================================================
select is(
  (select relrowsecurity from pg_class where oid = 'public.flutterwave_payments'::regclass),
  true, 'la RLS est active sur flutterwave_payments');
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.flutterwave_payments'::regclass),
  1, 'une seule policy: aucune policy d ecriture');
select is(
  (select polcmd from pg_policy where polrelid = 'public.flutterwave_payments'::regclass),
  'r'::"char", 'la policy est une policy de LECTURE');
select is(has_table_privilege('authenticated', 'public.flutterwave_payments', 'insert'), false,
  'authenticated ne peut pas inserer');
select is(has_table_privilege('authenticated', 'public.flutterwave_payments', 'update'), false,
  'authenticated ne peut pas modifier');
select is(has_table_privilege('anon', 'public.flutterwave_payments', 'select'), false,
  'anon ne lit rien');
select ok(
  exists (select 1 from pg_indexes where tablename = 'flutterwave_payments'
            and indexdef like '%(tenant_id, status, period_end)%'),
  'index (tenant_id, status, period_end) present');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('apply_flutterwave_payment', 'flutterwave_renewals_due', 'flutterwave_freeze_overdue')
      and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  3, 'les trois fonctions sont SECURITY DEFINER avec search_path vide');

select is(
  (select bool_or(has_function_privilege(r, f, 'execute'))
     from unnest(array[
       'public.apply_flutterwave_payment(uuid,bigint,bigint,bigint,boolean,timestamptz)',
       'public.flutterwave_renewals_due(timestamptz,integer)',
       'public.flutterwave_freeze_overdue(timestamptz,interval,integer)']) f,
          unnest(array['anon', 'authenticated']) r),
  false, 'ni anon ni authenticated ne peuvent EXECUTER les trois fonctions');
select is(
  (select bool_and(has_function_privilege('service_role', f, 'execute'))
     from unnest(array[
       'public.apply_flutterwave_payment(uuid,bigint,bigint,bigint,boolean,timestamptz)',
       'public.flutterwave_renewals_due(timestamptz,integer)',
       'public.flutterwave_freeze_overdue(timestamptz,interval,integer)']) f),
  true, 'service_role peut les executer (temoin positif)');
select is(
  (select count(*)::int from pg_proc p
     where p.proname in ('apply_flutterwave_payment', 'flutterwave_renewals_due', 'flutterwave_freeze_overdue')
       and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)),
  0, 'PUBLIC n a aucun EXECUTE sur les trois fonctions');

-- Contraintes de la table
select pg_temp.mk_tenant(90, 'active', 'pro', null);
select throws_ok($$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
  values (pg_temp.tid(90), 'dup', 'pro', 'monthly', 1, 'EUR')$$, '23514', NULL, 'seules XOF et XAF sont acceptees');
select lives_ok($$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
  values (pg_temp.tid(90), 'dup', 'pro', 'monthly', 1, 'XOF')$$, 'une ligne pending valide s insere');
select throws_ok($$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
  values (pg_temp.tid(90), 'dup', 'pro', 'monthly', 1, 'XOF')$$, '23505', NULL, 'tx_ref est unique');
select throws_ok($$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency, status, flw_transaction_id)
  values (pg_temp.tid(90), 'r1', 'pro', 'monthly', 1, 'XOF', 'successful', 5)$$, '23514', NULL,
  'une ligne successful sans periode est refusee');
select lives_ok($$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency, status, flw_transaction_id)
  values (pg_temp.tid(90), 'r2', 'pro', 'monthly', 1, 'XOF', 'rejected_conflict', 6)$$,
  'une ligne rejected_* avec transaction et sans periode est valide');

-- ===========================================================================
-- 2. apply_flutterwave_payment: periode
-- ===========================================================================
select pg_temp.mk_tenant(1, 'trial', 'starter', null);
select pg_temp.mk_pending(1, 'pro', 'monthly', 79000);
select is(pg_temp.go(1, 1001, 79000, 79000) ->> 'outcome', 'applied', 'S1: essai sans periode -> applied');
select is(
  (select row(subscription_status, subscription_plan, billing_interval, is_active, freeze_reason,
              subscription_current_period_start, subscription_current_period_end)::text from pg_temp.ten(1)),
  row('active', 'pro', 'monthly', true, null::text, '2026-11-15T10:00:00Z'::timestamptz, '2026-12-15T10:00:00Z'::timestamptz)::text,
  'S1: abonnement active, plan pose, periode d un mois depuis maintenant');
select is(
  (select row(status, flw_transaction_id, period_end)::text from pg_temp.pay(1)),
  row('successful', 1001::bigint, '2026-12-15T10:00:00Z'::timestamptz)::text,
  'S1: la ligne de paiement est reglee avec la meme periode');

select pg_temp.mk_tenant(2, 'active', 'pro', '2026-11-20T00:00:00Z');
select pg_temp.mk_pending(2, 'pro', 'monthly', 79000);
select pg_temp.go(2, 1002, 79000, 79000);
select is((select subscription_current_period_end from pg_temp.ten(2)), '2026-12-20T00:00:00Z'::timestamptz,
  'S2: meme plan, on prolonge depuis la fin de periode en cours (aucun jour perdu)');

select pg_temp.mk_tenant(3, 'active', 'pro', '2026-10-01T00:00:00Z');
select pg_temp.mk_pending(3, 'pro', 'monthly', 79000);
select pg_temp.go(3, 1003, 79000, 79000);
select is((select subscription_current_period_end from pg_temp.ten(3)), '2026-12-15T10:00:00Z'::timestamptz,
  'S3: periode expiree, on repart de maintenant (pas de rattrapage)');

select pg_temp.mk_tenant(4, 'trial', 'starter', null);
select pg_temp.mk_pending(4, 'pro', 'yearly', 804000);
select pg_temp.go(4, 1004, 804000, 804000);
select is((select subscription_current_period_end from pg_temp.ten(4)), '2027-11-15T10:00:00Z'::timestamptz,
  'S4: annuel = douze mois');

select pg_temp.mk_tenant(5, 'trial', 'starter', null, '2026-11-25T10:00:00Z');
select pg_temp.mk_pending(5, 'pro', 'monthly', 79000);
select pg_temp.go(5, 1005, 79000, 79000);
select is((select row(subscription_current_period_start, subscription_current_period_end)::text from pg_temp.ten(5)),
  row('2026-11-25T10:00:00Z'::timestamptz, '2026-12-25T10:00:00Z'::timestamptz)::text,
  'S5: un essai en cours garde ses jours restants');

select pg_temp.mk_tenant(6, 'trial', 'starter', null);
select pg_temp.mk_pending(6, 'pro', 'monthly', 79000, '2027-01-30T10:00:00Z');
select pg_temp.go(6, 1006, 79000, 79000, false, '2027-01-31T10:00:00Z');
select is((select subscription_current_period_end from pg_temp.ten(6)), '2027-02-28T10:00:00Z'::timestamptz,
  'S6: 31 janvier + 1 mois = 28 fevrier');

-- ===========================================================================
-- 3. Plan different en cours de periode (HIGH-2)
-- ===========================================================================
select pg_temp.mk_tenant(7, 'active', 'pro', '2026-11-25T10:00:00Z');
select pg_temp.mk_pending(7, 'starter', 'monthly', 39000);
select is(pg_temp.go(7, 1007, 39000, 39000) ->> 'outcome', 'rejected_plan_change',
  'S7: autre plan avec 10 jours restants -> rejected_plan_change');
select is((select row(subscription_plan, subscription_current_period_end)::text from pg_temp.ten(7)),
  row('pro', '2026-11-25T10:00:00Z'::timestamptz)::text, 'S7: l abonnement n a PAS bouge');
select is((select row(status, flw_transaction_id, period_end)::text from pg_temp.pay(7)),
  row('rejected_plan_change', 1007::bigint, null::timestamptz)::text,
  'S7: la ligne porte la transaction (drapeau de remboursement) et aucune periode');

select pg_temp.mk_tenant(8, 'active', 'pro', '2026-11-15T20:00:00Z');
select pg_temp.mk_pending(8, 'business', 'monthly', 149000);
select is(pg_temp.go(8, 1008, 149000, 149000) ->> 'outcome', 'applied',
  'S8: autre plan a moins d un jour de l echeance -> applied');
select is((select row(subscription_plan, subscription_current_period_start, subscription_current_period_end)::text from pg_temp.ten(8)),
  row('business', '2026-11-15T10:00:00Z'::timestamptz, '2026-12-15T10:00:00Z'::timestamptz)::text,
  'S8: le nouveau plan demarre MAINTENANT');

-- ===========================================================================
-- 4. Abonnement Stripe (HIGH-1 / MEDIUM-2)
-- ===========================================================================
select pg_temp.mk_tenant(9, 'cancelled', 'pro', null, null, 'sub_old');
select pg_temp.mk_pending(9, 'pro', 'monthly', 79000);
select is(pg_temp.go(9, 1009, 79000, 79000, false) ->> 'outcome', 'applied',
  'S9: identifiant Stripe perime (verifie mort par le code) -> applied');
select is((select row(stripe_subscription_id, subscription_status)::text from pg_temp.ten(9)),
  row(null::text, 'active')::text, 'S9: l identifiant Stripe mort est EFFACE, abonnement actif');

select pg_temp.mk_tenant(10, 'active', 'pro', '2026-12-01T00:00:00Z', null, 'sub_live');
select pg_temp.mk_pending(10, 'pro', 'monthly', 79000);
select is(pg_temp.go(10, 1010, 79000, 79000, false) ->> 'outcome', 'rejected_conflict',
  'S10: abonnement Stripe vivant (statut local actif + identifiant) -> rejected_conflict');
select is((select row(stripe_subscription_id, subscription_current_period_end)::text from pg_temp.ten(10)),
  row('sub_live', '2026-12-01T00:00:00Z'::timestamptz)::text, 'S10: l abonnement Stripe n a PAS ete touche');
select is((select status from pg_temp.pay(10)), 'rejected_conflict', 'S10: la ligne est marquee (remboursement a faire)');

select pg_temp.mk_tenant(11, 'frozen', 'pro', null, null, 'sub_unpaid', 'stripe_unpaid');
select pg_temp.mk_pending(11, 'pro', 'monthly', 79000);
select is(pg_temp.go(11, 1011, 79000, 79000, true) ->> 'outcome', 'rejected_conflict',
  'S11: gele mais Stripe vivant (p_stripe_live) -> rejected_conflict');
select is((select subscription_status from pg_temp.ten(11)), 'frozen', 'S11: le restaurant reste gele');

-- ===========================================================================
-- 5. Tentative expiree (L3)
-- ===========================================================================
select pg_temp.mk_tenant(12, 'trial', 'starter', null);
select pg_temp.mk_pending(12, 'pro', 'monthly', 70000, '2026-11-01T10:00:00Z');
select is(pg_temp.go(12, 1012, 70000, 79000) ->> 'outcome', 'rejected_expired',
  'S12: tentative de 14 jours payee sous le prix ACTUEL -> rejected_expired');
select is((select subscription_status from pg_temp.ten(12)), 'trial', 'S12: rien n est applique');

select pg_temp.mk_tenant(13, 'trial', 'starter', null);
select pg_temp.mk_pending(13, 'pro', 'monthly', 70000, '2026-11-01T10:00:00Z');
select is(pg_temp.go(13, 1013, 79000, 79000) ->> 'outcome', 'applied',
  'S13: la meme tentative expiree, payee au prix actuel -> applied');

-- ===========================================================================
-- 6. Idempotence, gels, cas limites
-- ===========================================================================
select is(pg_temp.go(1, 1001, 79000, 79000) ->> 'outcome', 'duplicate', 'S14: rejouer la meme ligne -> duplicate');
select is((select subscription_current_period_end from pg_temp.ten(1)), '2026-12-15T10:00:00Z'::timestamptz,
  'S14: aucune seconde prolongation');

select pg_temp.mk_tenant(14, 'trial', 'starter', null);
select pg_temp.mk_pending(14, 'pro', 'monthly', 79000);
select is(pg_temp.go(14, 1001, 79000, 79000) ->> 'outcome', 'duplicate',
  'S15: la transaction Flutterwave 1001 a deja regle une autre ligne -> duplicate');
select is((select status from pg_temp.pay(14)), 'pending', 'S15: la seconde ligne reste pending');

select pg_temp.mk_tenant(15, 'frozen', 'pro', null, null, null, 'trial_expired');
select pg_temp.mk_pending(15, 'pro', 'monthly', 79000);
select is(pg_temp.go(15, 1015, 79000, 79000) -> 'unfrozen', 'true'::jsonb, 'S16: gel d essai expire -> leve');
select is((select row(subscription_status, is_active, freeze_reason)::text from pg_temp.ten(15)),
  row('active', true, null::text)::text, 'S16: actif, is_active, cause effacee');

select pg_temp.mk_tenant(16, 'frozen', 'pro', null, null, null, 'dispute');
select pg_temp.mk_pending(16, 'pro', 'monthly', 79000);
select is(pg_temp.go(16, 1016, 79000, 79000) ->> 'outcome', 'rejected_blocked',
  'S17: gel pour litige -> rejected_blocked (argent pris, a rembourser)');
select is((select row(subscription_status, is_active, freeze_reason, subscription_current_period_end)::text from pg_temp.ten(16)),
  row('frozen', false, 'dispute', null::timestamptz)::text, 'S17: reste gele, aucune periode ecrite');
select is((select row(status, flw_transaction_id)::text from pg_temp.pay(16)),
  row('rejected_blocked', 1016::bigint)::text, 'S17: la ligne porte la transaction (drapeau de remboursement)');

select pg_temp.mk_tenant(23, 'frozen', 'pro', null, null, null, null);
select pg_temp.mk_pending(23, 'pro', 'monthly', 79000);
select is(pg_temp.go(23, 1023, 79000, 79000) ->> 'outcome', 'rejected_blocked',
  'S17b: gele sans cause connue -> rejected_blocked (cause inconnue = gel qui ne se leve pas)');

select pg_temp.mk_tenant(17, 'trial', 'starter', null, null, null, null, '2026-11-01T00:00:00Z');
select pg_temp.mk_pending(17, 'pro', 'monthly', 79000);
select is(pg_temp.go(17, 1017, 79000, 79000) ->> 'outcome', 'rejected_blocked',
  'S18: restaurant suspendu par le super-admin -> rejected_blocked');
select is((select row(subscription_status, is_active)::text from pg_temp.ten(17)),
  row('trial', false)::text, 'S18: le restaurant suspendu n est pas reactive par un paiement');

select pg_temp.mk_tenant(18, 'active', 'pro', null, null, null, null, null, '2026-11-01T00:00:00Z');
select pg_temp.mk_pending(18, 'pro', 'monthly', 79000);
select is(pg_temp.go(18, 1018, 79000, 79000) ->> 'outcome', 'tenant_not_found', 'S19: restaurant supprime -> tenant_not_found');
select is((select status from pg_temp.pay(18)), 'pending', 'S19: la ligne reste pending');
select is(public.apply_flutterwave_payment('00000000-0000-0000-0000-000000000000', 1, 1, 1, false) ->> 'outcome',
  'unknown_payment', 'S20: ligne inconnue -> unknown_payment');

-- ===========================================================================
-- 7. Cycle de vie complet: identifiant Stripe perime -> paiement -> rappels -> gel -> renouvellement
-- ===========================================================================
-- Le restaurant 9 (S9) a paye le 2026-11-15 10:00 pour un mois: fin le 2026-12-15 10:00.
select is((select count(*)::int from public.flutterwave_renewals_due('2026-12-01T10:00:00Z', 50) where tenant_id = pg_temp.tid(9)),
  0, 'L1: a 14 jours de l echeance, aucun rappel');
select is((select reminder from public.flutterwave_renewals_due('2026-12-08T10:00:00Z', 50) where tenant_id = pg_temp.tid(9)),
  'd7', 'L2: a 7 jours, rappel d7 (restaurant dont l identifiant Stripe a ete efface)');
update public.flutterwave_payments set reminder_d7_at = '2026-12-08T10:00:00Z' where id = pg_temp.pid(9);
select is((select count(*)::int from public.flutterwave_renewals_due('2026-12-08T10:00:00Z', 50) where tenant_id = pg_temp.tid(9)),
  0, 'L3: une fois le rappel marque, le restaurant sort du resultat');
select is((select reminder from public.flutterwave_renewals_due('2026-12-14T11:00:00Z', 50) where tenant_id = pg_temp.tid(9)),
  'd1', 'L4: a moins d un jour, rappel d1');

-- Un restaurant revenu chez Stripe n'est jamais relance.
select pg_temp.mk_tenant(20, 'active', 'pro', '2026-12-01T00:00:00Z');
select pg_temp.mk_pending(20, 'pro', 'monthly', 79000);
select pg_temp.go(20, 1020, 79000, 79000, false, '2026-11-01T00:00:00Z');
update public.tenants set stripe_subscription_id = 'sub_back', subscription_current_period_end = '2026-12-01T00:00:00Z'
  where id = pg_temp.tid(20);
select is((select count(*)::int from public.flutterwave_renewals_due('2026-11-28T00:00:00Z', 50) where tenant_id = pg_temp.tid(20)),
  0, 'L5: un restaurant repasse sur un abonnement Stripe n est pas relance');

-- Pas de famine (L1): 4 restaurants deja relances ne retiennent pas le 5e dans un lot de 3.
select pg_temp.mk_tenant(30 + g, 'active', 'pro', '2027-03-05T00:00:00Z') from generate_series(1, 5) g;
select pg_temp.mk_pending(30 + g, 'pro', 'monthly', 79000) from generate_series(1, 5) g;
select pg_temp.go(30 + g, 1030 + g, 79000, 79000, false, '2027-02-05T00:00:00Z') from generate_series(1, 5) g;
update public.tenants set subscription_current_period_end = '2027-03-05T00:00:00Z' where id in (select pg_temp.tid(30 + g) from generate_series(1, 5) g);
update public.flutterwave_payments set period_end = '2027-03-05T00:00:00Z' where id in (select pg_temp.pid(30 + g) from generate_series(1, 5) g);
update public.flutterwave_payments set reminder_d7_at = now() where id in (select pg_temp.pid(30 + g) from generate_series(1, 4) g);
select is((select array_agg(tenant_id) from public.flutterwave_renewals_due('2027-03-02T00:00:00Z', 3)), array[pg_temp.tid(35)],
  'L6: le seul restaurant a relancer est rendu malgre un lot de 3 (filtrage cote base)');

-- Gel: pas pendant la grace, oui apres.
select is(public.flutterwave_freeze_overdue('2026-12-17T00:00:00Z', interval '3 days', 50), 0,
  'L7: pendant la grace (fin le 15, grace jusqu au 18) rien n est gele');
select is((select subscription_status from pg_temp.ten(9)), 'active', 'L7: le restaurant 9 est toujours actif');
select pg_temp.mk_tenant(21, 'active', 'pro', '2026-10-01T00:00:00Z');  -- jamais paye par Flutterwave
create temp table freeze_run as
  select public.flutterwave_freeze_overdue('2026-12-19T00:00:00Z', interval '3 days', 50) as n;
select is((select n from freeze_run),
  (select count(*)::int from public.tenants where freeze_reason = 'flutterwave_unpaid'),
  'L8: apres la grace, la fonction gele exactement les restaurants payes par Flutterwave et echus');
select is((select row(subscription_status, is_active, freeze_reason)::text from pg_temp.ten(9)),
  row('frozen', false, 'flutterwave_unpaid')::text, 'L8: gele avec la cause flutterwave_unpaid');
select is((select subscription_status from pg_temp.ten(21)), 'active',
  'L8: un restaurant sans paiement Flutterwave n est pas gele par cette fonction');
select is((select subscription_status from pg_temp.ten(20)), 'active', 'L8: ni un restaurant sous Stripe');

-- Renouvellement apres le gel: possible, et il leve le gel de cause flutterwave_unpaid.
insert into public.flutterwave_payments (id, tenant_id, tx_ref, plan, billing_interval, amount, currency, status, created_at)
  values (pg_temp.pid(91), pg_temp.tid(9), 'atb_renew9', 'pro', 'monthly', 79000, 'XOF', 'pending', '2026-12-19T01:00:00Z');
select is(public.apply_flutterwave_payment(pg_temp.pid(91), 2009, 79000, 79000, false, '2026-12-19T02:00:00Z') ->> 'outcome',
  'applied', 'L9: le renouvellement apres gel s applique');
select is((select row(subscription_status, is_active, freeze_reason, subscription_current_period_end)::text from pg_temp.ten(9)),
  row('active', true, null::text, '2027-01-19T02:00:00Z'::timestamptz)::text,
  'L9: actif, la periode repart de maintenant');

-- ===========================================================================
-- 7b. Ancrage du jour de periode (LOW-3) et devise (LOW-4)
-- ===========================================================================
-- Restaurant 6 (S6): premiere periode 31 jan -> 28 fev. Le renouvellement contigu
-- retombe sur le 31 (et non sur le 28).
insert into public.flutterwave_payments (id, tenant_id, tx_ref, plan, billing_interval, amount, currency, status, created_at)
  values (pg_temp.pid(96), pg_temp.tid(6), 'atb_t6b', 'pro', 'monthly', 79000, 'XOF', 'pending', '2027-02-19T10:00:00Z');
select pg_temp.go(96, 2096, 79000, 79000, false, '2027-02-20T10:00:00Z');
select is((select subscription_current_period_end from pg_temp.ten(6)), '2027-03-31T10:00:00Z'::timestamptz,
  'A1: 31 jan -> 28 fev -> 31 mars (jour d ancrage conserve)');
select is((select anchor_day from pg_temp.pay(6)), 31::smallint, 'A1: la premiere ligne porte le jour d ancrage 31');

-- Apres une interruption (periode finie, on repart de maintenant), l'ancrage repart aussi.
select pg_temp.mk_tenant(24, 'active', 'pro', '2026-08-31T00:00:00Z');
select pg_temp.mk_pending(24, 'pro', 'monthly', 79000);
select pg_temp.go(24, 1024, 79000, 79000);
select is((select period_end from pg_temp.pay(24)), '2026-12-15T10:00:00Z'::timestamptz,
  'A2: apres une interruption, la periode repart de maintenant avec le jour de maintenant');

-- Un restaurant dont la devise n'est plus XOF/XAF n'est pas relance.
select pg_temp.mk_tenant(25, 'active', 'pro', null);
select pg_temp.mk_pending(25, 'pro', 'monthly', 79000);
select pg_temp.go(25, 1025, 79000, 79000, false, '2026-11-01T00:00:00Z');
select is((select count(*)::int from public.flutterwave_renewals_due('2026-11-28T00:00:00Z', 50) where tenant_id = pg_temp.tid(25)),
  1, 'D1: temoin positif, un restaurant XOF paye est relance');
update public.tenants set currency = 'EUR' where id = pg_temp.tid(25);
select is((select count(*)::int from public.flutterwave_renewals_due('2026-11-28T00:00:00Z', 50) where tenant_id = pg_temp.tid(25)),
  0, 'D2: meme restaurant passe en EUR -> exclu des rappels (aucun paiement Flutterwave possible)');

select ok(
  (select count(*) = 2 from information_schema.columns
    where table_schema = 'public' and table_name = 'flutterwave_payments'
      and column_name in ('anchor_day', 'last_checked_at')),
  'colonnes anchor_day et last_checked_at presentes');

-- ===========================================================================
-- 8. Lecture: qui a billing.manage, meme limite (proprietaire, gerant) (L4)
-- ===========================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('ffee0000-0000-0000-0000-00000000000' || g)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'flw' || g || '@exemple.test', 'x', now(), now()
  from generate_series(1, 5) g;
insert into public.admin_users (user_id, tenant_id, email, role, is_active) values
  ('ffee0000-0000-0000-0000-000000000001', pg_temp.tid(1), 'flw1@exemple.test', 'owner', true),
  ('ffee0000-0000-0000-0000-000000000002', pg_temp.tid(1), 'flw2@exemple.test', 'manager', true),
  ('ffee0000-0000-0000-0000-000000000003', pg_temp.tid(1), 'flw3@exemple.test', 'waiter', true),
  ('ffee0000-0000-0000-0000-000000000004', pg_temp.tid(1), 'flw4@exemple.test', 'manager', false),
  ('ffee0000-0000-0000-0000-000000000005', pg_temp.tid(2), 'flw5@exemple.test', 'owner', true);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"ffee0000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select array_agg(tx_ref) from public.flutterwave_payments), array['atb_t1'],
  'le proprietaire du restaurant 1 ne voit que ses paiements');
select throws_ok($$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
  values ('ffff0000-0000-0000-0000-000000000001', 'hack', 'pro', 'monthly', 1, 'XOF')$$,
  '42501', NULL, 'un proprietaire ne peut pas ecrire dans son registre');
select throws_ok($$select public.apply_flutterwave_payment('eeee0000-0000-0000-0000-000000000001', 1, 1, 1, false)$$,
  '42501', NULL, 'un proprietaire ne peut pas appeler apply_flutterwave_payment (pas de prolongation gratuite)');

set local "request.jwt.claims" = '{"sub":"ffee0000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.flutterwave_payments), 1, 'un gerant voit les paiements de son restaurant (factures: billing.manage limite)');
set local "request.jwt.claims" = '{"sub":"ffee0000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.flutterwave_payments), 0, 'un serveur (waiter) ne voit AUCUN paiement');
set local "request.jwt.claims" = '{"sub":"ffee0000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.flutterwave_payments), 0, 'un gerant DESACTIVE ne voit rien');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.flutterwave_payments$$, '42501', NULL, 'anon ne peut pas lire la table');
reset role;

select * from finish();
rollback;

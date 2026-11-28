-- Les trois politiques de LECTURE repointees par le lot 1 des roles sont
-- evaluees une fois par REQUETE, pas une fois par ligne.
--
-- POURQUOI CE TEST EXISTE. Une politique `has_tenant_write_permission(tenant_id,
-- 'audit.view')` appelle, pour CHAQUE ligne, une chaine de quatre fonctions que
-- le planificateur ne peut pas integrer. `audit_log` est la table qui grossit
-- le plus : la lecture du journal deviendrait lineaire en appels de fonctions.
-- La forme retenue compare `tenant_id` a un tableau calcule par une
-- sous-requete sans reference a la ligne, que PostgreSQL evalue une seule fois
-- (InitPlan). Il suffit d'oublier le `(SELECT ...)` pour perdre cet effet sans
-- changer aucun resultat : seul un test de forme et de plan le voit.
--
-- TEMOIN. Une politique ecrite SANS la sous-requete est creee dans le test :
-- la verification de forme la rejette, et son plan ne montre pas d'InitPlan.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

-- 1 gerant, 2 caissier, 3 chef.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('af000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'lecture' || g || '@test.local', 'x', now(), now()
from generate_series(1, 3) g;
insert into public.tenants (id, slug, name, is_active) values
  ('af000000-0000-4000-8000-00000000000a', 'lecture-a', 'Lecture A', true),
  ('af000000-0000-4000-8000-00000000000b', 'lecture-b', 'Lecture B', true);
insert into public.admin_users (id, tenant_id, user_id, email, postes, is_active) values
  ('af000000-0000-4000-8000-000000000201', 'af000000-0000-4000-8000-00000000000a', 'af000000-0000-4000-8000-000000000101', 'lecture1@test.local', '{manager}', true),
  ('af000000-0000-4000-8000-000000000202', 'af000000-0000-4000-8000-00000000000a', 'af000000-0000-4000-8000-000000000102', 'lecture2@test.local', '{cashier}', true),
  ('af000000-0000-4000-8000-000000000203', 'af000000-0000-4000-8000-00000000000a', 'af000000-0000-4000-8000-000000000103', 'lecture3@test.local', '{chef}', true);

insert into public.audit_log (tenant_id, action, entity_type)
select t, 'create', 'menu_item'
from unnest(array['af000000-0000-4000-8000-00000000000a', 'af000000-0000-4000-8000-00000000000b']::uuid[]) t,
     generate_series(1, 50);
insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency) values
  ('af000000-0000-4000-8000-00000000000a', 'lecture-a', 'pro', 'monthly', 10000, 'XOF'),
  ('af000000-0000-4000-8000-00000000000b', 'lecture-b', 'pro', 'monthly', 10000, 'XOF');
insert into public.invitations (tenant_id, email, postes, invited_by, token, expires_at)
values ('af000000-0000-4000-8000-00000000000a', 'invite-lecture@test.local', '{waiter}',
        'af000000-0000-4000-8000-000000000201', 'jeton-lecture', now() + interval '1 day');

-- La forme attendue, lue dans pg_policies : `= ANY (( SELECT tenants_avec_droit(...`.
create function pg_temp.forme_initplan(p_qual text) returns boolean language sql immutable as
  $f$ select p_qual ~ '= ANY \(\(\s*SELECT (public\.)?tenants_avec_droit\(' $f$;
-- Le plan d'une requete, sous le role et le jeton de l'appelant.
create function public.plan_de_lecture(p_requete text) returns text language plpgsql as $f$
declare v_ligne text; v_plan text := '';
begin
  for v_ligne in execute 'explain (costs off) ' || p_requete loop
    v_plan := v_plan || v_ligne || E'\n';
  end loop;
  return v_plan;
end $f$;
grant execute on function public.plan_de_lecture(text) to authenticated;

-- ===========================================================================
-- Forme des trois politiques
-- ===========================================================================
select ok(pg_temp.forme_initplan((select qual from pg_policies
            where tablename = 'audit_log' and policyname = 'Admins can read audit logs')),
  'forme: la lecture de audit_log passe par une sous-requete tenants_avec_droit');
select ok(pg_temp.forme_initplan((select qual from pg_policies
            where tablename = 'flutterwave_payments' and policyname = 'Proprietaires et admins lisent les paiements Flutterwave')),
  'forme: la lecture de flutterwave_payments aussi');
select ok(pg_temp.forme_initplan((select qual from pg_policies
            where tablename = 'invitations' and policyname = 'tenant_admins_can_view_invitations')),
  'forme: la lecture de invitations aussi');
select is((select count(*)::int from pg_policies
            where schemaname = 'public' and cmd = 'SELECT' and qual like '%tenants_avec_droit%'
              and not pg_temp.forme_initplan(qual)), 0,
  'forme: aucune politique de lecture n appelle tenants_avec_droit hors sous-requete');
select ok((select qual like '%''audit.view''%' from pg_policies
            where tablename = 'audit_log' and policyname = 'Admins can read audit logs')
      and (select qual like '%''billing.manage''%' and qual like '%''limited''%' from pg_policies
            where tablename = 'flutterwave_payments' and policyname = 'Proprietaires et admins lisent les paiements Flutterwave')
      and (select qual like '%''team.manage''%' from pg_policies
            where tablename = 'invitations' and policyname = 'tenant_admins_can_view_invitations'),
  'forme: chaque politique exige le bon droit (audit.view, billing.manage limite, team.manage)');

-- ===========================================================================
-- Plan : InitPlan, donc une evaluation par requete
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"af000000-0000-4000-8000-000000000101"}';
select matches(public.plan_de_lecture('select * from public.audit_log'), 'InitPlan',
  'plan: la lecture de audit_log evalue la politique en InitPlan');
select matches(public.plan_de_lecture('select * from public.flutterwave_payments'), 'InitPlan',
  'plan: la lecture de flutterwave_payments evalue la politique en InitPlan');
select matches(public.plan_de_lecture('select id from public.invitations'), 'InitPlan',
  'plan: la lecture de invitations evalue la politique en InitPlan');

-- ===========================================================================
-- Resultats : les bons lecteurs, et seulement leur restaurant
-- ===========================================================================
select is((select count(*)::int from public.audit_log), 50,
  'resultat: le gerant lit les 50 lignes de SON restaurant, aucune des 50 de l autre');
select is((select array_agg(tx_ref) from public.flutterwave_payments), array['lecture-a'],
  'resultat: le gerant lit les paiements de son restaurant (niveau limite)');
select is((select count(id)::int from public.invitations), 1, 'resultat: le gerant lit les invitations');
set local request.jwt.claims = '{"sub":"af000000-0000-4000-8000-000000000102"}';
select is((select count(*)::int from public.audit_log), 0, 'resultat: le caissier ne lit pas le journal');
select is((select count(id)::int from public.invitations), 0, 'resultat: le caissier ne lit pas les invitations');
set local request.jwt.claims = '{"sub":"af000000-0000-4000-8000-000000000103"}';
select is((select count(*)::int from public.flutterwave_payments), 0, 'resultat: le chef ne lit pas les paiements');
reset role;

-- ===========================================================================
-- Temoin : une politique ecrite sans la sous-requete
-- ===========================================================================
create table public.temoin_lecture (tenant_id uuid);
alter table public.temoin_lecture enable row level security;
grant select on public.temoin_lecture to authenticated;
create policy temoin_par_ligne on public.temoin_lecture for select
  using (tenant_id = any (public.tenants_avec_droit('audit.view')));
select ok(not pg_temp.forme_initplan((select qual from pg_policies where policyname = 'temoin_par_ligne')),
  'temoin: la verification de forme REJETTE une politique sans sous-requete');
set local role authenticated;
set local request.jwt.claims = '{"sub":"af000000-0000-4000-8000-000000000101"}';
select doesnt_match(public.plan_de_lecture('select * from public.temoin_lecture'), 'InitPlan',
  'temoin: sans sous-requete, le plan ne montre PAS d InitPlan (appel par ligne)');
reset role;
drop policy temoin_par_ligne on public.temoin_lecture;
create policy temoin_par_requete on public.temoin_lecture for select
  using (tenant_id = any ((select public.tenants_avec_droit('audit.view'))::uuid[]));
set local role authenticated;
select matches(public.plan_de_lecture('select * from public.temoin_lecture'), 'InitPlan',
  'temoin: la meme politique avec la sous-requete montre un InitPlan');
reset role;

select * from finish();
rollback;

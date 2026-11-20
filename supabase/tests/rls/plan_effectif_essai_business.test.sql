-- Essai = offre Business, et une seule regle de plan effectif (migration 20261120120000).
--
-- Temoin negatif: sur le code d'AVANT la migration, ces assertions echouent:
--   - la fonction tenant_effective_plan n'existait pas (assertions 1 a 7);
--   - un essai actif plafonnait a 2 etablissements (assertions 8 et 9);
--   - un tenant resilie gardait le QR personnalise et le plafond de son plan
--     (assertions 11 et 13), un tenant en pause gardait l'Inventaire (15).
-- Execution: scripts/run-pgtap.sh --local
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into tenants (id, slug, name, subscription_plan, subscription_status, trial_ends_at, is_active) values
  ('a1000000-0000-4000-8000-000000000001', 'pe-essai', 'PE Essai', 'starter', 'trial', now() + interval '5 days', true),
  ('a1000000-0000-4000-8000-000000000002', 'pe-essai-fini', 'PE Essai fini', 'starter', 'trial', now() - interval '1 day', true),
  ('a1000000-0000-4000-8000-000000000003', 'pe-resilie', 'PE Resilie', 'pro', 'cancelled', null, false),
  ('a1000000-0000-4000-8000-000000000004', 'pe-pro', 'PE Pro', 'pro', 'active', null, true),
  ('a1000000-0000-4000-8000-000000000005', 'pe-impaye', 'PE Impaye', 'business', 'past_due', null, true),
  ('a1000000-0000-4000-8000-000000000006', 'pe-pause', 'PE Pause', 'pro', 'paused', null, false),
  ('a1000000-0000-4000-8000-000000000007', 'pe-inconnu', 'PE Inconnu', 'gold', 'active', null, true);

-- 1-7. La regle elle-meme (miroir de getEffectivePlan).
select is(tenant_effective_plan('a1000000-0000-4000-8000-000000000001'), 'business', 'essai actif: offre Business');
select is(tenant_effective_plan('a1000000-0000-4000-8000-000000000002'), 'starter', 'essai expire: starter');
select is(tenant_effective_plan('a1000000-0000-4000-8000-000000000003'), 'starter', 'resilie: starter, meme sur un plan pro');
select is(tenant_effective_plan('a1000000-0000-4000-8000-000000000004'), 'pro', 'abonne pro: pro');
select is(tenant_effective_plan('a1000000-0000-4000-8000-000000000005'), 'business', 'impaye: garde son plan');
select is(tenant_effective_plan('a1000000-0000-4000-8000-000000000007'), 'starter', 'plan inconnu: starter');
select is(tenant_effective_plan('a1000000-0000-4000-8000-0000000000ff'), 'starter', 'tenant introuvable: starter');

-- 8-9. Essai: 10 etablissements actifs autorises, pas 11.
select lives_ok($$
  insert into venues (tenant_id, slug, name, is_active)
  select 'a1000000-0000-4000-8000-000000000001', 'v' || g, 'V' || g, true
  from generate_series(1, 10 - (select count(*) from venues where tenant_id = 'a1000000-0000-4000-8000-000000000001' and is_active)) g
$$, 'essai: jusqu a 10 etablissements actifs');
select throws_ok($$
  insert into venues (tenant_id, slug, name, is_active)
  values ('a1000000-0000-4000-8000-000000000001', 'v-onze', 'V onze', true)
$$, '23514', null, 'essai: le 11e etablissement est refuse');

-- 10-11. Plafond d'etablissements: pro actif = 2; resilie = 1.
select lives_ok($$
  insert into venues (tenant_id, slug, name, is_active)
  select 'a1000000-0000-4000-8000-000000000004', 'p' || g, 'P' || g, true
  from generate_series(1, 2 - (select count(*) from venues where tenant_id = 'a1000000-0000-4000-8000-000000000004' and is_active)) g
$$, 'pro actif: 2 etablissements');
select throws_ok($$
  insert into venues (tenant_id, slug, name, is_active)
  select 'a1000000-0000-4000-8000-000000000003', 'r' || g, 'R' || g, true
  from generate_series(1, 2) g
$$, '23514', null, 'resilie: retombe au plafond starter (1 etablissement)');

-- 12-13. QR personnalise.
select lives_ok($$
  insert into qr_designs (tenant_id, name, config) values ('a1000000-0000-4000-8000-000000000001', 'essai', '{}'::jsonb)
$$, 'QR personnalise: ouvert pendant l essai');
select throws_ok($$
  insert into qr_designs (tenant_id, name, config) values ('a1000000-0000-4000-8000-000000000003', 'resilie', '{}'::jsonb)
$$, '23514', null, 'QR personnalise: ferme a un tenant resilie');

-- 14-16. Inventaire.
select lives_ok($$
  insert into suppliers (tenant_id, name) values ('a1000000-0000-4000-8000-000000000001', 'Fournisseur essai')
$$, 'Inventaire: ouvert pendant l essai');
select throws_ok($$
  insert into suppliers (tenant_id, name) values ('a1000000-0000-4000-8000-000000000006', 'Fournisseur pause')
$$, '23514', null, 'Inventaire: ferme a un tenant en pause');
select throws_ok($$
  insert into suppliers (tenant_id, name) values ('a1000000-0000-4000-8000-000000000002', 'Fournisseur fini')
$$, '23514', null, 'Inventaire: ferme apres la fin de l essai');

select * from finish();
rollback;

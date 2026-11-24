-- Excedent apres une baisse de plan: on GARDE tout, on BLOQUE seulement l'ajout
-- (decision du proprietaire du 2026-11-21, "ne jamais bloquer un restaurant").
--
-- Un restaurant passe d'un essai (Business, 10 espaces) a Starter (1 espace)
-- avec 3 espaces actifs. Ils continuent de fonctionner: rien n'est desactive,
-- on peut les renommer. Creer ou reactiver un espace au-dela de la limite est
-- refuse.
-- Temoin negatif mesure: un trigger qui bloquerait toute ecriture sur un espace
-- en excedent fait echouer les assertions 1, 2, 4 et 6; sans trigger de plafond, les
-- assertions 3, 5 et 6 echouent (les deux mesures faites le 2026-11-21).
-- Execution: scripts/run-pgtap.sh --local
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

set local session_replication_role = replica;
insert into tenants (id, slug, name, subscription_plan, subscription_status, is_active) values
  ('e5000000-0000-4000-8000-000000000001', 'ex-starter', 'Ex Starter', 'starter', 'active', true);
insert into venues (id, tenant_id, slug, name, is_active) values
  ('e5000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000001', 'salle', 'Salle', true),
  ('e5000000-0000-4000-8000-000000000012', 'e5000000-0000-4000-8000-000000000001', 'terrasse', 'Terrasse', true),
  ('e5000000-0000-4000-8000-000000000013', 'e5000000-0000-4000-8000-000000000001', 'bar', 'Bar', true);
set local session_replication_role = origin;

select lives_ok($$
  update venues set name = 'Grande salle' where id = 'e5000000-0000-4000-8000-000000000011'
$$, 'excedent: renommer un espace existant reste permis');
select lives_ok($$
  update venues set is_active = true where id = 'e5000000-0000-4000-8000-000000000012'
$$, 'excedent: un espace deja actif le reste');
select throws_ok($$
  insert into venues (tenant_id, slug, name, is_active)
  values ('e5000000-0000-4000-8000-000000000001', 'piscine', 'Piscine', true)
$$, '23514', null, 'excedent: creer un nouvel espace actif est refuse');
select lives_ok($$
  update venues set is_active = false where id = 'e5000000-0000-4000-8000-000000000013'
$$, 'excedent: desactiver un espace reste permis');
select throws_ok($$
  update venues set is_active = true where id = 'e5000000-0000-4000-8000-000000000013'
$$, '23514', null, 'excedent: reactiver au-dela de la limite est refuse');
select is((select count(*)::int from venues where tenant_id = 'e5000000-0000-4000-8000-000000000001' and is_active),
  2, 'excedent: aucun espace n a ete desactive par le systeme');

select * from finish();
rollback;

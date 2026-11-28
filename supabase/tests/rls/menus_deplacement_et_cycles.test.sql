-- Deplacement apres coup et cycles de cartes (contre-audit D3 du lot B1).
--
-- CE QUE CE TEST VERROUILLE. La garde de 20261123100000 ne regardait que la
-- ligne `menus` modifiee. Un proprietaire des DEUX restaurants pouvait deplacer
-- apres coup une salle ou une carte parente vers l'autre restaurant, laissant
-- des cartes rattachees de part et d'autre; et un cycle de parents etait
-- accepte. Migration 20261123100300.
--
-- Execution: scripts/run-pgtap.sh --local

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

-- Plan business: les verrous de plan limitent le nombre de salles en starter.
insert into public.tenants (id, slug, name, is_active, currency, subscription_status, subscription_plan) values
  ('d3a00000-0000-0000-0000-00000000000a', 'd3-resto-a', 'Resto A', true, 'XOF', 'active', 'business'),
  ('d3b00000-0000-0000-0000-00000000000b', 'd3-resto-b', 'Resto B', true, 'XOF', 'active', 'business');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('e3d00000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'owner-ab@exemple.test', 'x', now(), now());

-- Proprietaire des deux restaurants: c'est le seul cas qui contournait la garde.
insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('d3d0000a-0000-0000-0000-00000000000a', 'e3d00000-0000-0000-0000-00000000000a',
   'd3a00000-0000-0000-0000-00000000000a', 'owner-ab@exemple.test', 'owner', true),
  ('d3d0000b-0000-0000-0000-00000000000b', 'e3d00000-0000-0000-0000-00000000000a',
   'd3b00000-0000-0000-0000-00000000000b', 'owner-ab@exemple.test', 'owner', true);

insert into public.venues (id, tenant_id, slug, name) values
  ('f3d0000a-0000-0000-0000-00000000000a', 'd3a00000-0000-0000-0000-00000000000a', 'salle-a', 'Salle A'),
  ('f3d0000c-0000-0000-0000-00000000000c', 'd3a00000-0000-0000-0000-00000000000a', 'salle-vide', 'Salle vide');

insert into public.menus (id, tenant_id, name, slug, is_active, venue_id) values
  ('c3d0000a-0000-0000-0000-00000000000a', 'd3a00000-0000-0000-0000-00000000000a', 'Parent', 'parent', true,
   'f3d0000a-0000-0000-0000-00000000000a');
insert into public.menus (id, tenant_id, name, slug, is_active, parent_menu_id) values
  ('c3d0000b-0000-0000-0000-00000000000b', 'd3a00000-0000-0000-0000-00000000000a', 'Enfant', 'enfant', true,
   'c3d0000a-0000-0000-0000-00000000000a'),
  ('c3d0000c-0000-0000-0000-00000000000c', 'd3a00000-0000-0000-0000-00000000000a', 'Petit-enfant', 'petit-enfant', true,
   'c3d0000b-0000-0000-0000-00000000000b');
insert into public.menus (id, tenant_id, name, slug, is_active) values
  ('c3d0000d-0000-0000-0000-00000000000d', 'd3a00000-0000-0000-0000-00000000000a', 'Seule', 'seule', true),
  ('c3d0000e-0000-0000-0000-00000000000e', 'd3a00000-0000-0000-0000-00000000000a', 'Parent 2', 'parent-2', true);
-- Arbre a part pour le deplacement d'une carte parente (aucun autre cas n'y touche).
insert into public.menus (id, tenant_id, name, slug, is_active, parent_menu_id) values
  ('c3d0000f-0000-0000-0000-00000000000f', 'd3a00000-0000-0000-0000-00000000000a', 'Enfant 2', 'enfant-2', true,
   'c3d0000e-0000-0000-0000-00000000000e');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e3d00000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- Les cycles d'abord: ils doivent etre refuses sur l'arbre d'origine, et non
-- par un effet de bord des deplacements testes ensuite.
select throws_ok(
  $$update public.menus set parent_menu_id = 'c3d0000b-0000-0000-0000-00000000000b'
    where id = 'c3d0000a-0000-0000-0000-00000000000a'$$,
  '23514', NULL,
  'cycle a deux niveaux refuse (le parent deviendrait l enfant de son enfant)');

select throws_ok(
  $$update public.menus set parent_menu_id = 'c3d0000c-0000-0000-0000-00000000000c'
    where id = 'c3d0000a-0000-0000-0000-00000000000a'$$,
  '23514', NULL,
  'cycle a trois niveaux refuse aussi');

select throws_ok(
  $$update public.venues set tenant_id = 'd3b00000-0000-0000-0000-00000000000b'
    where id = 'f3d0000a-0000-0000-0000-00000000000a'$$,
  '23514', NULL,
  'une salle encore utilisee par des cartes de A ne part pas vers B');

select throws_ok(
  $$update public.menus set tenant_id = 'd3b00000-0000-0000-0000-00000000000b'
    where id = 'c3d0000e-0000-0000-0000-00000000000e'$$,
  '23514', NULL,
  'une carte parente ne part pas vers B en laissant ses sous-cartes dans A');

select lives_ok(
  $$update public.venues set tenant_id = 'd3b00000-0000-0000-0000-00000000000b'
    where id = 'f3d0000c-0000-0000-0000-00000000000c'$$,
  'temoin: une salle sans carte rattachee peut changer de restaurant');

select lives_ok(
  $$update public.menus set tenant_id = 'd3b00000-0000-0000-0000-00000000000b'
    where id = 'c3d0000d-0000-0000-0000-00000000000d'$$,
  'temoin: une carte sans lien ni sous-carte peut changer de restaurant');

select lives_ok(
  $$update public.menus set parent_menu_id = 'c3d0000a-0000-0000-0000-00000000000a'
    where id = 'c3d0000c-0000-0000-0000-00000000000c'$$,
  'temoin: re-rattacher une carte plus haut dans le meme arbre, sans cycle, passe');

reset role;

select is(
  (select count(*)::int from pg_proc
    where proname in ('menus_tenant_move_keeps_children', 'venues_tenant_move_keeps_menus',
                      'menus_same_tenant_links')
      and prosecdef),
  0,
  'les trois gardes sont SECURITY INVOKER');

-- Contre-audits E1 et F1: deux transactions concurrentes fermaient un cycle,
-- ou recreaient un lien vers l'autre restaurant en deplacant le parent ou la
-- salle. La course demande deux sessions (essai hors pgTAP, voir le rapport du
-- correcteur); ici on verrouille la presence du verrou dans les trois gardes.
select is(
  (select count(*)::int from pg_proc
    where proname in ('menus_same_tenant_links', 'menus_tenant_move_keeps_children',
                      'venues_tenant_move_keeps_menus')
      and prosrc like '%pg_advisory_xact_lock(hashtext(''menus_tree''), hashtext(LEAST(%'),
  3,
  'les trois gardes serialisent par restaurant (verrou menus_tree, plus petit identifiant d abord)');

-- Un gerant qui a le droit de modifier les cartes mais PAS les salles
-- (settings.edit retire par le proprietaire) rattache toujours une carte a une
-- salle: la garde ne fait aucune lecture verrouillante soumise a la politique
-- UPDATE de `venues`.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('e3d0000b-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'gerant-d3@exemple.test', 'x', now(), now());
insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('d3d0000c-0000-0000-0000-00000000000c', 'e3d0000b-0000-0000-0000-00000000000b',
   'd3a00000-0000-0000-0000-00000000000a', 'gerant-d3@exemple.test', 'manager', true);
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('d3a00000-0000-0000-0000-00000000000a', 'manager', '{"settings.edit": false}'::jsonb);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e3d0000b-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$insert into public.menus (tenant_id, name, slug, is_active, venue_id)
    values ('d3a00000-0000-0000-0000-00000000000a', 'Carte gerant', 'carte-gerant', true,
            'f3d0000a-0000-0000-0000-00000000000a')$$,
  'gerant sans settings.edit: cree une carte rattachee a une salle');

select lives_ok(
  $$update public.menus set name = 'Carte gerant 2', venue_id = 'f3d0000a-0000-0000-0000-00000000000a'
    where slug = 'carte-gerant' and tenant_id = 'd3a00000-0000-0000-0000-00000000000a'$$,
  'gerant sans settings.edit: modifie une carte rattachee a une salle');

reset role;

select * from finish();
rollback;

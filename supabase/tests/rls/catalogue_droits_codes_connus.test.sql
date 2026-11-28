-- Catalogue ferme : un code de droit inconnu est refuse a TOUT LE MONDE, et
-- aucune politique ni fonction de la base n'en passe un a une garde.
--
-- POURQUOI CE TEST EXISTE. L'ancienne garde finissait par une branche ELSE qui
-- accordait tout code inconnu a l'administrateur et au gerant : une faute de
-- frappe dans une politique (`'menu.edti'`) ouvrait l'ecriture au lieu de la
-- fermer. Le lot 1 des roles inverse la regle. Le prix : un code retire du
-- catalogue (`orders.manage`, `reports.view`) encore cite par une politique la
-- rendrait MORTE pour tous, proprietaire compris, sans aucune erreur. Ce test
-- lit donc l'etat effectif de la base (pg_policies, pg_proc), pas le texte des
-- migrations. La meme requete (private.droits_hors_catalogue) cloture la
-- migration 20261128100100 et sert au controle en production.
--
-- TEMOINS. (1) Une politique et une fonction temporaires portant un code faux
-- doivent etre TROUVEES par le balayage : sans cela, "0 litteral hors
-- catalogue" ne prouverait rien. (2) Le meme membre obtient bien un droit sur
-- un code connu : le refus vient du code, pas du membre.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a5000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'catalogue' || g || '@test.local', 'x', now(), now()
from generate_series(1, 2) g;
insert into public.tenants (id, slug, name, is_active)
values ('a5000000-0000-4000-8000-000000000001', 'tenant-catalogue', 'Tenant Catalogue', true);
insert into public.admin_users (tenant_id, user_id, email, postes, is_active) values
  ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000101', 'catalogue1@test.local', '{owner}', true),
  ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000102', 'catalogue2@test.local', '{manager}', true);

-- ===========================================================================
-- Le catalogue et la matrice eux-memes
-- ===========================================================================
select is(cardinality(private.codes_droits()), 22, 'catalogue: 22 codes');
select is((select count(distinct c)::int from unnest(private.codes_droits()) c), 22, 'catalogue: aucun doublon');
select is((select count(*)::int from private.matrice_postes()), 86, 'matrice: 86 cases');
select is((select count(*)::int from private.matrice_postes() m where m.poste = 'owner'), 0,
  'matrice: aucune ligne pour le proprietaire (il a toujours tout)');
select is((select count(*)::int from private.matrice_postes() m
            where not (m.droit = any (private.codes_droits())) or m.niveau not in ('full', 'limited')), 0,
  'matrice: chaque case porte un code du catalogue et un niveau connu');
select is((select count(*)::int from (select m.poste, m.droit from private.matrice_postes() m
            group by 1, 2 having count(*) > 1) d), 0, 'matrice: aucune case en double');

-- ===========================================================================
-- Un code inconnu est refuse, pour le gerant ET pour le proprietaire
-- ===========================================================================
set local role authenticated;

set local request.jwt.claims = '{"sub":"a5000000-0000-4000-8000-000000000102"}';
select ok(public.has_tenant_write_permission('a5000000-0000-4000-8000-000000000001', 'menu.edit'),
  'temoin: le gerant a bien un droit sur un code connu');
select is((select count(*)::int from unnest(array['orders.manage', 'reports.view', 'pos.use', 'orders.view',
             'settings.view', 'nimporte.quoi', 'menu.edti', '', null]) c
            where public.has_tenant_write_permission('a5000000-0000-4000-8000-000000000001', c)
               or public.tenant_permission_level('a5000000-0000-4000-8000-000000000001', c) is not null), 0,
  'gerant: aucun des 9 codes hors catalogue (anciens codes, faute de frappe, vide, NULL) n ouvre rien');
select ok(not public.has_tenant_write_permission('a5000000-0000-4000-8000-000000000001', 'orders.manage'),
  'gerant: orders.manage, que l ancienne branche ELSE lui accordait, est refuse');
select ok(not public.has_tenant_write_permission('a5000000-0000-4000-8000-000000000001', 'reports.view'),
  'gerant: reports.view est refuse');
select ok(not public.has_tenant_write_permission('a5000000-0000-4000-8000-000000000001', null),
  'gerant: NULL rend faux, pas NULL (une politique ne doit jamais recevoir NULL)');
select is(public.tenants_avec_droit('orders.manage'), '{}'::uuid[],
  'gerant: tenants_avec_droit rend un tableau vide pour un code hors catalogue');
select is(public.tenants_avec_droit('menu.edit', 'nimporte'), '{}'::uuid[],
  'gerant: tenants_avec_droit rend un tableau vide pour un niveau inconnu');

set local request.jwt.claims = '{"sub":"a5000000-0000-4000-8000-000000000101"}';
select ok(public.has_tenant_write_permission('a5000000-0000-4000-8000-000000000001', 'billing.manage'),
  'temoin: le proprietaire a bien tout sur un code connu');
select is((select count(*)::int from unnest(array['orders.manage', 'reports.view', 'pos.use', 'orders.view',
             'settings.view', 'nimporte.quoi', 'menu.edti', '', null]) c
            where public.has_tenant_write_permission('a5000000-0000-4000-8000-000000000001', c)
               or public.tenant_permission_level('a5000000-0000-4000-8000-000000000001', c) is not null), 0,
  'proprietaire: aucun des 9 codes hors catalogue n ouvre rien, meme a lui');

reset role;

-- ===========================================================================
-- Balayage de la base : aucun litteral hors catalogue passe a une garde
-- ===========================================================================
select is((select count(*)::int from private.droits_hors_catalogue()), 0,
  'balayage: aucune politique ni fonction ne passe un code hors catalogue');

-- Temoin 1 : une politique avec une faute de frappe est trouvee.
create policy "temoin faute de frappe" on public.coupons for select to authenticated
  using (public.has_tenant_write_permission(tenant_id, 'menu.edti'));
select is((select array_agg(h.code order by h.code) from private.droits_hors_catalogue() h), array['menu.edti'],
  'temoin: le balayage trouve le code faux d une politique');
select ok((select bool_and(h.origine like 'politique coupons /%') from private.droits_hors_catalogue() h),
  'temoin: il nomme la table et la politique fautives');
drop policy "temoin faute de frappe" on public.coupons;

-- Temoin 2 : une politique de lecture (tenants_avec_droit) avec un ancien code.
create policy "temoin ancien code" on public.coupons for select to authenticated
  using (tenant_id = any ((select public.tenants_avec_droit('reports.view'))::uuid[]));
select is((select array_agg(h.code order by h.code) from private.droits_hors_catalogue() h), array['reports.view'],
  'temoin: le balayage trouve aussi un ancien code passe a tenants_avec_droit');
drop policy "temoin ancien code" on public.coupons;

-- Temoin 3 : un corps de fonction.
create function public.temoin_code_faux(p uuid) returns boolean language sql as
  $f$ select public.has_tenant_write_permission(p, 'orders.manage') or public.tenant_permission_level(p, 'pos.use') is not null $f$;
select is((select array_agg(h.code order by h.code) from private.droits_hors_catalogue() h), array['orders.manage', 'pos.use'],
  'temoin: le balayage trouve les codes faux d un corps de fonction');
select ok((select bool_and(h.origine = 'fonction public.temoin_code_faux') from private.droits_hors_catalogue() h),
  'temoin: il nomme la fonction fautive');
drop function public.temoin_code_faux(uuid);

select is((select count(*)::int from private.droits_hors_catalogue()), 0,
  'balayage: de nouveau 0 une fois les temoins retires');

select * from finish();
rollback;

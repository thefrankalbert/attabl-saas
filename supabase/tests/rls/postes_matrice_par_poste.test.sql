-- Matrice par defaut : les 242 cases (11 postes x 22 droits), une par une.
--
-- POURQUOI CE TEST EXISTE. La resolution des droits repose sur 86 cases ecrites
-- a la main dans private.matrice_postes(). Une case fausse donne ou retire un
-- droit a tout un poste, dans tous les restaurants. Ici chaque case est
-- comparee a un tableau d'ATTENDUS ecrit dans ce fichier (recopie du tableau
-- B.3 de la conception), et PAS relu dans matrice_postes : sinon le test se
-- comparerait a lui-meme.
--
-- Un membre par poste, interroge sous son propre jeton et sous le role
-- `authenticated`, comme le ferait PostgREST.
--
-- TEMOIN. Changer une case du tableau d'attendus (par exemple
-- ('chef','orders.pay',null)) puis relancer : le test doit passer au rouge.
-- Verifie sur le banc le 2026-11-28 (docs/roles-personnel/preuves-phase-a.md),
-- puis retire. Deux temoins restent dans le fichier : le tableau compte bien
-- 242 lignes dont 108 non vides (86 de la matrice + 22 du proprietaire), et un
-- code hors catalogue rend NULL meme au proprietaire.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(245);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a1000000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'matrice' || g || '@test.local', 'x', now(), now()
from generate_series(1, 11) g;

insert into public.tenants (id, slug, name, is_active)
values ('a1000000-0000-4000-8000-000000000001', 'tenant-matrice', 'Tenant Matrice', true);

-- Ecriture au NOUVEAU format : `postes` seul, le declencheur projette `role`.
insert into public.admin_users (tenant_id, user_id, email, postes, is_active)
select 'a1000000-0000-4000-8000-000000000001',
       ('a1000000-0000-4000-8000-0000000001' || lpad(p.rang::text, 2, '0'))::uuid,
       'matrice' || p.rang || '@test.local', array[p.poste], true
from unnest(array['owner', 'manager', 'chef', 'cashier', 'bartender', 'reception', 'waiter', 'cook', 'crew', 'sales', 'production']) with ordinality as p(poste, rang);

-- Les attendus. Table ordinaire (annulee avec la transaction) : une table
-- temporaire ne serait pas lisible sous le role `authenticated`.
create table public.attendus_matrice (poste text, droit text, niveau text);
grant select on public.attendus_matrice to authenticated;
insert into public.attendus_matrice (poste, droit, niveau) values
  ('owner','menu.view','full'), ('owner','menu.edit','full'), ('owner','menu.price','full'),
  ('owner','orders.take','full'), ('owner','kitchen.track','full'), ('owner','orders.cancel','full'),
  ('owner','orders.discount','full'), ('owner','orders.refund','full'), ('owner','orders.pay','full'),
  ('owner','cash.close','full'), ('owner','cash.count','full'), ('owner','reports.menu','full'),
  ('owner','reports.money','full'), ('owner','reports.own','full'), ('owner','inventory.view','full'),
  ('owner','inventory.edit','full'), ('owner','suppliers.manage','full'), ('owner','team.view','full'),
  ('owner','team.manage','full'), ('owner','settings.edit','full'), ('owner','audit.view','full'),
  ('owner','billing.manage','full'), ('manager','menu.view','full'), ('manager','menu.edit','full'),
  ('manager','menu.price','full'), ('manager','orders.take','full'), ('manager','kitchen.track','full'),
  ('manager','orders.cancel','full'), ('manager','orders.discount','full'), ('manager','orders.refund','full'),
  ('manager','orders.pay','full'), ('manager','cash.close','full'), ('manager','cash.count','full'),
  ('manager','reports.menu','full'), ('manager','reports.money','full'), ('manager','reports.own','full'),
  ('manager','inventory.view','full'), ('manager','inventory.edit','full'), ('manager','suppliers.manage','full'),
  ('manager','team.view','full'), ('manager','team.manage','full'), ('manager','settings.edit','full'),
  ('manager','audit.view','full'), ('manager','billing.manage','limited'), ('chef','menu.view','full'),
  ('chef','menu.edit','full'), ('chef','menu.price','full'), ('chef','orders.take',null),
  ('chef','kitchen.track','full'), ('chef','orders.cancel',null), ('chef','orders.discount',null),
  ('chef','orders.refund',null), ('chef','orders.pay',null), ('chef','cash.close',null),
  ('chef','cash.count',null), ('chef','reports.menu','full'), ('chef','reports.money',null),
  ('chef','reports.own',null), ('chef','inventory.view','full'), ('chef','inventory.edit','full'),
  ('chef','suppliers.manage','full'), ('chef','team.view',null), ('chef','team.manage',null),
  ('chef','settings.edit',null), ('chef','audit.view',null), ('chef','billing.manage',null),
  ('cashier','menu.view','full'), ('cashier','menu.edit',null), ('cashier','menu.price',null),
  ('cashier','orders.take','full'), ('cashier','kitchen.track',null), ('cashier','orders.cancel','limited'),
  ('cashier','orders.discount','limited'), ('cashier','orders.refund','limited'), ('cashier','orders.pay','full'),
  ('cashier','cash.close',null), ('cashier','cash.count','full'), ('cashier','reports.menu',null),
  ('cashier','reports.money',null), ('cashier','reports.own','full'), ('cashier','inventory.view',null),
  ('cashier','inventory.edit',null), ('cashier','suppliers.manage',null), ('cashier','team.view',null),
  ('cashier','team.manage',null), ('cashier','settings.edit',null), ('cashier','audit.view',null),
  ('cashier','billing.manage',null), ('bartender','menu.view','full'), ('bartender','menu.edit',null),
  ('bartender','menu.price',null), ('bartender','orders.take','full'), ('bartender','kitchen.track','full'),
  ('bartender','orders.cancel','limited'), ('bartender','orders.discount','limited'), ('bartender','orders.refund','limited'),
  ('bartender','orders.pay','full'), ('bartender','cash.close',null), ('bartender','cash.count','full'),
  ('bartender','reports.menu',null), ('bartender','reports.money',null), ('bartender','reports.own','full'),
  ('bartender','inventory.view','full'), ('bartender','inventory.edit',null), ('bartender','suppliers.manage',null),
  ('bartender','team.view',null), ('bartender','team.manage',null), ('bartender','settings.edit',null),
  ('bartender','audit.view',null), ('bartender','billing.manage',null), ('reception','menu.view','full'),
  ('reception','menu.edit',null), ('reception','menu.price',null), ('reception','orders.take','full'),
  ('reception','kitchen.track',null), ('reception','orders.cancel','limited'), ('reception','orders.discount','limited'),
  ('reception','orders.refund','limited'), ('reception','orders.pay','full'), ('reception','cash.close',null),
  ('reception','cash.count','full'), ('reception','reports.menu',null), ('reception','reports.money',null),
  ('reception','reports.own','full'), ('reception','inventory.view',null), ('reception','inventory.edit',null),
  ('reception','suppliers.manage',null), ('reception','team.view',null), ('reception','team.manage',null),
  ('reception','settings.edit',null), ('reception','audit.view',null), ('reception','billing.manage',null),
  ('waiter','menu.view','full'), ('waiter','menu.edit',null), ('waiter','menu.price',null),
  ('waiter','orders.take','full'), ('waiter','kitchen.track',null), ('waiter','orders.cancel','limited'),
  ('waiter','orders.discount','limited'), ('waiter','orders.refund',null), ('waiter','orders.pay','limited'),
  ('waiter','cash.close',null), ('waiter','cash.count',null), ('waiter','reports.menu',null),
  ('waiter','reports.money',null), ('waiter','reports.own','full'), ('waiter','inventory.view',null),
  ('waiter','inventory.edit',null), ('waiter','suppliers.manage',null), ('waiter','team.view',null),
  ('waiter','team.manage',null), ('waiter','settings.edit',null), ('waiter','audit.view',null),
  ('waiter','billing.manage',null), ('cook','menu.view','full'), ('cook','menu.edit',null),
  ('cook','menu.price',null), ('cook','orders.take',null), ('cook','kitchen.track','full'),
  ('cook','orders.cancel',null), ('cook','orders.discount',null), ('cook','orders.refund',null),
  ('cook','orders.pay',null), ('cook','cash.close',null), ('cook','cash.count',null),
  ('cook','reports.menu',null), ('cook','reports.money',null), ('cook','reports.own',null),
  ('cook','inventory.view','full'), ('cook','inventory.edit',null), ('cook','suppliers.manage',null),
  ('cook','team.view',null), ('cook','team.manage',null), ('cook','settings.edit',null),
  ('cook','audit.view',null), ('cook','billing.manage',null), ('crew','menu.view','full'),
  ('crew','menu.edit',null), ('crew','menu.price',null), ('crew','orders.take','full'),
  ('crew','kitchen.track','full'), ('crew','orders.cancel','limited'), ('crew','orders.discount','limited'),
  ('crew','orders.refund','limited'), ('crew','orders.pay','full'), ('crew','cash.close',null),
  ('crew','cash.count','full'), ('crew','reports.menu',null), ('crew','reports.money',null),
  ('crew','reports.own','full'), ('crew','inventory.view','full'), ('crew','inventory.edit',null),
  ('crew','suppliers.manage',null), ('crew','team.view',null), ('crew','team.manage',null),
  ('crew','settings.edit',null), ('crew','audit.view',null), ('crew','billing.manage',null),
  ('sales','menu.view','full'), ('sales','menu.edit',null), ('sales','menu.price',null),
  ('sales','orders.take','full'), ('sales','kitchen.track',null), ('sales','orders.cancel','limited'),
  ('sales','orders.discount','limited'), ('sales','orders.refund','limited'), ('sales','orders.pay','full'),
  ('sales','cash.close',null), ('sales','cash.count','full'), ('sales','reports.menu',null),
  ('sales','reports.money',null), ('sales','reports.own','full'), ('sales','inventory.view',null),
  ('sales','inventory.edit',null), ('sales','suppliers.manage',null), ('sales','team.view',null),
  ('sales','team.manage',null), ('sales','settings.edit',null), ('sales','audit.view',null),
  ('sales','billing.manage',null), ('production','menu.view','full'), ('production','menu.edit',null),
  ('production','menu.price',null), ('production','orders.take',null), ('production','kitchen.track','full'),
  ('production','orders.cancel',null), ('production','orders.discount',null), ('production','orders.refund',null),
  ('production','orders.pay',null), ('production','cash.close',null), ('production','cash.count',null),
  ('production','reports.menu',null), ('production','reports.money',null), ('production','reports.own',null),
  ('production','inventory.view','full'), ('production','inventory.edit',null), ('production','suppliers.manage',null),
  ('production','team.view',null), ('production','team.manage',null), ('production','settings.edit',null),
  ('production','audit.view',null), ('production','billing.manage',null);

select is((select count(*)::int from public.attendus_matrice), 242,
  'temoin: le tableau d attendus couvre 11 postes x 22 droits');
select is((select count(*)::int from public.attendus_matrice where niveau is not null), 108,
  'temoin: 108 cases non vides (86 de la matrice, 22 du proprietaire)');

set local role authenticated;

-- owner
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000101"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'owner / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'owner' order by a.droit;

-- manager
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000102"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'manager / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'manager' order by a.droit;

-- chef
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000103"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'chef / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'chef' order by a.droit;

-- cashier
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000104"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'cashier / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'cashier' order by a.droit;

-- bartender
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000105"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'bartender / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'bartender' order by a.droit;

-- reception
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000106"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'reception / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'reception' order by a.droit;

-- waiter
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000107"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'waiter / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'waiter' order by a.droit;

-- cook
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000108"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'cook / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'cook' order by a.droit;

-- crew
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000109"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'crew / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'crew' order by a.droit;

-- sales
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000110"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'sales / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'sales' order by a.droit;

-- production
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000111"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', a.droit), a.niveau,
          'production / ' || a.droit || ' = ' || coalesce(a.niveau, 'aucun droit'))
from public.attendus_matrice a where a.poste = 'production' order by a.droit;

-- Temoin : un code hors catalogue est refuse meme au proprietaire. Si la
-- fonction rendait 'full' a tout, les 22 cases du proprietaire passeraient
-- quand meme : celle-ci, non.
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000101"}';
select is(public.tenant_permission_level('a1000000-0000-4000-8000-000000000001', 'orders.manage'), null,
  'temoin: le proprietaire n obtient rien sur un code hors catalogue');

select * from finish();
rollback;

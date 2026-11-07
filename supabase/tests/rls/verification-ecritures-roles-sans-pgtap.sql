-- Verification des ecritures par ROLE, SANS pgTAP.
--
-- POURQUOI CE FICHIER EXISTE A COTE DES TESTS pgTAP.
--
-- Les tests pgTAP (catalogue_write_roles.test.sql, argent_write_roles.test.sql)
-- sont joues par la CI. En local, pgTAP doit etre compile, ce que le bac a sable
-- de la session du 2026-11-07 refusait. Resultat: impossible de REPETER avant
-- d'ecrire en production. Ce fichier n'a besoin de rien d'autre que psql, donc il
-- tourne sur n'importe quel Postgres, y compris une copie jetable du schema de
-- production restauree depuis supabase/backups/.
--
-- CE QU'IL A MESURE (2026-11-07, sur une copie du schema de production du jour):
--
--   AVANT les deux migrations RLS :  2/12 OK
--   APRES                          : 12/12 OK
--
-- Les dix lignes qui passent du rouge au vert sont les attaques reelles: avec la
-- seule cle anon du bundle et son propre compte, un employe de role `waiter`
-- reecrivait les prix du menu, marquait une commande payee sans ligne au ledger,
-- changeait le total d'une commande, mettait la TVA du restaurant a zero et
-- supprimait une commande. Un test qui ne serait pas ROUGE avant ne prouverait
-- rien: c'est la lecon des faux verts de cette session.
--
-- Mode d'emploi (repetition complete avant une ecriture en production):
--
--   1. demarrer un Postgres jetable
--        initdb -D /tmp/pg -U postgres -A trust --locale=C -E UTF8
--        pg_ctl -D /tmp/pg -o "-p 54399 -k /tmp" -l /tmp/pg/log start
--   2. creer les roles et schemas que Supabase fournit d'ordinaire
--        create role anon nologin; create role authenticated nologin;
--        create role service_role nologin;
--        create schema auth; create schema extensions;
--      puis des bouchons pour auth.uid() / auth.role() / auth.jwt() lisant
--      current_setting('request.jwt.claims', true)
--   3. restaurer la sauvegarde du schema de production (supabase/backups/)
--   4. jouer CE fichier -> il doit afficher 2/12 (etat d'avant)
--   5. appliquer les deux migrations du 2026-11-07
--   6. rejouer CE fichier -> il doit afficher 12/12
--
-- Execution: psql "$URL" -X -q -f supabase/tests/rls/verification-ecritures-roles-sans-pgtap.sql
--
-- Tout se passe dans une transaction annulee a la fin: aucune donnee n'est
-- laissee derriere, meme sur une vraie base.
\set ON_ERROR_STOP on
begin;

insert into public.tenants (id, slug, name, is_active, tax_rate)
values ('d3333333-3333-3333-3333-333333333333', 'tenant-verif-rls', 'Verif RLS', true, 18);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  (gen_random_uuid(), 'd3333333-3333-3333-3333-333333333333',
   'd1111111-1111-1111-1111-111111111111', 'gerant@verif.local', 'manager', true),
  (gen_random_uuid(), 'd3333333-3333-3333-3333-333333333333',
   'd2222222-2222-2222-2222-222222222222', 'serveur@verif.local', 'waiter', true);

insert into public.categories (id, tenant_id, name)
values ('d8888888-8888-8888-8888-888888888888', 'd3333333-3333-3333-3333-333333333333', 'Cat');
insert into public.menu_items (id, tenant_id, category_id, name, price)
values ('d7777777-7777-7777-7777-777777777777', 'd3333333-3333-3333-3333-333333333333',
        'd8888888-8888-8888-8888-888888888888', 'Plat', 10000);
insert into public.orders (id, tenant_id, order_number, status, payment_status, subtotal, total)
values ('d4444444-4444-4444-4444-444444444444', 'd3333333-3333-3333-3333-333333333333',
        'CMD-VERIF', 'pending', 'pending', 29000, 29000);

create temp table resultat (etiquette text, verdict text);
-- Le role `authenticated` doit pouvoir y ecrire: on bascule de role pendant le test.
grant all on resultat to authenticated;

-- ======================= LE SERVEUR (waiter) =======================
set local role authenticated;
set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222"}';

update public.menu_items set price = 1 where id = 'd7777777-7777-7777-7777-777777777777';
insert into resultat select 'serveur ne reecrit PAS le prix d un plat',
  case when (select price::int from public.menu_items where id='d7777777-7777-7777-7777-777777777777') = 10000
       then 'OK' else 'ECHEC' end;

update public.orders set payment_status = 'paid' where id = 'd4444444-4444-4444-4444-444444444444';
insert into resultat select 'serveur ne marque PAS une commande payee',
  case when (select payment_status from public.orders where id='d4444444-4444-4444-4444-444444444444') = 'pending'
       then 'OK' else 'ECHEC' end;

update public.orders set total = 1 where id = 'd4444444-4444-4444-4444-444444444444';
insert into resultat select 'serveur ne change PAS le total d une commande',
  case when (select total::int from public.orders where id='d4444444-4444-4444-4444-444444444444') = 29000
       then 'OK' else 'ECHEC' end;

update public.tenants set tax_rate = 0 where id = 'd3333333-3333-3333-3333-333333333333';
insert into resultat select 'serveur ne met PAS la TVA a zero',
  case when (select tax_rate::int from public.tenants where id='d3333333-3333-3333-3333-333333333333') = 18
       then 'OK' else 'ECHEC' end;

delete from public.orders where id = 'd4444444-4444-4444-4444-444444444444';
insert into resultat select 'serveur ne supprime PAS une commande',
  case when (select count(*)::int from public.orders where id='d4444444-4444-4444-4444-444444444444') = 1
       then 'OK' else 'ECHEC' end;

do $$ begin
  insert into public.payments (tenant_id, order_id, amount, method, status)
  values ('d3333333-3333-3333-3333-333333333333','d4444444-4444-4444-4444-444444444444',29000,'cash','completed');
  insert into resultat values ('serveur n ecrit PAS au ledger des paiements','ECHEC');
exception
  when insufficient_privilege then
    insert into resultat values ('serveur n ecrit PAS au ledger des paiements','OK');
  when foreign_key_violation then
    insert into resultat values ('serveur n ecrit PAS au ledger des paiements','N/A commande deja supprimee');
end $$;

insert into resultat select 'serveur LIT toujours les commandes de son restaurant',
  case when (select count(*)::int from public.orders where id='d4444444-4444-4444-4444-444444444444') = 1
       then 'OK' else 'ECHEC' end;

-- ======================= LE GERANT (manager) =======================
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111"}';

update public.menu_items set price = 12000 where id = 'd7777777-7777-7777-7777-777777777777';
insert into resultat select 'gerant modifie TOUJOURS le prix d un plat',
  case when (select price::int from public.menu_items where id='d7777777-7777-7777-7777-777777777777') = 12000
       then 'OK' else 'ECHEC' end;

update public.orders set payment_status = 'paid' where id = 'd4444444-4444-4444-4444-444444444444';
insert into resultat select 'gerant encaisse TOUJOURS (commande payee)',
  case when (select payment_status from public.orders where id='d4444444-4444-4444-4444-444444444444') = 'paid'
       then 'OK' else 'ECHEC' end;

update public.tenants set tax_rate = 20 where id = 'd3333333-3333-3333-3333-333333333333';
insert into resultat select 'gerant change TOUJOURS la TVA',
  case when (select tax_rate::int from public.tenants where id='d3333333-3333-3333-3333-333333333333') = 20
       then 'OK' else 'ECHEC' end;

do $$ begin
  insert into public.payments (tenant_id, order_id, amount, method, status)
  values ('d3333333-3333-3333-3333-333333333333','d4444444-4444-4444-4444-444444444444',29000,'cash','completed');
  insert into resultat values ('gerant ecrit TOUJOURS au ledger des paiements','OK');
exception
  when insufficient_privilege then
    insert into resultat values ('gerant ecrit TOUJOURS au ledger des paiements','ECHEC');
  when foreign_key_violation then
    insert into resultat values ('gerant ecrit TOUJOURS au ledger des paiements','N/A commande deja supprimee');
end $$;

-- ============ PARITE: une permission RETIREE mord aussi en base ============
reset role;
update public.admin_users set custom_permissions = '{"menu.edit": false}'::jsonb
 where user_id = 'd1111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111"}';

update public.menu_items set price = 777 where id = 'd7777777-7777-7777-7777-777777777777';
insert into resultat select 'gerant dont menu.edit est RETIRE ne touche plus au prix',
  case when (select price::int from public.menu_items where id='d7777777-7777-7777-7777-777777777777') = 12000
       then 'OK' else 'ECHEC' end;

reset role;
select verdict, etiquette from resultat order by verdict desc, etiquette;
select 'fonctionnel: ' || count(*) filter (where verdict='OK') || '/' || count(*) || ' OK' as bilan from resultat;
rollback;

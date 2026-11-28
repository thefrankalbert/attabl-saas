-- Privileges EXECUTE de chaque fonction du lot 1 des roles, pour anon,
-- authenticated et service_role, compares a un tableau d'attendus.
--
-- POURQUOI CE TEST EXISTE. Deux erreurs opposees, toutes deux deja rencontrees
-- dans ce depot :
--   - une fonction d'aide de RLS SANS EXECUTE pour `authenticated` casse toutes
--     les politiques qui l'appellent ("permission denied for function") ;
--   - une fonction interne AVEC EXECUTE pour `anon` devient un point d'entree
--     de l'API (`/rest/v1/rpc/...`), par exemple pour lire la matrice.
-- Et `REVOKE ... FROM PUBLIC` ne suffit pas a s'en assurer : les privileges
-- par defaut du schema (`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS
-- TO anon, authenticated`) redonnent EXECUTE a la creation, et ils different
-- entre la production, la CI et un banc local. On ne suppose donc rien : on
-- mesure l'etat de CHAQUE fonction, schema `private` compris.
--
-- TEMOIN. Le tableau contient des attendus "oui" et des attendus "non" : une
-- verification qui rendrait toujours la meme reponse echouerait sur l'une des
-- deux moities. Le test verifie aussi qu'il a bien lu ses 20 fonctions (aucune
-- signature mal ecrite, qui ferait disparaitre une ligne).
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(68);

-- signature, anon, authenticated, service_role
create temp table attendus (signature text, anon boolean, authenticated boolean, service_role boolean) on commit drop;
insert into attendus values
  -- Aides de RLS : appelees par des politiques, sous le role de l'appelant.
  ('public.tenant_permission_level(uuid, text)',        true,  true,  true),
  ('public.tenants_avec_droit(text, text)',             true,  true,  true),
  ('public.is_tenant_owner(uuid)',                      true,  true,  true),
  ('public.has_tenant_write_permission(uuid, text)',    true,  true,  true),
  ('public.has_tenant_money_permission(uuid)',          true,  true,  true),
  ('public.has_tenant_floor_permission(uuid)',          true,  true,  true),
  -- Appelees par un CHECK ou par un declencheur SECURITY INVOKER.
  ('private.droits_valides(jsonb)',                     false, true,  true),
  ('private.fusion_anciens_droits(jsonb, jsonb, jsonb)', false, true,  true),
  -- Internes : appelees seulement depuis des fonctions SECURITY DEFINER.
  ('private.codes_droits()',                            false, false, false),
  ('private.matrice_postes()',                          false, false, false),
  ('private.postes_depuis_role(text)',                  false, false, false),
  ('private.role_depuis_postes(text[])',                false, false, false),
  ('private.postes_normalises(text[])',                 false, false, false),
  ('private.droits_depuis_anciens(jsonb)',              false, false, false),
  ('private.droits_hors_catalogue()',                   false, false, false),
  -- Fonctions de declencheur : jamais appelables en direct.
  ('private.sync_postes_admin_users()',                 false, false, false),
  ('private.sync_postes_invitations()',                 false, false, false),
  ('private.garder_proprietaire()',                     false, false, false),
  ('public.role_permissions_vers_postes()',             false, false, false),
  ('public.garder_prix_carte()',                        false, false, false);

select is((select count(*)::int from attendus a where to_regprocedure(a.signature) is not null), 20,
  'temoin: les 20 fonctions du tableau existent (aucune signature fausse)');
select ok((select count(*) filter (where a.authenticated) > 0 and count(*) filter (where not a.authenticated) > 0
           from attendus a), 'temoin: le tableau porte des attendus oui ET non');

select is(has_function_privilege('anon', a.signature, 'EXECUTE'), a.anon,
          a.signature || ' : anon ' || case when a.anon then 'execute' else 'n execute PAS' end)
from attendus a order by a.signature;
select is(has_function_privilege('authenticated', a.signature, 'EXECUTE'), a.authenticated,
          a.signature || ' : authenticated ' || case when a.authenticated then 'execute' else 'n execute PAS' end)
from attendus a order by a.signature;
select is(has_function_privilege('service_role', a.signature, 'EXECUTE'), a.service_role,
          a.signature || ' : service_role ' || case when a.service_role then 'execute' else 'n execute PAS' end)
from attendus a order by a.signature;

-- Aucune fonction CREEE par le lot 1 n'est executable par PUBLIC (les trois
-- gardes anterieures gardent leurs grants d'origine, hors de ce controle).
select is((select count(*)::int from attendus a
            join pg_proc p on p.oid = to_regprocedure(a.signature)
            cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
            where x.grantee = 0 and x.privilege_type = 'EXECUTE'
              and a.signature not like 'public.has_tenant_%'), 0,
  'aucune fonction nouvelle n est executable par PUBLIC');

-- Chaque fonction fixe son search_path (une fonction SECURITY DEFINER sans
-- search_path se detourne par un objet du meme nom dans un autre schema).
select is((select count(*)::int from attendus a
            join pg_proc p on p.oid = to_regprocedure(a.signature)
            where not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'chaque fonction fixe son search_path');

-- Le mode de securite attendu : INVOKER pour les deux declencheurs qui lisent
-- current_user ou doivent subir la RLS de l'appelant, DEFINER pour les aides.
select is((select array_agg(a.signature order by a.signature) from attendus a
            join pg_proc p on p.oid = to_regprocedure(a.signature) where p.prosecdef),
  array['private.droits_valides(jsonb)', 'private.fusion_anciens_droits(jsonb, jsonb, jsonb)',
        'private.garder_proprietaire()', 'private.sync_postes_admin_users()', 'private.sync_postes_invitations()',
        'public.has_tenant_floor_permission(uuid)', 'public.has_tenant_money_permission(uuid)',
        'public.has_tenant_write_permission(uuid, text)', 'public.is_tenant_owner(uuid)',
        'public.tenant_permission_level(uuid, text)', 'public.tenants_avec_droit(text, text)'],
  'SECURITY DEFINER : exactement ces onze fonctions (les deux declencheurs INVOKER n y sont pas)');

-- Effet reel, pas seulement le catalogue : anon n'appelle pas une fonction interne.
set local role anon;
select throws_ok('select private.matrice_postes()', '42501', null, 'anon: lire la matrice est refuse');
reset role;
set local role authenticated;
select throws_ok('select private.codes_droits()', '42501', null, 'authenticated: lire le catalogue interne est refuse');
select lives_ok($$select public.tenant_permission_level(gen_random_uuid(), 'menu.view')$$,
  'temoin: authenticated appelle bien une aide de RLS');
reset role;

select * from finish();
rollback;

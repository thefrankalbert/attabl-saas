-- Couverture RLS — à exécuter dans Supabase (SQL Editor) ou via psql/MCP execute_sql.
-- But: prouver que toute table du schéma public a la RLS activée ET au moins une policy.

-- 1) Tables du schéma public SANS RLS activée (doit renvoyer 0 ligne)
select n.nspname as schema, c.relname as table_sans_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by 2;

-- 2) Tables avec RLS activée mais AUCUNE policy (table verrouillée, souvent involontaire)
select t.schemaname, t.tablename
from pg_tables t
where t.schemaname = 'public'
  and t.rowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = t.schemaname and p.tablename = t.tablename
  )
order by 1,2;

-- 3) Policies potentiellement trop permissives (USING (true) / WITH CHECK (true))
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (coalesce(qual,'') ilike '%true%' or coalesce(with_check,'') ilike '%true%')
order by tablename, policyname;

-- 4) Fonctions SECURITY DEFINER du schéma public (vérifier search_path + EXECUTE)
select p.proname as fonction,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(search_path non figé)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef = true
order by 1;

-- 5) Qui peut EXECUTE les fonctions SECURITY DEFINER (chercher anon/authenticated)
select p.proname as fonction, r.rolname as role_avec_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral (values ('anon'),('authenticated')) as roles(rolname)
join pg_roles r on r.rolname = roles.rolname
where n.nspname = 'public' and p.prosecdef = true
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by 1,2;

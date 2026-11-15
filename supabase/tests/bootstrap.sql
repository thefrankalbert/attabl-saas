-- ============================================================================
-- Ce que Supabase fournit et qu'un Postgres nu n'a pas.
-- ============================================================================
--
-- Les tests de supabase/tests/rls/ prouvent que le refus vient des PRIVILEGES
-- Postgres et des policies RLS, pas du code applicatif. Pour cela il faut un
-- vrai serveur, avec les roles et les fonctions `auth.*` que Supabase installe
-- sur ses instances. Ce fichier les recree a l'identique du point de vue des
-- tests.
--
-- Il est partage par la CI (.github/workflows/pgtap.yml) et par la machine de
-- developpement (scripts/run-pgtap.sh). Un seul fichier, pour que les deux ne
-- divergent jamais: un bootstrap different en local et en CI, c'est un test qui
-- passe d'un cote et echoue de l'autre sans que personne comprenne pourquoi.
--
-- Rejouable: tout est en `if not exists` / `create or replace`.
-- ============================================================================

-- ------------------------------------------------------------------ les roles
-- `anon`, `authenticated` et `service_role` sont ceux que les tests endossent
-- avec `set local role`. Les autres existent uniquement parce que les
-- instructions `OWNER TO` de supabase/schema.sql les nomment: sans eux le
-- chargement du schema echoue.
do $$
declare r text;
begin
  foreach r in array array[
    'anon', 'authenticated', 'service_role', 'authenticator',
    'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin',
    'supabase_realtime_admin', 'dashboard_user', 'pgbouncer',
    'supabase_read_only_user', 'supabase_etl_admin'
  ]
  loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- les schemas
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists graphql_public;
create schema if not exists realtime;
create schema if not exists storage;

-- ------------------------------------------------------------- les extensions
-- uuid-ossp n'est PAS optionnelle: les defauts de colonnes de schema.sql
-- appellent `extensions.uuid_generate_v4()`. Sans elle, la creation des tables
-- echoue en cascade (433 erreurs mesurees, dont "relation does not exist" sur
-- presque toutes les tables) et le diagnostic part dans la mauvaise direction.
create extension if not exists pgcrypto      with schema extensions;
create extension if not exists "uuid-ossp"   with schema extensions;
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists unaccent      with schema extensions;
create extension if not exists btree_gin     with schema extensions;
create extension if not exists citext        with schema extensions;
create extension if not exists moddatetime   with schema extensions;

-- pgTAP lui-meme. Fourni par le paquet postgresql-<version>-pgtap.
create extension if not exists pgtap with schema extensions;

-- ----------------------------------------------------------- la table auth
-- Les tests y inserent les comptes de connexion. Seules les colonnes qu'ils
-- renseignent sont recreees: ce n'est pas une copie de la vraie table GoTrue,
-- c'est le minimum dont les policies et les tests ont besoin.
create table if not exists auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ------------------------------------------------------ les fonctions auth.*
-- Fideles au comportement de production: elles lisent le JWT depuis le reglage
-- de session `request.jwt.claims`, exactement comme sur une instance Supabase.
-- C'est ce qui permet aux tests de se faire passer pour un utilisateur donne
-- avec `set local request.jwt.claims = '{"sub":"..."}'`.
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$f$;

create or replace function auth.role() returns text language sql stable as $f$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    current_user);
$f$;

create or replace function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
$f$;

grant usage on schema auth, extensions to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- Les tests inserent leurs comptes et leurs restaurants AVANT d'endosser
-- `anon` ou `authenticated`, donc en tant que superutilisateur. Rien d'autre a
-- accorder ici: tout ce qui suit doit venir de supabase/schema.sql, sinon le
-- bootstrap masquerait justement les privileges que les tests mesurent.

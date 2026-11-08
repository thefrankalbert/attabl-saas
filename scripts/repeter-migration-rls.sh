#!/usr/bin/env bash
#
# Repeter une migration RLS sur une COPIE JETABLE du schema de production.
#
# POURQUOI CE BANC D'ESSAI EXISTE. On ne fait pas de QA en ecriture sur la base
# de production, et `supabase db push` ne peut pas s'appliquer sur ce depot (le
# suivi des migrations est divergent). Sans copie locale, une migration RLS
# partait en production sans avoir jamais ete executee une seule fois.
#
# CE QU'IL PROUVE, et c'est le point: l'etat AVANT et l'etat APRES. Un "refuse"
# apres la migration ne prouve rien tout seul - il pourrait venir d'une
# contrainte de cle etrangere ou d'une faute de frappe. La meme insertion doit
# d'abord etre AUTORISEE sur le schema d'aujourd'hui.
#
# QUATRE PIEGES, tous rencontres en vrai le 2026-11-08:
#   1. `initdb` refuse la locale du poste -> LC_ALL=C.
#   2. Une socket Unix est limitee a 103 octets, et le chemin du bac a sable du
#      harnais la depasse -> socket dans /tmp.
#   3. Sans les doublures `auth.uid/role/jwt`, 63 CREATE POLICY echouent en
#      silence: 80 policies restaurees au lieu de 143, et on croit tester le
#      schema de production.
#   4. Sans le schema `extensions` de Supabase, le dump s'arrete a la premiere
#      extension et AUCUNE table n'est creee: 445 erreurs en cascade, toutes du
#      type "relation public.tenants does not exist".
#
# Usage: bash scripts/repeter-migration-rls.sh <dossier-de-travail> <racine-du-depot>
# Exemple: bash scripts/repeter-migration-rls.sh /tmp/essai-rls .
#
# La migration repetee est choisie en tete du script (MIGRATION), avec son jeu
# d'essai. Adapter les deux pour une autre migration.
# Repetition de la migration RLS push sur une copie JETABLE du schema.
# Jamais sur la production: aucune QA en ecriture avec les identifiants de prod.
set -euo pipefail
export LC_ALL=C LANG=C
PG="/opt/homebrew/opt/postgresql@17/bin"
BASE="$1"; DEPOT="$2"
# Une socket Unix est limitee a 103 octets: le chemin du bac a sable est trop long.
PORT=54890
SOCK="/tmp/pgpush-$$"
PGDATA="$BASE/pgdata"
rm -rf "$PGDATA" "$SOCK"; mkdir -p "$PGDATA" "$SOCK"

"$PG/initdb" -D "$PGDATA" -U postgres --no-locale --encoding=UTF8 >"$BASE/initdb.log" 2>&1
"$PG/pg_ctl" -D "$PGDATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$BASE/pg.log" start >/dev/null
trap '"$PG/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true' EXIT
sleep 1
P="$PG/psql -h $SOCK -p $PORT -U postgres -X -q -v ON_ERROR_STOP=1"

# Roles et doublures de l'environnement Supabase. SANS les doublures auth.*,
# 63 CREATE POLICY echouent en silence et le schema restaure est incomplet
# (80 policies au lieu de 143): piege deja rencontre le 2026-11-07.
$P -c "
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema if not exists auth;
-- Supabase place ses extensions dans un schema dedie: sans lui, le dump
-- s'arrete a la premiere extension et AUCUNE table n'est creee (445 erreurs
-- en cascade, toutes du type \"relation public.tenants does not exist\").
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists \"uuid-ossp\" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as \$\$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid \$\$;
create or replace function auth.role() returns text language sql stable as \$\$
  select coalesce(nullif(current_setting('request.jwt.claims', true)::json->>'role',''),'anon') \$\$;
create or replace function auth.jwt() returns jsonb language sql stable as \$\$
  select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb,'{}'::jsonb) \$\$;
grant usage on schema auth to anon, authenticated, service_role;
" >/dev/null

# Restauration SANS ON_ERROR_STOP: le dump rejoue des objets deja presents
# ("schema public already exists"), ce qui est benin et ne doit pas tout arreter.
"$PG/psql" -h "$SOCK" -p "$PORT" -U postgres -X -q -f "$DEPOT/supabase/schema.sql" >"$BASE/restore.log" 2>&1 || true
echo "policies restaurees: $($P -t -A -c "select count(*) from pg_policy;")  (attendu ~143)"
echo "etat AVANT la migration:"
$P -t -A -F'|' -c "
select '  policy', polname, pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid='public.push_subscriptions'::regclass;
select '  truncate_authenticated', has_table_privilege('authenticated','public.push_subscriptions','truncate')::text;"

# Le comportement, pas la forme: deux restaurants, deux comptes.
$P -c "
insert into public.tenants (id, slug, name, is_active, currency, subscription_status) values
 ('cccc1111-0000-0000-0000-00000000000a','push-victime','Victime',true,'XOF','active'),
 ('cccc2222-0000-0000-0000-00000000000b','push-attaquant','Attaquant',true,'XOF','active');
insert into auth.users (id,email) values
 ('eeee1111-0000-0000-0000-00000000000a','membre@exemple.test'),
 ('eeee2222-0000-0000-0000-00000000000b','attaquant@exemple.test');
insert into public.admin_users (id,user_id,tenant_id,email,role,is_active) values
 ('dddd1111-0000-0000-0000-00000000000a','eeee1111-0000-0000-0000-00000000000a','cccc1111-0000-0000-0000-00000000000a','membre@exemple.test','owner',true),
 ('dddd2222-0000-0000-0000-00000000000b','eeee2222-0000-0000-0000-00000000000b','cccc2222-0000-0000-0000-00000000000b','attaquant@exemple.test','owner',true);
" >/dev/null


# CONTRE-EPREUVE. Sans elle, un "REFUSE" apres la migration ne prouve rien: il
# pourrait venir d'une contrainte de cle etrangere ou d'une autre cause. La
# MEME insertion doit etre AUTORISEE avant la migration.
essayer_insertion() {
  $P -t -A -c "
begin;
set local role authenticated;
set local \"request.jwt.claims\" = '{\"sub\":\"eeee2222-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';
insert into public.push_subscriptions (tenant_id,user_id,endpoint,p256dh,auth)
 values ('$1','eeee2222-0000-0000-0000-00000000000b','https://fcm.googleapis.com/fcm/send/$2','p','a');
rollback;" >/dev/null 2>&1 && echo AUTORISE || echo REFUSE
}
echo "AVANT la migration (etat de la production aujourd'hui):"
echo "  insertion sous le restaurant d'un AUTRE: $(essayer_insertion cccc1111-0000-0000-0000-00000000000a x)  <- doit etre AUTORISE, c'est la faille"
echo "  insertion sous SON restaurant:           $(essayer_insertion cccc2222-0000-0000-0000-00000000000b y)"

$P -1 -f "$DEPOT/supabase/migrations/20261108120000_push_subscriptions_appartenance_tenant.sql" >/dev/null
echo "migration appliquee."
echo "etat APRES:"
$P -t -A -F'|' -c "
select '  policy', polname, (pg_get_expr(polwithcheck, polrelid) like '%get_my_tenant_ids%')::text from pg_policy where polrelid='public.push_subscriptions'::regclass;
select '  truncate_authenticated', has_table_privilege('authenticated','public.push_subscriptions','truncate')::text;
select '  insert_authenticated', has_table_privilege('authenticated','public.push_subscriptions','insert')::text;"

echo "APRES la migration:"
echo "  insertion sous le restaurant d'un AUTRE: $(essayer_insertion cccc1111-0000-0000-0000-00000000000a z)  <- doit etre REFUSE"
echo "  insertion sous SON restaurant:           $(essayer_insertion cccc2222-0000-0000-0000-00000000000b w)  <- doit rester AUTORISE"

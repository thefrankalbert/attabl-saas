-- DB-12 - le role anon detient des privileges d'ECRITURE sur le schema public.
--
-- Mesure le 2026-07-31 sur un snapshot du schema de production:
--   select count(*) from information_schema.role_table_grants
--   where grantee='anon' and table_schema='public'
--     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
--   -> 294
--
-- Soit INSERT, UPDATE, DELETE et TRUNCATE pour anon sur une large part du schema,
-- y compris admin_users, audit_log, categories, coupon_redemptions. L'audit
-- annoncait "une trentaine de tables": c'est davantage.
--
-- Ces droits sont contenus par la RLS aujourd'hui. Le probleme est qu'il n'y a
-- alors AUCUNE deuxieme ligne de defense: la moindre policy trop large devient
-- immediatement une ecriture ou une destruction de donnees, au lieu d'un simple
-- 42501. Les grants proviennent du schema d'origine, etabli en production avant
-- le suivi des migrations (aucune migration du depot ne les accorde).
--
-- On revoque UNIQUEMENT les privileges d'ecriture. Les GRANT SELECT sont laisses
-- intacts: c'est ce qui fait vivre la vitrine publique (menus, categories,
-- venues, tables...), et les restreindre demanderait une liste blanche table par
-- table, donc un risque de regression sans contrepartie de securite ici. Les
-- lectures reellement trop larges sont traitees table par table dans les
-- migrations 20260731000100 a 20260731000400.
--
-- Rollback (deconseille):
--   grant insert, update, delete, truncate, references, trigger
--     on all tables in schema public to anon;

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon;

-- Meme traitement pour les tables futures: sans cela, la prochaine table creee
-- par le role proprietaire redonnerait ces privileges a anon.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables
  from anon;

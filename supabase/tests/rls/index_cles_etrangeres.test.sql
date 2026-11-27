-- Toute cle etrangere de `public` a un index qui commence par sa colonne
-- (migration 20261124120100, constat L1).
--
-- La requete du catalogue est d'abord prouvee sur un temoin: une table creee
-- ici avec une cle etrangere sans index DOIT etre listee (temoin negatif), puis
-- ne plus l'etre une fois indexee (temoin positif). Ensuite seulement, elle
-- doit rendre 0 ligne sur le schema reel. Une cle etrangere ajoutee plus tard
-- sans index fait echouer ce test.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

create function pg_temp.fk_sans_index() returns setof text
language sql as $$
  select c.conrelid::regclass::text || '.' || a.attname -- regclass sans schema (public est dans search_path)
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
     )
   order by 1
$$;

create table public.zz_temoin_fk (id uuid primary key, order_id uuid references public.orders(id));
select ok('zz_temoin_fk.order_id' in (select pg_temp.fk_sans_index()),
  'temoin negatif: une cle etrangere sans index est detectee');
create index on public.zz_temoin_fk (order_id);
select ok('zz_temoin_fk.order_id' not in (select pg_temp.fk_sans_index()),
  'temoin positif: indexee, elle n est plus listee');
drop table public.zz_temoin_fk;

select is_empty('select * from pg_temp.fk_sans_index()',
  'aucune cle etrangere de public sans index');
select has_index('public', 'order_notes', 'idx_order_notes_order_id',
  'order_notes(order_id) indexe (lu a chaque fiche de commande)');

select * from finish();
rollback;

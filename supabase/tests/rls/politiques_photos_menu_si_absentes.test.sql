-- Politiques du bucket `menu-items` creees si absentes
-- (migration 20261124120200).
--
-- La base pgTAP n'a pas de table `storage.objects` (le schema storage de
-- Supabase n'y est pas installe). Le test en cree une minimale DANS sa
-- transaction (annulee a la fin), avec `storage.foldername` comme Supabase,
-- puis rejoue la migration avec \ir. Il prouve:
--   - temoin negatif: avant la migration, aucune des quatre politiques;
--   - apres: les quatre existent, l'ecriture d'un membre dans le dossier de
--     SON restaurant passe, dans celui d'un autre restaurant est refusee, et
--     la lecture ne montre que ses propres photos;
--   - une politique deja presente n'est pas reecrite (rejeu).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- Meme definition que Supabase: le chemin sans son dernier segment.
create function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
grant execute on function storage.foldername(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('e8111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'gerant-photos@test.local', 'x', now(), now());
insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('e8000000-0000-4000-8000-00000000000a', 'photos-a', 'Photos A', true, 'pro', 'active'),
       ('e8000000-0000-4000-8000-00000000000b', 'photos-b', 'Photos B', true, 'pro', 'active');
insert into public.admin_users (tenant_id, user_id, email, role, is_active)
values ('e8000000-0000-4000-8000-00000000000a', 'e8111111-1111-4111-8111-111111111111',
        'gerant-photos@test.local', 'manager', true);
insert into storage.objects (bucket_id, name)
values ('menu-items', 'e8000000-0000-4000-8000-00000000000a/plat-a.jpg'),
       ('menu-items', 'e8000000-0000-4000-8000-00000000000b/plat-b.jpg');

select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname like '%menu photos'),
  0, 'temoin negatif: sans la migration, aucune politique des photos du menu');

\ir ../../migrations/20261124120200_politiques_photos_menu_si_absentes.sql

select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname in ('Tenants can upload menu photos', 'Tenants can update own menu photos',
                               'Tenants can delete own menu photos', 'Tenants can read own menu photos')),
  4, 'les quatre politiques sont creees');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e8111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('menu-items', 'e8000000-0000-4000-8000-00000000000a/nouveau.jpg')$$,
  'temoin positif: le gerant depose une photo dans le dossier de son restaurant');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('menu-items', 'e8000000-0000-4000-8000-00000000000b/intrus.jpg')$$,
  '42501', null, 'le gerant ne depose rien dans le dossier d un autre restaurant');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('menu-items', 'a-plat.jpg')$$,
  '42501', null, 'un fichier hors dossier de restaurant est refuse');
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'menu-items'),
  array['e8000000-0000-4000-8000-00000000000a/nouveau.jpg', 'e8000000-0000-4000-8000-00000000000a/plat-a.jpg'],
  'lecture: seulement les photos de son restaurant');

reset role;

-- Rejeu sur une base ou une politique existe deja avec un autre texte: elle
-- n'est pas reecrite.
alter policy "Tenants can upload menu photos" on storage.objects with check (false);
\ir ../../migrations/20261124120200_politiques_photos_menu_si_absentes.sql
select is((select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname = 'Tenants can upload menu photos'),
  'false', 'rejeu: une politique existante n est pas modifiee');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname like '%menu photos'),
  4, 'rejeu: aucune politique en double');

select * from finish();
rollback;

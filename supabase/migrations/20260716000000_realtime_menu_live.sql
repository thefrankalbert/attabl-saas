-- Make the storefront menu live: availability, structure, and tenant settings.
--
-- The client (useClientMenuDetail) already subscribes to menu_items, categories,
-- and tenants, but those tables were NOT in the realtime publication, so zero
-- events reached the storefront. This publishes them.
--
-- It also relaxes the public menu_items SELECT policy: Supabase realtime evaluates
-- RLS on the NEW row of an UPDATE, so the old `is_available = true` filter silently
-- dropped every "item just became unavailable" event - the exact transition the
-- storefront needs to grey out a dish live. Anon can now read unavailable (but not
-- deleted) items; the storefront renders them greyed "Indisponible". This exposes
-- nothing new: the server already renders those greyed items via the service-role
-- cache. Deleted items stay hidden.
--
-- Rollback:
--   alter publication supabase_realtime drop table public.menu_items, public.categories, public.tenants;
--   drop policy "Public can view menu items" on public.menu_items;
--   create policy "Public can view available menu items" on public.menu_items
--     for select using ((is_available = true) and (deleted_at is null));

-- 1. Publish the tables the storefront subscribes to (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
  ) then
    alter publication supabase_realtime add table public.menu_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tenants'
  ) then
    alter publication supabase_realtime add table public.tenants;
  end if;
end $$;

-- 2. Let anon read unavailable-but-not-deleted items so realtime delivers the
--    disable transition (RLS is checked on the NEW row).
drop policy if exists "Public can view available menu items" on public.menu_items;
create policy "Public can view menu items" on public.menu_items
  for select
  using (deleted_at is null);

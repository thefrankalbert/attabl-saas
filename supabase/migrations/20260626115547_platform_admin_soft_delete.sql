-- Platform super-admin: soft-delete + suspension metadata
--
-- Adds reversible lifecycle columns used by the super-admin Command Center.
-- Purely additive (nullable columns), safe to apply before the code that reads
-- them is deployed. No data is dropped or rewritten.
--
-- Rollback:
--   alter table public.tenants
--     drop column if exists deleted_at, drop column if exists deleted_by,
--     drop column if exists suspended_at, drop column if exists suspended_by,
--     drop column if exists suspend_reason;
--   alter table public.admin_users
--     drop column if exists deleted_at, drop column if exists deleted_by,
--     drop column if exists banned_at, drop column if exists banned_by,
--     drop column if exists ban_reason;

-- --- tenants ---------------------------------------------------------------
alter table public.tenants
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null,
  add column if not exists suspend_reason text;

-- Partial index: tenant resolution (by slug) only ever wants live rows.
create index if not exists idx_tenants_live
  on public.tenants (slug)
  where deleted_at is null;

-- --- admin_users -----------------------------------------------------------
alter table public.admin_users
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_by uuid references auth.users(id) on delete set null,
  add column if not exists ban_reason text;

-- Partial index for live-membership lookups (login, user lists).
create index if not exists idx_admin_users_live
  on public.admin_users (tenant_id)
  where deleted_at is null;

-- Platform super-admin audit trail
--
-- Separate from the tenant-scoped `audit_log` (which has tenant_id NOT NULL and
-- ON DELETE CASCADE, so its rows vanish when a tenant is purged). God-mode
-- actions must leave a trail that OUTLIVES the tenant they acted on, so this
-- table keeps tenant_id nullable with ON DELETE SET NULL and denormalizes a
-- human-readable target_label.
--
-- RLS is enabled with NO policies: only the service_role (super-admin server
-- actions) can read or write it. Never exposed to anon/authenticated clients.
--
-- Rollback: drop table if exists public.platform_audit_log;

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id uuid,
  target_label text,
  tenant_id uuid references public.tenants(id) on delete set null,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_audit_log_created
  on public.platform_audit_log (created_at desc);

create index if not exists idx_platform_audit_log_target
  on public.platform_audit_log (target_type, target_id);

alter table public.platform_audit_log enable row level security;
-- Intentionally no policies: service_role bypasses RLS; everyone else is denied.

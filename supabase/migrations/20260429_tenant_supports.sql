-- Migration: tenant_supports table for print templates (chevalet, etc.)
-- Created: 2026-04-29

create table if not exists tenant_supports (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  type        text not null default 'chevalet_standard',
  config      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tenant_supports_type_check check (type in ('chevalet_standard')),
  constraint tenant_supports_unique unique (tenant_id, type)
);

create index if not exists tenant_supports_tenant_id_idx on tenant_supports(tenant_id);

alter table tenant_supports enable row level security;

create policy "tenant_supports_select"
  on tenant_supports for select
  using (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  );

create policy "tenant_supports_insert"
  on tenant_supports for insert
  with check (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  );

create policy "tenant_supports_update"
  on tenant_supports for update
  using (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  )
  with check (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  );

create or replace function update_tenant_supports_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenant_supports_updated_at
  before update on tenant_supports
  for each row execute procedure update_tenant_supports_updated_at();

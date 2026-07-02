-- Perf + advisors cleanup (audit 2026-07-01/02)
-- 1. Drop duplicate/over-broad SELECT policies (2 were exposure bugs)
-- 2. Scope service_role belt-and-suspenders policies to the service_role role
-- 3. Wrap auth.uid()/auth.role() in scalar subselects in all public policies
--    (fixes 62 auth_rls_initplan advisor warnings; semantics unchanged)
-- 4. Tighten newsletter INSERT WITH CHECK (was: true)
-- 5. Drop 4 duplicate indexes, add 18 missing FK indexes
-- 6. Drop unused public-listing policy on the qr-designs bucket
--
-- Rollback: restore policies from the pg_policies snapshot taken pre-migration
-- (scratchpad rls_snapshot_20260702.json) and recreate dropped indexes from
-- their definitions in the same snapshot.

-- 1a. announcements: qual was `true` - exposed INACTIVE announcements to anon.
-- "Public can view active announcements" (is_active = true) remains for convive;
-- "Admins can manage announcements" (ALL) keeps admin access to inactive rows.
drop policy if exists "Anyone can view active announcements" on public.announcements;

-- 1b. menu_items: exposed soft-deleted items. "Public can view available menu
-- items" (is_available AND deleted_at IS NULL) remains; admin ALL policy remains.
drop policy if exists "Menu items are publicly readable" on public.menu_items;

-- 1c. coupons: strict duplicates of "Admins can manage own tenant coupons" (ALL).
drop policy if exists "Coupons manageable by admins" on public.coupons;
drop policy if exists "Coupons viewable by tenant admins" on public.coupons;

-- 1d. Stock-domain SELECT duplicates: "Admins can view own tenant X" (via
-- get_my_tenant_ids_array()) remains and is the standard; the X_select twins
-- (bare admin_users subquery, no is_active check) are dropped.
drop policy if exists ingredients_select on public.ingredients;
drop policy if exists item_suggestions_select on public.item_suggestions;
drop policy if exists recipes_select on public.recipes;
drop policy if exists stock_movements_select on public.stock_movements;
drop policy if exists suppliers_select on public.suppliers;

-- 2. service_role bypasses RLS; these belt-and-suspenders policies only need to
-- exist for service_role. Scoping them stops anon/authenticated queries from
-- evaluating them (multiple_permissive_policies advisor).
alter policy service_role_full_access_invitations on public.invitations to service_role;
alter policy service_role_full_access_role_permissions on public.role_permissions to service_role;
alter policy service_role_full_access on public.restaurant_groups to service_role;
alter policy "Enable select for service_role only" on public.newsletter_subscriber to service_role;
alter policy "Enable delete for service_role only" on public.newsletter_subscriber to service_role;

-- 3. auth_rls_initplan: wrap per-row auth.uid()/auth.role() calls in scalar
-- subselects so Postgres evaluates them once per query (InitPlan) instead of
-- once per row. Generic and idempotent: already-wrapped calls round-trip to
-- their original form.
do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
        or coalesce(qual, '') like '%auth.role()%'
        or coalesce(with_check, '') like '%auth.role()%'
      )
  loop
    new_qual := r.qual;
    new_check := r.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, '( SELECT (select auth.uid()) AS uid)', '( SELECT auth.uid() AS uid)');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      new_qual := replace(new_qual, '( SELECT (select auth.role()) AS role)', '( SELECT auth.role() AS role)');
    end if;

    if new_check is not null then
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, '( SELECT (select auth.uid()) AS uid)', '( SELECT auth.uid() AS uid)');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      new_check := replace(new_check, '( SELECT (select auth.role()) AS role)', '( SELECT auth.role() AS role)');
    end if;

    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;

    execute stmt;
  end loop;
end;
$$;

-- 4. newsletter_subscriber INSERT: keep the public subscribe path (server action
-- uses the anon-key server client, Zod-validated + rate limited 3/h/IP) but
-- replace WITH CHECK (true) with a minimal shape constraint.
alter policy "Enable insert for public" on public.newsletter_subscriber
  with check (
    email is not null
    and char_length(email) between 5 and 255
    and position('@' in email) > 1
  );

-- 5a. Duplicate indexes (identical definitions verified in pg_indexes).
drop index if exists public.idx_announcements_tenant;        -- dup of idx_announcements_tenant_id
drop index if exists public.idx_announcements_active;        -- dup of idx_announcements_tenant_active
drop index if exists public.idx_stock_movements_date;        -- dup of idx_stock_movements_tenant_created
drop index if exists public.idx_tenants_stripe_customer;     -- dup of idx_tenants_stripe_customer_id

-- 5b. Missing FK covering indexes (unindexed_foreign_keys advisor).
create index if not exists idx_admin_users_banned_by on public.admin_users (banned_by);
create index if not exists idx_admin_users_deleted_by on public.admin_users (deleted_by);
create index if not exists idx_ai_credits_ledger_menu_item_id on public.ai_credits_ledger (menu_item_id);
create index if not exists idx_ai_credits_ledger_tenant_id on public.ai_credits_ledger (tenant_id);
create index if not exists idx_ai_credits_ledger_user_id on public.ai_credits_ledger (user_id);
create index if not exists idx_coupon_redemptions_coupon_id on public.coupon_redemptions (coupon_id);
create index if not exists idx_dish_photo_drafts_attached_menu_item_id on public.dish_photo_drafts (attached_menu_item_id);
create index if not exists idx_dish_photo_drafts_created_by on public.dish_photo_drafts (created_by);
create index if not exists idx_invitations_invited_by on public.invitations (invited_by);
create index if not exists idx_menu_items_image_uploaded_by on public.menu_items (image_uploaded_by);
create index if not exists idx_payments_created_by on public.payments (created_by);
create index if not exists idx_platform_audit_log_actor_user_id on public.platform_audit_log (actor_user_id);
create index if not exists idx_platform_audit_log_tenant_id on public.platform_audit_log (tenant_id);
create index if not exists idx_role_permissions_updated_by on public.role_permissions (updated_by);
create index if not exists idx_stock_alert_notifications_ingredient_id on public.stock_alert_notifications (ingredient_id);
create index if not exists idx_table_assignments_table_id on public.table_assignments (table_id);
create index if not exists idx_tenants_deleted_by on public.tenants (deleted_by);
create index if not exists idx_tenants_suspended_by on public.tenants (suspended_by);

-- 6. qr-designs is a public bucket; object URLs work without a SELECT policy.
-- The broad SELECT policy only enabled anonymous LISTING of the whole bucket,
-- and no code path lists it (audited 2026-07-02).
drop policy if exists "Public can read QR designs" on storage.objects;

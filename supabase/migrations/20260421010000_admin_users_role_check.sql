-- Defense in depth: add a CHECK constraint on admin_users.role so that
-- even a future contributor bypassing Zod validation or using raw UPDATE
-- cannot set an arbitrary value. The trigger
-- `prevent_super_admin_elevation` already blocks non-service-role clients
-- from promoting to super_admin; this constraint enforces the value domain
-- at the storage layer.

ALTER TABLE public.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_check;

ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'cashier', 'chef', 'waiter', 'super_admin'));

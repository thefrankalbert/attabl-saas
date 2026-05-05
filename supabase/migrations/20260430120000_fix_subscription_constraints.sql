-- Migrate old plan names to new ones
UPDATE tenants SET subscription_plan = CASE
  WHEN subscription_plan = 'essentiel' THEN 'starter'
  WHEN subscription_plan = 'premium' THEN 'pro'
  ELSE subscription_plan
END
WHERE subscription_plan IN ('essentiel', 'premium');

-- Fix subscription_plan constraint
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_plan_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_subscription_plan_check
  CHECK (subscription_plan IN ('starter', 'pro', 'business', 'enterprise'));

-- Fix billing_interval constraint (add semiannual)
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_billing_interval_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'semiannual', 'yearly'));

-- Fix subscription_status constraint (add frozen - used in prod code but missing from DB)
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'paused', 'frozen'));

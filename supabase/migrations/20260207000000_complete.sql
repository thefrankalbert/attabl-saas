-- ============================================
-- ATTABL SaaS - Complete Database Migrations
-- ============================================
-- Combined: Billing + Onboarding Support
-- Author: Antigravity AI
-- Date: 2026-02-07
-- ============================================

-- ============================================
-- PART 1: BILLING & SUBSCRIPTION COLUMNS
-- ============================================

-- Intervalle de facturation (monthly/yearly)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS billing_interval TEXT 
CHECK (billing_interval IN ('monthly', 'yearly')) 
DEFAULT 'monthly';

-- Date de fin de l'essai gratuit
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Colonnes Stripe
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

-- Contraintes subscription_plan
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_plan_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_subscription_plan_check 
CHECK (subscription_plan IN ('essentiel', 'premium', 'enterprise'));

-- Contraintes subscription_status
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_subscription_status_check 
CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'paused'));

-- Migration des anciennes données
UPDATE tenants
SET subscription_plan = CASE
  WHEN subscription_plan = 'starter' THEN 'essentiel'
  WHEN subscription_plan = 'pro' THEN 'premium'
  ELSE subscription_plan
END
WHERE subscription_plan IN ('starter', 'pro');

-- ============================================
-- PART 2: ONBOARDING COLUMNS
-- ============================================

-- Colonnes établissement
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS establishment_type VARCHAR(50) DEFAULT 'restaurant';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Tchad';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS table_count INTEGER DEFAULT 10;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#000000';

-- Colonnes onboarding status
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;

-- ============================================
-- PART 3: ONBOARDING PROGRESS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS onboarding_progress (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  step INTEGER DEFAULT 1 CHECK (step >= 1 AND step <= 4),
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own onboarding_progress" ON onboarding_progress;
CREATE POLICY "Users can view own onboarding_progress" ON onboarding_progress
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own onboarding_progress" ON onboarding_progress;
CREATE POLICY "Users can insert own onboarding_progress" ON onboarding_progress
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own onboarding_progress" ON onboarding_progress;
CREATE POLICY "Users can update own onboarding_progress" ON onboarding_progress
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

-- ============================================
-- PART 4: INDEXES & TRIGGERS
-- ============================================

-- Billing indexes
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status ON tenants(subscription_status);
CREATE INDEX IF NOT EXISTS idx_tenants_trial_ends_at ON tenants(trial_ends_at) WHERE subscription_status = 'trial';
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer_id ON tenants(stripe_customer_id);

-- Onboarding indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_tenant ON onboarding_progress(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_onboarding ON tenants(onboarding_completed);

-- Trial end date trigger
CREATE OR REPLACE FUNCTION set_trial_end_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscription_status = 'trial' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_trial_end_date ON tenants;
CREATE TRIGGER trigger_set_trial_end_date
BEFORE INSERT OR UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_trial_end_date();

-- ============================================
-- DONE! All migrations applied.
-- ============================================

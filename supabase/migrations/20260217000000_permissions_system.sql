-- ============================================
-- ATTABL SaaS - Permissions System Migration
-- ============================================
-- Adds: login tracking, order assignment, user preferences,
--       session audit trail, auto-preference creation trigger
-- Date: 2026-02-17
-- ============================================

-- ============================================
-- PART 1: LOGIN TRACKING COLUMNS ON admin_users
-- ============================================

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- ============================================
-- PART 2: ORDER ASSIGNMENT COLUMNS ON orders
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_assigned ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_server ON orders(server_id);

-- ============================================
-- PART 3: USER PREFERENCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES admin_users(id) ON DELETE CASCADE,
  notification_sound TEXT DEFAULT 'default',
  default_view TEXT DEFAULT 'standard'
    CHECK (default_view IN ('standard', 'pos', 'kitchen', 'server')),
  language TEXT DEFAULT 'fr'
    CHECK (language IN ('fr', 'en')),
  theme TEXT DEFAULT 'light'
    CHECK (theme IN ('light', 'dark')),
  kitchen_config JSONB DEFAULT '{}',
  pos_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER trigger_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences" ON user_preferences
  FOR SELECT USING (
    user_id IN (SELECT id FROM admin_users WHERE user_id = auth.uid())
    OR user_id IN (
      SELECT au.id FROM admin_users au
      WHERE au.tenant_id IN (SELECT get_my_tenant_ids())
    )
  );

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (
    user_id IN (SELECT id FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================
-- PART 4: USER SESSIONS AUDIT TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ DEFAULT NOW(),
  logout_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  device_info JSONB DEFAULT '{}',
  login_type TEXT DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at ON user_sessions(login_at);

-- RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;
CREATE POLICY "Users can view own sessions" ON user_sessions
  FOR SELECT USING (
    user_id IN (SELECT id FROM admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Tenant admins can view tenant sessions" ON user_sessions;
CREATE POLICY "Tenant admins can view tenant sessions" ON user_sessions
  FOR SELECT USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Users can insert own sessions" ON user_sessions;
CREATE POLICY "Users can insert own sessions" ON user_sessions
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================
-- PART 5: AUTO-CREATE user_preferences ON admin_user INSERT
-- ============================================

CREATE OR REPLACE FUNCTION auto_create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_user_preferences ON admin_users;
CREATE TRIGGER trigger_auto_create_user_preferences
  AFTER INSERT ON admin_users
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_user_preferences();

-- ============================================
-- PART 6: LOGIN TRACKING RPC
-- ============================================

CREATE OR REPLACE FUNCTION increment_login_count(admin_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE admin_users
  SET last_login_at = NOW(),
      login_count = COALESCE(login_count, 0) + 1
  WHERE id = admin_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

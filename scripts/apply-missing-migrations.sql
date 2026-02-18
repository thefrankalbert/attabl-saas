-- ============================================================
-- ATTABL SaaS - Combined Missing Migrations
-- ============================================================
-- This script combines the following unapplied migrations:
--   1. 20260210_production_upgrade.sql
--   2. 20260211_menu_hierarchy.sql
--   3. 20260216_idle_timeout.sql
--   4. 20260216_tenant_locale.sql
--   5. 20260217_permissions_system.sql
--   + zones, tables, announcements (never had their own migration)
--
-- All statements use IF NOT EXISTS / DO $$ ... EXCEPTION ... $$
-- guards so this script is safe to re-run (idempotent).
--
-- Skipped (already applied):
--   - 20260212_inventory_engine.sql
--   - 20260212_adjust_ingredient_stock.sql
--   - 20260215_suppliers.sql
--   - 20260215_stock_alert_notifications.sql
-- ============================================================

BEGIN;

-- ============================================================
-- MIGRATION 1: 20260210_production_upgrade
-- ============================================================

-- ── PART 1: TENANT COLUMNS (Missing + New) ──────────────────

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#000000';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notification_sound_id VARCHAR(50) DEFAULT 'classic-bell';

-- Multi-currency support
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'XAF';
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_currency_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_currency_check
  CHECK (currency IN ('XAF', 'EUR', 'USD'));

-- Tax & Service Charge
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_tax_rate_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_tax_rate_check
  CHECK (tax_rate >= 0 AND tax_rate <= 100);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS service_charge_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_service_charge_rate_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_service_charge_rate_check
  CHECK (service_charge_rate >= 0 AND service_charge_rate <= 100);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enable_tax BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enable_service_charge BOOLEAN DEFAULT FALSE;

-- ── PART 2: COUPONS TABLE ───────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value >= 0),
  min_order_amount NUMERIC(10,2) DEFAULT 0,
  max_discount_amount NUMERIC(10,2),
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code) WHERE is_active = TRUE;

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coupons viewable by tenant admins" ON coupons;
CREATE POLICY "Coupons viewable by tenant admins" ON coupons
  FOR SELECT USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Coupons manageable by admins" ON coupons;
CREATE POLICY "Coupons manageable by admins" ON coupons
  FOR ALL USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Public can validate active coupons" ON coupons;
CREATE POLICY "Public can validate active coupons" ON coupons
  FOR SELECT USING (is_active = TRUE);

-- ── PART 3: ORDERS TABLE UPGRADE ────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) DEFAULT 'dine_in';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_service_type_check
  CHECK (service_type IN ('dine_in', 'takeaway', 'delivery', 'room_service'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS room_number VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- Financial breakdown
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;

-- Payment tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'mobile_money'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'refunded'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Coupon reference (use DO block for FK which doesn't support IF NOT EXISTS)
DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- ── PART 4: ORDER_ITEMS TABLE UPGRADE ───────────────────────

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_item_status_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_item_status_check
  CHECK (item_status IN ('pending', 'preparing', 'ready', 'served'));

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS course VARCHAR(20);
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_course_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_course_check
  CHECK (course IS NULL OR course IN ('appetizer', 'main', 'dessert', 'drink'));

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_notes TEXT;

-- ── PART 5: ITEM_MODIFIERS TABLE ────────────────────────────

CREATE TABLE IF NOT EXISTS item_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  name_en VARCHAR(200),
  price NUMERIC(10,2) DEFAULT 0 CHECK (price >= 0),
  is_available BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_modifiers_menu_item ON item_modifiers(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_item_modifiers_tenant ON item_modifiers(tenant_id);

ALTER TABLE item_modifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Item modifiers viewable by public" ON item_modifiers;
CREATE POLICY "Item modifiers viewable by public" ON item_modifiers
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Item modifiers manageable by admins" ON item_modifiers;
CREATE POLICY "Item modifiers manageable by admins" ON item_modifiers
  FOR ALL USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );

-- ── PART 6: ATOMIC ORDER NUMBERS ────────────────────────────

CREATE OR REPLACE FUNCTION next_order_number(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_date TEXT;
  v_seq INTEGER;
  v_lock_key BIGINT;
BEGIN
  v_date := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Advisory lock per tenant+date to prevent race conditions
  v_lock_key := ('x' || LEFT(MD5(p_tenant_id::TEXT || v_date), 15))::BIT(60)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get next sequence for this tenant + date
  SELECT COALESCE(MAX(
    NULLIF(
      SUBSTRING(order_number FROM 'CMD-\d{8}-(\d+)')::INTEGER,
      0
    )
  ), 0) + 1
  INTO v_seq
  FROM orders
  WHERE tenant_id = p_tenant_id
    AND order_number LIKE 'CMD-' || v_date || '-%';

  RETURN 'CMD-' || v_date || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ── PART 7: COUPON USAGE INCREMENT ──────────────────────────

CREATE OR REPLACE FUNCTION increment_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE coupons
  SET current_uses = current_uses + 1, updated_at = NOW()
  WHERE id = p_coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── PART 8: REPORTING RPCs ──────────────────────────────────

-- Daily revenue report
CREATE OR REPLACE FUNCTION get_daily_revenue(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  revenue NUMERIC,
  order_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at) AS day,
    COALESCE(SUM(o.total), 0)::NUMERIC AS revenue,
    COUNT(o.id) AS order_count
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
  GROUP BY DATE(o.created_at)
  ORDER BY day ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Top items report
CREATE OR REPLACE FUNCTION get_top_items(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  quantity_sold BIGINT,
  revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.menu_item_id AS item_id,
    MAX(oi.item_name)::TEXT AS item_name,
    SUM(oi.quantity)::BIGINT AS quantity_sold,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
  GROUP BY oi.menu_item_id
  ORDER BY quantity_sold DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Order summary
CREATE OR REPLACE FUNCTION get_order_summary(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_orders BIGINT,
  avg_basket NUMERIC,
  total_tax NUMERIC,
  total_service_charge NUMERIC,
  total_discounts NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(o.total), 0)::NUMERIC AS total_revenue,
    COUNT(o.id)::BIGINT AS total_orders,
    CASE WHEN COUNT(o.id) > 0
      THEN ROUND(SUM(o.total) / COUNT(o.id), 2)
      ELSE 0
    END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── PART 9: FIX RLS ONBOARDING_PROGRESS ─────────────────────
-- Skipped: onboarding_progress table may not exist in all environments
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_progress' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own onboarding_progress" ON onboarding_progress';
    EXECUTE 'CREATE POLICY "Users can view own onboarding_progress" ON onboarding_progress FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()))';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert own onboarding_progress" ON onboarding_progress';
    EXECUTE 'CREATE POLICY "Users can insert own onboarding_progress" ON onboarding_progress FOR INSERT WITH CHECK (tenant_id IN (SELECT get_my_tenant_ids()))';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update own onboarding_progress" ON onboarding_progress';
    EXECUTE 'CREATE POLICY "Users can update own onboarding_progress" ON onboarding_progress FOR UPDATE USING (tenant_id IN (SELECT get_my_tenant_ids()))';
  END IF;
END $$;

-- ── PART 10: INDEXES FOR PERFORMANCE ────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_service_type ON orders(tenant_id, service_type);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(tenant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(order_id, item_status);
CREATE INDEX IF NOT EXISTS idx_order_items_course ON order_items(order_id, course);


-- ============================================================
-- MIGRATION 2: 20260211_menu_hierarchy
-- ============================================================

-- ── PART 1: MENUS TABLE ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  parent_menu_id UUID REFERENCES menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_en TEXT,
  slug TEXT NOT NULL,
  description TEXT,
  description_en TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_menus_tenant ON menus(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menus_venue ON menus(venue_id);
CREATE INDEX IF NOT EXISTS idx_menus_parent ON menus(parent_menu_id);
CREATE INDEX IF NOT EXISTS idx_menus_slug ON menus(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_menus_active ON menus(tenant_id, is_active)
  WHERE is_active = TRUE;

-- ── PART 2: ADD menu_id TO CATEGORIES ───────────────────────

DO $$ BEGIN
  ALTER TABLE categories ADD COLUMN menu_id UUID
    REFERENCES menus(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_menu ON categories(menu_id);

-- ── PART 3: RLS POLICIES ────────────────────────────────────

ALTER TABLE menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active menus" ON menus;
CREATE POLICY "Public can view active menus" ON menus
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins can manage menus" ON menus;
CREATE POLICY "Admins can manage menus" ON menus
  FOR ALL USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- ── PART 4: SLUG GENERATION HELPER ──────────────────────────

CREATE OR REPLACE FUNCTION generate_menu_slug(
  p_tenant_id UUID,
  p_name TEXT
) RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Transliterate accented chars and create slug
  base_slug := LOWER(TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(TRIM(p_name)),
        'àâäéèêëïîôùûüÿçñ ',
        'aaaeeeeiioouuycn-'
      ),
      '[^a-z0-9-]+', '-', 'g'
    )
  ));

  -- Remove consecutive dashes
  base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');

  -- Ensure non-empty
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'carte';
  END IF;

  final_slug := base_slug;

  -- Ensure uniqueness within tenant
  WHILE EXISTS (
    SELECT 1 FROM menus WHERE tenant_id = p_tenant_id AND slug = final_slug
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ── PART 5: CREATE DEFAULT MENUS FOR EXISTING TENANTS ───────

DO $$
DECLARE
  t RECORD;
  new_menu_id UUID;
  default_slug TEXT;
BEGIN
  FOR t IN SELECT DISTINCT id, slug, name FROM tenants LOOP
    -- Generate unique slug
    default_slug := generate_menu_slug(t.id, 'Carte Principale');

    -- Create default menu
    INSERT INTO menus (tenant_id, name, name_en, slug, is_active, display_order)
    VALUES (t.id, 'Carte Principale', 'Main Menu', default_slug, TRUE, 0)
    ON CONFLICT (tenant_id, slug) DO NOTHING
    RETURNING id INTO new_menu_id;

    -- If menu already existed (conflict), get its ID
    IF new_menu_id IS NULL THEN
      SELECT id INTO new_menu_id FROM menus
        WHERE tenant_id = t.id AND slug = default_slug
        LIMIT 1;
    END IF;

    -- Assign all orphan categories to this default menu
    IF new_menu_id IS NOT NULL THEN
      UPDATE categories SET menu_id = new_menu_id
        WHERE tenant_id = t.id AND menu_id IS NULL;
    END IF;
  END LOOP;
END;
$$;

-- ── PART 6: UPDATED_AT TRIGGER ──────────────────────────────

CREATE OR REPLACE FUNCTION update_menus_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_menus_updated_at ON menus;
CREATE TRIGGER trigger_menus_updated_at
  BEFORE UPDATE ON menus
  FOR EACH ROW EXECUTE FUNCTION update_menus_updated_at();


-- ============================================================
-- MIGRATION 3: ZONES TABLE (no prior migration file existed)
-- ============================================================

CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_en TEXT,
  prefix VARCHAR(10) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zones_venue ON zones(venue_id);
CREATE INDEX IF NOT EXISTS idx_zones_tenant ON zones(tenant_id);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view zones" ON zones;
CREATE POLICY "Public can view zones" ON zones
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins can manage zones" ON zones;
CREATE POLICY "Admins can manage zones" ON zones
  FOR ALL USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );


-- ============================================================
-- MIGRATION 4: TABLES TABLE (no prior migration file existed)
-- ============================================================

CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_number VARCHAR(20) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 2 CHECK (capacity > 0),
  is_active BOOLEAN DEFAULT TRUE,
  qr_code_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tables_zone ON tables(zone_id);
CREATE INDEX IF NOT EXISTS idx_tables_tenant ON tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tables_active ON tables(tenant_id, is_active) WHERE is_active = TRUE;

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active tables" ON tables;
CREATE POLICY "Public can view active tables" ON tables
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins can manage tables" ON tables;
CREATE POLICY "Admins can manage tables" ON tables
  FOR ALL USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );


-- ============================================================
-- MIGRATION 5: ANNOUNCEMENTS TABLE (no prior migration file existed)
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_en TEXT,
  description TEXT,
  description_en TEXT,
  image_url TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(tenant_id, is_active)
  WHERE is_active = TRUE;

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active announcements" ON announcements;
CREATE POLICY "Public can view active announcements" ON announcements
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;
CREATE POLICY "Admins can manage announcements" ON announcements
  FOR ALL USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );


-- ============================================================
-- MIGRATION 6: 20260216_idle_timeout
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER DEFAULT 30;

DO $$ BEGIN
  ALTER TABLE tenants ADD COLUMN screen_lock_mode TEXT DEFAULT 'overlay'
    CHECK (screen_lock_mode IN ('overlay', 'password'));
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN tenants.idle_timeout_minutes IS 'Minutes of inactivity before lock screen. NULL = disabled. Range: 5-120.';
COMMENT ON COLUMN tenants.screen_lock_mode IS 'overlay = simple click-to-unlock, password = requires re-authentication';


-- ============================================================
-- MIGRATION 7: 20260216_tenant_locale
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_locale TEXT DEFAULT 'fr-FR';

COMMENT ON COLUMN tenants.default_locale IS 'Default locale for the tenant dashboard and client-facing pages. One of: fr-FR, fr-CA, en-US, en-GB, en-AU, en-CA, en-IE, es-ES.';


-- ============================================================
-- MIGRATION 8: 20260217_permissions_system
-- ============================================================

-- ── PART 1: LOGIN TRACKING COLUMNS ON admin_users ───────────

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- ── PART 2: ORDER ASSIGNMENT COLUMNS ON orders ──────────────

DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN cashier_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN server_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_assigned ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_server ON orders(server_id);

-- ── PART 3: USER PREFERENCES TABLE ──────────────────────────

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

-- ── PART 4: USER SESSIONS AUDIT TABLE ───────────────────────

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

-- ── PART 5: AUTO-CREATE user_preferences ON admin_user INSERT

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

-- ── PART 6: LOGIN TRACKING RPC ──────────────────────────────

CREATE OR REPLACE FUNCTION increment_login_count(admin_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE admin_users
  SET last_login_at = NOW(),
      login_count = COALESCE(login_count, 0) + 1
  WHERE id = admin_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- DONE! All missing migrations applied.
-- ============================================================

COMMIT;

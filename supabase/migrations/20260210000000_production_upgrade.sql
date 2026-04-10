-- ============================================
-- ATTABL SaaS - Production Upgrade Migration
-- ============================================
-- Adds: multi-currency, tax/service charge, coupons,
--        item modifiers, service types, payment tracking,
--        KDS per-item status, course management,
--        atomic order numbers, server-side reporting RPCs
-- Author: Antigravity AI
-- Date: 2026-02-10
-- ============================================

-- ============================================
-- PART 1: TENANT COLUMNS (Missing + New)
-- ============================================

-- Missing columns that code already references
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#000000';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notification_sound_id VARCHAR(50) DEFAULT 'classic-bell';

-- Multi-currency support (XAF default, EUR, USD)
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

-- ============================================
-- PART 2: COUPONS TABLE (must exist before orders FK)
-- ============================================

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code) WHERE is_active = TRUE;

-- RLS
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

-- Public can validate coupons (for customer checkout)
DROP POLICY IF EXISTS "Public can validate active coupons" ON coupons;
CREATE POLICY "Public can validate active coupons" ON coupons
  FOR SELECT USING (is_active = TRUE);

-- ============================================
-- PART 3: ORDERS TABLE UPGRADE
-- ============================================

-- Service type & metadata
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

-- Coupon reference
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL;

-- ============================================
-- PART 4: ORDER_ITEMS TABLE UPGRADE
-- ============================================

-- Per-item status for partial KDS
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_item_status_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_item_status_check
  CHECK (item_status IN ('pending', 'preparing', 'ready', 'served'));

-- Course management
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS course VARCHAR(20);
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_course_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_course_check
  CHECK (course IS NULL OR course IN ('appetizer', 'main', 'dessert', 'drink'));

-- Paid modifiers (JSONB array: [{name, price}])
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]';

-- Separate customer notes from variant info
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_notes TEXT;

-- ============================================
-- PART 5: ITEM_MODIFIERS TABLE
-- ============================================

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_item_modifiers_menu_item ON item_modifiers(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_item_modifiers_tenant ON item_modifiers(tenant_id);

-- RLS
ALTER TABLE item_modifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Item modifiers viewable by public" ON item_modifiers;
CREATE POLICY "Item modifiers viewable by public" ON item_modifiers
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Item modifiers manageable by admins" ON item_modifiers;
CREATE POLICY "Item modifiers manageable by admins" ON item_modifiers
  FOR ALL USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );

-- ============================================
-- PART 6: ATOMIC ORDER NUMBERS
-- ============================================

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

-- ============================================
-- PART 7: COUPON USAGE INCREMENT (Atomic)
-- ============================================

CREATE OR REPLACE FUNCTION increment_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE coupons
  SET current_uses = current_uses + 1, updated_at = NOW()
  WHERE id = p_coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 8: REPORTING RPCs (Server-side aggregation)
-- ============================================

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

-- ============================================
-- PART 9: FIX RLS ONBOARDING_PROGRESS
-- ============================================
-- Use get_my_tenant_ids() instead of direct subquery to prevent recursion

DROP POLICY IF EXISTS "Users can view own onboarding_progress" ON onboarding_progress;
CREATE POLICY "Users can view own onboarding_progress" ON onboarding_progress
  FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()));

DROP POLICY IF EXISTS "Users can insert own onboarding_progress" ON onboarding_progress;
CREATE POLICY "Users can insert own onboarding_progress" ON onboarding_progress
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_my_tenant_ids()));

DROP POLICY IF EXISTS "Users can update own onboarding_progress" ON onboarding_progress;
CREATE POLICY "Users can update own onboarding_progress" ON onboarding_progress
  FOR UPDATE USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- ============================================
-- PART 10: INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_orders_service_type ON orders(tenant_id, service_type);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(tenant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(order_id, item_status);
CREATE INDEX IF NOT EXISTS idx_order_items_course ON order_items(order_id, course);

-- ============================================
-- DONE! Production upgrade migration complete.
-- ============================================

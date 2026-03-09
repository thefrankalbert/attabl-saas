-- ============================================
-- Atomic coupon claim — prevents race conditions
-- Replaces the old increment_coupon_usage which
-- had a check-then-act gap allowing concurrent
-- orders to exceed max_uses.
-- ============================================

CREATE OR REPLACE FUNCTION claim_coupon_usage(p_coupon_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE coupons
  SET current_uses = current_uses + 1, updated_at = NOW()
  WHERE id = p_coupon_id
    AND is_active = true
    AND (max_uses IS NULL OR current_uses < max_uses)
    AND (valid_until IS NULL OR valid_until > NOW());

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

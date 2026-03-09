-- ============================================
-- Unclaim coupon usage — rollback function
-- Used when order creation fails after coupon
-- usage was already atomically claimed.
-- Decrements current_uses (floor at 0).
-- ============================================

CREATE OR REPLACE FUNCTION unclaim_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE coupons
  SET current_uses = GREATEST(current_uses - 1, 0), updated_at = NOW()
  WHERE id = p_coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Idle timeout / screen lock configuration per tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER DEFAULT 30;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS screen_lock_mode TEXT DEFAULT 'overlay' CHECK (screen_lock_mode IN ('overlay', 'password'));

COMMENT ON COLUMN tenants.idle_timeout_minutes IS 'Minutes of inactivity before lock screen. NULL = disabled. Range: 5-120.';
COMMENT ON COLUMN tenants.screen_lock_mode IS 'overlay = simple click-to-unlock, password = requires re-authentication';

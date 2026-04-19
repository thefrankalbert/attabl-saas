-- ATTABL SaaS - Tenant opening hours
-- Adds opening_hours JSONB to tenants. Each key is a weekday (mon..sun)
-- and the value is { "open": "HH:mm", "close": "HH:mm" }. A missing key
-- means the tenant is closed that day. Empty object {} means 24/7 open
-- (backward compat fallback).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenants.opening_hours IS
  'Weekly opening hours as { mon: {open,close}, ... }. Empty object = always open.';

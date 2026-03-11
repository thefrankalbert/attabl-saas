-- ============================================
-- Add custom_permissions column to admin_users
-- ============================================
-- This column was defined in migration 20260218_invitations_permissions.sql
-- but never applied to production. Several features depend on it:
--   - Permission overrides per user (src/lib/permissions.ts)
--   - Invitation acceptance flow (src/services/invitation.service.ts)
-- Date: 2026-03-11
-- ============================================

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL;

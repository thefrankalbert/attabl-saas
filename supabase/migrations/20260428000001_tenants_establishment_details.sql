-- Add type-specific establishment fields to tenants table.
-- These are collected during onboarding and written on completion.
-- Rollback: DROP COLUMN for each added column.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS star_rating       SMALLINT    CHECK (star_rating BETWEEN 1 AND 5);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS has_restaurant    BOOLEAN     DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS has_terrace       BOOLEAN     DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS has_wifi          BOOLEAN     DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS has_delivery      BOOLEAN     DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS register_count    INTEGER     DEFAULT 1 CHECK (register_count >= 1);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS total_capacity    INTEGER     CHECK (total_capacity >= 1);

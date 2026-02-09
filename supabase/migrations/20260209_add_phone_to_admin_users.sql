-- Migration: Add phone column to admin_users table
-- Date: 2026-02-09
-- Description: The signup process requires a phone number for administrative users.

ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- Add explicit icon field to categories table.
-- Stores a Lucide icon name (e.g. 'Salad', 'Wine', 'ChefHat').
-- NULL = no icon chosen yet, display layer falls back to auto-derive.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;

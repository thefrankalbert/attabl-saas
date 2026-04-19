-- Add allergens and calories columns to menu_items
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS allergens TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS calories INTEGER;

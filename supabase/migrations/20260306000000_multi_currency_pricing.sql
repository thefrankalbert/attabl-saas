-- Multi-currency manual pricing
-- Allows tenants to define per-currency prices for menu items, variants, and modifiers

-- Supported currencies per tenant (controls which currencies appear in client settings)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS supported_currencies text[] NOT NULL DEFAULT '{XAF}';
UPDATE tenants SET supported_currencies = ARRAY[COALESCE(currency, 'XAF')]
  WHERE supported_currencies = '{XAF}' AND currency IS NOT NULL AND currency != 'XAF';

-- Manual prices as JSONB on menu_items, item_price_variants, item_modifiers
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS prices jsonb DEFAULT NULL;
ALTER TABLE item_price_variants ADD COLUMN IF NOT EXISTS prices jsonb DEFAULT NULL;
ALTER TABLE item_modifiers ADD COLUMN IF NOT EXISTS prices jsonb DEFAULT NULL;

-- Record which display currency the client was viewing when placing the order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_currency varchar(3) DEFAULT NULL;

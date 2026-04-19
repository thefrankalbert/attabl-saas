-- Add default locale preference per tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_locale TEXT DEFAULT 'fr-FR';

COMMENT ON COLUMN tenants.default_locale IS 'Default locale for the tenant dashboard and client-facing pages. One of: fr-FR, fr-CA, en-US, en-GB, en-AU, en-CA, en-IE, es-ES.';

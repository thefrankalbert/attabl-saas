-- =====================================================
-- SCRIPT DE CORRECTION DE LA BASE DE DONNÉES ATTABL
-- Exécuter dans Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Ajouter les colonnes manquantes à la table tenants
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS establishment_type TEXT DEFAULT 'restaurant',
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Cameroun',
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS table_count INTEGER DEFAULT 10;

-- 2. Mettre à jour les tenants existants avec des valeurs par défaut
UPDATE tenants
SET
  onboarding_completed = true,
  establishment_type = 'restaurant',
  country = 'Cameroun',
  table_count = 10,
  trial_ends_at = NOW() + INTERVAL '14 days'
WHERE onboarding_completed IS NULL OR onboarding_completed = false;

-- 3. S'assurer que la table onboarding_progress a la bonne structure
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Créer un index sur tenant_id si pas existant
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_tenant_id ON onboarding_progress(tenant_id);

-- 5. Vérification finale
SELECT
  slug,
  name,
  onboarding_completed,
  establishment_type,
  subscription_status,
  trial_ends_at
FROM tenants;

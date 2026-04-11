-- Add onboarding_draft JSONB column to onboarding_progress table
-- This stores the FULL onboarding data (all fields) so that progress is never lost
-- when a user navigates away during onboarding.

ALTER TABLE onboarding_progress ADD COLUMN IF NOT EXISTS draft JSONB DEFAULT '{}';

-- Also widen the step check constraint to support the new 5-step flow
-- (The original constraint was step 1-4, but we now use steps up to 5)
ALTER TABLE onboarding_progress DROP CONSTRAINT IF EXISTS onboarding_progress_step_check;
ALTER TABLE onboarding_progress ADD CONSTRAINT onboarding_progress_step_check CHECK (step >= 1 AND step <= 6);

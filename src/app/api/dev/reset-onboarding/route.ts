/**
 * DEV-ONLY: Reset onboarding for the current user's tenant.
 * GET /api/dev/reset-onboarding → resets onboarding_completed to false → redirects to /onboarding
 *
 * ⚠️  DELETE THIS FILE when done testing onboarding.
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Block in production
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/login`);
  }

  // Get user's tenant
  const { data: adminUser, error: adminError } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (adminError || !adminUser) {
    return NextResponse.json({ error: 'No tenant found for this user' }, { status: 404 });
  }

  const tenantId = adminUser.tenant_id;

  // Reset tenant onboarding flag
  const { error: tenantError } = await supabase
    .from('tenants')
    .update({
      onboarding_completed: false,
      onboarding_completed_at: null,
    })
    .eq('id', tenantId);

  if (tenantError) {
    return NextResponse.json(
      { error: 'Failed to reset tenant', details: tenantError.message },
      { status: 500 },
    );
  }

  // Reset onboarding progress
  await supabase
    .from('onboarding_progress')
    .update({
      step: 1,
      completed: false,
      completed_at: null,
    })
    .eq('tenant_id', tenantId);

  // Redirect to onboarding
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/onboarding`, { status: 302 });
}

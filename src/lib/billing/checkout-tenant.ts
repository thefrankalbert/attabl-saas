import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type CheckoutTenantRow = {
  tenant_id: string;
  tenants: {
    name: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    trial_ends_at: string | null;
    subscription_status: string | null;
  } | null;
};

export type ResolveCheckoutTenantResult =
  | { ok: true; userId: string; email: string; tenant: CheckoutTenantRow }
  | { ok: false; status: 401 | 404 | 400; error: string };

/**
 * Resolves tenant + Stripe billing fields for checkout (service role lookup, session-scoped).
 */
export async function resolveCheckoutTenant(): Promise<ResolveCheckoutTenantResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Non authentifie' };
  }

  if (!user.email) {
    return { ok: false, status: 400, error: 'Aucune adresse email associee a ce compte' };
  }

  const admin = createAdminClient();
  const { data: adminUser, error: adminUserError } = await admin
    .from('admin_users')
    .select(
      'tenant_id, tenants(name, stripe_customer_id, stripe_subscription_id, trial_ends_at, subscription_status)',
    )
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (adminUserError || !adminUser?.tenant_id) {
    return { ok: false, status: 404, error: 'Tenant non trouve pour cet utilisateur' };
  }

  const tenantsRaw = adminUser.tenants;
  const tenants = Array.isArray(tenantsRaw) ? (tenantsRaw[0] ?? null) : tenantsRaw;

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    tenant: {
      tenant_id: adminUser.tenant_id,
      tenants: tenants as CheckoutTenantRow['tenants'],
    },
  };
}

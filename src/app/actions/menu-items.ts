'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { ServiceError } from '@/services/errors';

type ActionResponse = {
  canCreate?: boolean;
  error?: string;
};

/**
 * Vérifie si le tenant peut ajouter un nouvel article au menu (limites du plan).
 * Appelé depuis le client avant l'insertion directe via Supabase.
 */
export async function checkCanAddMenuItemAction(tenantId: string): Promise<ActionResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Non authentifié' };
  }

  // Vérifier que l'utilisateur appartient au tenant
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single();

  if (!adminUser) {
    return { error: 'Permission refusée' };
  }

  const adminClient = createAdminClient();

  try {
    const planService = createPlanEnforcementService(adminClient);

    // Récupérer le tenant avec les infos de plan
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return { error: 'Tenant introuvable' };
    }

    await planService.canAddMenuItem(tenant);
    return { canCreate: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Erreur lors de la vérification des limites du plan' };
  }
}

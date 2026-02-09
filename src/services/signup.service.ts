import type { SupabaseClient } from '@supabase/supabase-js';
import { createSlugService } from './slug.service';
import { ServiceError } from './errors';

interface CreateTenantInput {
  slug: string;
  name: string;
  plan: string;
}

interface CreateAdminInput {
  tenantId: string;
  userId: string;
  email: string;
  fullName: string;
  phone?: string;
}

interface EmailSignupInput {
  restaurantName: string;
  email: string;
  password: string;
  phone?: string;
  plan?: string;
}

interface OAuthSignupInput {
  userId: string;
  email: string;
  restaurantName: string;
  phone?: string;
  plan?: string;
}

interface SignupResult {
  slug: string;
  tenantId: string;
}

/**
 * Signup service — handles tenant creation for both email and OAuth flows.
 *
 * Eliminates code duplication between /api/signup and /api/signup-oauth.
 * Both routes shared identical logic for: slug generation, tenant creation,
 * admin user creation, and default venue creation (~60 duplicated lines).
 */
export function createSignupService(supabase: SupabaseClient) {
  const slugService = createSlugService(supabase);

  return {
    /**
     * Creates a tenant with a 14-day trial period.
     */
    async createTenantWithTrial(input: CreateTenantInput): Promise<{ id: string; slug: string }> {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          slug: input.slug,
          name: input.name,
          subscription_plan: input.plan,
          subscription_status: 'trial',
          trial_ends_at: trialEndsAt.toISOString(),
          is_active: true,
        })
        .select()
        .single();

      if (tenantError) {
        throw new ServiceError(`Erreur Tenant: ${tenantError.message}`, 'INTERNAL', tenantError);
      }

      return { id: tenant.id, slug: tenant.slug };
    },

    /**
     * Creates the admin_users link between a user and tenant.
     */
    async createAdminUser(input: CreateAdminInput): Promise<void> {
      const { error: adminError } = await supabase.from('admin_users').insert({
        tenant_id: input.tenantId,
        user_id: input.userId,
        email: input.email,
        full_name: input.fullName,
        phone: input.phone || null,
        role: 'superadmin',
        is_active: true,
      });

      if (adminError) {
        throw new ServiceError(`Erreur Admin: ${adminError.message}`, 'INTERNAL', adminError);
      }
    },

    /**
     * Creates the default venue for a new tenant.
     */
    async createDefaultVenue(tenantId: string): Promise<void> {
      await supabase.from('venues').insert({
        tenant_id: tenantId,
        slug: 'main',
        name: 'Salle principale',
        name_en: 'Main Dining',
        type: 'restaurant',
        is_active: true,
      });
    },

    /**
     * Complete email/password signup flow with rollback on failure.
     *
     * Steps:
     * 1. Generate unique slug
     * 2. Create auth user (admin client)
     * 3. Create tenant (rollback: delete auth user)
     * 4. Create admin user (rollback: delete tenant + auth user)
     * 5. Create default venue
     */
    async completeEmailSignup(input: EmailSignupInput): Promise<SignupResult> {
      // 1. Generate unique slug
      const slug = await slugService.generateUniqueSlug(input.restaurantName);

      // 2. Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          restaurant_name: input.restaurantName,
          phone: input.phone,
        },
      });

      if (authError) {
        throw new ServiceError(`Erreur Auth: ${authError.message}`, 'VALIDATION', authError);
      }

      const userId = authData.user?.id;
      if (!userId) {
        throw new ServiceError('Erreur lors de la création du compte', 'INTERNAL');
      }

      // 3. Create tenant (rollback: delete auth user if fails)
      let tenant: { id: string; slug: string };
      try {
        tenant = await this.createTenantWithTrial({
          slug,
          name: input.restaurantName,
          plan: input.plan || 'essentiel',
        });
      } catch (err) {
        await supabase.auth.admin.deleteUser(userId);
        throw err;
      }

      // 4. Create admin user (rollback: delete tenant + auth user if fails)
      try {
        await this.createAdminUser({
          tenantId: tenant.id,
          userId,
          email: input.email,
          fullName: input.restaurantName,
          phone: input.phone,
        });
      } catch (err) {
        await supabase.from('tenants').delete().eq('id', tenant.id);
        await supabase.auth.admin.deleteUser(userId);
        throw err;
      }

      // 5. Create default venue (best-effort, no rollback)
      await this.createDefaultVenue(tenant.id);

      return { slug: tenant.slug, tenantId: tenant.id };
    },

    /**
     * Complete OAuth signup flow (user already authenticated).
     *
     * Steps:
     * 1. Generate unique slug
     * 2. Create tenant (no auth user creation needed — user exists)
     * 3. Create admin user (rollback: delete tenant)
     * 4. Create default venue
     */
    async completeOAuthSignup(input: OAuthSignupInput): Promise<SignupResult> {
      // 1. Generate unique slug
      const slug = await slugService.generateUniqueSlug(input.restaurantName);

      // 2. Create tenant
      const tenant = await this.createTenantWithTrial({
        slug,
        name: input.restaurantName,
        plan: input.plan || 'essentiel',
      });

      // 3. Create admin user (rollback: delete tenant if fails)
      try {
        await this.createAdminUser({
          tenantId: tenant.id,
          userId: input.userId,
          email: input.email,
          fullName: input.restaurantName,
          phone: input.phone,
        });
      } catch (err) {
        await supabase.from('tenants').delete().eq('id', tenant.id);
        throw err;
      }

      // 4. Create default venue (best-effort)
      await this.createDefaultVenue(tenant.id);

      return { slug: tenant.slug, tenantId: tenant.id };
    },
  };
}

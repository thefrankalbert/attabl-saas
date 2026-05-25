import type { SupabaseClient } from '@supabase/supabase-js';
import { createSlugService } from './slug.service';
import { ServiceError } from './errors';
import { sendWelcomeConfirmationEmail } from './email.service';
import { logger } from '@/lib/logger';

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
  restaurantName?: string;
  phone?: string;
  plan?: string;
}

interface SignupResult {
  slug: string;
  tenantId: string;
}

/**
 * Signup service - handles tenant creation for both email and OAuth flows.
 *
 * Eliminates code duplication between /api/signup and /api/signup-oauth.
 * Both routes shared identical logic for: slug generation, tenant creation,
 * admin user creation, and default venue creation (~60 duplicated lines).
 */
interface ProvisionSignupRpcResult {
  tenantId: string;
  slug: string;
  groupId?: string;
}

export function createSignupService(supabase: SupabaseClient) {
  const slugService = createSlugService(supabase);

  async function provisionSignupTenant(input: {
    slug: string;
    name: string;
    plan: string;
    userId: string;
    email: string;
    fullName: string;
    phone?: string;
  }): Promise<SignupResult> {
    const { data, error } = await supabase.rpc('provision_signup_tenant', {
      p_slug: input.slug,
      p_name: input.name,
      p_plan: input.plan,
      p_user_id: input.userId,
      p_email: input.email,
      p_full_name: input.fullName,
      p_phone: input.phone ?? null,
    });

    if (error) {
      throw new ServiceError(`Erreur provisionnement: ${error.message}`, 'INTERNAL', error);
    }

    const row = data as ProvisionSignupRpcResult | null;
    if (!row?.tenantId || !row?.slug) {
      throw new ServiceError('Erreur provisionnement: reponse invalide', 'INTERNAL');
    }

    return { tenantId: row.tenantId, slug: row.slug };
  }

  return {
    /**
     * Creates a tenant with a 14-day trial period.
     */
    async createTenantWithTrial(input: CreateTenantInput): Promise<{ id: string; slug: string }> {
      const trialEndsAt = new Date(Date.now() + 14 * 86400000);

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
        role: 'owner',
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
      // Defensive email validation before any DB operations
      if (!input.email || !input.email.includes('@')) {
        throw new ServiceError('Email invalide', 'VALIDATION');
      }

      // 1. Generate unique slug
      const slug = await slugService.generateUniqueSlug(input.restaurantName);

      // 2. Create auth user (NOT auto-confirmed - must verify via email)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: false,
        user_metadata: {
          restaurant_name: input.restaurantName,
          phone: input.phone,
        },
      });

      if (authError) {
        const msg = authError.message?.toLowerCase() ?? '';
        if (
          msg.includes('already') ||
          msg.includes('registered') ||
          msg.includes('exists') ||
          authError.status === 422
        ) {
          throw new ServiceError(
            'Cette adresse email est deja utilisee. Connectez-vous ou reinitialisez votre mot de passe.',
            'CONFLICT',
            authError,
          );
        }
        throw new ServiceError(`Erreur Auth: ${authError.message}`, 'VALIDATION', authError);
      }

      const userId = authData.user?.id;
      if (!userId) {
        throw new ServiceError('Erreur lors de la création du compte', 'INTERNAL');
      }

      const emailPrefix = input.email.split('@')[0].replace(/[._-]/g, ' ').trim();
      const initialName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) || input.email;

      let tenant: SignupResult;
      try {
        tenant = await provisionSignupTenant({
          slug,
          name: input.restaurantName,
          plan: input.plan || 'starter',
          userId,
          email: input.email,
          fullName: initialName,
          phone: input.phone,
        });
      } catch (err) {
        await supabase.auth.admin.deleteUser(userId);
        throw err;
      }

      // 6. Generate confirmation link and send welcome email
      // Note: generateLink('signup') is idempotent - calling it again replaces the previous token.
      // Rate limiting (3 req/10min per IP) on the signup endpoint prevents abuse.
      try {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'signup',
          email: input.email,
          password: input.password,
        });

        if (linkError || !linkData?.properties?.hashed_token) {
          logger.error('Failed to generate confirmation link', { error: linkError });
        } else {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
          const confirmationUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=signup`;

          await sendWelcomeConfirmationEmail(input.email, {
            confirmationUrl,
          });
        }
      } catch (emailErr) {
        // Email sending is best-effort - do not fail signup
        logger.error('Failed to send confirmation email', emailErr);
      }

      return { slug: tenant.slug, tenantId: tenant.tenantId };
    },

    /**
     * Complete OAuth signup flow (user already authenticated).
     *
     * Steps:
     * 1. Generate unique slug
     * 2. Create tenant (no auth user creation needed - user exists)
     * 3. Create admin user (rollback: delete tenant)
     * 4. Create default venue
     */
    async completeOAuthSignup(input: OAuthSignupInput): Promise<SignupResult> {
      // Defensive email validation (OAuth providers may return unexpected values)
      if (!input.email || !input.email.includes('@')) {
        throw new ServiceError('Email invalide', 'VALIDATION');
      }

      const oauthRestaurantName =
        input.restaurantName?.trim() ||
        input.email.split('@')[0]?.replace(/[._-]/g, ' ').trim() ||
        'Mon Etablissement';

      // 1. Generate unique slug
      const slug = await slugService.generateUniqueSlug(oauthRestaurantName);

      const oauthEmailPrefix = input.email.split('@')[0].replace(/[._-]/g, ' ').trim();
      const oauthInitialName =
        oauthEmailPrefix.charAt(0).toUpperCase() + oauthEmailPrefix.slice(1) || input.email;

      return provisionSignupTenant({
        slug,
        name: oauthRestaurantName,
        plan: input.plan || 'starter',
        userId: input.userId,
        email: input.email,
        fullName: oauthInitialName,
        phone: input.phone,
      });
    },

    /**
     * Ensures an authenticated user has a tenant + admin_users row before onboarding.
     * Covers login after a partial signup (auth exists, tenant link missing) and OAuth
     * callback failures that left an orphan restaurant_groups / tenants row.
     */
    async ensureTenantForOnboarding(input: OAuthSignupInput): Promise<SignupResult> {
      const restaurantName =
        input.restaurantName?.trim() ||
        input.email.split('@')[0]?.replace(/[._-]/g, ' ').trim() ||
        'Mon Etablissement';

      const { data: existingAdmin } = await supabase
        .from('admin_users')
        .select('tenant_id, tenants(slug)')
        .eq('user_id', input.userId)
        .eq('is_active', true)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAdmin?.tenant_id) {
        const tenantRow = Array.isArray(existingAdmin.tenants)
          ? existingAdmin.tenants[0]
          : existingAdmin.tenants;
        const slug =
          tenantRow && typeof tenantRow === 'object' && 'slug' in tenantRow
            ? String((tenantRow as { slug: string }).slug)
            : '';
        return { tenantId: existingAdmin.tenant_id, slug };
      }

      const emailPrefix = input.email.split('@')[0].replace(/[._-]/g, ' ').trim();
      const fullName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) || input.email;

      const { data: existingGroup } = await supabase
        .from('restaurant_groups')
        .select('id')
        .eq('owner_user_id', input.userId)
        .maybeSingle();

      if (existingGroup) {
        const { data: orphanTenant } = await supabase
          .from('tenants')
          .select('id, slug')
          .eq('group_id', existingGroup.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        let tenantId = orphanTenant?.id;
        let slug = orphanTenant?.slug;

        if (!tenantId) {
          const created = await this.createTenantWithTrial({
            slug: await slugService.generateUniqueSlug(restaurantName),
            name: restaurantName,
            plan: input.plan || 'starter',
          });
          tenantId = created.id;
          slug = created.slug;
          await supabase.from('tenants').update({ group_id: existingGroup.id }).eq('id', tenantId);
        }

        await this.createAdminUser({
          tenantId,
          userId: input.userId,
          email: input.email,
          fullName,
          phone: input.phone,
        });

        try {
          await this.createDefaultVenue(tenantId);
        } catch (venueError) {
          logger.warn(
            'Default venue already exists or could not be created during onboarding recovery',
            {
              tenantId,
              error: String(venueError),
            },
          );
        }

        return { tenantId, slug: slug ?? '' };
      }

      return this.completeOAuthSignup({
        ...input,
        restaurantName,
      });
    },
  };
}

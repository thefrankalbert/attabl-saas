import type { SupabaseClient } from '@supabase/supabase-js';
import { createSlugService } from './slug.service';
import { ServiceError, isTenantNameConflictError } from './errors';
import { sendWelcomeConfirmationEmail } from './email.service';
import { logger } from '@/lib/logger';
import { isEmailAlreadyRegisteredAuthError } from '@/lib/auth/is-email-already-registered';

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
  /**
   * Whether the confirmation email was actually handed off to a delivery
   * provider (Resend, or the Supabase native fallback). Undefined for flows
   * that do not send a confirmation email (OAuth, onboarding provisioning).
   * When false, the UI must tell the user the email could not be sent.
   */
  emailDelivered?: boolean;
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
      if (isTenantNameConflictError(error)) {
        throw new ServiceError('RESTAURANT_NAME_TAKEN', 'CONFLICT', error);
      }
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
      const { error: venueError } = await supabase.from('venues').insert({
        tenant_id: tenantId,
        slug: 'main',
        name: 'Salle principale',
        name_en: 'Main Dining',
        type: 'restaurant',
        is_active: true,
      });

      // Surface the failure: the onboarding-recovery caller already wraps this
      // call in a try/catch (venue may legitimately exist), which was dead code
      // while this insert swallowed its error.
      if (venueError) {
        throw new ServiceError(`Erreur Venue: ${venueError.message}`, 'INTERNAL', venueError);
      }
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
        if (isEmailAlreadyRegisteredAuthError(authError)) {
          throw new ServiceError('EMAIL_ALREADY_REGISTERED', 'CONFLICT', authError);
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

      // 6. Generate confirmation link and send welcome email.
      // Note: generateLink('signup') is idempotent - calling it again replaces the previous token.
      // Rate limiting (3 req/10min per IP) on the signup endpoint prevents abuse.
      // Delivery is best-effort (never fails signup) BUT we now track whether the
      // email was actually handed off, so the UI can warn the user when it was not.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
      let emailDelivered = false;
      try {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'signup',
          email: input.email,
          password: input.password,
        });

        if (linkError || !linkData?.properties?.hashed_token) {
          logger.error('Failed to generate confirmation link', { error: linkError });
        } else {
          const confirmationUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=signup`;

          emailDelivered = await sendWelcomeConfirmationEmail(input.email, {
            confirmationUrl,
          });
        }
      } catch (emailErr) {
        logger.error('Failed to send confirmation email via Resend', emailErr);
      }

      // NOTE: no Supabase-native fallback here. The user is created via
      // auth.admin.createUser({email_confirm:false}) and the confirmation token
      // is delivered through Resend. supabase.auth.resend() on the service_role
      // admin client has no authenticated session context and cannot reliably
      // send (and could falsely report success, masking a real non-delivery).
      // The real remediation is verifying the Resend sender domain. When
      // delivery fails, emailDelivered=false is surfaced to the UI, which shows
      // a warning and offers the "Resend confirmation" action (POST
      // /api/resend-confirmation, which re-attempts via the same channel).
      return { slug: tenant.slug, tenantId: tenant.tenantId, emailDelivered };
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
        'Mon Établissement';

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
        'Mon Établissement';

      const { data: existingAdmin } = await supabase
        .from('admin_users')
        .select('tenant_id, tenants(slug)')
        .eq('user_id', input.userId)
        .eq('is_active', true)
        // Most recent tenant (deterministic). The uuid primary key is not ordered by time.
        .order('created_at', { ascending: false })
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
          // Most recent tenant (deterministic). The uuid primary key is not ordered by time.
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!orphanTenant?.id) {
          // No tenant yet under this group: create tenant + owner + venue in a
          // single transaction. provision_signup_tenant reuses the existing
          // group via ON CONFLICT (owner_user_id), so no orphan can be left.
          return provisionSignupTenant({
            slug: await slugService.generateUniqueSlug(restaurantName),
            name: restaurantName,
            plan: input.plan || 'starter',
            userId: input.userId,
            email: input.email,
            fullName,
            phone: input.phone,
          });
        }

        // Orphan tenant exists but the owner link is missing: attach the owner.
        // Idempotent recovery - safe to re-run.
        await this.createAdminUser({
          tenantId: orphanTenant.id,
          userId: input.userId,
          email: input.email,
          fullName,
          phone: input.phone,
        });

        try {
          await this.createDefaultVenue(orphanTenant.id);
        } catch (venueError) {
          logger.warn(
            'Default venue already exists or could not be created during onboarding recovery',
            {
              tenantId: orphanTenant.id,
              error: String(venueError),
            },
          );
        }

        return { tenantId: orphanTenant.id, slug: orphanTenant.slug ?? '' };
      }

      return this.completeOAuthSignup({
        ...input,
        restaurantName,
      });
    },
  };
}

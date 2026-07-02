import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import type { Invitation } from '@/types/invitation.types';

interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: string;
  invitedBy: string;
  customPermissions?: Record<string, boolean>;
}

interface AcceptInvitationInput {
  token: string;
  fullName?: string;
  password?: string;
}

// Reduced from 72h to 24h per security audit - shorter window limits exposure
// if the token leaks via browser history, CDN logs, or Referer headers.
const TOKEN_EXPIRY_HOURS = 24;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function getExpiresAt(): string {
  const date = new Date();
  date.setHours(date.getHours() + TOKEN_EXPIRY_HOURS);
  return date.toISOString();
}

export interface InvitationService {
  createInvitation(input: CreateInvitationInput): Promise<Invitation>;
  validateToken(token: string): Promise<Invitation>;
  acceptInvitation(input: AcceptInvitationInput): Promise<{ tenantSlug: string }>;
  cancelInvitation(invitationId: string): Promise<void>;
  resendInvitation(invitationId: string): Promise<Invitation>;
  getPendingInvitations(
    tenantId: string,
    options?: { page?: number; pageSize?: number },
  ): Promise<{ invitations: Invitation[]; total: number }>;
}

export function createInvitationService(supabase: SupabaseClient): InvitationService {
  return {
    async createInvitation(input: CreateInvitationInput): Promise<Invitation> {
      // Check if email already has an ATTABL account
      const { data: existingAdminUser } = await supabase
        .from('admin_users')
        .select('user_id, email')
        .eq('email', input.email)
        .maybeSingle();

      if (existingAdminUser) {
        // User already exists - add directly to admin_users
        const { error: adminError } = await supabase.from('admin_users').insert({
          user_id: existingAdminUser.user_id,
          tenant_id: input.tenantId,
          email: input.email,
          role: input.role,
          is_active: true,
          custom_permissions: input.customPermissions || null,
          created_by: input.invitedBy,
        });

        if (adminError) {
          throw new ServiceError(
            `Erreur ajout membre: ${adminError.message}`,
            'INTERNAL',
            adminError,
          );
        }

        return {
          id: 'direct-add',
          tenant_id: input.tenantId,
          email: input.email,
          role: input.role,
          custom_permissions: input.customPermissions || null,
          invited_by: input.invitedBy,
          token: '',
          expires_at: new Date().toISOString(),
          status: 'accepted',
          created_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
        };
      }

      // Reject a duplicate pending invitation for the same (tenant, email): the
      // token UNIQUE constraint does not prevent multiple pending rows for one
      // email, which clutters the pending list and confuses the invitee about
      // which link is valid. To re-send, use the resend action (fresh token).
      const { data: existingPending } = await supabase
        .from('invitations')
        .select('id')
        .eq('tenant_id', input.tenantId)
        .eq('email', input.email)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingPending) {
        throw new ServiceError(
          'Une invitation est deja en attente pour cet email. Renvoyez-la ou annulez-la avant d en creer une nouvelle.',
          'VALIDATION',
        );
      }

      // New user - create invitation with token
      const token = generateToken();
      const expiresAt = getExpiresAt();

      const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
          tenant_id: input.tenantId,
          email: input.email,
          role: input.role,
          custom_permissions: input.customPermissions || null,
          invited_by: input.invitedBy,
          token,
          expires_at: expiresAt,
          status: 'pending',
        })
        .select(
          'id, tenant_id, email, role, custom_permissions, invited_by, token, expires_at, status, created_at, accepted_at',
        )
        .single();

      if (error || !invitation) {
        throw new ServiceError(
          `Erreur creation invitation: ${error?.message || 'Donnees manquantes'}`,
          'INTERNAL',
          error,
        );
      }

      return invitation as Invitation;
    },

    async validateToken(token: string): Promise<Invitation> {
      const { data: invitation, error } = await supabase
        .from('invitations')
        .select('*, tenants(name, logo_url, slug)')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (error || !invitation) {
        throw new ServiceError('Invitation introuvable ou deja utilisee', 'NOT_FOUND');
      }

      if (new Date(invitation.expires_at) < new Date()) {
        // Best-effort cleanup: the throw below already rejects the token for this
        // request; a failed update only leaves the row 'pending' until next listing.
        const { error: expireError } = await supabase
          .from('invitations')
          .update({ status: 'expired' })
          .eq('id', invitation.id);
        if (expireError) {
          logger.warn('validateToken: failed to mark invitation expired', {
            invitationId: invitation.id,
            error: expireError,
          });
        }
        throw new ServiceError('Cette invitation a expire', 'VALIDATION');
      }

      return invitation as Invitation;
    },

    async acceptInvitation(input: AcceptInvitationInput): Promise<{ tenantSlug: string }> {
      const invitation = await this.validateToken(input.token);

      let userId: string;

      const { data: existingAdminUser } = await supabase
        .from('admin_users')
        .select('user_id, email')
        .eq('email', invitation.email)
        .maybeSingle();

      if (existingAdminUser) {
        userId = existingAdminUser.user_id;
      } else {
        if (!input.password || !input.fullName) {
          throw new ServiceError('Nom et mot de passe requis pour un nouveau compte', 'VALIDATION');
        }

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: invitation.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.fullName },
        });

        if (authError || !authUser.user) {
          throw new ServiceError(
            `Erreur creation compte: ${authError?.message || 'Erreur inconnue'}`,
            'INTERNAL',
            authError,
          );
        }

        userId = authUser.user.id;
      }

      const { data, error } = await supabase.rpc('accept_invitation_membership', {
        p_invitation_id: invitation.id,
        p_user_id: userId,
        p_full_name: input.fullName || invitation.email,
      });

      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('INVITATION_EXPIRED')) {
          throw new ServiceError('Cette invitation a expire', 'VALIDATION', error);
        }
        if (msg.includes('INVITATION_NOT_FOUND')) {
          throw new ServiceError('Invitation introuvable ou deja utilisee', 'NOT_FOUND', error);
        }
        throw new ServiceError(
          `Erreur ajout au restaurant: ${msg || 'Erreur inconnue'}`,
          'INTERNAL',
          error,
        );
      }

      const row = data as { tenantSlug?: string } | null;
      return { tenantSlug: row?.tenantSlug ?? '' };
    },

    async cancelInvitation(invitationId: string): Promise<void> {
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId)
        .eq('status', 'pending');

      if (error) {
        throw new ServiceError(`Erreur annulation: ${error.message}`, 'INTERNAL', error);
      }
    },

    async resendInvitation(invitationId: string): Promise<Invitation> {
      const token = generateToken();
      const expiresAt = getExpiresAt();

      const { data: invitation, error } = await supabase
        .from('invitations')
        .update({ token, expires_at: expiresAt, status: 'pending' })
        .eq('id', invitationId)
        .eq('status', 'pending')
        .select(
          'id, tenant_id, email, role, custom_permissions, invited_by, token, expires_at, status, created_at, accepted_at',
        )
        .single();

      if (error || !invitation) {
        throw new ServiceError(
          `Erreur renvoi: ${error?.message || 'Invitation introuvable'}`,
          'INTERNAL',
          error,
        );
      }

      return invitation as Invitation;
    },

    async getPendingInvitations(
      tenantId: string,
      options?: { page?: number; pageSize?: number },
    ): Promise<{ invitations: Invitation[]; total: number }> {
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 25;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('invitations')
        .select(
          'id, tenant_id, email, role, custom_permissions, invited_by, token, expires_at, status, created_at, accepted_at',
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw new ServiceError(`Erreur chargement: ${error.message}`, 'INTERNAL', error);
      }

      const now = new Date();
      const valid: Invitation[] = [];
      const expiredIds: string[] = [];

      for (const inv of (data || []) as Invitation[]) {
        if (new Date(inv.expires_at) < now) {
          expiredIds.push(inv.id);
        } else {
          valid.push(inv);
        }
      }

      if (expiredIds.length > 0) {
        const { error: expireError } = await supabase
          .from('invitations')
          .update({ status: 'expired' })
          .in('id', expiredIds);
        if (expireError) {
          logger.warn('getPendingInvitations: failed to mark invitations expired', {
            tenantId,
            expiredCount: expiredIds.length,
            error: expireError,
          });
        }
      }

      return { invitations: valid, total: count ?? valid.length };
    },
  };
}

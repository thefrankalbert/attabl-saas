import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { ServiceError } from './errors';
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

const TOKEN_EXPIRY_HOURS = 72;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function getExpiresAt(): string {
  const date = new Date();
  date.setHours(date.getHours() + TOKEN_EXPIRY_HOURS);
  return date.toISOString();
}

export function createInvitationService(supabase: SupabaseClient) {
  return {
    async createInvitation(input: CreateInvitationInput): Promise<Invitation> {
      // Check if email already has an ATTABL account
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(
        (u: { email?: string }) => u.email === input.email,
      );

      if (existingUser) {
        // User already exists — add directly to admin_users
        const { error: adminError } = await supabase.from('admin_users').insert({
          user_id: existingUser.id,
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

      // New user — create invitation with token
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
        .select()
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
        await supabase.from('invitations').update({ status: 'expired' }).eq('id', invitation.id);
        throw new ServiceError('Cette invitation a expire', 'VALIDATION');
      }

      return invitation as Invitation;
    },

    async acceptInvitation(input: AcceptInvitationInput): Promise<{ tenantSlug: string }> {
      const invitation = await this.validateToken(input.token);

      let userId: string;

      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(
        (u: { email?: string }) => u.email === invitation.email,
      );

      if (existingUser) {
        userId = existingUser.id;
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

      const { error: adminError } = await supabase.from('admin_users').insert({
        user_id: userId,
        tenant_id: invitation.tenant_id,
        email: invitation.email,
        full_name: input.fullName || invitation.email,
        role: invitation.role,
        is_active: true,
        custom_permissions: invitation.custom_permissions,
        created_by: invitation.invited_by,
      });

      if (adminError) {
        throw new ServiceError(
          `Erreur ajout au restaurant: ${adminError.message}`,
          'INTERNAL',
          adminError,
        );
      }

      await supabase
        .from('invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id);

      const { data: tenant } = await supabase
        .from('tenants')
        .select('slug')
        .eq('id', invitation.tenant_id)
        .single();

      return { tenantSlug: tenant?.slug || '' };
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
        .select()
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

    async getPendingInvitations(tenantId: string): Promise<Invitation[]> {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw new ServiceError(`Erreur chargement: ${error.message}`, 'INTERNAL', error);
      }

      const now = new Date();
      const valid: Invitation[] = [];

      for (const inv of (data || []) as Invitation[]) {
        if (new Date(inv.expires_at) < now) {
          await supabase.from('invitations').update({ status: 'expired' }).eq('id', inv.id);
        } else {
          valid.push(inv);
        }
      }

      return valid;
    },
  };
}

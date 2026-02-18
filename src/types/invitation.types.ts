export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  custom_permissions: Record<string, boolean> | null;
  invited_by: string;
  token: string;
  expires_at: string;
  status: InvitationStatus;
  created_at: string;
  accepted_at: string | null;
}

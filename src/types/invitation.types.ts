import type { PermissionMap, StaffPoste } from '@/types/permission.types';

type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  postes: StaffPoste[];
  permission_overrides: PermissionMap | null;
  invited_by: string;
  token: string;
  expires_at: string;
  status: InvitationStatus;
  created_at: string;
  accepted_at: string | null;
}

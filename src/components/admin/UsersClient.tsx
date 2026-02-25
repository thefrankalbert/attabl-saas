'use client';

import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import AdminModal from '@/components/admin/AdminModal';
import { useUsersData } from '@/hooks/useUsersData';
import UsersTable from '@/components/features/users/UsersTable';
import UserForm from '@/components/features/users/UserForm';
import PendingInvitations from '@/components/features/users/PendingInvitations';
import type { AdminUser, AdminRole } from '@/types/admin.types';

// ─── Types ─────────────────────────────────────────────────

interface UsersClientProps {
  tenantId: string;
  currentUserRole: AdminRole;
  initialUsers: AdminUser[];
}

// ─── Main Component ────────────────────────────────────────

export default function UsersClient({ tenantId, currentUserRole, initialUsers }: UsersClientProps) {
  const t = useTranslations('users');

  const data = useUsersData({ tenantId, currentUserRole, initialUsers });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('teamTitle')}</h1>
          <p className="text-sm text-neutral-500">{t('teamSubtitle')}</p>
        </div>
        {data.canManageUsers && (
          <Button variant="lime" onClick={() => data.setIsModalOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" /> {t('newMember')}
          </Button>
        )}
      </div>

      <UsersTable
        users={data.users}
        canManageUsers={data.canManageUsers}
        onToggleStatus={data.handleToggleStatus}
        onDeleteUser={data.handleDeleteUser}
      />

      {/* Pending Invitations Section */}
      {data.canManageUsers && (
        <PendingInvitations
          pendingOnly={data.pendingOnly}
          loadingInvitations={data.loadingInvitations}
          resendingId={data.resendingId}
          cancellingId={data.cancellingId}
          onResend={data.handleResendInvitation}
          onCancel={data.handleCancelInvitation}
        />
      )}

      <AdminModal
        isOpen={data.isModalOpen}
        onClose={() => data.setIsModalOpen(false)}
        title={t('addMember')}
      >
        <UserForm
          activeTab={data.activeTab}
          setActiveTab={data.setActiveTab}
          inviteEmail={data.inviteEmail}
          setInviteEmail={data.setInviteEmail}
          inviteRole={data.inviteRole}
          setInviteRole={data.setInviteRole}
          inviting={data.inviting}
          onSendInvitation={data.handleSendInvitation}
          formData={data.formData}
          setFormData={data.setFormData}
          loading={data.loading}
          onCreateUser={data.handleCreateUser}
          onClose={() => data.setIsModalOpen(false)}
        />
      </AdminModal>
    </div>
  );
}

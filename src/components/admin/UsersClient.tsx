'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserPlus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useUsersData } from '@/hooks/useUsersData';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/ui/use-toast';
import UsersTable from '@/components/features/users/UsersTable';
import UserForm from '@/components/features/users/UserForm';
import UserPermissionsDialog from '@/components/features/users/UserPermissionsDialog';
import PendingInvitations from '@/components/features/users/PendingInvitations';
import RoleGuard from '@/components/admin/RoleGuard';
import { ListPagination } from '@/components/admin/ListPagination';
import type { ServerListPagination } from '@/lib/pagination';
import {
  actionUpdateAdminUser,
  actionResetUserPassword,
  actionUpdateUserEmail,
} from '@/app/actions/admin';
import type { AdminUser, AdminRole } from '@/types/admin.types';
import type { PermissionMap } from '@/types/permission.types';

// ─── Types ─────────────────────────────────────────────────

interface UsersClientProps {
  tenantId: string;
  currentUserRole: AdminRole;
  initialUsers: AdminUser[];
  roleOverrides?: Record<string, PermissionMap>;
  serverListPagination?: ServerListPagination;
}

// ─── Main Component ────────────────────────────────────────

export default function UsersClient({
  tenantId,
  currentUserRole,
  initialUsers,
  roleOverrides = {},
  serverListPagination,
}: UsersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const { toast } = useToast();
  const { confirm, Dialog: ConfirmDialog } = useConfirmDialog();
  const useServerPagination = !!serverListPagination;

  const handlePageChange = useCallback(
    (pageIndex: number) => {
      if (!useServerPagination) {
        return;
      }
      const params = new URLSearchParams();
      if (pageIndex > 0) {
        params.set('page', String(pageIndex + 1));
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [useServerPagination, router, pathname],
  );

  const listPage = useMemo(() => {
    if (!serverListPagination) {
      return 0;
    }
    const maxPage = Math.max(
      0,
      Math.ceil(serverListPagination.total / serverListPagination.pageSize) - 1,
    );
    return Math.min(serverListPagination.page - 1, maxPage);
  }, [serverListPagination]);

  // Wrap the hook-local dialog to expose the narrow "message -> Promise<boolean>"
  // shape that useUsersData expects, without leaking shadcn internals into the hook.
  const confirmWithMessage = useCallback(
    (message: string) =>
      confirm({
        title: tc('delete'),
        description: message,
        confirmLabel: tc('delete'),
        cancelLabel: tc('cancel'),
        destructive: true,
      }),
    [confirm, tc],
  );

  const data = useUsersData({
    tenantId,
    currentUserRole,
    initialUsers,
    confirm: confirmWithMessage,
  });

  // Edit user state
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = (user: AdminUser) => {
    setEditingUser(user);
    setEditName(user.full_name || '');
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditPassword('');
  };

  // Per-user permission override dialog
  const [permsUser, setPermsUser] = useState<AdminUser | null>(null);

  const handleEditSave = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    try {
      // Update name/role if changed
      if (editName !== editingUser.full_name || editRole !== editingUser.role) {
        const res = await actionUpdateAdminUser(tenantId, editingUser.id, {
          full_name: editName,
          role: editRole as AdminRole,
          is_active: editingUser.is_active,
        } as Partial<AdminUser>);
        if (res.error) {
          toast({ title: res.error, variant: 'destructive' });
          return;
        }
      }
      // Update email if changed
      if (editEmail !== editingUser.email) {
        const res = await actionUpdateUserEmail(tenantId, editingUser.id, editEmail);
        if (res.error) {
          toast({ title: res.error, variant: 'destructive' });
          return;
        }
      }
      // Reset password if provided
      if (editPassword.trim()) {
        const res = await actionResetUserPassword(tenantId, editingUser.id, editPassword);
        if (res.error) {
          toast({ title: res.error, variant: 'destructive' });
          return;
        }
      }
      toast({ title: t('userUpdated') });
      setEditingUser(null);
      window.location.reload();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <RoleGuard permission="canManageUsers">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 space-y-4">
          <AdminPageHeader
            title={t('title')}
            actions={
              data.canManageUsers ? (
                <Button
                  variant="default"
                  onClick={() => data.setIsModalOpen(true)}
                  className="gap-2 shrink-0"
                >
                  <UserPlus className="w-4 h-4" /> {t('newMember')}
                </Button>
              ) : undefined
            }
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 @sm:mt-6 space-y-6">
          <UsersTable
            users={data.users}
            canManageUsers={data.canManageUsers}
            onToggleStatus={data.handleToggleStatus}
            onDeleteUser={data.handleDeleteUser}
            onEditUser={data.canManageUsers ? openEditModal : undefined}
            onEditPermissions={data.canManageUsers ? setPermsUser : undefined}
          />

          {useServerPagination && serverListPagination && (
            <ListPagination
              page={listPage}
              pageSize={serverListPagination.pageSize}
              totalCount={serverListPagination.total}
              onPageChange={handlePageChange}
            />
          )}

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
        </div>

        {/* Add Member Modal */}
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

        {/* Edit User Modal */}
        <AdminModal
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          title={t('editUser')}
        >
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t('fullName')}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('email')}</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('role')}</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiter">{t('roleWaiterLabel')}</SelectItem>
                  <SelectItem value="chef">{t('roleChefLabel')}</SelectItem>
                  <SelectItem value="cashier">{t('roleCashierLabel')}</SelectItem>
                  <SelectItem value="manager">{t('roleManagerLabel')}</SelectItem>
                  <SelectItem value="admin">{t('roleAdminLabel')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('newPassword')}</Label>
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder={t('newPasswordPlaceholder')}
                className="min-h-[44px]"
              />
              <p className="text-xs text-app-text-secondary">{t('passwordHint')}</p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
              <Button variant="ghost" onClick={() => setEditingUser(null)}>
                {tc('cancel')}
              </Button>
              <Button variant="default" disabled={editSaving} onClick={handleEditSave}>
                {editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {tc('saveChanges')}
              </Button>
            </div>
          </div>
        </AdminModal>
        {/* Per-user permission override dialog (remounts per user via key) */}
        {permsUser && (
          <UserPermissionsDialog
            key={permsUser.id}
            user={permsUser}
            tenantId={tenantId}
            roleOverride={roleOverrides[permsUser.role] ?? {}}
            onClose={() => setPermsUser(null)}
            onSaved={() => {
              setPermsUser(null);
              window.location.reload();
            }}
          />
        )}
        {ConfirmDialog}
      </div>
    </RoleGuard>
  );
}

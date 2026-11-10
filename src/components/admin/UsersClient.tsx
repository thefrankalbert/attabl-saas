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

// --- Types -------------------------------------------------

interface UsersClientProps {
  tenantId: string;
  currentUserRole: AdminRole;
  initialUsers: AdminUser[];
  roleOverrides?: Record<string, PermissionMap>;
  serverListPagination?: ServerListPagination;
}

// --- Main Component ----------------------------------------

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
  const [editSaving, setEditSaving] = useState(false);
  const [sendingResetLink, setSendingResetLink] = useState(false);

  const openEditModal = (user: AdminUser) => {
    setEditingUser(user);
    setEditName(user.full_name || '');
    setEditEmail(user.email);
    setEditRole(user.role);
  };

  // Le champ "nouveau mot de passe" a disparu: le serveur n'ecrit plus le mot
  // de passe d'autrui (constat ACT-14), il envoie un lien de reinitialisation
  // au titulaire. Garder un champ dont la valeur etait ignoree affichait
  // "utilisateur mis a jour" alors que rien ne changeait: le patron croyait
  // avoir donne un mot de passe a son equipier. L'action est donc explicite,
  // et son message dit a quelle adresse le lien est parti.
  const handleSendResetLink = async () => {
    if (!editingUser) return;
    setSendingResetLink(true);
    try {
      const res = await actionResetUserPassword(tenantId, editingUser.id);
      if (res.error) {
        toast({ title: res.error, variant: 'destructive' });
        return;
      }
      // Le toast ne NOMME plus d'adresse (reserve S3' du contre-audit LOT 4).
      // Il affichait `editingUser.email`, c'est-a-dire le miroir
      // `admin_users.email`, alors que le serveur envoie le lien a l'adresse
      // portee par le COMPTE AUTH de la cible (admin.ts, getUserById). Les deux
      // divergent des qu'un changement d'adresse n'a pas ete confirme par le
      // titulaire: le message affirmait alors un destinataire que le serveur
      // n'avait pas utilise - le meme mensonge d'interface que ce lot pretend
      // avoir ferme. Retourner l'adresse reellement utilisee aurait divulgue a
      // l'appelant l'adresse privee du compte auth; on n'en nomme donc aucune.
      toast({ title: t('resetLinkSent') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setSendingResetLink(false);
    }
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
    <RoleGuard permission="team.view">
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

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6 space-y-6">
          <UsersTable
            users={data.users}
            canManageUsers={data.canManageUsers}
            onToggleStatus={data.handleToggleStatus}
            onDeleteUser={data.handleDeleteUser}
            onEditUser={data.canManageUsers ? openEditModal : undefined}
            onEditPermissions={data.canEditPermissions ? setPermsUser : undefined}
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
                autoComplete="off"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('email')}</Label>
              <Input
                type="email"
                autoComplete="off"
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
              <Label>{t('passwordSection')}</Label>
              <Button
                variant="outline"
                disabled={sendingResetLink}
                onClick={handleSendResetLink}
                className="w-full min-h-[44px] gap-2"
              >
                {sendingResetLink && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('sendResetLink')}
              </Button>
              <p className="text-xs text-app-text-secondary">{t('resetLinkHint')}</p>
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  actionCreateAdminUser,
  actionDeleteAdminUser,
  actionUpdateAdminUser,
} from '@/app/actions/admin';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import type { AdminUser, AdminRole } from '@/types/admin.types';
import type { Invitation } from '@/types/invitation.types';

// ─── Types ─────────────────────────────────────────────────

export type ModalTab = 'invite' | 'direct';

export interface CreateUserFormData {
  email: string;
  password: string;
  full_name: string;
  role: AdminRole;
}

/**
 * Async confirmation callback - typically from useConfirmDialog.
 * Returns true when the user confirms, false otherwise. We keep the signature
 * narrow (message string only) so callers can plug any dialog implementation.
 */
export type ConfirmFn = (message: string) => Promise<boolean>;

export interface UseUsersDataParams {
  tenantId: string;
  currentUserRole: AdminRole;
  initialUsers: AdminUser[];
  /** Required: no-window.confirm fallback to avoid the native prompt. */
  confirm: ConfirmFn;
}

export interface UseUsersDataReturn {
  users: AdminUser[];
  canManageUsers: boolean;

  // Modal state
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  activeTab: ModalTab;
  setActiveTab: (tab: ModalTab) => void;
  loading: boolean;

  // Invitation form state
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: string;
  setInviteRole: (role: string) => void;
  inviting: boolean;

  // Pending invitations
  pendingInvitations: Invitation[];
  loadingInvitations: boolean;
  resendingId: string | null;
  cancellingId: string | null;
  pendingOnly: Invitation[];

  // Direct creation form state
  formData: CreateUserFormData;
  setFormData: (data: CreateUserFormData) => void;

  // Actions
  handleSendInvitation: () => Promise<void>;
  handleResendInvitation: (invitationId: string) => Promise<void>;
  handleCancelInvitation: (invitationId: string) => Promise<void>;
  handleCreateUser: () => Promise<void>;
  handleDeleteUser: (userId: string) => Promise<void>;
  handleToggleStatus: (user: AdminUser) => Promise<void>;
}

// ─── Helpers ───────────────────────────────────────────────

export function timeAgo(
  dateStr: string,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return t('lessThanHour');
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t('daysAgo', { count: diffDays });
}

export function timeUntil(
  dateStr: string,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return t('expired');
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return t('lessThanHour');
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t('daysAgo', { count: diffDays });
}

// ─── Hook ──────────────────────────────────────────────────

export function useUsersData({
  tenantId,
  currentUserRole,
  initialUsers,
  confirm,
}: UseUsersDataParams): UseUsersDataReturn {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modal tab state
  const [activeTab, setActiveTab] = useState<ModalTab>('invite');

  // Invitation form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('waiter');
  const [inviting, setInviting] = useState(false);

  // Pending invitations state
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Direct creation form state
  const [formData, setFormData] = useState<CreateUserFormData>({
    email: '',
    password: '',
    full_name: '',
    role: 'waiter' as AdminRole,
  });

  const canManageUsers = ['owner', 'admin'].includes(currentUserRole);

  // Fetch pending invitations
  const fetchInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      const response = await fetch(`/api/invitations`);
      if (!response.ok) {
        throw new Error('Erreur lors du chargement des invitations');
      }
      const data: unknown = await response.json();
      if (Array.isArray(data)) {
        setPendingInvitations(data as Invitation[]);
      }
    } catch (e: unknown) {
      logger.error('Failed to fetch invitations', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  useEffect(() => {
    if (canManageUsers) {
      void fetchInvitations();
    }
  }, [canManageUsers, fetchInvitations]);

  // Handle invitation send
  const handleSendInvitation = async () => {
    if (!inviteEmail) {
      toast({ title: t('emailRequired'), variant: 'destructive' });
      return;
    }

    setInviting(true);
    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!response.ok) {
        const errorData: unknown = await response.json();
        const errorMessage =
          errorData && typeof errorData === 'object' && 'error' in errorData
            ? String((errorData as { error: string }).error)
            : tc('unknownError');
        throw new Error(errorMessage);
      }

      toast({ title: t('inviteSentTo', { email: inviteEmail }) });
      setInviteEmail('');
      setInviteRole('waiter');
      setIsModalOpen(false);
      void fetchInvitations();
    } catch (e: unknown) {
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('unknownError'),
        variant: 'destructive',
      });
    } finally {
      setInviting(false);
    }
  };

  // Handle resend invitation
  const handleResendInvitation = async (invitationId: string) => {
    setResendingId(invitationId);
    try {
      const response = await fetch(`/api/invitations/${invitationId}/resend`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(tc('unknownError'));
      }

      toast({ title: t('invitationResent') });
      void fetchInvitations();
    } catch (e: unknown) {
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('unknownError'),
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  };

  // Handle cancel invitation
  const handleCancelInvitation = async (invitationId: string) => {
    setCancellingId(invitationId);
    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(tc('unknownError'));
      }

      toast({ title: t('invitationCancelled') });
      void fetchInvitations();
    } catch (e: unknown) {
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('unknownError'),
        variant: 'destructive',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.email || !formData.password || !formData.full_name) {
      toast({ title: t('fillAllFields'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const result = await actionCreateAdminUser(tenantId, formData);
      if (result.error) throw new Error(result.error);

      toast({ title: t('userCreated') });
      setIsModalOpen(false);
      window.location.reload();
    } catch (e: unknown) {
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('unknownError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const ok = await confirm(t('confirmDeleteUser'));
    if (!ok) return;

    try {
      const result = await actionDeleteAdminUser(tenantId, userId);
      if (result.error) throw new Error(result.error);

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast({ title: t('userDeleted') });
    } catch (e: unknown) {
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('unknownError'),
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    try {
      const newStatus = !user.is_active;
      const result = await actionUpdateAdminUser(tenantId, user.id, { is_active: newStatus });
      if (result.error) throw new Error(result.error);

      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: newStatus } : u)));
      toast({ title: newStatus ? t('userActivated') : t('userDeactivated') });
    } catch (e: unknown) {
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('unknownError'),
        variant: 'destructive',
      });
    }
  };

  const pendingOnly = pendingInvitations.filter((inv) => inv.status === 'pending');

  return {
    users,
    canManageUsers,

    isModalOpen,
    setIsModalOpen,
    activeTab,
    setActiveTab,
    loading,

    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    inviting,

    pendingInvitations,
    loadingInvitations,
    resendingId,
    cancellingId,
    pendingOnly,

    formData,
    setFormData,

    handleSendInvitation,
    handleResendInvitation,
    handleCancelInvitation,
    handleCreateUser,
    handleDeleteUser,
    handleToggleStatus,
  };
}

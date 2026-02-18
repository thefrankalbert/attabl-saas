'use client';

import { useState } from 'react';
import {
  Users,
  UserPlus,
  UserX,
  Shield,
  CreditCard,
  ChefHat,
  Coffee,
  MoreVertical,
  Mail,
  Lock,
  Check,
  X,
  Loader2,
  Crown,
  Activity,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import {
  createAdminUserAction,
  deleteAdminUserAction,
  updateAdminUserAction,
} from '@/app/actions/admin';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { AdminUser, AdminRole } from '@/types/admin.types';

type RoleConfigEntry = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
};

interface UsersClientProps {
  tenantId: string;
  currentUserRole: AdminRole;
  initialUsers: AdminUser[];
}

export default function UsersClient({ tenantId, currentUserRole, initialUsers }: UsersClientProps) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'waiter' as AdminRole,
  });

  const { toast } = useToast();

  const ROLE_CONFIG: Record<AdminRole, RoleConfigEntry> = {
    owner: { label: t('roleOwner'), icon: Crown, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    admin: { label: t('roleAdmin'), icon: Shield, color: 'text-purple-600', bg: 'bg-purple-50' },
    manager: { label: t('roleManager'), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    cashier: {
      label: t('roleCashier'),
      icon: CreditCard,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    chef: { label: t('roleChef'), icon: ChefHat, color: 'text-orange-600', bg: 'bg-orange-50' },
    waiter: {
      label: t('roleWaiter'),
      icon: Coffee,
      color: 'text-neutral-600',
      bg: 'bg-neutral-50',
    },
  };

  const DEFAULT_ROLE_CONFIG: RoleConfigEntry = {
    label: t('roleUser'),
    icon: Users,
    color: 'text-neutral-600',
    bg: 'bg-neutral-50',
  };

  function getRoleConfig(role: string): RoleConfigEntry {
    return ROLE_CONFIG[role as AdminRole] ?? DEFAULT_ROLE_CONFIG;
  }

  const canManageUsers = ['owner', 'admin'].includes(currentUserRole);

  const handleCreateUser = async () => {
    if (!formData.email || !formData.password || !formData.full_name) {
      toast({ title: t('fillAllFields'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const result = await createAdminUserAction(tenantId, formData);
      if (result.error) throw new Error(result.error);

      toast({ title: t('userCreated') });
      setIsModalOpen(false);
      // Ideally re-fetch or optimistically update. Since we don't have the full object from response easily without another fetch,
      // let's reload the page to be safe and simple, or fetch via client-side supabase if we wanted.
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
    if (!confirm(t('confirmDeleteUser'))) return;

    try {
      const result = await deleteAdminUserAction(tenantId, userId);
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
      const result = await updateAdminUserAction(tenantId, user.id, { is_active: newStatus });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('teamTitle')}</h1>
          <p className="text-sm text-neutral-500">{t('teamSubtitle')}</p>
        </div>
        {canManageUsers && (
          <Button variant="lime" onClick={() => setIsModalOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" /> {t('newMember')}
          </Button>
        )}
      </div>

      <div className="bg-white border border-neutral-100 rounded-xl overflow-hidden">
        <div className="divide-y divide-neutral-100">
          {users.map((user) => {
            const roleConfig = getRoleConfig(user.role);
            const RoleIcon = roleConfig.icon;
            return (
              <div
                key={user.id}
                className={cn(
                  'p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors',
                  !user.is_active && 'opacity-60 bg-neutral-50',
                )}
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10 border">
                    <AvatarImage
                      src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.full_name}`}
                    />
                    <AvatarFallback>{user.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-neutral-900">{user.full_name}</p>
                      {!user.is_active && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                          {t('inactive')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-neutral-500">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2',
                      roleConfig.bg,
                      roleConfig.color,
                    )}
                  >
                    <RoleIcon className="w-3.5 h-3.5" />
                    {roleConfig.label}
                  </div>

                  <div className="hidden md:block text-xs text-neutral-400">
                    {user.last_login_at || user.last_login ? (
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />{' '}
                        {new Date((user.last_login_at || user.last_login)!).toLocaleDateString(
                          locale,
                          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
                        )}
                      </span>
                    ) : (
                      <span>{t('neverLoggedIn')}</span>
                    )}
                  </div>

                  {canManageUsers && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{tc('actions')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                          {user.is_active ? (
                            <UserX className="w-4 h-4 mr-2" />
                          ) : (
                            <Check className="w-4 h-4 mr-2" />
                          )}
                          {user.is_active ? t('deactivate') : t('activate')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          {tc('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="p-12 text-center text-neutral-500">{t('emptyState')}</div>
          )}
        </div>
      </div>

      <AdminModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('addMember')}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('fullName')}</Label>
            <div className="relative">
              <Users className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <Input
                className="pl-9"
                placeholder={t('fullNamePlaceholder')}
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('professionalEmail')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <Input
                className="pl-9"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('temporaryPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <Input
                className="pl-9"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('roleAndPermissions')}</Label>
            <Select
              value={formData.role}
              onValueChange={(v: AdminRole) => setFormData({ ...formData, role: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key} disabled={key === 'owner'}>
                    <div className="flex items-center gap-2">
                      <config.icon className="w-4 h-4" />
                      <span>{config.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500 mt-1">{t('roleDescription')}</p>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="lime" onClick={handleCreateUser} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('createAccount')}
            </Button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

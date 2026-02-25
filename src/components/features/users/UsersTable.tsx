'use client';

import {
  Users,
  UserX,
  Shield,
  CreditCard,
  ChefHat,
  Coffee,
  MoreVertical,
  Check,
  X,
  Crown,
  Activity,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { AdminUser, AdminRole } from '@/types/admin.types';

// ─── Types ─────────────────────────────────────────────────

type RoleConfigEntry = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
};

interface UsersTableProps {
  users: AdminUser[];
  canManageUsers: boolean;
  onToggleStatus: (user: AdminUser) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
}

// ─── Component ─────────────────────────────────────────────

export default function UsersTable({
  users,
  canManageUsers,
  onToggleStatus,
  onDeleteUser,
}: UsersTableProps) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const locale = useLocale();

  const ROLE_CONFIG: Record<AdminRole, RoleConfigEntry> = {
    owner: { label: t('roleOwner'), icon: Crown, color: 'text-lime-700', bg: 'bg-lime-100' },
    admin: { label: t('roleAdmin'), icon: Shield, color: 'text-blue-600', bg: 'bg-blue-50' },
    manager: { label: t('roleManager'), icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    cashier: {
      label: t('roleCashier'),
      icon: CreditCard,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    },
    chef: { label: t('roleChef'), icon: ChefHat, color: 'text-orange-600', bg: 'bg-orange-50' },
    waiter: {
      label: t('roleWaiter'),
      icon: Coffee,
      color: 'text-green-600',
      bg: 'bg-green-50',
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

  return (
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
                      <DropdownMenuItem onClick={() => onToggleStatus(user)}>
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
                        onClick={() => onDeleteUser(user.id)}
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
  );
}

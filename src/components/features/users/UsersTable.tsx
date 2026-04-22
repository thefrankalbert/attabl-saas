'use client';

import { UserX, MoreVertical, Check, X, Activity, Pencil } from 'lucide-react';
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
import { getRoleConfig } from '@/lib/role-config';
import type { AdminUser } from '@/types/admin.types';

interface UsersTableProps {
  users: AdminUser[];
  canManageUsers: boolean;
  onToggleStatus: (user: AdminUser) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onEditUser?: (user: AdminUser) => void;
}

// ─── Component ─────────────────────────────────────────────

export default function UsersTable({
  users,
  canManageUsers,
  onToggleStatus,
  onDeleteUser,
  onEditUser,
}: UsersTableProps) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const locale = useLocale();

  return (
    <div className="bg-app-card border border-app-border rounded-[10px] overflow-hidden">
      <div className="divide-y divide-app-border">
        {users.map((user) => {
          const roleConfig = getRoleConfig(user.role, t);
          const RoleIcon = roleConfig.icon;
          return (
            <div
              key={user.id}
              className={cn(
                'p-4 flex items-center justify-between hover:bg-app-hover transition-colors',
                !user.is_active && 'opacity-60 bg-app-elevated',
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
                    <p className="font-normal text-app-text">{user.full_name}</p>
                    {!user.is_active && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                        {t('inactive')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-app-text-secondary">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-normal flex items-center gap-2',
                    roleConfig.bg,
                    roleConfig.color,
                  )}
                >
                  <RoleIcon className="w-3.5 h-3.5" />
                  {roleConfig.label}
                </div>

                <div className="hidden @md:block text-xs text-app-text-muted">
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
                      {onEditUser && (
                        <DropdownMenuItem onClick={() => onEditUser(user)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          {t('editUser')}
                        </DropdownMenuItem>
                      )}
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
          <div className="p-12 text-center text-app-text-secondary">{t('emptyState')}</div>
        )}
      </div>
    </div>
  );
}

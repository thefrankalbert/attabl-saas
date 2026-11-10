'use client';

import { usePermissions } from '@/hooks/usePermissions';
import { ShieldX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdminRole } from '@/types/admin.types';
import type { PermissionCode } from '@/types/permission.types';

// --- Types ----------------------------------------------

interface RoleGuardProps {
  /** Permission EFFECTIVE requise (meme resolution que le serveur). */
  permission?: PermissionCode;
  /** Direct role whitelist (user must have one of these roles) */
  roles?: AdminRole[];
  /** Custom fallback UI (defaults to AccessDenied) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

// --- Access Denied UI -----------------------------------

function AccessDenied() {
  const t = useTranslations('permissions');

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="p-4 bg-app-elevated rounded-xl mb-4">
        <ShieldX className="w-8 h-8 text-app-text-muted" />
      </div>
      <h2 className="text-lg font-semibold text-app-text mb-1">{t('accessDenied')}</h2>
      <p className="text-sm text-app-text-secondary max-w-sm">{t('noAccessHint')}</p>
    </div>
  );
}

// --- Component ------------------------------------------

export default function RoleGuard({ permission, roles, fallback, children }: RoleGuardProps) {
  const { role, can } = usePermissions();

  // Check role whitelist
  if (roles && !roles.includes(role)) {
    return <>{fallback ?? <AccessDenied />}</>;
  }

  // Check effective permission
  if (permission && !can(permission)) {
    return <>{fallback ?? <AccessDenied />}</>;
  }

  return <>{children}</>;
}

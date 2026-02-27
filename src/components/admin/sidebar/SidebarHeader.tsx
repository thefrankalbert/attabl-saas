'use client';

import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────

interface SidebarHeaderProps {
  basePath: string;
  tenant: {
    name: string;
    logo_url?: string;
    primary_color?: string;
  };
  roleLabel: string;
  isCollapsed: boolean;
}

// ─── Component ──────────────────────────────────────────

export function SidebarHeader({ basePath, tenant, roleLabel, isCollapsed }: SidebarHeaderProps) {
  return (
    <div
      className={cn(
        'border-b border-neutral-100 flex-shrink-0 flex items-center',
        isCollapsed ? 'p-3 justify-center' : 'p-6 justify-between',
      )}
    >
      <Link
        href={basePath}
        className={cn('flex items-center group', isCollapsed ? 'justify-center' : 'gap-3')}
      >
        {tenant.logo_url ? (
          <Image
            src={tenant.logo_url}
            alt={tenant.name}
            width={isCollapsed ? 32 : 40}
            height={isCollapsed ? 32 : 40}
            className={cn('rounded-lg object-contain', isCollapsed ? 'w-8 h-8' : 'w-10 h-10')}
          />
        ) : (
          <div
            className={cn(
              'rounded-lg flex items-center justify-center text-white font-bold',
              isCollapsed ? 'w-8 h-8 text-xs' : 'w-10 h-10',
            )}
            style={{ backgroundColor: tenant.primary_color || '#374151' }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-neutral-900 truncate uppercase tracking-tight">
              {tenant.name}
            </h2>
            <p className="text-xs text-neutral-500">{roleLabel}</p>
          </div>
        )}
      </Link>
    </div>
  );
}

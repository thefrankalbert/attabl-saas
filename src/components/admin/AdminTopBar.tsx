'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, LogOut, Sun, Moon } from 'lucide-react';
import Image from 'next/image';
import { isImmersivePage, isAdminHome } from '@/lib/constants';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Types ──────────────────────────────────────────────

interface AdminTopBarProps {
  tenant: {
    name: string;
    slug: string;
    logo_url?: string;
  };
  basePath: string;
  notifications?: React.ReactNode;
}

// ─── Component ──────────────────────────────────────────

export function AdminTopBar({ tenant, basePath, notifications }: AdminTopBarProps) {
  const pathname = usePathname();
  const { resolved, setTheme } = useTheme();

  if (isImmersivePage(pathname)) return null;

  const isHome = isAdminHome(pathname, basePath);

  return (
    <header className="shrink-0 h-14 bg-app-card border-b border-app-border flex items-center justify-between px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="flex items-center gap-3">
        {!isHome && (
          <Link
            href={basePath}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-app-elevated hover:bg-app-hover transition-colors touch-manipulation"
          >
            <ArrowLeft className="w-4 h-4 text-app-text-secondary" />
          </Link>
        )}

        {tenant.logo_url ? (
          <Image
            src={tenant.logo_url}
            alt={tenant.name}
            width={28}
            height={28}
            className="w-7 h-7 rounded-lg object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center font-bold text-xs text-accent-text">
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}

        <span className="font-semibold text-app-text text-sm truncate max-w-[200px]">
          {tenant.name}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {notifications}
        <button
          type="button"
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-app-hover hover:text-app-text transition-colors touch-manipulation"
          title="Toggle theme"
        >
          {resolved === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-status-error-bg hover:text-status-error transition-colors touch-manipulation"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </header>
  );
}

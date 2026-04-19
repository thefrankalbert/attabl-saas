import Image from 'next/image';
import { cn } from '@/lib/utils';

interface SidebarBrandProps {
  name: string;
  slug: string;
  logoUrl?: string;
  collapsed?: boolean;
}

/**
 * Brand block shown at the top of the redesigned admin sidebar.
 * Lime square mark with the tenant initial (or logo) + name + mono domain.
 * Matches the Claude Design mockup (Dashboard.html lines 58-67 / 467-473).
 */
export function SidebarBrand({ name, slug, logoUrl, collapsed }: SidebarBrandProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={cn('flex items-center gap-2.5', collapsed ? 'justify-center px-0' : 'px-2')}>
      <div
        className={cn(
          'relative grid place-items-center rounded-[7px] bg-accent text-[13px] font-bold tracking-tight',
          'w-[26px] h-[26px] shrink-0',
        )}
        style={{ color: 'var(--app-accent-text)' }}
        aria-hidden
      >
        {logoUrl ? (
          <Image src={logoUrl} alt="" fill sizes="26px" className="object-cover rounded-[7px]" />
        ) : (
          initial
        )}
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight text-app-text truncate">{name}</p>
          <p className="font-mono text-[11px] text-app-text-muted truncate">{slug}.attabl.com</p>
        </div>
      )}
    </div>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavItem } from './NavItem';
import { SidebarTooltip } from './SidebarTooltip';
import type { LucideIcon } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

export interface NavGroupItem {
  href: string;
  icon: LucideIcon;
  label: string;
  highlight?: boolean;
}

interface NavGroupProps {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavGroupItem[];
  /** If set, this group is a direct link (no expandable children) */
  directLink?: string;
  highlight?: boolean;
  isCollapsed: boolean;
  isExpanded: boolean;
  primaryColor?: string;
  onToggle: (groupId: string) => void;
  onToggleCollapsed: () => void;
}

// ─── Component ──────────────────────────────────────────

export function NavGroup({
  id,
  title,
  icon: Icon,
  items,
  directLink,
  highlight,
  isCollapsed,
  isExpanded,
  primaryColor,
  onToggle,
  onToggleCollapsed,
}: NavGroupProps) {
  const pathname = usePathname();
  const accentColor = primaryColor || '#000000';

  // ─── Helper: check if group or children are active ───
  const isGroupActive = (): boolean => {
    if (directLink) {
      if (id === 'dashboard') return pathname === directLink;
      return pathname === directLink || pathname.startsWith(directLink + '/');
    }
    return items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  };

  const active = isGroupActive();

  // ─── Direct link item (Dashboard, Orders, POS, Kitchen, Service) ─
  if (directLink) {
    return (
      <NavItem
        href={directLink}
        icon={Icon}
        label={title}
        isActive={active}
        isCollapsed={isCollapsed}
        primaryColor={primaryColor}
        highlight={highlight}
      />
    );
  }

  // ─── Collapsible group (Organization, Marketing, Analyse) ─
  return (
    <div>
      <SidebarTooltip label={title} show={isCollapsed}>
        <button
          type="button"
          onClick={() => {
            if (isCollapsed) {
              // In collapsed mode, expand the sidebar so user can see children
              onToggleCollapsed();
              if (!isExpanded) onToggle(id);
            } else {
              onToggle(id);
            }
          }}
          className={cn(
            'w-full group flex items-center rounded-lg transition-all duration-200 relative',
            isCollapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5',
            active && !isExpanded
              ? 'bg-neutral-50 text-neutral-900 font-semibold'
              : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 font-medium',
          )}
        >
          {active && !isExpanded && (
            <div
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
              style={{ backgroundColor: accentColor }}
            />
          )}
          <Icon
            className={cn(
              'w-[18px] h-[18px] flex-shrink-0 transition-transform group-hover:scale-105',
              active ? '' : 'text-neutral-400 group-hover:text-neutral-600',
            )}
            style={active ? { color: accentColor } : undefined}
          />
          {!isCollapsed && (
            <>
              <span className="text-sm tracking-tight leading-none ml-3">{title}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 ml-auto text-neutral-400 transition-transform duration-200',
                  isExpanded && 'rotate-180',
                )}
              />
            </>
          )}
        </button>
      </SidebarTooltip>

      {/* Collapsible sub-items */}
      {!isCollapsed && (
        <div
          className={cn(
            'overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out',
            isExpanded ? 'grid grid-rows-[1fr]' : 'grid grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0">
            <div className="pl-4 mt-1 space-y-0.5">
              {items.map((item) => {
                const isItemActive = pathname === item.href || pathname.startsWith(item.href + '/');

                return (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    isActive={isItemActive}
                    isCollapsed={false}
                    primaryColor={primaryColor}
                    highlight={item.highlight}
                    isSubItem
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

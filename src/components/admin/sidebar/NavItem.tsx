'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SidebarTooltip } from './SidebarTooltip';
import type { LucideIcon } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  isCollapsed: boolean;
  primaryColor?: string;
  highlight?: boolean;
  /** Whether this is a sub-item (smaller icon, indented) */
  isSubItem?: boolean;
}

// ─── Component ──────────────────────────────────────────

export function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  isCollapsed,
  primaryColor,
  highlight,
  isSubItem,
}: NavItemProps) {
  const prefersReduced = useReducedMotion();

  return (
    <SidebarTooltip label={label} show={isCollapsed}>
      <Link
        href={href}
        className={cn(
          'group flex items-center rounded-lg transition-all duration-200 relative',
          isCollapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5 space-x-3',
          isActive
            ? 'bg-white/10 text-white font-semibold'
            : isSubItem
              ? 'text-white/40 hover:bg-white/5 hover:text-white/80 font-medium'
              : 'text-white/50 hover:bg-white/5 hover:text-white/80 font-medium',
          highlight && !isActive && 'bg-[#CCFF00]/10 border border-[#CCFF00]/20',
        )}
      >
        {isActive && (
          <motion.div
            layoutId={isSubItem ? undefined : 'sidebar-active-indicator'}
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-[#CCFF00]"
            transition={
              prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 350, damping: 30 }
            }
          />
        )}
        <Icon
          className={cn(
            'flex-shrink-0 transition-transform group-hover:scale-105',
            isSubItem ? 'w-4 h-4' : 'w-[18px] h-[18px]',
            isActive
              ? 'text-[#CCFF00]'
              : highlight
                ? 'text-[#CCFF00]/70'
                : 'text-white/30 group-hover:text-white/60',
          )}
        />
        {!isCollapsed && (
          <>
            <span
              className={cn(
                'text-sm tracking-tight leading-none',
                highlight && !isActive && 'text-[#CCFF00] font-bold',
              )}
            >
              {label}
            </span>
            {isActive && (
              <ChevronRight
                className={cn('ml-auto text-white/30', isSubItem ? 'h-3.5 w-3.5' : 'h-4 w-4')}
              />
            )}
          </>
        )}
      </Link>
    </SidebarTooltip>
  );
}

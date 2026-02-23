'use client';

import { useState, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────

interface SidebarTooltipProps {
  label: string;
  children: React.ReactNode;
  show: boolean;
}

// ─── Component ──────────────────────────────────────────

export function SidebarTooltip({ label, children, show }: SidebarTooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!show) return <>{children}</>;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 px-2.5 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-md whitespace-nowrap pointer-events-none">
          {label}
        </div>
      )}
    </div>
  );
}

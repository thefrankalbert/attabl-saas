'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ClientBottomNav } from '@/components/tenant/client/BottomNav';
import { ClientFloatingCart } from '@/components/tenant/client/FloatingCart';

/**
 * Convive (customer) shell: the scrolling viewport anchor + bottom nav + cart.
 *
 * Admin routes (/sites/[site]/admin/*) are nested under the same tenant layout
 * but bring their OWN shell (AdminLayoutClient: h-dvh + main#main-content). So
 * on admin paths we must NOT render the convive shell - otherwise the convive
 * BottomNav/FloatingCart leak into the dashboard and a second main#main-content
 * + nested h-dvh break the single-scroll-container viewport contract.
 */
export function ConviveShell({
  slug,
  fontFamily,
  children,
}: {
  slug: string;
  fontFamily: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '';

  if (pathname.includes(`/${slug}/admin`)) {
    return <>{children}</>;
  }

  return (
    <div
      className="tenant-client flex h-dvh flex-col overflow-hidden bg-white antialiased"
      style={{ fontFamily }}
    >
      <main id="main-content" className="relative flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      <ClientFloatingCart slug={slug} />
      <ClientBottomNav slug={slug} />
    </div>
  );
}

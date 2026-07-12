'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UtensilsCrossed, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { QRScanResult } from '@/components/tenant/QRScanner';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), { ssr: false });

interface WelcomeSplashProps {
  tenantSlug: string;
  tenantName: string;
  tenantLogo: string | null;
  location: string | null;
  isOpen: boolean;
}

export default function WelcomeSplash({
  tenantSlug,
  tenantName,
  tenantLogo,
  location,
  isOpen,
}: WelcomeSplashProps) {
  const t = useTranslations('homePage');
  const router = useRouter();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const initials =
    tenantName
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'A';

  const handleScan = useCallback(
    (result: QRScanResult) => {
      if (result.tableNumber) {
        try {
          localStorage.setItem(`attabl_${tenantSlug}_table`, result.tableNumber);
        } catch {
          // localStorage unavailable - the table still flows through the URL
        }
      }
      setIsScannerOpen(false);
      const target = result.menuSlug
        ? `/sites/${tenantSlug}/menu?menu=${result.menuSlug}${result.tableNumber ? `&table=${result.tableNumber}` : ''}`
        : result.tableNumber
          ? `/sites/${tenantSlug}/menu?table=${result.tableNumber}`
          : `/sites/${tenantSlug}/menu`;
      router.push(target);
    },
    [router, tenantSlug],
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--color-ink)] text-white">
      {/* brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-1/3 h-72 w-72 rounded-full bg-[var(--color-brand)] opacity-[0.10] blur-[60px]"
      />

      {/* Top: venue identity */}
      <div className="relative flex items-center gap-3 px-[18px] pt-6">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-modal)] border border-white/15 bg-white/10">
          {tenantLogo ? (
            <Image
              src={tenantLogo}
              alt={tenantName}
              width={52}
              height={52}
              className="h-full w-full object-cover"
              unoptimized={tenantLogo.startsWith('data:') || tenantLogo.startsWith('blob:')}
            />
          ) : (
            <span className="font-mono text-[14px] font-bold tracking-[0.5px]">{initials}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-[-0.2px]">{tenantName}</div>
          {location && <div className="truncate text-[12px] text-white/55">{location}</div>}
        </div>
      </div>

      {/* Center: faded mark */}
      <div className="relative flex flex-1 items-center justify-center">
        <UtensilsCrossed className="h-9 w-9 text-white/10" strokeWidth={1.5} />
      </div>

      {/* Bottom: pitch + CTAs */}
      <div
        className="relative px-[22px]"
        style={{ paddingBottom: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-white/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.4px] text-white/85">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
          {t('welcomeBadge')}
        </span>
        <h1 className="mt-3.5 line-clamp-2 break-words text-[40px] font-bold leading-[1.02] tracking-[-1.2px]">
          {tenantName}
        </h1>
        <p className="mt-2.5 max-w-sm text-[14.5px] leading-[1.45] text-white/65">
          {t('welcomeTagline')}
        </p>

        <Button
          onClick={() => setIsScannerOpen(true)}
          className="mt-6 h-[58px] w-full justify-center gap-2.5 rounded-full bg-[var(--color-brand)] text-[15.5px] font-semibold text-white hover:bg-[var(--color-brand-dark)]"
        >
          {t('scanMyTable')}
          <QrCode className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </Button>

        <Button
          asChild
          variant="ghost"
          className="mt-1.5 h-12 w-full text-[14px] font-semibold text-white hover:bg-white/5 hover:text-white"
        >
          <Link href={`/sites/${tenantSlug}/menu`}>{t('browseMenu')}</Link>
        </Button>
      </div>

      {isScannerOpen && (
        <QRScanner
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleScan}
          tenantName={tenantName}
          isOpen_venue={isOpen}
        />
      )}
    </div>
  );
}

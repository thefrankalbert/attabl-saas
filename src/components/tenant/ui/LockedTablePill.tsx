'use client';

import { Lock, QrCode } from 'lucide-react';
import { Pill } from './Pill';
import { TenantButton } from './TenantButton';
import { cn } from '@/lib/utils';

type LockedTablePillProps = {
  tableNumber?: string | null;
  lockedLabel: string;
  noTableLabel: string;
  rescanLabel: string;
  onRescan?: () => void;
  className?: string;
};

export function LockedTablePill({
  tableNumber,
  lockedLabel,
  noTableLabel,
  rescanLabel,
  onRescan,
  className,
}: LockedTablePillProps) {
  const trimmed = tableNumber?.trim();
  const hasTable = Boolean(trimmed);

  return (
    <div
      data-slot="locked-table-pill"
      className={cn(
        'inline-flex items-center gap-3 rounded-full border border-[color:var(--line)] bg-[color:var(--cream)] px-4 py-2 text-sm',
        className,
      )}
    >
      {hasTable ? (
        <Pill variant="lock" className="bg-transparent p-0">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          <span className="font-normal">
            {lockedLabel} - {trimmed}
          </span>
        </Pill>
      ) : (
        <span className="flex items-center gap-2 text-[color:var(--navy-80)]">
          <QrCode className="h-4 w-4" aria-hidden />
          <span>{noTableLabel}</span>
        </span>
      )}
      {!hasTable && onRescan && (
        <TenantButton variant="ghost" size="sm" onClick={onRescan} className="ml-auto">
          {rescanLabel}
        </TenantButton>
      )}
    </div>
  );
}

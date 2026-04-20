'use client';

import { useEffect, useState } from 'react';

interface HeroProps {
  /** Revenue today, in the display currency (FCFA by default). */
  revenueToday: number;
  revenueYesterday: number;
  /** ISO timestamp of the last order (drives the "il y a N min" line). */
  lastOrderAt?: string | null;
  currencyLabel?: string;
}

function formatMoney(value: number): string {
  return Math.round(value).toLocaleString('fr-FR');
}

function formatDelta(today: number, yesterday: number): string | null {
  if (yesterday <= 0) return null;
  const delta = ((today - yesterday) / yesterday) * 100;
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  return `${sign}${Math.abs(delta).toFixed(1).replace('.', ',')}% vs hier`;
}

function formatRelative(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Derniere commande a l'instant";
  if (mins < 60) return `Derniere commande il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Derniere commande il y a ${hours} h`;
  return null;
}

export function Hero({
  revenueToday,
  revenueYesterday,
  lastOrderAt,
  currencyLabel = 'FCFA',
}: HeroProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const delta = formatDelta(revenueToday, revenueYesterday);
  const relative = formatRelative(lastOrderAt, now);

  return (
    <div className="pt-2">
      <div
        className="flex items-center gap-2.5 text-[11.5px] font-medium uppercase tracking-[0.08em]"
        style={{ color: 'var(--cc-text-3)' }}
      >
        <span>{`Chiffre d'affaires - aujourd'hui`}</span>
        <span className="cc-live-dot" style={{ textTransform: 'none' }}>
          en direct
        </span>
      </div>

      <div
        className="mb-2.5 mt-[14px] flex items-baseline gap-[14px] whitespace-nowrap"
        style={{
          fontFamily: 'var(--cc-serif)',
          fontSize: 84,
          fontWeight: 400,
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        <span>{formatMoney(revenueToday)}</span>
        <span
          className="text-[22px] font-normal tracking-tight"
          style={{ color: 'var(--cc-text-3)', fontFamily: 'var(--cc-sans)' }}
        >
          {currencyLabel}
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-[14px] text-[13px]"
        style={{ color: 'var(--cc-text-2)' }}
      >
        {delta && (
          <span
            className="cc-mono inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[11.5px]"
            style={{ background: 'var(--cc-accent-soft)', color: 'var(--cc-accent-ink)' }}
          >
            {delta}
          </span>
        )}
        {delta && relative && <span style={{ color: 'var(--cc-text-3)' }}>·</span>}
        {relative && <span>{relative}</span>}
      </div>
    </div>
  );
}

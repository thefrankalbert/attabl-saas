'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

export type SectionCardData = {
  /** KPI title (e.g. "Chiffre du jour") */
  desc: string;
  /** Formatted main value (e.g. "287 500") */
  value: string;
  /** Optional trailing unit shown smaller (e.g. " FCFA", " / 14") */
  unit?: string;
  /** Formatted trend badge text (e.g. "+12%"); omitted when not computable */
  deltaText?: string;
  /** Trend direction - drives the up/down icon */
  up?: boolean;
  /** Footer line 1 (emphasised) */
  line1: string;
  /** Footer line 2 (muted) */
  line2: string;
};

interface SectionCardsProps {
  cards: SectionCardData[];
}

export function SectionCards({ cards }: SectionCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 px-3 sm:grid-cols-2 sm:gap-4 sm:px-5">
      {cards.map((c, i) => {
        const TrendIcon = c.up ? TrendingUp : TrendingDown;
        return (
          <div
            key={i}
            className="flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] [background-image:linear-gradient(to_top,var(--muted),var(--card))] dark:[background-image:none]"
          >
            <div className="grid gap-1.5 px-4 pt-4 sm:px-5 sm:pt-5">
              {/* In the narrow 2-up KPI column the title wraps and, when one word
                  plus the badge no longer fit, the badge drops under the title
                  instead of overlapping it or leaving the card. */}
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <div className="min-w-0 text-[13px] leading-snug text-[var(--muted-foreground)]">
                  {c.desc}
                </div>
                {c.deltaText && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
                    <TrendIcon className="size-3" />
                    {c.deltaText}
                  </span>
                )}
              </div>
              <div className="text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums sm:text-[26px]">
                {c.value}
                {c.unit && (
                  <span className="text-base font-medium text-[var(--muted-foreground)]">
                    {c.unit}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 px-4 pb-4 pt-3 text-[13px] sm:px-5 sm:pb-5">
              <div className="flex items-center gap-1.5 font-medium">
                {c.line1}
                {c.deltaText && <TrendIcon className="size-4" />}
              </div>
              <div className="text-[var(--muted-foreground)]">{c.line2}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

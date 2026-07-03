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
    <div className="grid grid-cols-1 gap-4 px-3 @sm:px-5 @xl:grid-cols-2 @md:px-6 @5xl:grid-cols-4">
      {cards.map((c, i) => {
        const TrendIcon = c.up ? TrendingUp : TrendingDown;
        return (
          <div
            key={i}
            className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] [background-image:linear-gradient(to_top,color-mix(in_oklab,var(--primary)_5%,transparent),var(--card))] dark:[background-image:none]"
          >
            <div className="grid gap-1.5 px-6 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] text-[var(--muted-foreground)]">{c.desc}</div>
                {c.deltaText && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
                    <TrendIcon className="size-3" />
                    {c.deltaText}
                  </span>
                )}
              </div>
              <div className="text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">
                {c.value}
                {c.unit && (
                  <span className="text-base font-medium text-[var(--muted-foreground)]">
                    {c.unit}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 px-6 pb-6 pt-3.5 text-[13px]">
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

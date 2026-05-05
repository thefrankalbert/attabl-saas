import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export interface PromoCardProps {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  tone?: 'brand' | 'ink' | 'warm';
}

const TONES = {
  brand: {
    bg: 'bg-[var(--color-brand-light)]',
    fg: 'text-[var(--color-ink)]',
    btn: 'bg-[var(--color-ink)] text-white',
  },
  ink: {
    bg: 'bg-[var(--color-ink)]',
    fg: 'text-white',
    btn: 'bg-[var(--color-brand)] text-[var(--color-ink)]',
  },
  warm: {
    bg: 'bg-[var(--color-warning-bg)]',
    fg: 'text-[var(--color-warning-fg)]',
    btn: 'bg-[var(--color-ink)] text-white',
  },
} as const;

export function PromoCard({ title, subtitle, cta, href, tone = 'brand' }: PromoCardProps) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className={`flex h-32 w-72 shrink-0 flex-col justify-between rounded-[var(--radius-card)] p-4 ${t.bg}`}
    >
      <div>
        <div className={`text-[18px] font-bold leading-tight ${t.fg}`}>{title}</div>
        <div className={`mt-1 text-[12px] ${t.fg} opacity-80`}>{subtitle}</div>
      </div>
      <span
        className={`inline-flex w-fit items-center gap-1 rounded-[var(--radius-pill)] px-3 py-1.5 text-[12px] font-semibold ${t.btn}`}
      >
        {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
      </span>
    </Link>
  );
}

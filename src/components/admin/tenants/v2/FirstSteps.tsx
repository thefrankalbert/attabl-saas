'use client';

import type { ComponentType } from 'react';
import { ArrowRight, QrCode, UtensilsCrossed, Eye, type LucideProps } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FirstStep {
  key: string;
  icon: 'menu' | 'qr' | 'dishes';
  title: string;
  hint: string;
  onClick: () => void;
}

interface FirstStepsProps {
  title: string;
  steps: FirstStep[];
  /** 1 = vertical stack (default); 3 = responsive grid for full-width layouts. */
  columns?: 1 | 3;
}

const ICONS: Record<FirstStep['icon'], ComponentType<LucideProps>> = {
  menu: Eye,
  qr: QrCode,
  dishes: UtensilsCrossed,
};

/**
 * Activation block shown when an account has no activity yet. Instead of empty
 * charts and "no orders" placeholders, it gives the owner concrete next steps.
 * Uses SaaS admin theme tokens (neutral), matching the rest of the dashboard.
 */
export function FirstSteps({ title, steps, columns = 1 }: FirstStepsProps) {
  return (
    <div>
      <div className="mb-3 text-xs font-medium tracking-[0.02em] text-[var(--cc-text-3)]">
        {title}
      </div>
      <div className={cn('flex flex-col gap-2', columns === 3 && 'sm:grid sm:grid-cols-3')}>
        {steps.map((step) => {
          const Icon = ICONS[step.icon];
          return (
            <Button
              key={step.key}
              type="button"
              variant="ghost"
              onClick={step.onClick}
              className="group flex h-auto min-h-[52px] w-full items-center justify-start gap-3 rounded-lg border border-[var(--cc-border)] bg-[var(--cc-surface)] p-2.5 text-left shadow-none transition-colors hover:bg-[var(--cc-surface-2)]"
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--cc-surface-2)] text-[var(--cc-text-2)]"
                aria-hidden
              >
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--cc-text)]">
                  {step.title}
                </span>
                <span className="block text-[11px] text-[var(--cc-text-3)]">{step.hint}</span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-[var(--cc-text-3)] transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
                aria-hidden
              />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

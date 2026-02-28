'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface OrderProgressBarProps {
  status: string;
}

const STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'served'] as const;

export default function OrderProgressBar({ status }: OrderProgressBarProps) {
  const t = useTranslations('tenant');
  const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  const stepLabels: Record<string, string> = {
    pending: t('orderSentStep'),
    confirmed: t('confirmedStep'),
    preparing: t('preparingStep'),
    ready: t('readyStep'),
    served: t('servedStep'),
  };

  return (
    <div className="flex items-center justify-between w-full py-3">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-initial">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                  isCompleted && 'bg-green-500 text-white',
                  isActive && 'text-white',
                  isFuture && 'bg-neutral-100 text-neutral-400',
                )}
                style={isActive ? { backgroundColor: 'var(--tenant-primary)' } : undefined}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : isActive ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-2.5 h-2.5 rounded-full bg-white"
                  />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-[9px] font-medium whitespace-nowrap',
                  isActive ? 'text-neutral-900' : 'text-neutral-400',
                )}
              >
                {stepLabels[step]}
              </span>
            </div>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-1.5 mt-[-14px]">
                <div
                  className={cn(
                    'h-full rounded-full transition-colors',
                    isCompleted ? 'bg-green-500' : 'bg-neutral-100',
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

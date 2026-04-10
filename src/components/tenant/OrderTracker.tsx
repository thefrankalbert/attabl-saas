'use client';

import { motion } from 'framer-motion';
import { ShoppingBag, ChefHat, Bell, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, SVGProps } from 'react';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface OrderTrackerProps {
  status: string;
  createdAt: string;
  compact?: boolean;
}

interface Step {
  key: string;
  Icon: IconComponent;
  labelKey: 'trackerReceived' | 'trackerPreparing' | 'trackerReady' | 'trackerDelivered';
}

const STEPS: Step[] = [
  { key: 'received', Icon: ShoppingBag, labelKey: 'trackerReceived' },
  { key: 'preparing', Icon: ChefHat, labelKey: 'trackerPreparing' },
  { key: 'ready', Icon: Bell, labelKey: 'trackerReady' },
  { key: 'delivered', Icon: Check, labelKey: 'trackerDelivered' },
];

// Map order status to the current active step index.
// pending / confirmed -> 0 (Recu)
// preparing -> 1 (Preparation)
// ready -> 2 (Pret)
// delivered / served -> 3 (Livre/Servi)
export function statusToStepIndex(status: string): number {
  switch (status) {
    case 'pending':
    case 'confirmed':
      return 0;
    case 'preparing':
      return 1;
    case 'ready':
      return 2;
    case 'delivered':
    case 'served':
      return 3;
    default:
      return 0;
  }
}

export default function OrderTracker({ status, compact = false }: OrderTrackerProps) {
  const t = useTranslations('tenant');
  const currentIndex = statusToStepIndex(status);
  const circleSize = compact ? 28 : 40;
  const iconSize = compact ? 14 : 18;

  return (
    <div className="w-full" role="group" aria-label={t('trackerAriaLabel')}>
      <div className="relative flex items-start justify-between">
        {STEPS.map((step, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex && status !== 'cancelled';
          const nextDone = index < currentIndex;

          // Current step keeps accent green; past steps go neutral gray;
          // future steps stay light.
          const circleBg = isCurrent ? '#1A1A1A' : isPast ? '#B0B0B0' : '#F6F6F6';
          const iconColor = isCurrent || isPast ? '#FFFFFF' : '#B0B0B0';
          const labelColor = isCurrent ? '#1A1A1A' : isPast ? '#737373' : '#B0B0B0';

          const Icon = step.Icon;

          return (
            <div
              key={step.key}
              className="relative flex flex-col items-center"
              style={{ flex: 1, minWidth: 0 }}
            >
              {/* Connector line to next step (drawn from this step's right edge) */}
              {index < STEPS.length - 1 && (
                <div
                  className="absolute"
                  style={{
                    top: circleSize / 2 - 1,
                    left: `calc(50% + ${circleSize / 2}px)`,
                    right: `calc(-50% + ${circleSize / 2}px)`,
                    height: 2,
                    backgroundColor: nextDone ? '#B0B0B0' : '#EEEEEE',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Circle */}
              <div
                className="relative z-10 rounded-full flex items-center justify-center"
                style={{
                  width: circleSize,
                  height: circleSize,
                  backgroundColor: circleBg,
                  transition: 'background-color 200ms ease',
                }}
              >
                {isCurrent && status !== 'cancelled' && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: '#1A1A1A', opacity: 0.35 }}
                    animate={{ scale: [1, 1.35, 1], opacity: [0.35, 0, 0.35] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <Icon width={iconSize} height={iconSize} color={iconColor} strokeWidth={2.25} />
              </div>

              {/* Label */}
              {!compact && (
                <span
                  className="mt-2 text-center whitespace-nowrap"
                  style={{
                    fontSize: '11px',
                    lineHeight: '15px',
                    fontWeight: 500,
                    color: labelColor,
                  }}
                >
                  {t(step.labelKey)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

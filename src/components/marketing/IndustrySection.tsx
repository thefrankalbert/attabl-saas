'use client';

import { Globe, Shield, ShoppingBag, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';

interface CounterData {
  target: number;
  prefix: string;
  suffix: string;
  label: string;
  icon: LucideIcon;
  decimals: number;
}

const counters: CounterData[] = [
  {
    target: 2400,
    prefix: '+',
    suffix: '',
    label: 'commerces accompagnes',
    icon: Store,
    decimals: 0,
  },
  {
    target: 12,
    prefix: '',
    suffix: '',
    label: 'pays couverts en Afrique',
    icon: Globe,
    decimals: 0,
  },
  {
    target: 98.7,
    prefix: '',
    suffix: '%',
    label: 'de disponibilite plateforme',
    icon: Shield,
    decimals: 1,
  },
  {
    target: 1.2,
    prefix: '+',
    suffix: 'M',
    label: 'de commandes traitees',
    icon: ShoppingBag,
    decimals: 1,
  },
];

export default function IndustrySection() {
  return (
    <section
      className="relative overflow-hidden bg-[#0C1117] py-16 sm:py-20 lg:py-24"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }}
    >
      {/* Gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0C1117] via-transparent to-[#0C1117]" />

      <div className="relative">
        <BlurFade delay={0} inView>
          <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
            ATTABL en chiffres
          </h2>
          <p className="mx-auto mb-10 max-w-md text-center text-neutral-400 sm:mb-16">
            Des resultats concrets pour les commerces africains.
          </p>
        </BlurFade>
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
          {counters.map((counter, idx) => {
            const Icon = counter.icon;
            return (
              <BlurFade key={counter.label} delay={idx * 0.15} inView>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center sm:p-8">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#CCFF00]/10">
                    <Icon className="h-5 w-5 text-[#CCFF00]" />
                  </div>
                  <p className="font-[family-name:var(--font-sora)] text-3xl font-bold tabular-nums text-white sm:text-5xl lg:text-6xl">
                    <span className="drop-shadow-[0_0_20px_rgba(204,255,0,0.15)]">
                      {counter.prefix}
                      <NumberTicker
                        value={counter.target}
                        delay={0.3 + idx * 0.2}
                        decimalPlaces={counter.decimals}
                        className="text-white"
                      />
                      {counter.suffix}
                    </span>
                  </p>
                  <p className="mt-3 text-sm text-gray-400">{counter.label}</p>
                </div>
              </BlurFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}

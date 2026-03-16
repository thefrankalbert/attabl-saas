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
    <section className="bg-app-card py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <BlurFade delay={0} inView>
          <h2 className="mb-12 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-app-text sm:mb-16 sm:text-4xl">
            ATTABL en chiffres
          </h2>
        </BlurFade>

        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
          {counters.map((counter, idx) => {
            const Icon = counter.icon;
            return (
              <BlurFade key={counter.label} delay={idx * 0.15} inView>
                <div className="rounded-xl border border-app-border bg-app-elevated p-6 text-center">
                  <Icon className="mx-auto mb-3 h-8 w-8 text-accent" />
                  <p className="text-4xl font-bold tabular-nums text-app-text sm:text-5xl">
                    {counter.prefix}
                    <NumberTicker
                      value={counter.target}
                      delay={0.3 + idx * 0.2}
                      decimalPlaces={counter.decimals}
                      className="text-4xl font-bold tabular-nums text-app-text sm:text-5xl"
                    />
                    {counter.suffix}
                  </p>
                  <p className="mt-2 text-xs text-app-text-muted sm:text-sm">{counter.label}</p>
                </div>
              </BlurFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}

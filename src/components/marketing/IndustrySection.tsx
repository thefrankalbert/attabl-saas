'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { Globe, Shield, ShoppingBag, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
    label: 'commerces accompagn\u00e9s',
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
    label: 'de disponibilit\u00e9 plateforme',
    icon: Shield,
    decimals: 1,
  },
  {
    target: 1.2,
    prefix: '+',
    suffix: 'M',
    label: 'de commandes trait\u00e9es',
    icon: ShoppingBag,
    decimals: 1,
  },
];

function useCountUp(
  target: number,
  decimals: number,
  duration: number,
  delay: number,
  inView: boolean,
): string {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const timeout = setTimeout(() => {
      const start = performance.now();
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setValue(eased * target);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timeout);
  }, [inView, target, duration, delay]);

  return decimals > 0 ? value.toFixed(decimals) : Math.floor(value).toLocaleString('fr-FR');
}

export default function IndustrySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  return (
    <section ref={sectionRef} className="bg-[#1A1A2E] py-24">
      <h2 className="mb-16 text-center text-3xl font-bold text-white sm:text-4xl">
        ATTABL en chiffres
      </h2>
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 lg:grid-cols-4">
        {counters.map((counter, idx) => (
          <CounterItem key={counter.label} counter={counter} index={idx} inView={isInView} />
        ))}
      </div>
    </section>
  );
}

function CounterItem({
  counter,
  index,
  inView,
}: {
  counter: CounterData;
  index: number;
  inView: boolean;
}) {
  const displayValue = useCountUp(counter.target, counter.decimals, 2000, index * 200, inView);
  const Icon = counter.icon;

  return (
    <div className="text-center">
      <Icon className="mx-auto mb-4 h-8 w-8 text-[#CCFF00]" />
      <p className="text-4xl font-bold tabular-nums text-white sm:text-5xl">
        {counter.prefix}
        {displayValue}
        {counter.suffix}
      </p>
      <p className="mt-2 text-sm text-gray-400">{counter.label}</p>
    </div>
  );
}

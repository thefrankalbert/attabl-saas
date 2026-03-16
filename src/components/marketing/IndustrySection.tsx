'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.15 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center sm:p-8"
    >
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#CCFF00]/10">
        <Icon className="h-5 w-5 text-[#CCFF00]" />
      </div>
      <p className="font-[family-name:var(--font-sora)] text-5xl font-bold tabular-nums text-white lg:text-6xl">
        <span className="drop-shadow-[0_0_20px_rgba(204,255,0,0.15)]">
          {counter.prefix}
          {displayValue}
          {counter.suffix}
        </span>
      </p>
      <p className="mt-3 text-sm text-gray-400">{counter.label}</p>
    </motion.div>
  );
}

export default function IndustrySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[#0C1117] py-24"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }}
    >
      {/* Gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0C1117] via-transparent to-[#0C1117]" />

      <div className="relative">
        <h2 className="mb-4 text-center text-3xl font-bold text-white font-[family-name:var(--font-sora)] sm:text-4xl">
          ATTABL en chiffres
        </h2>
        <p className="mx-auto mb-16 max-w-md text-center text-neutral-400">
          Des resultats concrets pour les commerces africains.
        </p>
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
          {counters.map((counter, idx) => (
            <CounterItem key={counter.label} counter={counter} index={idx} inView={isInView} />
          ))}
        </div>
      </div>
    </section>
  );
}

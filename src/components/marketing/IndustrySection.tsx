'use client';

import { useEffect, useRef, useState } from 'react';
import { Store, Globe, Shield, ShoppingBag } from 'lucide-react';

const counters = [
  { target: 2400, prefix: '+', suffix: '', label: 'établissements accompagnés', Icon: Store },
  { target: 5, prefix: '', suffix: '', label: 'pays couverts', Icon: Globe },
  { target: 98.7, prefix: '', suffix: '%', label: 'de disponibilité', Icon: Shield },
  { target: 1.2, prefix: '+', suffix: 'M', label: 'de commandes traitées', Icon: ShoppingBag },
];

function formatNumber(value: number, target: number, suffix: string): string {
  if (suffix === 'M' || suffix === '%') {
    return value.toFixed(1);
  }
  return Math.round(value).toLocaleString('fr-FR');
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default function IndustrySection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [values, setValues] = useState<number[]>(counters.map(() => 0));

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasAnimated]);

  useEffect(() => {
    if (!hasAnimated) return;

    const duration = 2000;
    const stagger = 200;

    counters.forEach((counter, index) => {
      const delay = index * stagger;
      const startTime = performance.now() + delay;

      function animate(now: number) {
        const elapsed = now - startTime;
        if (elapsed < 0) {
          requestAnimationFrame(animate);
          return;
        }

        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);
        const currentValue = easedProgress * counter.target;

        setValues((prev) => {
          const next = [...prev];
          next[index] = currentValue;
          return next;
        });

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      }

      requestAnimationFrame(animate);
    });
  }, [hasAnimated]);

  return (
    <section ref={sectionRef} className="bg-neutral-950 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-10 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
          Chaque service compte. Chaque détail aussi.
        </h2>
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 lg:grid-cols-4">
          {counters.map((counter, i) => {
            const Icon = counter.Icon;
            return (
              <div key={counter.label} className="text-center">
                <Icon className="mx-auto mb-3 h-8 w-8 text-[#CCFF00]" />
                <p className="tabular-nums text-4xl font-bold text-white sm:text-5xl">
                  {counter.prefix}
                  {formatNumber(values[i], counter.target, counter.suffix)}
                  {counter.suffix}
                </p>
                <p className="mt-2 text-sm text-white/50">{counter.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

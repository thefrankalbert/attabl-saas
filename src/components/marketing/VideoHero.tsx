'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  UtensilsCrossed,
  Store,
  Scissors,
  Hotel,
  TrendingUp,
  ShoppingBag,
  BarChart3,
  Zap,
  Globe,
  Coins,
  Cloud,
} from 'lucide-react';
import { Particles } from '@/components/ui/particles';
import { BlurFade } from '@/components/ui/blur-fade';
import { BorderBeam } from '@/components/ui/border-beam';
import { NumberTicker } from '@/components/ui/number-ticker';
import { WordRotate } from '@/components/ui/word-rotate';

type Segment = 'restaurant' | 'boutique' | 'salon' | 'hotel';

const segments: { key: Segment; label: string; icon: React.ElementType }[] = [
  { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
  { key: 'boutique', label: 'Boutique', icon: Store },
  { key: 'salon', label: 'Salon', icon: Scissors },
  { key: 'hotel', label: 'H\u00f4tel', icon: Hotel },
];

const dashboardKPIs: Record<
  Segment,
  {
    label1: string;
    val1: string;
    label2: string;
    val2: string;
    label3: string;
    val3: string;
    label4: string;
    val4: string;
  }
> = {
  restaurant: {
    label1: 'Revenu',
    val1: '2 450 000 F',
    label2: 'Commandes',
    val2: '152',
    label3: 'Clients',
    val3: '1 243',
    label4: 'Panier moy.',
    val4: '13 100 F',
  },
  boutique: {
    label1: 'Revenu',
    val1: '1 870 000 F',
    label2: 'Ventes',
    val2: '89',
    label3: 'Clients',
    val3: '2 891',
    label4: 'Panier moy.',
    val4: '5 990 F',
  },
  salon: {
    label1: 'Revenu',
    val1: '980 000 F',
    label2: 'RDV',
    val2: '94',
    label3: 'Clients',
    val3: '421',
    label4: 'Panier moy.',
    val4: '10 400 F',
  },
  hotel: {
    label1: 'Revenu',
    val1: '5 120 000 F',
    label2: 'R\u00e9servations',
    val2: '63',
    label3: 'Clients',
    val3: '189',
    label4: 'Panier moy.',
    val4: '81 300 F',
  },
};

const dashboardBars: Record<Segment, number[]> = {
  restaurant: [60, 45, 80, 55, 95, 70, 50],
  boutique: [70, 88, 55, 92, 60, 75, 40],
  salon: [45, 78, 65, 82, 50, 60, 70],
  hotel: [92, 55, 78, 40, 88, 65, 72],
};

const tableRows: Record<Segment, { name: string; color: string; value: string }[]> = {
  restaurant: [
    { name: 'Poulet brais\u00e9', color: 'bg-accent', value: '24 500 F' },
    { name: 'Ndol\u00e9 complet', color: 'bg-accent-400', value: '18 200 F' },
    { name: 'Poisson grill\u00e9', color: 'bg-accent-600', value: '31 800 F' },
  ],
  boutique: [
    { name: 'Robe wax', color: 'bg-accent', value: '15 000 F' },
    { name: 'Sac en cuir', color: 'bg-accent-400', value: '22 500 F' },
    { name: 'Bijoux argent', color: 'bg-accent-600', value: '8 900 F' },
  ],
  salon: [
    { name: 'Coupe homme', color: 'bg-accent', value: '3 500 F' },
    { name: 'Tresses', color: 'bg-accent-400', value: '12 000 F' },
    { name: 'Soin cheveux', color: 'bg-accent-600', value: '8 000 F' },
  ],
  hotel: [
    { name: 'Suite junior', color: 'bg-accent', value: '85 000 F' },
    { name: 'Chambre double', color: 'bg-accent-400', value: '45 000 F' },
    { name: 'Petit-d\u00e9jeuner', color: 'bg-accent-600', value: '12 500 F' },
  ],
};

const stats = [
  { numValue: 2400, prefix: '+', suffix: '', label: 'commerces', icon: Store, delay: 0.5 },
  { numValue: 12, prefix: '', suffix: '', label: 'pays', icon: Globe, delay: 0.7 },
  { numValue: 3, prefix: '', suffix: '', label: 'devises', icon: Coins, delay: 0.9 },
  { numValue: 100, prefix: '', suffix: '%', label: 'cloud', icon: Cloud, delay: 1.1 },
];

export default function VideoHero() {
  const [activeSegment, setActiveSegment] = useState<Segment>('restaurant');
  const kpis = dashboardKPIs[activeSegment];
  const bars = dashboardBars[activeSegment];
  const rows = tableRows[activeSegment];

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-app-bg">
      {/* Particles background */}
      <Particles className="absolute inset-0" quantity={40} color="#4ade80" size={0.5} />

      {/* Main content */}
      <div className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            {/* Left column — text */}
            <BlurFade delay={0.1} inView>
              <div>
                {/* Badge */}
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-app-border px-3 py-1">
                  <Zap className="h-3 w-3 text-accent" />
                  <span className="text-xs text-app-text-muted">
                    Plateforme commerce pour l&apos;Afrique
                  </span>
                </div>

                {/* Title */}
                <h1 className="font-[family-name:var(--font-sora)] text-4xl font-extrabold leading-[1.1] tracking-tight text-app-text sm:text-5xl lg:text-6xl">
                  <span className="block">La plateforme pour</span>
                  <WordRotate
                    words={['lancer', 'g\u00e9rer', 'd\u00e9velopper']}
                    className="text-accent"
                  />
                  <span className="block">votre commerce</span>
                </h1>

                {/* Subtitle */}
                <p className="mt-6 max-w-md text-base leading-relaxed text-app-text-secondary sm:text-lg">
                  Tout-en-un pour les entrepreneurs africains. Menu digital, stock, POS, analytics.
                </p>

                {/* Segment pills */}
                <div className="mt-8 flex flex-wrap gap-2">
                  {segments.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setActiveSegment(key)}
                      className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm transition-all ${
                        activeSegment === key
                          ? 'bg-accent font-semibold text-accent-text shadow-sm'
                          : 'border border-app-border text-app-text-muted hover:border-app-border-hover hover:text-app-text-secondary'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-8">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-xl bg-accent px-8 py-4 font-bold text-accent-text shadow-sm transition-colors hover:bg-accent-hover"
                  >
                    D\u00e9marrer gratuitement
                  </Link>
                </div>
              </div>
            </BlurFade>

            {/* Right column — fake dashboard */}
            <BlurFade delay={0.3} inView>
              <div className="relative overflow-hidden rounded-xl border border-app-border bg-app-card p-4 sm:p-6">
                <BorderBeam size={200} duration={10} colorFrom="#4ade80" colorTo="#a78bfa" />

                {/* Top bar */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                    <span className="text-[10px] text-app-text-muted">
                      {segments.find((s) => s.key === activeSegment)?.label} &mdash; Tableau de bord
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-app-hover" />
                    <div className="h-2 w-2 rounded-full bg-app-hover" />
                    <div className="h-2 w-2 rounded-full bg-app-hover" />
                  </div>
                </div>

                {/* KPI cards */}
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: kpis.label1, value: kpis.val1, icon: TrendingUp },
                    { label: kpis.label2, value: kpis.val2, icon: ShoppingBag },
                    { label: kpis.label3, value: kpis.val3, icon: BarChart3 },
                    { label: kpis.label4, value: kpis.val4, icon: BarChart3 },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-lg bg-app-elevated p-3">
                      <p className="text-lg font-bold tabular-nums text-app-text">{kpi.value}</p>
                      <p className="mt-0.5 text-[10px] text-app-text-muted">{kpi.label}</p>
                    </div>
                  ))}
                </div>

                {/* Chart area */}
                <div className="mb-3 rounded-lg bg-app-elevated p-3">
                  <div className="flex h-20 items-end gap-1">
                    {bars.map((height, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${i === 4 ? 'bg-accent' : 'bg-app-hover'}`}
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Table area */}
                <div className="rounded-lg bg-app-elevated p-3">
                  {rows.map((row, i) => (
                    <div
                      key={row.name}
                      className={`flex items-center justify-between py-2 ${
                        i < rows.length - 1 ? 'border-b border-app-border' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full ${row.color}`} />
                        <span className="text-xs text-app-text-secondary">{row.name}</span>
                      </div>
                      <span className="text-xs font-medium tabular-nums text-app-text">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </BlurFade>
          </div>
        </div>
      </div>

      {/* Stats banner */}
      <div className="mt-auto border-t border-app-border">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`px-4 py-6 text-center sm:px-6 ${
                i < stats.length - 1 ? 'border-r border-app-border' : ''
              }`}
            >
              <stat.icon className="mx-auto mb-2 h-4 w-4 text-accent" />
              <p className="text-xl font-bold text-app-text sm:text-2xl">
                {stat.prefix}
                <NumberTicker
                  value={stat.numValue}
                  delay={stat.delay}
                  className="text-xl font-bold text-app-text sm:text-2xl"
                />
                {stat.suffix}
              </p>
              <p className="mt-1 text-[11px] text-app-text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

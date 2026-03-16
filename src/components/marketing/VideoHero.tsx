'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UtensilsCrossed,
  Store,
  Scissors,
  Hotel,
  Globe,
  Coins,
  Cloud,
  TrendingUp,
  ShoppingBag,
  Users,
  BarChart3,
} from 'lucide-react';

type Segment = 'restaurant' | 'boutique' | 'salon' | 'hotel';

const segments: { key: Segment; label: string; icon: React.ElementType }[] = [
  { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
  { key: 'boutique', label: 'Boutique', icon: Store },
  { key: 'salon', label: 'Salon', icon: Scissors },
  { key: 'hotel', label: 'Hôtel', icon: Hotel },
];

const dashboardKPIs: Record<
  Segment,
  { revenue: string; orders: string; clients: string; avg: string }
> = {
  restaurant: { revenue: '2 450 000', orders: '187', clients: '1 243', avg: '13 100' },
  boutique: { revenue: '1 870 000', orders: '312', clients: '2 891', avg: '5 990' },
  salon: { revenue: '980 000', orders: '94', clients: '421', avg: '10 400' },
  hotel: { revenue: '5 120 000', orders: '63', clients: '189', avg: '81 300' },
};

const dashboardBars: Record<Segment, number[]> = {
  restaurant: [85, 62, 94, 48, 71],
  boutique: [70, 88, 55, 92, 60],
  salon: [45, 78, 65, 82, 50],
  hotel: [92, 55, 78, 40, 88],
};

const stats = [
  { value: '+2 400', label: 'commerces actifs', icon: Store },
  { value: '12', label: 'pays', icon: Globe },
  { value: '3', label: 'devises', icon: Coins },
  { value: '100%', label: 'cloud', icon: Cloud },
];

export default function VideoHero() {
  const [activeSegment, setActiveSegment] = useState<Segment>('restaurant');

  return (
    <section className="relative min-h-screen w-full bg-[#0A0A0F] overflow-hidden">
      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* Radial glow behind title */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 30% 50%, rgba(204,255,0,0.06) 0%, transparent 60%)',
        }}
      />

      {/* Hero grid */}
      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pt-32">
        {/* Left column — text */}
        <div className="text-center lg:text-left">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="font-[family-name:var(--font-sora)] text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            <span className="block lg:inline">Lancez</span>
            <span className="text-[#CCFF00]">.</span> <span className="block lg:inline">Gérez</span>
            <span className="text-[#CCFF00]">.</span>{' '}
            <span className="block lg:inline">Grandissez</span>
            <span className="text-[#CCFF00]">.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mx-auto mt-8 max-w-md text-base leading-relaxed text-white/50 sm:text-lg lg:mx-0"
          >
            La plateforme commerce tout-en-un qui accompagne les entrepreneurs africains de
            l&apos;idée au succès.
          </motion.p>

          {/* Segment pills */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start"
          >
            {segments.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveSegment(key)}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm backdrop-blur-sm transition-all duration-300 ${
                  activeSegment === key
                    ? 'bg-[#CCFF00] font-semibold text-[#0A0A0F] shadow-[0_0_20px_rgba(204,255,0,0.3)]'
                    : 'border border-white/10 text-white/60 hover:border-white/25 hover:text-white/80'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-10 flex justify-center lg:justify-start"
          >
            <Link
              href="/signup"
              className="rounded-full bg-[#CCFF00] px-8 py-4 font-bold text-[#0A0A0F] shadow-[0_0_30px_rgba(204,255,0,0.2)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(204,255,0,0.3)]"
            >
              Démarrer gratuitement
            </Link>
          </motion.div>
        </div>

        {/* Right column — fake dashboard */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="relative"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSegment}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 backdrop-blur"
            >
              {/* Dashboard header */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#CCFF00]" />
                  <span className="text-xs font-medium text-white/40">
                    {segments.find((s) => s.key === activeSegment)?.label} — Tableau de bord
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>
              </div>

              {/* KPI row */}
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: 'Revenu',
                    value: dashboardKPIs[activeSegment].revenue,
                    icon: TrendingUp,
                    suffix: ' F',
                  },
                  {
                    label: 'Commandes',
                    value: dashboardKPIs[activeSegment].orders,
                    icon: ShoppingBag,
                  },
                  { label: 'Clients', value: dashboardKPIs[activeSegment].clients, icon: Users },
                  {
                    label: 'Panier moy.',
                    value: dashboardKPIs[activeSegment].avg,
                    icon: BarChart3,
                    suffix: ' F',
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <kpi.icon className="h-3 w-3 text-white/20" />
                      <span className="text-[10px] text-white/30">{kpi.label}</span>
                    </div>
                    <p className="text-sm font-semibold text-white/80">
                      {kpi.value}
                      {kpi.suffix && <span className="text-white/30">{kpi.suffix}</span>}
                    </p>
                  </div>
                ))}
              </div>

              {/* Chart — horizontal bars */}
              <div className="mb-6 rounded-lg border border-white/[0.04] bg-white/[0.02] p-4">
                <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/25">
                  Ventes par jour
                </p>
                <div className="space-y-2">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'].map((day, i) => (
                    <div key={day} className="flex items-center gap-3">
                      <span className="w-7 text-[10px] text-white/25">{day}</span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${dashboardBars[activeSegment][i]}%` }}
                          transition={{ duration: 0.6, delay: i * 0.08 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            i === 2 ? 'bg-[#CCFF00]' : 'bg-[#CCFF00]/20'
                          }`}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] text-white/20">
                        {dashboardBars[activeSegment][i]}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Table rows */}
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4">
                <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/25">
                  Commandes récentes
                </p>
                <div className="space-y-2">
                  {[
                    { id: '#1247', status: 'Complétée', amount: '24 500 F' },
                    { id: '#1246', status: 'En cours', amount: '18 200 F' },
                    { id: '#1245', status: 'Complétée', amount: '31 800 F' },
                  ].map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between border-b border-white/[0.03] pb-2 last:border-0 last:pb-0"
                    >
                      <span className="text-xs font-mono text-white/40">{row.id}</span>
                      <span
                        className={`text-[10px] ${
                          row.status === 'En cours' ? 'text-[#CCFF00]/60' : 'text-white/25'
                        }`}
                      >
                        {row.status}
                      </span>
                      <span className="text-xs text-white/50">{row.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Stats banner */}
      <div className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`px-6 py-8 text-center ${
                i < stats.length - 1 ? 'border-r border-white/[0.06]' : ''
              }`}
            >
              <stat.icon className="mx-auto mb-2 h-4 w-4 text-[#CCFF00]/60" />
              <p className="text-2xl font-bold text-white sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs text-white/40 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

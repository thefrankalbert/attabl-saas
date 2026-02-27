'use client';

import { motion } from 'framer-motion';
import { TestimonialCarousel } from './TestimonialCarousel';
import { TrendingUp } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const stats = [
  { value: '+500', label: 'Restaurants' },
  { value: '99.9%', label: 'Disponibilité' },
  { value: '< 2 min', label: 'Mise en route' },
];

const mockOrders = [
  {
    table: 'Table 4',
    item: 'Entrecôte + 2 vins',
    status: 'En cours',
    time: '2m',
    statusClass: 'bg-amber-400/20 text-amber-300',
  },
  {
    table: 'Table 7',
    item: 'Menu du jour ×3',
    status: 'Servi',
    time: '8m',
    statusClass: 'bg-emerald-400/20 text-emerald-300',
  },
  {
    table: 'Bar',
    item: 'Cocktail Maison ×2',
    status: 'Préparation',
    time: '1m',
    statusClass: 'bg-blue-400/20 text-blue-300',
  },
];

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* ── Left — Form panel ─────────────────────────────── */}
      <div className="w-full md:w-[55%] flex items-center justify-center bg-white px-4 sm:px-8 md:px-12 lg:px-20 py-10 overflow-y-auto">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>

      {/* ── Right — Showcase panel ────────────────────────── */}
      <div className="hidden md:flex md:w-[45%] items-center py-6 pr-3 md:pr-6 pl-1.5 md:pl-3">
        <div className="relative flex flex-col w-full h-full overflow-hidden rounded-[2rem] bg-[#0C0C0C]">
          {/* Decorative dot grid */}
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col h-full px-8 lg:px-12 py-10 justify-between">
            {/* ── Top: Headline block ────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 bg-[#CCFF00]/10 border border-[#CCFF00]/20 rounded-full px-3 py-1 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]" />
                </span>
                <span className="text-[#CCFF00] text-xs font-medium tracking-wide">
                  Commandes en direct
                </span>
              </div>

              <h2
                className="text-3xl lg:text-[2.2rem] text-white leading-[1.18] mb-3 font-normal"
                style={{ fontFamily: 'var(--font-dm-serif-display)' }}
              >
                La plateforme préférée
                <br />
                <span className="text-[#CCFF00]">des restaurateurs.</span>
              </h2>
              <p className="text-white/40 text-sm leading-relaxed max-w-xs">
                Menu QR, commandes en temps réel, analytics — tout depuis un seul tableau de bord.
              </p>
            </motion.div>

            {/* ── Middle: Dashboard mockup ───────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
              className="my-6"
            >
              <div className="bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
                {/* Browser chrome bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] bg-white/[0.03]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/5 rounded-md px-2.5 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    <span className="text-white/30 text-[11px] font-mono">attabl.io/admin</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    <span className="text-emerald-400 text-[11px] font-medium">Live</span>
                  </div>
                </div>

                {/* Revenue stat header */}
                <div className="px-5 pt-5 pb-4 flex items-start justify-between">
                  <div>
                    <div className="text-white/40 text-xs mb-1 uppercase tracking-wider">
                      Chiffre du jour
                    </div>
                    <div className="text-[#CCFF00] text-3xl font-bold tracking-tight">€ 2 847</div>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 text-xs bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1.5 rounded-full mt-1">
                    <TrendingUp className="w-3 h-3" />
                    <span className="font-medium">+18% vs hier</span>
                  </div>
                </div>

                {/* Thin chart bars (decorative) */}
                <div className="px-5 pb-4 flex items-end gap-1 h-10">
                  {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.6 + i * 0.04, duration: 0.4, ease: 'easeOut' }}
                      style={{
                        height: `${h}%`,
                        originY: 1,
                        opacity: i === 11 ? 1 : 0.25 + (i / 11) * 0.4,
                      }}
                      className="flex-1 bg-[#CCFF00] rounded-sm min-w-0"
                    />
                  ))}
                </div>

                {/* Divider */}
                <div className="mx-5 border-t border-white/[0.07]" />

                {/* Order rows */}
                <div className="px-4 py-3 space-y-1.5">
                  {mockOrders.map((order, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.55 + i * 0.13, duration: 0.4, ease: 'easeOut' }}
                      className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.05] rounded-xl px-3 py-2.5 transition-colors"
                    >
                      <div className="text-white/60 text-xs font-semibold w-14 shrink-0">
                        {order.table}
                      </div>
                      <div className="text-white/35 text-xs flex-1 truncate">{order.item}</div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${order.statusClass}`}
                      >
                        {order.status}
                      </span>
                      <span className="text-white/20 text-[10px] shrink-0 w-6 text-right">
                        {order.time}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ── Bottom: Stats + Testimonial ───────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.8 }}
              className="space-y-6"
            >
              {/* Stats row */}
              <div className="flex items-center gap-4 border-t border-white/[0.08] pt-6">
                {stats.map((stat, i) => (
                  <div key={stat.label} className="flex-1 text-center">
                    <div className="text-lg font-bold text-[#CCFF00]">{stat.value}</div>
                    <div className="text-[11px] text-white/30 mt-0.5 leading-tight">
                      {stat.label}
                    </div>
                    {i < stats.length - 1 && (
                      <div className="absolute hidden" /> /* spacer handled by flex gap */
                    )}
                  </div>
                ))}
              </div>

              {/* Testimonial carousel */}
              <TestimonialCarousel />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

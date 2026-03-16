'use client';

import { motion } from 'framer-motion';
import { TestimonialCarousel } from './TestimonialCarousel';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-dvh md:h-dvh w-full flex bg-app-bg relative">
      {/* Theme toggle — top-right corner */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* ── Left — Form panel ─────────────────────────────── */}
      <div className="w-full md:w-[55%] lg:w-[50%] flex flex-col px-4 sm:px-8 md:px-10 lg:px-20 py-6 sm:py-10 md:overflow-y-auto">
        <div className="w-full max-w-md m-auto">{children}</div>
      </div>

      {/* ── Right — Showcase panel ────────────────────────── */}
      <div className="hidden md:flex md:w-[45%] lg:w-[50%] items-center py-4 pr-4 md:pr-5 pl-0">
        <div className="relative flex flex-col w-full h-full overflow-hidden rounded-[1.5rem] bg-app-card border border-app-border">
          {/* Subtle accent glow top */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

          {/* Content */}
          <div className="relative z-10 flex flex-col h-full px-6 lg:px-8 py-6 lg:py-8 justify-between overflow-y-auto scrollbar-hide">
            {/* ── Top: Impact headline ────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="shrink-0 text-center mb-6"
            >
              <h2 className="text-[1.5rem] lg:text-[1.75rem] text-app-text leading-[1.2] mb-3 font-bold">
                Vos clients vivent une
                <br />
                <span className="text-accent">expérience 5 étoiles.</span>
                <br />
                <span className="text-app-text-secondary">Votre gestion aussi.</span>
              </h2>
            </motion.div>

            {/* ── Impact numbers ──────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
              className="shrink-0 mb-6"
            >
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: '+35%', label: 'de commandes', sub: 'en moyenne' },
                  { value: '-50%', label: "d'erreurs", sub: 'en salle' },
                  { value: '10 min', label: 'pour lancer', sub: 'votre menu' },
                ].map((stat) => (
                  <div
                    key={stat.value}
                    className="text-center p-3 rounded-xl bg-app-elevated/50 border border-app-border"
                  >
                    <div className="text-lg lg:text-xl font-black text-accent tabular-nums leading-none mb-1">
                      {stat.value}
                    </div>
                    <div className="text-[10px] font-medium text-app-text-secondary leading-tight">
                      {stat.label}
                    </div>
                    <div className="text-[9px] text-app-text-muted leading-tight">{stat.sub}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Dashboard preview (compact, contextual) ─── */}
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
              className="shrink-0 mb-6"
            >
              <div className="bg-app-elevated/40 border border-app-border rounded-xl overflow-hidden">
                {/* Revenue header */}
                <div className="px-4 pt-3 pb-2 flex items-start justify-between">
                  <div>
                    <div className="text-[8px] text-app-text-muted uppercase tracking-widest font-medium mb-0.5">
                      Chiffre du jour
                    </div>
                    <div className="text-base font-black text-app-text tabular-nums">
                      1 847 000{' '}
                      <span className="text-[10px] font-semibold text-app-text-muted">FCFA</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-status-success text-[9px] bg-app-status-success-bg border border-status-success/20 px-1.5 py-0.5 rounded-full">
                    <span className="font-bold">+18%</span>
                  </div>
                </div>

                {/* Sparkline */}
                <div className="px-4 pb-2">
                  <svg viewBox="0 0 280 32" className="w-full h-6" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="login-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4ade80" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <motion.path
                      d="M 0 26 L 40 22 L 80 18 L 120 24 L 160 14 L 200 10 L 240 12 L 280 4"
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.6, duration: 1, ease: 'easeOut' }}
                    />
                    <path
                      d="M 0 26 L 40 22 L 80 18 L 120 24 L 160 14 L 200 10 L 240 12 L 280 4 L 280 32 L 0 32 Z"
                      fill="url(#login-grad)"
                    />
                  </svg>
                </div>

                {/* Divider */}
                <div className="mx-4 border-t border-app-border" />

                {/* Live orders */}
                <div className="px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between px-1 mb-0.5">
                    <span className="text-[8px] font-semibold text-app-text-muted uppercase tracking-widest">
                      Commandes récentes
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-status-success" />
                      </span>
                      <span className="text-[8px] text-status-success font-medium">Live</span>
                    </div>
                  </div>
                  {[
                    {
                      table: 'Table 4',
                      total: '32 500 FCFA',
                      status: 'En cours',
                      cls: 'bg-app-status-warning-bg text-status-warning',
                    },
                    {
                      table: 'Table 7',
                      total: '78 000 FCFA',
                      status: 'Servi',
                      cls: 'bg-app-status-success-bg text-status-success',
                    },
                  ].map((order, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-app-hover/40 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-[10px] font-semibold text-app-text-secondary w-12 shrink-0">
                        {order.table}
                      </span>
                      <span className="text-[9px] text-app-text-muted tabular-nums flex-1">
                        {order.total}
                      </span>
                      <span
                        className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${order.cls}`}
                      >
                        {order.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ── Bottom: Testimonials ───────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.7 }}
              className="shrink-0"
            >
              <TestimonialCarousel />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

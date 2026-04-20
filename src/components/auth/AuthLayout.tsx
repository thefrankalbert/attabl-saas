import { TestimonialCarousel } from './TestimonialCarousel';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="h-full w-full flex bg-white dark:bg-neutral-950 relative">
      {/* ── Left - Form panel ─────────────────────────────── */}
      <div className="w-full md:w-[55%] lg:w-[50%] flex flex-col px-6 sm:px-10 lg:px-16 py-8 md:overflow-y-auto">
        <div className="w-full max-w-md m-auto">{children}</div>
      </div>

      {/* ── Right - Showcase panel ────────────────────────── */}
      <div className="hidden md:flex md:w-[45%] lg:w-[50%] items-center p-4 md:p-5">
        <div className="w-full h-full rounded-2xl bg-neutral-950 flex flex-col justify-between p-8 lg:p-10 overflow-hidden">
          {/* ── Top: Impact headline ────────────────────── */}
          <div className="shrink-0 mb-8">
            <h2 className="text-2xl lg:text-3xl font-bold leading-tight font-[family-name:var(--font-sora)]">
              <span className="text-white">Vos clients vivent une</span>
              <br />
              <span className="text-[#CCFF00]">expérience 5 étoiles.</span>
              <br />
              <span className="text-neutral-400">Votre gestion aussi.</span>
            </h2>
          </div>

          {/* ── Impact numbers ──────────────────────────── */}
          <div className="shrink-0 mb-8">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: '+35%', label: 'de commandes' },
                { value: '-50%', label: "d'erreurs" },
                { value: '10 min', label: 'pour lancer' },
              ].map((stat) => (
                <div
                  key={stat.value}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 text-center"
                >
                  <div className="text-lg font-black text-[#CCFF00] tabular-nums leading-none mb-1">
                    {stat.value}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Dashboard mini preview ─────────────────── */}
          <div className="shrink-0 mb-8">
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              {/* Revenue header */}
              <div className="px-4 pt-3 pb-2 flex items-start justify-between">
                <div>
                  <div className="text-[8px] text-neutral-500 uppercase tracking-widest font-medium mb-0.5">
                    Chiffre du jour
                  </div>
                  <div className="text-base font-black text-white tabular-nums">
                    1 847 000{' '}
                    <span className="text-[10px] font-semibold text-neutral-500">FCFA</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#4ade80] text-[9px] bg-[#4ade80]/10 border border-[#4ade80]/20 px-1.5 py-0.5 rounded-full">
                  <span className="font-bold">+18%</span>
                </div>
              </div>

              {/* Sparkline */}
              <div className="px-4 pb-2">
                <svg viewBox="0 0 280 32" className="w-full h-6" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="login-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#CCFF00" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#CCFF00" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0 26 L 40 22 L 80 18 L 120 24 L 160 14 L 200 10 L 240 12 L 280 4"
                    fill="none"
                    stroke="#CCFF00"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 0 26 L 40 22 L 80 18 L 120 24 L 160 14 L 200 10 L 240 12 L 280 4 L 280 32 L 0 32 Z"
                    fill="url(#login-grad)"
                  />
                </svg>
              </div>

              {/* Divider */}
              <div className="mx-4 border-t border-white/10" />

              {/* Live orders */}
              <div className="px-3 py-2 space-y-1">
                <div className="flex items-center justify-between px-1 mb-0.5">
                  <span className="text-[8px] font-semibold text-neutral-500 uppercase tracking-widest">
                    Commandes récentes
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#4ade80]" />
                    </span>
                    <span className="text-[8px] text-[#4ade80] font-medium">Live</span>
                  </div>
                </div>
                {[
                  {
                    table: 'Table 4',
                    total: '32 500 FCFA',
                    status: 'En cours',
                    cls: 'bg-amber-500/10 text-amber-400',
                  },
                  {
                    table: 'Table 7',
                    total: '78 000 FCFA',
                    status: 'Servi',
                    cls: 'bg-[#4ade80]/10 text-[#4ade80]',
                  },
                ].map((order, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5"
                  >
                    <span className="text-[10px] font-semibold text-neutral-300 w-12 shrink-0">
                      {order.table}
                    </span>
                    <span className="text-[9px] text-neutral-500 tabular-nums flex-1">
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
          </div>

          {/* ── Bottom: Testimonials ───────────────────── */}
          <div className="shrink-0">
            <TestimonialCarousel />
          </div>
        </div>
      </div>
    </div>
  );
}

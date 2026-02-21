'use client';

import { motion } from 'framer-motion';
import { TestimonialCarousel } from './TestimonialCarousel';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const stats = [
  { value: '+500', label: 'Restaurants' },
  { value: '99.9%', label: 'Disponibilit\u00e9' },
  { value: '< 2 min', label: 'Mise en route' },
];

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Left \u2014 Form on white surface */}
      <div className="w-full lg:w-[55%] flex items-center justify-center bg-white px-8 sm:px-16 lg:px-20 py-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>

      {/* Right \u2014 Dark panel with testimonials (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%] items-center py-6 pr-6 pl-3">
        <div className="relative flex flex-col items-center justify-center w-full h-full overflow-hidden rounded-[2rem]">
          {/* Background layers */}
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-900" />
          <div className="absolute inset-0 bg-[url('/images/restaurant-ambiance.jpg')] bg-cover bg-center opacity-20" />
          <div className="absolute inset-0 bg-black/40" />

          {/* Lime glow orb */}
          <div className="absolute top-1/4 right-1/3 w-[400px] h-[400px] bg-[#CCFF00]/5 rounded-full blur-[160px] pointer-events-none" />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center px-12 lg:px-16 max-w-lg w-full">
            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="w-full mb-12"
            >
              <div className="flex items-center justify-center gap-8">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-2xl font-bold text-[#CCFF00]">{stat.value}</div>
                    <div className="text-xs text-white/50 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Divider */}
            <div className="w-full border-t border-white/10 mb-12" />

            {/* Testimonial carousel */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="w-full"
            >
              <TestimonialCarousel />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

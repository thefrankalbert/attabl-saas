'use client';

import { AuthForm } from '@/components/auth/AuthForm';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

// --- Right Visual Panel (dark with social proof) ---
function VisualPanel() {
  return (
    <div className="relative flex flex-col items-center justify-center h-full overflow-hidden">
      {/* Background image overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-900" />
      <div className="absolute inset-0 bg-[url('/images/restaurant-ambiance.jpg')] bg-cover bg-center opacity-20" />
      <div className="absolute inset-0 bg-black/40" />

      {/* Subtle lime glow */}
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-[#CCFF00]/5 rounded-full blur-[160px] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-12 lg:px-16 max-w-lg">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight mb-8"
        >
          Pilotez votre établissement depuis un seul outil.
        </motion.h2>

        {/* Client logos / social proof text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="grid grid-cols-2 gap-x-10 gap-y-6"
        >
          {[
            'Restaurants',
            'Hôtels',
            'Quick-Service',
            'Bars & Cafés',
            'Food Trucks',
            'Boulangeries',
          ].map((name) => (
            <span
              key={name}
              className="text-white/60 text-sm font-semibold tracking-wide uppercase"
            >
              {name}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// --- Main Page ---
export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex">
      {/* Left — Form on white background */}
      <div className="w-full lg:w-[55%] flex items-center justify-center bg-white px-8 sm:px-16 lg:px-20 py-10">
        <div className="w-full max-w-[420px]">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
              </div>
            }
          >
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </div>

      {/* Right — Dark visual panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%]">
        <VisualPanel />
      </div>
    </div>
  );
}

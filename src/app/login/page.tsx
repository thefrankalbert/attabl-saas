'use client';

import { AuthForm } from '@/components/auth/AuthForm';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Layout, ShieldCheck, Zap, Users } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-white">
      {/* Left Column: Form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 xl:px-28 bg-white z-10">
        <Suspense fallback={
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#CCFF00]" />
          </div>
        }>
          <AuthForm mode="login" />
        </Suspense>
      </div>

      {/* Right Column: Visual */}
      <div className="hidden lg:flex relative bg-black overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-black" />
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[#CCFF00]/20 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-[#CCFF00]/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 px-12 text-center max-w-lg">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#CCFF00]/30 bg-[#CCFF00]/10 text-sm font-bold text-[#CCFF00] mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
              </span>
              Plateforme en ligne
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
              Gérez votre établissement{' '}
              <span className="text-[#CCFF00]">simplement.</span>
            </h2>

            <p className="text-lg text-gray-400 mb-12 leading-relaxed">
              Menu digital, commandes, paiements, statistiques. Tout ce dont vous avez besoin.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              {[
                { icon: ShieldCheck, text: "Sécurisé" },
                { icon: Zap, text: "Rapide" },
                { icon: Users, text: "Simple" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 text-sm font-medium"
                >
                  <item.icon className="h-4 w-4 text-[#CCFF00]" />
                  {item.text}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-8 left-8 flex items-center gap-2 text-white/30 text-xs font-medium">
          <Layout className="h-4 w-4" />
          ATTABL © 2026
        </div>
      </div>
    </div>
  );
}

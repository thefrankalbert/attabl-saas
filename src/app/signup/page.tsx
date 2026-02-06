'use client';

import { AuthForm } from '@/components/auth/AuthForm';
import { Layout, ShieldCheck, Zap, Users, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SignupPage() {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-white">
      {/* Left Column: Form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 xl:px-28 bg-white z-10 py-12">
        <AuthForm mode="signup" />
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
              <Check className="h-4 w-4" />
              14 jours d'essai gratuit
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
              Commencez votre{' '}
              <span className="text-[#CCFF00]">transformation</span>{' '}
              digitale.
            </h2>

            <p className="text-lg text-gray-400 mb-12 leading-relaxed">
              Rejoignez des centaines d'établissements qui ont modernisé leur service avec Attabl.
            </p>

            <div className="space-y-4 text-left">
              {[
                "Menu digital illimité",
                "Commandes en temps réel",
                "Paiements sécurisés",
                "Support prioritaire",
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-3 text-white/80"
                >
                  <div className="h-6 w-6 rounded-full bg-[#CCFF00] flex items-center justify-center">
                    <Check className="h-4 w-4 text-black" />
                  </div>
                  {feature}
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

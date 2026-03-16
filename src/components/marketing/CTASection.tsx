'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#0A0A0F] via-[#0A0A0F] to-[#111118] py-16 sm:py-20 lg:py-24">
      {/* Decorative grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(204,255,0,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(204,255,0,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(204,255,0,0.08) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[700px] px-4 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="font-[family-name:var(--font-sora)] text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          Votre commerce mérite mieux qu&apos;un <span className="text-[#CCFF00]">carnet</span> et
          une <span className="text-[#CCFF00]">calculette</span>.
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        >
          <p className="mx-auto mt-6 max-w-lg text-base text-white/50 sm:text-lg">
            ATTABL est la plateforme commerce #1 en Afrique. Créez votre compte en 2 minutes et
            commencez à vendre aujourd&apos;hui.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="min-h-[44px] rounded-full bg-[#CCFF00] px-8 py-4 font-bold text-[#0A0A0F] shadow-[0_4px_30px_rgba(204,255,0,0.3)] transition-all duration-300 hover:scale-105 hover:shadow-[0_4px_40px_rgba(204,255,0,0.4)]"
            >
              Créer mon compte gratuit
            </Link>
            <Link
              href="/contact"
              className="min-h-[44px] rounded-full border border-white/15 px-8 py-4 text-white transition-colors hover:bg-white/5"
            >
              Parler à un conseiller
            </Link>
          </div>

          <p className="mt-8 text-sm tracking-wide text-white/30">
            Utilisé par 2 400+ commerces <span className="mx-1 text-white/15">·</span> Support
            WhatsApp 24/7 <span className="mx-1 text-white/15">·</span> Disponible en français et en
            anglais
          </p>
        </motion.div>
      </div>
    </section>
  );
}

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <section className="py-20 lg:py-32 text-center">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-[family-name:var(--font-sora)] font-bold text-4xl sm:text-5xl lg:text-6xl text-neutral-900 leading-tight">
            Votre établissement.
            <br />
            Votre menu.
            <br />
            Votre contrôle.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-neutral-700 max-w-2xl mx-auto font-[family-name:var(--font-dm-sans)]">
            Menu digital, commandes, stocks, rapports. Tout ce qu&apos;il faut pour gérer votre
            activité avec précision — du food truck au palace.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-10 justify-center">
            <Link
              href="/signup"
              className="bg-brand-green text-white px-8 py-4 rounded-xl text-base font-semibold hover:bg-brand-green-dark transition-colors"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="#demo"
              className="border-2 border-neutral-900 text-neutral-900 px-8 py-4 rounded-xl text-base font-semibold hover:bg-neutral-900 hover:text-white transition-colors"
            >
              Voir une démo
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

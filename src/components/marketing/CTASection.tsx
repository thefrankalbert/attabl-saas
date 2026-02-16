'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="py-20 bg-neutral-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <h2 className="font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-white mb-4">
            Pr&ecirc;t &agrave; digitaliser votre &eacute;tablissement ?
          </h2>
          <p className="text-neutral-300 text-lg mb-10">
            14 jours gratuits. Aucune carte bancaire requise.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-[#CCFF00] text-black px-8 py-4 rounded-xl text-base font-semibold hover:bg-[#b3e600] transition-colors"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="#demo"
              className="border-2 border-white/20 text-white px-8 py-4 rounded-xl text-base font-semibold hover:bg-white/10 transition-colors"
            >
              Demander une d&eacute;mo
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

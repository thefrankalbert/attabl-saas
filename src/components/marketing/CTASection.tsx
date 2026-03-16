'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="bg-[#1A1A2E] py-24">
      <div className="max-w-[700px] mx-auto text-center px-4">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-3xl sm:text-4xl font-bold text-white leading-tight"
        >
          Votre commerce m&eacute;rite mieux qu&apos;un <em className="italic">carnet</em> et une{' '}
          <em className="italic">calculette</em>.
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        >
          <p className="text-lg text-white/60 mt-6 max-w-lg mx-auto">
            ATTABL est la plateforme commerce #1 en Afrique. Cr&eacute;ez votre compte en 2 minutes
            et commencez &agrave; vendre aujourd&apos;hui.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link
              href="/signup"
              className="bg-[#CCFF00] text-[#1A1A2E] font-bold rounded-full px-8 py-4 hover:scale-105 transition-transform"
            >
              Cr&eacute;er mon compte gratuit
            </Link>
            <Link
              href="/contact"
              className="border border-white text-white rounded-full px-8 py-4 hover:bg-white/10 transition-colors"
            >
              Parler &agrave; un conseiller
            </Link>
          </div>

          <p className="text-sm text-gray-400 mt-8">
            Utilis&eacute; par 2 400+ commerces &bull; Support WhatsApp 24/7 &bull; Disponible en
            fran&ccedil;ais et en anglais
          </p>
        </motion.div>
      </div>
    </section>
  );
}

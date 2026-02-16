'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface SegmentHeroProps {
  title: string;
  subtitle: string;
  ctaText?: string;
  ctaHref?: string;
}

export default function SegmentHero({
  title,
  subtitle,
  ctaText = 'Essayer gratuitement',
  ctaHref = '/signup',
}: SegmentHeroProps) {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-[family-name:var(--font-sora)] text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 leading-tight mb-6">
            {title}
          </h1>

          <p className="text-neutral-700 text-lg sm:text-xl max-w-2xl mx-auto mb-10">{subtitle}</p>

          <Link
            href={ctaHref}
            className="bg-brand-green text-white px-8 py-4 rounded-xl text-base font-semibold hover:bg-brand-green-dark transition-colors inline-block"
          >
            {ctaText}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

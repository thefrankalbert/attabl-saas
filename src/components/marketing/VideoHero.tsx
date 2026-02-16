'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import LogoMarquee from './LogoMarquee';

export default function VideoHero() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Video Background */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
        >
          <source src="/videos/hero.webm" type="video/webm" />
          <source src="/videos/hero.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-8">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-[family-name:var(--font-dm-serif-display)] text-5xl font-light leading-[1.1] text-white sm:text-6xl lg:text-7xl"
        >
          Petit comptoir ou grande enseigne.
          <br />
          Marquez votre territoire.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-white/90 sm:text-xl"
        >
          Menu, commandes, stocks, finances tout piloté depuis un seul outil.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-8 flex flex-col gap-4 sm:flex-row"
        >
          <Link
            href="/signup"
            className="rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-all hover:scale-105"
          >
            Commencer
          </Link>
          <Link
            href="#contact"
            className="rounded-full bg-primary px-8 py-4 text-base font-semibold text-white transition-all hover:scale-105"
          >
            Contacter l&apos;équipe
          </Link>
        </motion.div>
      </div>

      {/* Logo Marquee - Scrolls above video */}
      <LogoMarquee />
    </section>
  );
}

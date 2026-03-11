'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, useCallback, useEffect, useRef } from 'react';
import LogoMarquee from './LogoMarquee';

export default function VideoHero() {
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleCanPlay = useCallback(() => {
    setVideoReady(true);
  }, []);

  // Eagerly hint the browser to prioritize the video download
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Force load in case preload="auto" is not enough
    video.load();
  }, []);

  return (
    <section className="relative min-h-screen w-full overflow-hidden h-dvh">
      {/* Video Background */}
      <div className="absolute inset-0 z-0">
        {/* Solid background color matching the video tone — visible instantly */}
        <div className="absolute inset-0 bg-[#141210]" />

        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/videos/hero-poster.jpg"
          onCanPlay={handleCanPlay}
          className={`absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover transition-opacity duration-700 ${
            videoReady ? 'opacity-100' : 'opacity-0'
          }`}
        >
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
          className="font-[family-name:var(--font-dm-serif-display)] text-3xl font-light leading-[1.1] text-white sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
        >
          Petit comptoir ou grande enseigne.
          <span className="hidden sm:inline">
            <br />
          </span>{' '}
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
            href="/contact"
            className="rounded-full border border-white text-white px-8 py-4 text-base font-semibold transition-all hover:bg-white/10 hover:scale-105"
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

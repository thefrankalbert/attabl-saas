'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  restaurant: string;
  initials: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "Depuis qu'on utilise ATTABL, nos commandes ont augment\u00e9 de 35%. Le menu digital a transform\u00e9 l'exp\u00e9rience de nos clients.",
    name: 'Marie L.',
    role: 'G\u00e9rante',
    restaurant: 'Le Petit Bistrot',
    initials: 'ML',
  },
  {
    quote:
      'La mise en place a pris moins de 10 minutes. Nos serveurs adorent le syst\u00e8me de commandes en temps r\u00e9el.',
    name: 'Thomas K.',
    role: 'Directeur F&B',
    restaurant: 'H\u00f4tel R\u00e9sidence',
    initials: 'TK',
  },
  {
    quote:
      'Le QR code sur table a r\u00e9duit nos erreurs de commande de 90%. Un investissement rentabilis\u00e9 en une semaine.',
    name: 'Aminata D.',
    role: 'Propri\u00e9taire',
    restaurant: 'Chez Ami',
    initials: 'AD',
  },
  {
    quote:
      "L'analytics nous permet enfin de comprendre ce que nos clients pr\u00e9f\u00e8rent. On adapte notre carte chaque mois.",
    name: 'Jean-Pierre M.',
    role: 'Chef Cuisinier',
    restaurant: "La Table d'Or",
    initials: 'JP',
  },
];

const variants = {
  enter: { opacity: 0, y: 20 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export function TestimonialCarousel() {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % testimonials.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next, isPaused]);

  const t = testimonials[current];

  return (
    <div
      className="w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative min-h-[180px] flex items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="w-full"
          >
            {/* Quote */}
            <blockquote className="text-lg text-white/90 leading-relaxed mb-6 text-left">
              &ldquo;{t.quote}&rdquo;
            </blockquote>

            {/* Author */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#CCFF00]/20 text-[#CCFF00] text-sm font-bold shrink-0">
                {t.initials}
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-sm text-white/50">
                  {t.role} &mdash; {t.restaurant}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 mt-8">
        {testimonials.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            aria-label={`T\u00e9moignage ${i + 1}`}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === current ? 'bg-[#CCFF00] w-6' : 'bg-white/20 hover:bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

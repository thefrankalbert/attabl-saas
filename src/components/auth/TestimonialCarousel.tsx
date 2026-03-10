'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';

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
      "Depuis qu'on utilise ATTABL, nos commandes ont augmenté de 35%. Le menu digital a transformé l'expérience de nos clients.",
    name: 'Marie L.',
    role: 'Gérante',
    restaurant: 'Le Petit Bistrot',
    initials: 'ML',
  },
  {
    quote:
      'La mise en place a pris moins de 10 minutes. Nos serveurs adorent le système de commandes en temps réel.',
    name: 'Thomas K.',
    role: 'Directeur F&B',
    restaurant: 'Hôtel Résidence',
    initials: 'TK',
  },
  {
    quote:
      'Le QR code sur table a réduit nos erreurs de commande de 90%. Un investissement rentabilisé en une semaine.',
    name: 'Aminata D.',
    role: 'Propriétaire',
    restaurant: 'Chez Ami',
    initials: 'AD',
  },
  {
    quote:
      "L'analytics nous permet enfin de comprendre ce que nos clients préfèrent. On adapte notre carte chaque mois.",
    name: 'Jean-Pierre M.',
    role: 'Chef Cuisinier',
    restaurant: "La Table d'Or",
    initials: 'JP',
  },
];

const variants = {
  enter: { opacity: 0, y: 16 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
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
      <div className="relative min-h-[160px] flex items-start">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="w-full"
          >
            {/* Stars */}
            <div className="flex items-center gap-0.5 mb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-accent text-accent" />
              ))}
            </div>

            {/* Quote */}
            <blockquote className="text-sm text-white/75 leading-relaxed mb-4 text-left">
              &ldquo;{t.quote}&rdquo;
            </blockquote>

            {/* Author */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/15 text-white text-xs font-medium shrink-0">
                {t.initials}
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white/90">{t.name}</div>
                <div className="text-xs text-white/35">
                  {t.role} &mdash; {t.restaurant}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center gap-1.5 mt-5">
        {testimonials.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            aria-label={`Témoignage ${i + 1}`}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === current ? 'bg-accent w-6' : 'bg-white/15 hover:bg-white/30 w-1'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

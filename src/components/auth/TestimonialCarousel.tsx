'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';

interface Testimonial {
  quote: string;
  highlight: string;
  name: string;
  role: string;
  establishment: string;
  initials: string;
}

const testimonials: Testimonial[] = [
  {
    quote: 'Nos commandes ont augmenté de 35% dès le premier mois. Le QR code a changé la donne.',
    highlight: '+35% de commandes',
    name: 'Marie L.',
    role: 'Gérante',
    establishment: 'Le Petit Bistrot, Douala',
    initials: 'ML',
  },
  {
    quote:
      'On a divisé par deux les erreurs en salle. Les serveurs adorent le suivi en temps réel.',
    highlight: "-50% d'erreurs",
    name: 'Thomas K.',
    role: 'Directeur F&B',
    establishment: "Hôtel Résidence, N'Djaména",
    initials: 'TK',
  },
  {
    quote:
      'Le menu était en ligne en 10 minutes. On a lancé le room service digital en une journée.',
    highlight: '10 min de mise en route',
    name: 'Aminata D.',
    role: 'Directrice Opérations',
    establishment: 'Pullman Douala',
    initials: 'AD',
  },
];

const variants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
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
      <div className="relative min-h-[100px] flex items-start">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-full"
          >
            {/* Stars */}
            <div className="flex items-center gap-0.5 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-[#CCFF00] text-[#CCFF00]" />
              ))}
            </div>

            {/* Quote */}
            <blockquote className="text-[13px] text-neutral-300 italic leading-relaxed mb-3">
              &ldquo;{t.quote}&rdquo;
            </blockquote>

            {/* Author */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20 text-[#CCFF00] text-[10px] font-bold shrink-0">
                {t.initials}
              </div>
              <div>
                <div className="text-xs font-semibold text-white">{t.name}</div>
                <div className="text-[10px] text-neutral-500">
                  {t.role}, {t.establishment}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center gap-1.5 mt-3">
        {testimonials.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            aria-label={`Témoignage ${i + 1}`}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === current ? 'bg-[#CCFF00] w-5' : 'bg-white/20 hover:bg-white/40 w-1'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

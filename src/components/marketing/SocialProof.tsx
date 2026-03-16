'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const testimonials = [
  {
    quote:
      'ATTABL a transformé la gestion de notre restaurant. On a réduit les erreurs de commande de 40% en 2 mois.',
    author: 'Amadou K.',
    business: 'Le Jardin',
    city: "N'Djamena",
    segment: 'Restauration',
  },
  {
    quote:
      'Enfin un outil qui comprend le commerce africain. Le support mobile money a tout changé pour nous.',
    author: 'Grace M.',
    business: 'Sahel Boutique',
    city: 'Douala',
    segment: 'Retail',
  },
  {
    quote:
      "Le dashboard analytics m'a ouvert les yeux sur mes vraies marges. J'ai augmenté ma rentabilité de 18%.",
    author: 'Ibrahim D.',
    business: 'Hôtel Prestige',
    city: 'Abidjan',
    segment: 'Hôtellerie',
  },
];

const mediaLogos = ['Jeune Afrique', 'Forbes Afrique', 'TechCrunch', 'Le Monde'];

export default function SocialProof() {
  const [activeIndex, setActiveIndex] = useState(0);

  const goTo = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [activeIndex]);

  const testimonial = testimonials[activeIndex];

  return (
    <section className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-16 text-center text-3xl font-bold text-neutral-900 sm:text-4xl">
          Ils nous font confiance
        </h2>

        {/* Testimonial carousel */}
        <div className="mx-auto max-w-[700px] px-4 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-4 font-serif text-6xl leading-none text-[#CCFF00]">&ldquo;</div>
              <p className="mb-8 text-xl italic leading-relaxed text-neutral-700 sm:text-2xl">
                {testimonial.quote}
              </p>
              <div className="font-bold text-neutral-900">{testimonial.author}</div>
              <div className="text-neutral-500">
                {testimonial.business} &mdash; {testimonial.city}
              </div>
              <span className="mt-3 inline-block rounded-full bg-[#CCFF00]/10 px-3 py-1 text-xs font-medium text-[#CCFF00]">
                {testimonial.segment}
              </span>
            </motion.div>
          </AnimatePresence>

          {/* Navigation dots */}
          <div className="mt-8 flex justify-center gap-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Témoignage ${index + 1}`}
                onClick={() => goTo(index)}
                className={
                  index === activeIndex
                    ? 'h-2.5 w-2.5 rounded-full bg-[#CCFF00]'
                    : 'h-2 w-2 cursor-pointer rounded-full bg-neutral-300 hover:bg-neutral-400'
                }
              />
            ))}
          </div>
        </div>

        {/* Media logos banner */}
        <div className="mt-16 border-t border-neutral-200 pt-12">
          <p className="mb-8 text-center text-xs uppercase tracking-widest text-neutral-400">
            Ils parlent de nous
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {mediaLogos.map((logo) => (
              <span
                key={logo}
                className="cursor-default text-lg font-bold text-neutral-300 transition-colors hover:text-neutral-600"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

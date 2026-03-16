'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { BlurFade } from '@/components/ui/blur-fade';
import { Marquee } from '@/components/ui/marquee';

const testimonials = [
  {
    quote:
      'ATTABL a transforme la gestion de notre restaurant. On a reduit les erreurs de commande de 40% en 2 mois.',
    author: 'Amadou K.',
    initials: 'AK',
    business: 'Le Jardin',
    city: "N'Djamena",
    segment: 'Restauration',
  },
  {
    quote:
      'Enfin un outil qui comprend le commerce africain. Le support mobile money a tout change pour nous.',
    author: 'Grace M.',
    initials: 'GM',
    business: 'Sahel Boutique',
    city: 'Douala',
    segment: 'Retail',
  },
  {
    quote:
      "Le dashboard analytics m'a ouvert les yeux sur mes vraies marges. J'ai augmente ma rentabilite de 18%.",
    author: 'Ibrahim D.',
    initials: 'ID',
    business: 'Hotel Prestige',
    city: 'Abidjan',
    segment: 'Hotellerie',
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
    <section className="bg-white py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <BlurFade inView>
          <h2 className="mb-10 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:mb-16 sm:text-4xl">
            Ils nous font confiance
          </h2>
        </BlurFade>

        {/* Testimonial carousel */}
        <BlurFade inView delay={0.1}>
          <div className="mx-auto max-w-[700px] px-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="relative mx-auto rounded-3xl border border-neutral-100 bg-[#FAFAF9] p-8 sm:p-12">
                  {/* Decorative opening quote */}
                  <span className="absolute -left-2 -top-4 select-none font-serif text-[80px] leading-none text-[#CCFF00]/20">
                    &ldquo;
                  </span>

                  {/* Quote text */}
                  <p className="mb-8 text-lg leading-relaxed text-neutral-800 sm:text-xl">
                    {testimonial.quote}
                  </p>

                  {/* Author section */}
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Avatar with initials */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#CCFF00]/10 font-bold text-[#CCFF00]">
                      {testimonial.initials}
                    </div>

                    {/* Name and business */}
                    <div className="min-w-0 text-left">
                      <div className="font-bold text-neutral-900">{testimonial.author}</div>
                      <div className="text-sm text-neutral-500">
                        {testimonial.business} &mdash; {testimonial.city}
                      </div>
                    </div>

                    {/* Segment badge */}
                    <span className="ml-auto rounded-full bg-[#0A0A0F] px-3 py-1 text-[10px] uppercase tracking-wider text-white">
                      {testimonial.segment}
                    </span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation dots */}
            <div className="mt-8 flex justify-center gap-1">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Temoignage ${index + 1}`}
                  onClick={() => goTo(index)}
                  className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center"
                >
                  <span
                    className={`block h-3 w-3 rounded-full transition-all duration-300 ${
                      index === activeIndex
                        ? 'bg-[#CCFF00] shadow-[0_0_8px_rgba(204,255,0,0.4)]'
                        : 'bg-neutral-300 hover:bg-neutral-400'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* Media logos marquee */}
        <div className="mt-16 border-t border-neutral-100 pt-12">
          <Marquee pauseOnHover className="[--duration:30s]">
            {mediaLogos.map((logo) => (
              <div
                key={logo}
                className="mx-4 flex items-center rounded-xl border border-neutral-200 px-6 py-3"
              >
                <span className="text-sm font-semibold text-neutral-400">{logo}</span>
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}

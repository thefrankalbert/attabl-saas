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
    <section className="bg-app-elevated/30 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <BlurFade inView>
          <h2 className="mb-10 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-app-text sm:mb-16 sm:text-4xl">
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
                <div className="relative mx-auto rounded-2xl border border-app-border bg-app-card p-6 sm:p-10">
                  {/* Decorative opening quote */}
                  <span className="absolute -top-2 left-4 select-none font-serif text-6xl text-accent/20">
                    &ldquo;
                  </span>

                  {/* Quote text */}
                  <p className="mb-8 text-base leading-relaxed text-app-text sm:text-lg">
                    {testimonial.quote}
                  </p>

                  {/* Author section */}
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Avatar with initials */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-muted font-bold text-accent">
                      {testimonial.initials}
                    </div>

                    {/* Name and business */}
                    <div className="min-w-0 text-left">
                      <div className="font-semibold text-app-text">{testimonial.author}</div>
                      <div className="text-sm text-app-text-secondary">
                        {testimonial.business} &mdash; {testimonial.city}
                      </div>
                    </div>

                    {/* Segment badge */}
                    <span className="ml-auto rounded-full bg-accent-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
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
                    className={`block rounded-full transition-all duration-300 ${
                      index === activeIndex ? 'h-2.5 w-2.5 bg-accent' : 'h-2 w-2 bg-app-border'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* Media logos marquee */}
        <div className="mt-16 border-t border-app-border pt-12">
          <Marquee pauseOnHover className="[--duration:30s]">
            {mediaLogos.map((logo) => (
              <div
                key={logo}
                className="mx-4 flex items-center rounded-xl border border-app-border px-5 py-2.5"
              >
                <span className="text-sm font-medium text-app-text-muted">{logo}</span>
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}

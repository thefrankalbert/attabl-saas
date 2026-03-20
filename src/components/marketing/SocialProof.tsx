'use client';

import { useState, useEffect, useCallback } from 'react';

const testimonials = [
  {
    quote:
      "On a réduit les erreurs de commande de 40% en 2 mois. La cuisine reçoit tout sur l'écran, plus de tickets perdus.",
    author: 'Amadou K.',
    business: 'Le Jardin',
    city: "N'Djamena",
    segment: 'Restaurant',
  },
  {
    quote:
      'Le room service digital a changé notre classement Booking. Les clients commandent depuis le lit, en anglais ou en français.',
    author: 'Ibrahim D.',
    business: 'Hôtel Prestige',
    city: 'Abidjan',
    segment: 'Hôtel',
  },
  {
    quote: '200 commandes par jour, zéro stress. Le KDS fait le tri, on prépare, on envoie.',
    author: 'Grace M.',
    business: 'Chez Mama',
    city: 'Douala',
    segment: 'Quick-Service',
  },
];

export default function SocialProof() {
  const [active, setActive] = useState(0);

  const next = useCallback(() => {
    setActive((prev) => (prev + 1) % testimonials.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next]);

  const t = testimonials[active];

  return (
    <section className="bg-white dark:bg-neutral-950 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
          Ils nous font confiance
        </h2>

        <div className="mt-12 mx-auto max-w-2xl">
          <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900 p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
            <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
              &ldquo;{t.quote}&rdquo;
            </p>

            <p className="mt-6 text-sm font-semibold text-neutral-900 dark:text-white">
              {t.author}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t.business} &mdash; {t.city}
            </p>

            <span className="mt-3 inline-block rounded bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t.segment}
            </span>
          </div>

          {/* Dots */}
          <div className="mt-6 flex justify-center gap-2">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`h-2 w-2 rounded-full cursor-pointer transition-colors ${
                  i === active
                    ? 'bg-neutral-900 dark:bg-white'
                    : 'bg-neutral-300 dark:bg-neutral-700'
                }`}
                aria-label={`Témoignage ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

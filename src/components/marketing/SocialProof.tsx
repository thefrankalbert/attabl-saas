'use client';

import { useState, useEffect, useCallback } from 'react';

const testimonials = [
  {
    quote: 'Erreurs de commande réduites de 40% en 2 mois.',
    author: 'Amadou K.',
    business: 'Le Jardin',
    city: "N'Djamena",
    segment: 'Restaurant',
  },
  {
    quote: "Le dashboard m'a ouvert les yeux sur mes vraies marges.",
    author: 'Ibrahim D.',
    business: 'Hôtel Prestige',
    city: 'Abidjan',
    segment: 'Hôtel',
  },
  {
    quote: 'On gère 200 commandes/jour sans stress grâce au KDS.',
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
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
          Ils nous font confiance
        </h2>

        <div className="mt-12 mx-auto max-w-2xl">
          <div className="rounded-2xl bg-neutral-50 p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
            <p className="text-lg leading-relaxed text-neutral-700">&ldquo;{t.quote}&rdquo;</p>

            <p className="mt-6 text-sm font-semibold text-neutral-900">{t.author}</p>
            <p className="text-sm text-neutral-500">
              {t.business} &mdash; {t.city}
            </p>

            <span className="mt-3 inline-block rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500">
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
                  i === active ? 'bg-neutral-900' : 'bg-neutral-300'
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
  {
    time: '08h',
    label: 'Matin',
    message: 'Stock de café bas. Commande fournisseur suggérée.',
    insight: 'Anticipe vos besoins',
  },
  {
    time: '13h',
    label: 'Rush',
    message: 'Temps de préparation moyen : 8 min. 2 commandes en retard.',
    insight: 'Optimise en temps réel',
  },
  {
    time: '21h',
    label: 'Clôture',
    message: 'Journée record ! +15% vs mardi. Top 3 : Burger, Salade, Jus.',
    insight: 'Transforme les données en décisions',
  },
];

export default function PhoneAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  const [paused, setPaused] = useState(false);

  const handleClick = useCallback((index: number) => {
    setActiveStep(index);
    setPaused(true);
  }, []);

  useEffect(() => {
    if (paused) {
      const resumeTimer = setTimeout(() => setPaused(false), 8000);
      return () => clearTimeout(resumeTimer);
    }

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [paused]);

  const current = steps[activeStep];

  return (
    <section className="bg-neutral-950 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
          Votre copilote, de l{"'"}ouverture à la fermeture.
        </h2>

        {/* Timeline nav */}
        <div className="mx-auto mt-14 flex max-w-md items-center justify-between">
          {steps.map((step, i) => (
            <button
              key={step.time}
              onClick={() => handleClick(i)}
              className="group relative flex flex-col items-center"
            >
              {/* Connector line (left) */}
              {i > 0 && (
                <span className="absolute right-1/2 top-[7px] h-px w-[calc(100%+3rem)] sm:w-[calc(100%+5rem)] bg-white/10" />
              )}

              {/* Dot */}
              <span
                className={`relative z-10 rounded-full transition-all duration-300 ${
                  i === activeStep
                    ? 'h-4 w-4 bg-white shadow-[0_0_12px_rgba(255,255,255,0.3)]'
                    : 'h-3 w-3 bg-white/20 group-hover:bg-white/40'
                }`}
              />

              {/* Time label */}
              <span
                className={`mt-3 text-xs font-semibold transition-colors duration-300 ${
                  i === activeStep ? 'text-white' : 'text-white/40'
                }`}
              >
                {step.time} - {step.label}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="mt-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="grid gap-6 md:grid-cols-2"
            >
              {/* Left: message card + insight */}
              <div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm leading-relaxed text-white/80">{current.message}</p>
                </div>
                <p className="mt-4 text-xs font-medium text-white/70">{current.insight}</p>
              </div>

              {/* Right: placeholder mockup */}
              <div className="hidden rounded-xl border border-white/10 bg-white/5 md:flex md:min-h-[120px] md:items-center md:justify-center">
                <span className="text-xs text-white/20">Aperçu</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

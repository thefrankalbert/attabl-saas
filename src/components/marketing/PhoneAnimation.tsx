'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const timelineSteps = [
  {
    time: '08h',
    label: 'Matin — Anticipation',
    message:
      'Stock de cafe bas. Commande fournisseur suggeree : 5kg Arabica chez votre fournisseur habituel.',
    insight: 'ATTABL AI anticipe vos besoins avant que vous ne les ressentiez.',
  },
  {
    time: '13h',
    label: 'Rush — Optimisation',
    message:
      'Temps de preparation moyen : 8 min. 2 commandes en retard — reallocation suggeree vers le poste 2.',
    insight: 'En plein rush, ATTABL AI optimise vos operations en temps reel.',
  },
  {
    time: '21h',
    label: 'Cloture — Bilan',
    message:
      'Journee record ! +15% vs mardi dernier. Votre top 3 : Burger Classic, Salade Cesar, Jus Gingembre.',
    insight: 'ATTABL AI transforme vos donnees en decisions rentables.',
  },
];

export default function PhoneAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoPlay = useCallback(() => {
    intervalRef.current = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % timelineSteps.length);
    }, 5000);
  }, []);

  const stopAutoPlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoPlay();
    return stopAutoPlay;
  }, [startAutoPlay, stopAutoPlay]);

  const handleStepClick = (index: number) => {
    stopAutoPlay();
    setActiveStep(index);
    startAutoPlay();
  };

  const step = timelineSteps[activeStep];

  return (
    <section className="bg-[#1A1A2E] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <h2 className="mb-4 text-center text-3xl font-bold text-white sm:text-4xl">
          Votre copilote business, de l&apos;ouverture a la fermeture
        </h2>

        {/* Subtitle */}
        <p className="mx-auto mb-16 max-w-2xl text-center text-lg text-white/60">
          ATTABL AI analyse votre activite et vous suggere les bonnes decisions, tout au long de la
          journee.
        </p>

        {/* Timeline navigation */}
        <div className="mb-12 flex items-center justify-center gap-0">
          {timelineSteps.map((s, i) => (
            <div key={s.time} className="flex items-center">
              {/* Step button */}
              <button
                onClick={() => handleStepClick(i)}
                className="flex flex-col items-center"
                aria-label={`${s.time} — ${s.label}`}
              >
                <div
                  className={
                    i === activeStep
                      ? 'h-4 w-4 rounded-full bg-[#CCFF00] shadow-[0_0_12px_rgba(204,255,0,0.5)]'
                      : 'h-3 w-3 cursor-pointer rounded-full bg-white/20 hover:bg-white/40'
                  }
                />
                <span
                  className={`mt-2 text-xs ${
                    i === activeStep ? 'font-bold text-[#CCFF00]' : 'text-white/40'
                  }`}
                >
                  {s.time}
                </span>
              </button>

              {/* Connector line (not after last) */}
              {i < timelineSteps.length - 1 && <div className="h-px w-16 bg-white/20 sm:w-24" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="mx-auto grid max-w-5xl gap-8 px-4 lg:grid-cols-2 lg:gap-12"
          >
            {/* Left column — text */}
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#CCFF00]">
                {step.label}
              </p>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm leading-relaxed text-white/80">{step.message}</p>
              </div>
              <p className="mt-6 text-sm italic text-white/50">{step.insight}</p>
            </div>

            {/* Right column — placeholder visual */}
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-[#CCFF00]/5 to-[#CCFF00]/10 aspect-video">
              <span className="text-sm text-white/30">Illustration {step.time}</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

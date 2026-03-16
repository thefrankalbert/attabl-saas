'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const timelineSteps = [
  {
    time: '08h',
    label: 'Matin — Anticipation',
    message:
      'Stock de cafe bas. Commande fournisseur suggeree : 5kg Arabica chez votre fournisseur habituel.',
    insight: 'ATTABL AI anticipe vos besoins avant que vous ne les ressentiez.',
    action: 'Commander',
    barHeights: [40, 65, 30, 80, 55, 45],
    highlightBar: 3,
    statLabel: 'Consommation cafe — 7 derniers jours',
  },
  {
    time: '13h',
    label: 'Rush — Optimisation',
    message:
      'Temps de preparation moyen : 8 min. 2 commandes en retard — reallocation suggeree vers le poste 2.',
    insight: 'En plein rush, ATTABL AI optimise vos operations en temps reel.',
    action: 'Reallouer',
    barHeights: [90, 85, 70, 95, 80, 88],
    highlightBar: 3,
    statLabel: 'Charge cuisine — temps reel',
  },
  {
    time: '21h',
    label: 'Cloture — Bilan',
    message:
      'Journee record ! +15% vs mardi dernier. Votre top 3 : Burger Classic, Salade Cesar, Jus Gingembre.',
    insight: 'ATTABL AI transforme vos donnees en decisions rentables.',
    action: 'Voir le rapport',
    barHeights: [50, 60, 75, 55, 85, 100],
    highlightBar: 5,
    statLabel: "Revenus par heure — aujourd'hui",
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
    <section className="relative overflow-hidden bg-gradient-to-b from-[#0A0A0F] to-[#0C1117] py-24">
      {/* Subtle glow behind content */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(204,255,0,0.04) 0%, transparent 50%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
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
                  className={`rounded-full transition-all duration-300 ${
                    i === activeStep
                      ? 'h-5 w-5 bg-[#CCFF00] ring-4 ring-[#CCFF00]/20 shadow-[0_0_12px_rgba(204,255,0,0.5)]'
                      : 'h-3 w-3 cursor-pointer bg-white/20 hover:bg-white/40'
                  }`}
                />
                <span
                  className={`mt-2 text-sm transition-colors duration-300 ${
                    i === activeStep ? 'font-bold text-[#CCFF00]' : 'text-white/40'
                  }`}
                >
                  {s.time}
                </span>
              </button>

              {/* Connector line (not after last) */}
              {i < timelineSteps.length - 1 && (
                <div className="h-0.5 w-16 bg-gradient-to-r from-white/10 to-white/10 sm:w-24" />
              )}
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
            {/* Left column — AI message card */}
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#CCFF00]">
                {step.label}
              </p>

              {/* AI notification card */}
              <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 backdrop-blur">
                {/* AI avatar + label */}
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#CCFF00]">
                    <Sparkles className="h-4 w-4 text-black" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#CCFF00]">
                    ATTABL AI
                  </span>
                </div>

                {/* Message text */}
                <p className="mt-3 text-sm leading-relaxed text-white/80">{step.message}</p>

                {/* Action button */}
                <span className="mt-4 inline-block rounded-full bg-[#CCFF00]/10 px-3 py-1.5 text-xs font-medium text-[#CCFF00]">
                  {step.action} &rarr;
                </span>
              </div>

              {/* Insight text */}
              <p className="mt-4 text-sm italic text-white/40">{step.insight}</p>
            </div>

            {/* Right column — Mini dashboard */}
            <div className="flex items-center justify-center">
              <div className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
                {/* Mini bar chart */}
                <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
                  {step.barHeights.map((height, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t transition-all duration-500 ${
                        i === step.highlightBar ? 'bg-[#CCFF00]' : 'bg-white/10'
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>

                {/* Stat label */}
                <p className="mt-3 text-[10px] text-white/20">{step.statLabel}</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

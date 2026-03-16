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
    <section className="relative overflow-hidden bg-app-bg py-16 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-app-text sm:text-4xl">
          Votre copilote business, de l&apos;ouverture a la fermeture
        </h2>

        {/* Subtitle */}
        <p className="mx-auto mb-10 max-w-2xl text-center text-base text-app-text-secondary sm:mb-16 sm:text-lg">
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
                className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center"
                aria-label={`${s.time} — ${s.label}`}
              >
                <div
                  className={`rounded-full transition-all duration-300 ${
                    i === activeStep
                      ? 'h-4 w-4 bg-accent ring-4 ring-accent/20'
                      : 'h-3 w-3 cursor-pointer bg-app-border hover:bg-app-border-hover'
                  }`}
                />
                <span
                  className={`mt-2 text-sm transition-colors duration-300 ${
                    i === activeStep ? 'font-semibold text-accent' : 'text-app-text-muted'
                  }`}
                >
                  {s.time}
                </span>
              </button>

              {/* Connector line (not after last) */}
              {i < timelineSteps.length - 1 && <div className="h-0.5 w-16 bg-app-border sm:w-20" />}
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
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">
                {step.label}
              </p>

              {/* AI notification card */}
              <div className="rounded-xl border border-app-border bg-app-card p-5">
                {/* AI avatar + label */}
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
                    <Sparkles className="h-3.5 w-3.5 text-accent-text" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                    ATTABL AI
                  </span>
                </div>

                {/* Message text */}
                <p className="mt-3 text-sm leading-relaxed text-app-text-secondary">
                  {step.message}
                </p>

                {/* Action pill */}
                <span className="mt-3 inline-block rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
                  {step.action} &rarr;
                </span>
              </div>

              {/* Insight text */}
              <p className="mt-4 text-sm italic text-app-text-muted">{step.insight}</p>
            </div>

            {/* Right column — Mini dashboard */}
            <div className="flex items-center justify-center">
              <div className="w-full rounded-xl border border-app-border bg-app-card p-4">
                {/* Mini bar chart */}
                <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
                  {step.barHeights.map((height, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t transition-all duration-500 ${
                        i === step.highlightBar ? 'bg-accent' : 'bg-app-border'
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>

                {/* Stat label */}
                <p className="mt-3 text-[10px] text-app-text-muted">{step.statLabel}</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

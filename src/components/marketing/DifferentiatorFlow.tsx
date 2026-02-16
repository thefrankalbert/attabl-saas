'use client';

import { motion } from 'framer-motion';
import { ShoppingCart, ListChecks, PackageMinus, Bell, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Step {
  icon: LucideIcon;
  label: string;
}

const steps: Step[] = [
  { icon: ShoppingCart, label: 'Plat command\u00e9' },
  { icon: ListChecks, label: 'D\u00e9composition ingr\u00e9dients' },
  { icon: PackageMinus, label: 'Stock mis \u00e0 jour' },
  { icon: Bell, label: 'Alerte si stock bas' },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const stepVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

export default function DifferentiatorFlow() {
  return (
    <section className="py-20 bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
          Ce que les autres ne font pas
        </h2>
        <p className="text-center text-neutral-700 text-lg mb-16 max-w-2xl mx-auto">
          Un moteur unique qui transforme chaque commande en mise &agrave; jour de stock
          automatique.
        </p>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-7 gap-6 md:gap-0 items-center"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div key={step.label} className="contents" variants={stepVariants}>
                {/* Step card */}
                <div className="flex flex-col items-center text-center md:col-span-1">
                  <div className="w-16 h-16 rounded-2xl bg-brand-green-light flex items-center justify-center mb-3">
                    <Icon className="h-8 w-8 text-brand-green" />
                  </div>
                  <span className="font-[family-name:var(--font-sora)] font-semibold text-neutral-900 text-sm">
                    {step.label}
                  </span>
                </div>

                {/* Arrow between steps (not after the last step) */}
                {index < steps.length - 1 && (
                  <div className="flex items-center justify-center md:col-span-1 py-2 md:py-0">
                    <ArrowRight className="h-5 w-5 text-neutral-700 rotate-90 md:rotate-0" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        <p className="mt-12 text-center text-neutral-700 max-w-3xl mx-auto text-base leading-relaxed">
          La plupart des syst&egrave;mes d&eacute;duisent un plat. Attabl d&eacute;compose chaque
          plat en ses ingr&eacute;dients exacts et met &agrave; jour votre stock en temps
          r&eacute;el.
        </p>
      </div>
    </section>
  );
}

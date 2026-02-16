'use client';

import { motion } from 'framer-motion';

interface Metric {
  value: string;
  label: string;
}

const metrics: Metric[] = [
  { value: '4', label: 'modes de service' },
  { value: '3', label: 'devises support\u00e9es' },
  { value: 'Auto', label: 'd\u00e9stockage' },
  { value: '14j', label: "d'essai gratuit" },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const metricVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

export default function StatsBar() {
  return (
    <section className="py-16 bg-black border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 text-center"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              variants={metricVariants}
              className={index < metrics.length - 1 ? 'border-r border-white/10' : undefined}
            >
              <div className="font-[family-name:var(--font-sora)] text-5xl font-bold text-white">
                {metric.value}
              </div>
              <div className="text-sm text-neutral-400 mt-1">{metric.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

'use client';

import { motion } from 'framer-motion';
import { Sparkles, Shield, Zap, Globe, BarChart3, Smartphone } from 'lucide-react';
import Link from 'next/link';

const updates = [
  {
    date: 'F\u00e9vrier 2026',
    tag: 'Nouveau',
    title: 'Syst\u00e8me de permissions par r\u00f4le',
    description:
      '6 r\u00f4les (propri\u00e9taire, admin, manager, caissier, chef, serveur) avec des permissions granulaires. Chaque \u00e9quipier voit exactement ce dont il a besoin.',
    icon: Shield,
  },
  {
    date: 'F\u00e9vrier 2026',
    tag: 'Nouveau',
    title: 'Internationalisation (8 locales)',
    description:
      "Interface disponible en fran\u00e7ais, anglais (US, GB, CA, AU, IE) et espagnol. Changez la langue de l'interface en un clic.",
    icon: Globe,
  },
  {
    date: 'F\u00e9vrier 2026',
    tag: 'Am\u00e9lioration',
    title: 'Verrouillage automatique par inactivit\u00e9',
    description:
      "Prot\u00e9gez les donn\u00e9es sensibles : l'\u00e9cran se verrouille apr\u00e8s une p\u00e9riode d'inactivit\u00e9 configurable.",
    icon: Shield,
  },
  {
    date: 'Janvier 2026',
    tag: 'Nouveau',
    title: 'Alertes de stock par email',
    description:
      'Recevez un email automatique quand un ingr\u00e9dient passe sous le seuil critique. Int\u00e9gration Resend.',
    icon: Zap,
  },
  {
    date: 'Janvier 2026',
    tag: 'Nouveau',
    title: 'Module fournisseurs',
    description:
      'G\u00e9rez vos fournisseurs, contacts et r\u00e9f\u00e9rences produits directement depuis le dashboard.',
    icon: BarChart3,
  },
  {
    date: 'Janvier 2026',
    tag: 'Am\u00e9lioration',
    title: 'Historique des mouvements de stock',
    description:
      "Tra\u00e7abilit\u00e9 compl\u00e8te : chaque entr\u00e9e, sortie et ajustement est enregistr\u00e9 avec l'auteur et la raison.",
    icon: BarChart3,
  },
  {
    date: 'D\u00e9cembre 2025',
    tag: 'Nouveau',
    title: 'Landing page redesign\u00e9e',
    description:
      'Nouvelle identit\u00e9 visuelle avec vid\u00e9o hero, mega-menu, pages par segment et animations Framer Motion.',
    icon: Sparkles,
  },
  {
    date: 'D\u00e9cembre 2025',
    tag: 'Nouveau',
    title: 'QR Code personnalis\u00e9 premium',
    description:
      '6 templates de QR codes avec pr\u00e9visualisation en temps r\u00e9el et export PDF.',
    icon: Smartphone,
  },
];

export default function NouveautesPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white pb-12 pt-20 lg:pt-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 text-4xl font-bold text-neutral-900 sm:text-5xl"
          >
            Nouveaut\u00e9s
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg text-neutral-600 sm:text-xl"
          >
            Les derni\u00e8res fonctionnalit\u00e9s et am\u00e9liorations d&apos;Attabl.
          </motion.p>
        </div>
      </section>

      {/* Timeline */}
      <section className="bg-neutral-50 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {updates.map((update, idx) => (
              <motion.div
                key={update.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.05 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-neutral-200 bg-white p-8"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <update.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                      {update.date}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        update.tag === 'Nouveau'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {update.tag}
                    </span>
                  </div>
                </div>
                <h3 className="mb-2 text-xl font-semibold text-neutral-900">{update.title}</h3>
                <p className="leading-relaxed text-neutral-600">{update.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-6 text-3xl font-bold text-neutral-900 sm:text-4xl">
            Pr&ecirc;t &agrave; essayer ?
          </h2>
          <p className="mb-10 text-lg text-neutral-600">14 jours gratuits. Sans carte bancaire.</p>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-lg bg-black px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-neutral-900"
          >
            Commencer gratuitement
          </Link>
        </div>
      </section>
    </>
  );
}

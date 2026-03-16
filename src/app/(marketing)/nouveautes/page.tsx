'use client';

import { motion } from 'framer-motion';
import { Sparkles, Shield, Zap, Globe, BarChart3, Smartphone } from 'lucide-react';
import Link from 'next/link';

const updates = [
  {
    date: 'Février 2026',
    tag: 'Nouveau',
    title: 'Système de permissions par rôle',
    description:
      '6 rôles (propriétaire, admin, manager, caissier, chef, serveur) avec des permissions granulaires. Chaque équipier voit exactement ce dont il a besoin.',
    icon: Shield,
  },
  {
    date: 'Février 2026',
    tag: 'Nouveau',
    title: 'Internationalisation (8 locales)',
    description:
      "Interface disponible en français, anglais (US, GB, CA, AU, IE) et espagnol. Changez la langue de l'interface en un clic.",
    icon: Globe,
  },
  {
    date: 'Février 2026',
    tag: 'Amélioration',
    title: 'Verrouillage automatique par inactivité',
    description:
      "Protégez les données sensibles : l'écran se verrouille après une période d'inactivité configurable.",
    icon: Shield,
  },
  {
    date: 'Janvier 2026',
    tag: 'Nouveau',
    title: 'Alertes de stock par email',
    description:
      'Recevez un email automatique quand un ingrédient passe sous le seuil critique. Intégration Resend.',
    icon: Zap,
  },
  {
    date: 'Janvier 2026',
    tag: 'Nouveau',
    title: 'Module fournisseurs',
    description:
      'Gérez vos fournisseurs, contacts et références produits directement depuis le dashboard.',
    icon: BarChart3,
  },
  {
    date: 'Janvier 2026',
    tag: 'Amélioration',
    title: 'Historique des mouvements de stock',
    description:
      "Traçabilité complète : chaque entrée, sortie et ajustement est enregistré avec l'auteur et la raison.",
    icon: BarChart3,
  },
  {
    date: 'Décembre 2025',
    tag: 'Nouveau',
    title: 'Landing page redesignée',
    description:
      'Nouvelle identité visuelle avec vidéo hero, mega-menu, pages par segment et animations Framer Motion.',
    icon: Sparkles,
  },
  {
    date: 'Décembre 2025',
    tag: 'Nouveau',
    title: 'QR Code personnalisé premium',
    description: '6 templates de QR codes avec prévisualisation en temps réel et export PDF.',
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
            Nouveautés
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg text-neutral-600 sm:text-xl"
          >
            Les dernières fonctionnalités et améliorations d&apos;Attabl.
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
                          ? 'bg-primary/10 text-lime-700'
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
          <h2 className="mb-6 text-3xl font-bold text-neutral-900 sm:text-4xl">Prêt à essayer ?</h2>
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

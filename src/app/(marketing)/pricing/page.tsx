'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Check, Minus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────
type BillingPeriod = 'monthly' | 'yearly';

interface Plan {
  name: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  subtitle: string;
  description: string;
  cta: string;
  ctaHref: string;
  popular?: boolean;
  trialPlan?: boolean;
  highlights: string[];
}

// ─── Plans ──────────────────────────────────
const plans: Plan[] = [
  {
    name: 'STARTER',
    priceMonthly: 39000,
    priceYearly: 31200,
    subtitle: 'Pour demarrer',
    description: 'Pour digitaliser votre menu et vos commandes.',
    cta: 'Commencer',
    ctaHref: '/signup',
    highlights: ['Menu QR bilingue', 'POS basique', '1 admin, 3 staff', 'Support email'],
  },
  {
    name: 'PRO',
    priceMonthly: 79000,
    priceYearly: 63200,
    subtitle: 'Le plus populaire',
    description: 'Pilotez votre restaurant comme un pro.',
    cta: 'Essayer gratuitement',
    ctaHref: '/signup',
    popular: true,
    trialPlan: true,
    highlights: ['Tout STARTER +', 'KDS, tables, stock', 'Multi-devises', 'Support WhatsApp 24h'],
  },
  {
    name: 'BUSINESS',
    priceMonthly: 149000,
    priceYearly: 119200,
    subtitle: 'Multi-sites',
    description: 'Gérez un hôtel ou une chaîne, tout au même endroit.',
    cta: 'Commencer',
    ctaHref: '/signup',
    highlights: [
      'Tout PRO +',
      "Jusqu'a 10 sites",
      'Room service, delivery',
      'Support prioritaire 4h',
    ],
  },
  {
    name: 'ENTERPRISE',
    priceMonthly: null,
    priceYearly: null,
    subtitle: 'Sur mesure',
    description: 'Solution sur mesure pour les grands groupes.',
    cta: 'Contactez-nous',
    ctaHref: '/contact',
    highlights: ['Tout BUSINESS +', 'Sites illimites', 'SLA 99.9%', 'Account manager'],
  },
];

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('fr-FR').format(price);
};

// ─── Feature Comparison Grid ──────────────────────────────────
interface FeatureRow {
  label: string;
  starter: boolean | string;
  pro: boolean | string;
  business: boolean | string;
  enterprise: boolean | string;
}

const featureCategories: { title: string; features: FeatureRow[] }[] = [
  {
    title: 'Menu & Commandes',
    features: [
      {
        label: 'Menu QR digital bilingue',
        starter: true,
        pro: true,
        business: true,
        enterprise: true,
      },
      { label: 'Commandes sur place', starter: true, pro: true, business: true, enterprise: true },
      { label: 'Commandes a emporter', starter: true, pro: true, business: true, enterprise: true },
      { label: 'Commandes delivery', starter: false, pro: false, business: true, enterprise: true },
      {
        label: 'Room service digital',
        starter: false,
        pro: false,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Encaissement',
    features: [
      { label: 'POS (cash + carte)', starter: true, pro: true, business: true, enterprise: true },
      { label: 'Mobile money', starter: false, pro: true, business: true, enterprise: true },
      {
        label: 'Multi-devises (XAF, EUR, USD)',
        starter: false,
        pro: true,
        business: true,
        enterprise: true,
      },
      { label: 'Pourboires integres', starter: false, pro: true, business: true, enterprise: true },
      {
        label: 'Reconciliation automatique',
        starter: false,
        pro: true,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Cuisine & Production',
    features: [
      { label: 'KDS (ecran cuisine)', starter: false, pro: true, business: true, enterprise: true },
      { label: 'Gestion des tables', starter: false, pro: true, business: true, enterprise: true },
      {
        label: 'Assignation serveurs',
        starter: false,
        pro: true,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Stock & Fournisseurs',
    features: [
      { label: 'Gestion de stock', starter: false, pro: true, business: true, enterprise: true },
      {
        label: 'Fiches techniques (cout matiere)',
        starter: false,
        pro: true,
        business: true,
        enterprise: true,
      },
      { label: 'Suivi fournisseurs', starter: false, pro: true, business: true, enterprise: true },
      {
        label: 'Alertes reapprovisionnement',
        starter: false,
        pro: true,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Analytics & Rapports',
    features: [
      {
        label: 'Dashboard (CA, commandes)',
        starter: true,
        pro: true,
        business: true,
        enterprise: true,
      },
      { label: 'Rapports de vente', starter: false, pro: true, business: true, enterprise: true },
      { label: 'Best-sellers', starter: false, pro: true, business: true, enterprise: true },
      { label: 'Analytics IA', starter: false, pro: false, business: true, enterprise: true },
      {
        label: 'Rapports multi-sites',
        starter: false,
        pro: false,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Equipe & Organisation',
    features: [
      {
        label: 'Gestion equipe (roles, permissions)',
        starter: false,
        pro: true,
        business: true,
        enterprise: true,
      },
      { label: 'Etablissements', starter: '1', pro: '1', business: '10', enterprise: 'Illimite' },
      { label: 'Admins', starter: '1', pro: '1', business: 'Illimite', enterprise: 'Illimite' },
      { label: 'Staff', starter: '3', pro: '10', business: 'Illimite', enterprise: 'Illimite' },
    ],
  },
  {
    title: 'Support',
    features: [
      { label: 'Support email', starter: true, pro: true, business: true, enterprise: true },
      {
        label: 'Support WhatsApp',
        starter: false,
        pro: '24h',
        business: '4h prioritaire',
        enterprise: '1h telephone',
      },
      { label: 'Account manager', starter: false, pro: false, business: false, enterprise: true },
      { label: 'SLA garanti', starter: false, pro: false, business: false, enterprise: '99.9%' },
      {
        label: 'Integrations API sur mesure',
        starter: false,
        pro: false,
        business: false,
        enterprise: true,
      },
    ],
  },
];

// ─── FAQ ──────────────────────────────────
const faqs = [
  {
    q: "Comment fonctionne l'essai gratuit ?",
    a: "14 jours d'acces complet au plan PRO. Sans carte bancaire. Vous testez tout : KDS, POS, stock, tables.",
  },
  {
    q: 'Que se passe-t-il apres les 14 jours ?',
    a: 'Votre menu reste visible pour vos clients. Votre dashboard passe en lecture seule. Choisissez un plan pour reprendre le controle.',
  },
  {
    q: 'Puis-je changer de plan ?',
    a: 'Oui, a tout moment. Montee en gamme immediate. Retour en arriere a la fin de la periode en cours.',
  },
  {
    q: 'Y a-t-il un engagement ?',
    a: 'Mensuel = sans engagement. Annuel = -20%.',
  },
  {
    q: 'Comment je paie ?',
    a: 'Par carte bancaire (Visa, Mastercard) via Stripe. Paiement securise.',
  },
  {
    q: 'Je dois acheter du materiel ?',
    a: 'Non. ATTABL est un logiciel. Utilisez votre telephone, tablette ou ordinateur existant.',
  },
  {
    q: 'Combien de menus je peux creer ?',
    a: 'Illimite sur tous les plans.',
  },
  {
    q: "Et si j'ai plusieurs restaurants ?",
    a: "Plan BUSINESS (jusqu'a 10 sites) ou ENTERPRISE (illimite).",
  },
];

// ─── FAQ Accordion Item ──────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left cursor-pointer"
      >
        <span className="font-semibold text-neutral-900 dark:text-white text-sm sm:text-base pr-4">
          {q}
        </span>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-neutral-400 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-40 pb-5' : 'max-h-0',
        )}
      >
        <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

// ─── Feature Cell ──────────────────────────────────
function FeatureCell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="w-4 h-4 text-green-600 mx-auto" />;
  if (value === false)
    return <Minus className="w-4 h-4 text-neutral-300 dark:text-neutral-600 mx-auto" />;
  return <span className="text-xs font-medium text-neutral-900 dark:text-white">{value}</span>;
}

// ─── Page ──────────────────────────────────
export default function PricingPage() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  return (
    <>
      {/* Hero + Plan Cards */}
      <section className="bg-white dark:bg-neutral-950 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-white">
              Un prix clair. Pas de surprise.
            </h1>
            <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-4">
              {"14 jours d'essai gratuit sur le plan PRO. Sans carte bancaire."}
            </p>

            {/* Billing toggle */}
            <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 rounded-full p-1 mt-8">
              <button
                type="button"
                onClick={() => setPeriod('monthly')}
                className={cn(
                  'px-5 py-2 text-sm font-medium cursor-pointer transition-all rounded-full',
                  period === 'monthly'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400',
                )}
              >
                Mensuel
              </button>
              <button
                type="button"
                onClick={() => setPeriod('yearly')}
                className={cn(
                  'px-5 py-2 text-sm font-medium cursor-pointer transition-all rounded-full',
                  period === 'yearly'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400',
                )}
              >
                Annuel
                <span className="ml-1.5 text-xs text-green-600 font-semibold">-20%</span>
              </button>
            </div>
          </div>

          {/* Plan cards — badge floats above the card */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            {plans.map((plan) => {
              const price = period === 'yearly' ? plan.priceYearly : plan.priceMonthly;
              const isCustom = price === null;

              return (
                <div key={plan.name} className="relative">
                  {/* Badge floats ABOVE the card */}
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <span className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[10px] px-3 py-1 rounded-full font-semibold uppercase tracking-wider whitespace-nowrap">
                        Le plus populaire
                      </span>
                    </div>
                  )}

                  <div
                    className={cn(
                      'bg-white dark:bg-neutral-800 rounded-2xl p-6 sm:p-8 flex flex-col h-full',
                      plan.popular
                        ? 'ring-2 ring-neutral-900 dark:ring-white border border-transparent'
                        : 'border border-neutral-200 dark:border-neutral-700',
                    )}
                  >
                    {/* Plan name + description */}
                    <div className="mb-5">
                      <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                        {plan.name}
                      </h3>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        {plan.description}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      {isCustom ? (
                        <span className="text-3xl font-bold text-neutral-900 dark:text-white">
                          Sur mesure
                        </span>
                      ) : (
                        <>
                          <span className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white tabular-nums">
                            {formatPrice(price)}
                          </span>
                          <span className="text-sm text-neutral-500 dark:text-neutral-400 block mt-1">
                            XAF/mois
                          </span>
                          {period === 'yearly' && plan.priceMonthly && (
                            <span className="text-xs text-neutral-400 dark:text-neutral-500 line-through block mt-0.5">
                              {formatPrice(plan.priceMonthly)} XAF/mois
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* CTA */}
                    <Link
                      href={plan.ctaHref}
                      className={cn(
                        'block w-full text-center rounded-lg py-3 text-sm font-semibold transition-colors',
                        plan.popular
                          ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100'
                          : 'bg-neutral-900 text-white hover:bg-neutral-800',
                      )}
                    >
                      {plan.cta}
                    </Link>
                    {plan.trialPlan && (
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500 text-center mt-2">
                        {"Plan de l'essai gratuit 14 jours"}
                      </p>
                    )}

                    {/* Highlights — short list */}
                    <ul className="mt-6 space-y-2.5 flex-1">
                      {plan.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                          <span className="text-neutral-600 dark:text-neutral-400 text-sm">
                            {h}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature Comparison Grid */}
      <section className="bg-neutral-50 dark:bg-neutral-900 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white text-center mb-12">
            Comparatif complet des fonctionnalites
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              {/* Header */}
              <thead>
                <tr className="border-b-2 border-neutral-200 dark:border-neutral-700">
                  <th className="text-left py-4 pr-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 w-[40%]">
                    Fonctionnalite
                  </th>
                  {['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'].map((name) => (
                    <th
                      key={name}
                      className="text-center py-4 px-2 text-sm font-bold text-neutral-900 dark:text-white w-[15%]"
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {featureCategories.map((cat) => (
                  <Fragment key={cat.title}>
                    {/* Category header */}
                    <tr>
                      <td
                        colSpan={5}
                        className="pt-8 pb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
                      >
                        {cat.title}
                      </td>
                    </tr>
                    {/* Feature rows */}
                    {cat.features.map((f) => (
                      <tr
                        key={f.label}
                        className="border-b border-neutral-100 dark:border-neutral-800"
                      >
                        <td className="py-3 pr-4 text-sm text-neutral-700 dark:text-neutral-300">
                          {f.label}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <FeatureCell value={f.starter} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <FeatureCell value={f.pro} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <FeatureCell value={f.business} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <FeatureCell value={f.enterprise} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="bg-white dark:bg-neutral-950 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white mb-8 text-center">
            Questions frequentes
          </h2>
          <div>
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

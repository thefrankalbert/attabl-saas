'use client';

import { Fragment, useState } from 'react';
import {
  Check,
  ChevronDown,
  CreditCard,
  Crown,
  Minus,
  Zap,
  Building2,
  Phone,
  Users,
  BarChart3,
  UtensilsCrossed,
  Star,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SinglePricingCard, type Testimonial } from '@/components/ui/single-pricing-card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

// ─── Types ──────────────────────────────────
type BillingPeriod = 'monthly' | 'yearly';

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('fr-FR').format(price);
};

// ─── Testimonials ──────────────────────────────────
const testimonials: Testimonial[] = [
  {
    id: 1,
    name: 'Amadou K.',
    role: 'Gerant',
    company: "Le Jardin, N'Djamena",
    content:
      "On a reduit les erreurs de commande de 40% en 2 mois. La cuisine recoit tout sur l'ecran, plus de tickets perdus.",
    rating: 5,
    avatar:
      'https://images.unsplash.com/photo-1589156280159-27698a70f29e?w=80&h=80&fit=crop&crop=face',
  },
  {
    id: 2,
    name: 'Grace M.',
    role: 'Proprietaire',
    company: 'Chez Mama, Douala',
    content: '200 commandes par jour, zero stress. Le KDS fait le tri, on prepare, on envoie.',
    rating: 5,
    avatar:
      'https://images.unsplash.com/photo-1611432579699-484f7990b127?w=80&h=80&fit=crop&crop=face',
  },
  {
    id: 3,
    name: 'Ibrahim D.',
    role: 'Directeur',
    company: 'Hotel Prestige, Abidjan',
    content:
      'Le room service digital a change notre classement Booking. Les clients commandent depuis le lit, en anglais ou en francais.',
    rating: 5,
    avatar:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&h=80&fit=crop&crop=face',
  },
  {
    id: 4,
    name: 'Fatou S.',
    role: 'Gerante',
    company: 'La Terrasse, Dakar',
    content:
      "En 3 mois, notre chiffre d'affaires a augmente de 25%. Le menu digital pousse les clients a commander plus.",
    rating: 5,
    avatar:
      'https://images.unsplash.com/photo-1523824921871-d6f1a15151f1?w=80&h=80&fit=crop&crop=face',
  },
];

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
      { label: 'Rapports avances', starter: false, pro: false, business: true, enterprise: true },
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
      { label: 'Etablissements', starter: '1', pro: '1', business: '10', enterprise: 'Illimite' },
      { label: 'Admins', starter: '1', pro: '1', business: '99', enterprise: '99+' },
      { label: 'Staff', starter: '3', pro: '10', business: '999', enterprise: '999+' },
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
  { q: 'Y a-t-il un engagement ?', a: 'Mensuel = sans engagement. Annuel = -20%.' },
  {
    q: 'Comment je paie ?',
    a: 'Par carte bancaire (Visa, Mastercard) via Stripe. Paiement securise.',
  },
  {
    q: 'Je dois acheter du materiel ?',
    a: 'Non. ATTABL est un logiciel. Utilisez votre telephone, tablette ou ordinateur existant.',
  },
];

// ─── FAQ Accordion Item ──────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left h-auto px-0 justify-between hover:bg-transparent"
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
      </Button>
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

  const starterPrice = period === 'yearly' ? 31200 : 39000;
  const proPrice = period === 'yearly' ? 63200 : 79000;
  const businessPrice = period === 'yearly' ? 119200 : 149000;

  return (
    <>
      {/* Hero */}
      <section className="bg-white dark:bg-neutral-950 pt-20 lg:pt-28 pb-8">
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPeriod('monthly')}
                className={cn(
                  'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                  period === 'monthly'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
                )}
              >
                Mensuel
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPeriod('yearly')}
                className={cn(
                  'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                  period === 'yearly'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
                )}
              >
                Annuel
                <span className="ml-1.5 text-xs text-green-600 font-semibold">-20%</span>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="bg-white dark:bg-neutral-950 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* STARTER */}
          <SinglePricingCard
            badge={{ icon: Zap, text: 'Pour demarrer' }}
            title="STARTER"
            subtitle="Digitalisez votre menu et vos commandes."
            price={{
              current: `${formatPrice(starterPrice)} XAF/mois`,
              original: period === 'yearly' ? `${formatPrice(39000)} XAF/mois` : undefined,
              discount: period === 'yearly' ? '-20%' : undefined,
            }}
            benefits={[
              { text: 'Menu QR bilingue (FR/EN)', icon: UtensilsCrossed },
              { text: 'POS basique (cash + carte)', icon: CreditCard },
              { text: '1 admin, 3 staff', icon: Users },
              { text: 'Support email', icon: Phone },
            ]}
            features={[
              { text: 'Menu QR digital bilingue' },
              { text: 'Commandes sur place et a emporter' },
              { text: 'POS cash et carte bancaire' },
              { text: 'Dashboard (CA, commandes)' },
              { text: '1 etablissement, 2 menus' },
            ]}
            featuresIcon={Check}
            featuresTitle="Inclus dans STARTER"
            primaryButton={{ text: 'Commencer', href: '/signup' }}
            testimonials={[testimonials[0], testimonials[1]]}
            testimonialRotationSpeed={6000}
          />

          {/* PRO */}
          <SinglePricingCard
            badge={{ icon: Crown, text: 'Essai gratuit 14 jours' }}
            title="PRO"
            subtitle="Pilotez votre restaurant comme un pro."
            popular
            price={{
              current: `${formatPrice(proPrice)} XAF/mois`,
              original: period === 'yearly' ? `${formatPrice(79000)} XAF/mois` : undefined,
              discount: period === 'yearly' ? '-20%' : undefined,
            }}
            benefits={[
              { text: 'Tout STARTER + KDS, tables, stock', icon: Star },
              { text: 'Multi-devises (XAF, EUR, USD)', icon: BarChart3 },
              { text: 'Essai gratuit 14 jours sans CB', icon: Shield },
              { text: 'Support WhatsApp 24h', icon: Phone },
            ]}
            features={[
              { text: 'Tout ce qui est dans STARTER' },
              { text: 'KDS (ecran cuisine)' },
              { text: 'Gestion des tables et assignation serveurs' },
              { text: 'Gestion de stock et alertes' },
              { text: 'Fiches techniques (cout matiere)' },
              { text: 'Suivi fournisseurs' },
              { text: 'Mobile money et pourboires' },
              { text: 'Rapports de vente et best-sellers' },
              { text: 'Gestion equipe (roles, permissions)' },
              { text: '10 menus, 10 staff' },
            ]}
            featuresIcon={Check}
            featuresTitle="Inclus dans PRO"
            primaryButton={{ text: 'Essayer gratuitement', href: '/signup' }}
            testimonials={testimonials}
            testimonialRotationSpeed={5000}
          />

          {/* BUSINESS */}
          <SinglePricingCard
            badge={{ icon: Building2, text: 'Multi-sites' }}
            title="BUSINESS"
            subtitle="Gerez un hotel ou une chaine, tout au meme endroit."
            price={{
              current: `${formatPrice(businessPrice)} XAF/mois`,
              original: period === 'yearly' ? `${formatPrice(149000)} XAF/mois` : undefined,
              discount: period === 'yearly' ? '-20%' : undefined,
            }}
            benefits={[
              { text: "Tout PRO + jusqu'a 10 sites", icon: Building2 },
              { text: 'Room service et delivery', icon: UtensilsCrossed },
              { text: 'Rapports avances et multi-sites', icon: BarChart3 },
              { text: 'Support prioritaire 4h', icon: Phone },
            ]}
            features={[
              { text: 'Tout ce qui est dans PRO' },
              { text: 'Room service digital' },
              { text: 'Commandes delivery' },
              { text: 'Rapports avances' },
              { text: 'Rapports multi-sites' },
              { text: "Jusqu'a 10 etablissements" },
              { text: '99 admins, 999 staff, 99 menus' },
            ]}
            featuresIcon={Check}
            featuresTitle="Inclus dans BUSINESS"
            primaryButton={{ text: 'Commencer', href: '/signup' }}
            secondaryButton={{ text: 'Voir une demo', href: '/contact' }}
            testimonials={[testimonials[2], testimonials[3]]}
            testimonialRotationSpeed={6000}
          />

          {/* ENTERPRISE */}
          <SinglePricingCard
            badge={{ icon: Crown, text: 'Sur mesure' }}
            title="ENTERPRISE"
            subtitle="Solution sur mesure pour les grands groupes."
            price={{ current: 'Sur mesure' }}
            benefits={[
              { text: 'Tout BUSINESS + sites illimites', icon: Building2 },
              { text: 'SLA 99.9% garanti', icon: Shield },
              { text: 'Account manager dedie', icon: Users },
              { text: 'Support telephone 1h + API sur mesure', icon: Phone },
            ]}
            features={[
              { text: 'Tout ce qui est dans BUSINESS' },
              { text: 'Etablissements illimites' },
              { text: 'SLA 99.9%' },
              { text: 'Account manager' },
              { text: 'Integrations API sur mesure' },
              { text: 'Support telephone prioritaire 1h' },
            ]}
            featuresIcon={Check}
            featuresTitle="Inclus dans ENTERPRISE"
            primaryButton={{ text: 'Contactez-nous', href: '/contact' }}
            testimonials={[testimonials[2]]}
            testimonialRotationSpeed={8000}
          />
        </div>
      </section>

      {/* Feature Comparison Grid */}
      <section className="bg-neutral-50 dark:bg-neutral-900 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white text-center mb-12">
            Comparatif complet des fonctionnalites
          </h2>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-neutral-200 dark:border-neutral-700">
                  <TableHead className="text-left py-4 pr-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 w-[40%]">
                    Fonctionnalite
                  </TableHead>
                  {['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'].map((name) => (
                    <TableHead
                      key={name}
                      className="text-center py-4 px-2 text-sm font-bold text-neutral-900 dark:text-white w-[15%]"
                    >
                      {name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureCategories.map((cat) => (
                  <Fragment key={cat.title}>
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="pt-8 pb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
                      >
                        {cat.title}
                      </TableCell>
                    </TableRow>
                    {cat.features.map((f) => (
                      <TableRow
                        key={f.label}
                        className="border-b border-neutral-100 dark:border-neutral-800"
                      >
                        <TableCell className="py-3 pr-4 text-sm text-neutral-700 dark:text-neutral-300">
                          {f.label}
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell value={f.starter} />
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell value={f.pro} />
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell value={f.business} />
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell value={f.enterprise} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {/* FAQ */}
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

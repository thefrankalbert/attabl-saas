'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Layout,
  ArrowRight,
  Sparkles,
  Shield,
  Smartphone,
  QrCode,
  BarChart3,
  Globe,
  CreditCard,
  Building2,
  ShoppingCart,
  ClipboardList,
  Settings,
  Menu as MenuIcon,
  CheckCircle2,
  Zap,
  Database,
  Lock,
  Wifi,
  Star,
  Moon,
  Sun,
  ArrowLeft,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useState } from 'react';

// ============================================
// FEATURES DATA
// ============================================

const newFeatures = [
  {
    title: 'Super Admin',
    description: 'Accès universel pour tester tous les établissements',
    date: 'Février 2026',
    icon: Shield,
    tag: 'Admin',
  },
  {
    title: 'Dark Mode',
    description: 'Interface sombre par défaut, plus immersive',
    date: 'Février 2026',
    icon: Moon,
    tag: 'UI',
  },
  {
    title: 'Prix Stripe Synchronisés',
    description: 'Gestion automatique des prix en FCFA',
    date: 'Février 2026',
    icon: CreditCard,
    tag: 'Paiement',
  },
];

const adminFeatures = [
  {
    category: 'Tableau de Bord',
    icon: BarChart3,
    features: [
      { name: 'Statistiques temps réel', desc: 'Commandes, revenus, items populaires' },
      { name: 'Commandes du jour', desc: 'Compteur et liste en direct' },
      { name: 'Revenus journaliers', desc: "Chiffre d'affaires en FCFA" },
      { name: 'Commandes actives', desc: 'Pending, preparing, ready' },
      { name: 'Dernières commandes', desc: '5 plus récentes avec statut' },
    ],
  },
  {
    category: 'Gestion des Commandes',
    icon: ClipboardList,
    features: [
      { name: 'Workflow complet', desc: 'Pending → Preparing → Ready → Delivered' },
      { name: 'Validation serveur', desc: 'Vérification prix et disponibilité' },
      { name: 'Numéro de table/chambre', desc: 'Attribution automatique' },
      { name: 'Notes pour la cuisine', desc: 'Instructions spéciales' },
      { name: 'Historique complet', desc: 'Toutes les commandes passées' },
    ],
  },
  {
    category: 'Gestion des Menus',
    icon: MenuIcon,
    features: [
      { name: 'Support bilingue', desc: 'Français et Anglais' },
      { name: 'Photos HD', desc: 'Images haute définition' },
      { name: 'Options & Variantes', desc: 'Tailles, préparations, prix différents' },
      { name: 'Catégories', desc: 'Organisation personnalisable' },
      { name: 'Indicateurs', desc: 'Végétarien, épicé, disponibilité' },
    ],
  },
  {
    category: 'QR Codes',
    icon: QrCode,
    features: [
      { name: '3 templates', desc: 'Standard, Chevalet, Carte de visite' },
      { name: 'Export PDF', desc: 'Téléchargement haute résolution' },
      { name: 'Personnalisation', desc: 'Logo et couleurs de marque' },
      { name: 'Impression directe', desc: 'Via le navigateur' },
    ],
  },
  {
    category: 'Paramètres',
    icon: Settings,
    features: [
      { name: 'Branding complet', desc: 'Logo, couleurs, description' },
      { name: 'Informations établissement', desc: 'Adresse, téléphone, type' },
      { name: 'Gestion équipe', desc: 'Admins multiples avec rôles' },
      { name: 'Notifications', desc: 'Alertes sonores configurables' },
    ],
  },
  {
    category: 'Abonnement & Facturation',
    icon: CreditCard,
    features: [
      { name: '3 plans disponibles', desc: 'Essentiel, Premium, Entreprise' },
      { name: 'Paiement Stripe', desc: 'Sécurisé et automatique' },
      { name: 'Essai gratuit 14 jours', desc: 'Sans engagement' },
      { name: 'Factures automatiques', desc: 'Mensuelles ou annuelles' },
    ],
  },
];

const clientFeatures = [
  {
    category: 'Navigation Menu',
    icon: Smartphone,
    features: [
      { name: 'Catégories visuelles', desc: 'Navigation intuitive' },
      { name: 'Photos des plats', desc: 'Images HD appétissantes' },
      { name: 'Prix en FCFA', desc: 'Formatage local' },
      { name: 'Indicateurs alimentaires', desc: 'Végétarien, épicé' },
      { name: 'Disponibilité temps réel', desc: 'Stock mis à jour' },
    ],
  },
  {
    category: 'Sélection & Panier',
    icon: ShoppingCart,
    features: [
      { name: 'Options & variantes', desc: 'Choix via dropdown' },
      { name: 'Contrôles quantité', desc: 'Boutons +/- intuitifs' },
      { name: 'Panier persistant', desc: 'Sauvegarde localStorage' },
      { name: 'Notes spéciales', desc: 'Instructions pour la cuisine' },
      { name: 'Calcul dynamique', desc: 'Total en temps réel' },
    ],
  },
  {
    category: 'Checkout & Confirmation',
    icon: CheckCircle2,
    features: [
      { name: 'Revue complète', desc: 'Récapitulatif avant commande' },
      { name: 'Modification facile', desc: 'Quantités et items' },
      { name: 'Numéro de commande', desc: 'Suivi unique' },
      { name: 'Confirmation instantanée', desc: 'Page de succès' },
    ],
  },
  {
    category: 'Multi-langues',
    icon: Globe,
    features: [
      { name: 'Français & Anglais', desc: 'Interface complète' },
      { name: 'Détection automatique', desc: 'Selon le navigateur' },
      { name: 'Toggle manuel', desc: 'Changement instantané' },
      { name: 'Contenu bilingue', desc: 'Menus traduits' },
    ],
  },
];

const technicalFeatures = [
  { icon: Database, name: 'Multi-tenant', desc: 'Isolation complète des données' },
  { icon: Lock, name: 'Authentification', desc: 'Email, Google, Microsoft' },
  { icon: Wifi, name: 'Temps réel', desc: 'Mises à jour instantanées' },
  { icon: Smartphone, name: 'Mobile-first', desc: 'Responsive design' },
  { icon: Zap, name: 'Performance', desc: 'Next.js 16 + Turbopack' },
  { icon: Shield, name: 'Sécurité', desc: 'RLS Supabase + validation' },
];

// ============================================
// COMPONENTS
// ============================================

const FeatureCard = ({ feature, index }: { feature: (typeof adminFeatures)[0]; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: index * 0.1 }}
    className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-[#CCFF00]/30 transition-all group"
  >
    <div className="flex items-center gap-3 mb-6">
      <div className="bg-[#CCFF00]/10 rounded-xl p-3 group-hover:bg-[#CCFF00]/20 transition-colors">
        <feature.icon className="h-6 w-6 text-[#CCFF00]" />
      </div>
      <h3 className="text-xl font-bold text-white">{feature.category}</h3>
    </div>
    <ul className="space-y-4">
      {feature.features.map((f, i) => (
        <li key={i} className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-[#CCFF00] shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-white">{f.name}</div>
            <div className="text-sm text-gray-400">{f.desc}</div>
          </div>
        </li>
      ))}
    </ul>
  </motion.div>
);

// ============================================
// PAGE COMPONENT
// ============================================

export default function FeaturesPage() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'admin' | 'client'>('admin');

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="bg-[#CCFF00] rounded-xl p-2 group-hover:scale-105 transition-transform">
              <Layout className="h-5 w-5 text-black" />
            </div>
            <span className="text-xl font-bold tracking-tight">ATTABL</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Link>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <Link href="/signup">
              <Button className="bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-xl">
                Commencer
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="bg-[#CCFF00]/10 text-[#CCFF00] border-[#CCFF00]/30 mb-6 px-4 py-2">
              <Sparkles className="h-4 w-4 mr-2" />
              Toutes les fonctionnalités
            </Badge>

            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Une plateforme <span className="text-[#CCFF00]">complète</span>
              <br />
              pour votre établissement
            </h1>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12">
              Découvrez toutes les fonctionnalités qui font d&apos;ATTABL la solution idéale pour
              digitaliser votre restaurant ou hôtel.
            </p>
          </motion.div>
        </div>
      </section>

      {/* New Features / À la Une */}
      <section className="py-16 px-6 border-y border-white/5 bg-gradient-to-b from-[#CCFF00]/5 to-transparent">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-[#CCFF00] rounded-lg p-2">
              <Star className="h-5 w-5 text-black" />
            </div>
            <h2 className="text-2xl font-bold">Nouveautés</h2>
            <Badge variant="outline" className="border-[#CCFF00]/50 text-[#CCFF00]">
              À la une
            </Badge>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {newFeatures.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-gradient-to-br from-[#CCFF00]/10 to-transparent border border-[#CCFF00]/20 rounded-2xl p-6 hover:border-[#CCFF00]/40 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-[#CCFF00]/20 rounded-xl p-3">
                    <feature.icon className="h-6 w-6 text-[#CCFF00]" />
                  </div>
                  <Badge variant="outline" className="text-xs border-white/20 text-gray-400">
                    {feature.tag}
                  </Badge>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 mb-3">{feature.description}</p>
                <div className="text-xs text-[#CCFF00] font-medium">{feature.date}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tab Navigation */}
      <section className="py-8 px-6 sticky top-16 z-40 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${
                activeTab === 'admin'
                  ? 'bg-[#CCFF00] text-black'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Building2 className="h-5 w-5 inline mr-2" />
              Dashboard Admin
            </button>
            <button
              onClick={() => setActiveTab('client')}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${
                activeTab === 'client'
                  ? 'bg-[#CCFF00] text-black'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Smartphone className="h-5 w-5 inline mr-2" />
              Application Client
            </button>
          </div>
        </div>
      </section>

      {/* Admin Features */}
      {activeTab === 'admin' && (
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">
                  Fonctionnalités <span className="text-[#CCFF00]">Dashboard Admin</span>
                </h2>
                <p className="text-gray-400 max-w-2xl mx-auto">
                  Gérez votre établissement avec un tableau de bord puissant et intuitif. Toutes les
                  fonctionnalités dont vous avez besoin pour piloter votre activité.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {adminFeatures.map((feature, i) => (
                  <FeatureCard key={i} feature={feature} index={i} />
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Client Features */}
      {activeTab === 'client' && (
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">
                  Fonctionnalités <span className="text-[#CCFF00]">Application Client</span>
                </h2>
                <p className="text-gray-400 max-w-2xl mx-auto">
                  Une expérience de commande fluide et moderne pour vos clients. Scan, commande,
                  paiement - tout en quelques taps.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {clientFeatures.map((feature, i) => (
                  <FeatureCard key={i} feature={feature} index={i} />
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Technical Features */}
      <section className="py-20 px-6 bg-gradient-to-b from-transparent to-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Infrastructure <span className="text-[#CCFF00]">Technique</span>
            </h2>
            <p className="text-gray-400">
              Construit avec les meilleures technologies pour performance et sécurité.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {technicalFeatures.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4 text-center hover:border-[#CCFF00]/30 transition-all"
              >
                <feature.icon className="h-8 w-8 text-[#CCFF00] mx-auto mb-3" />
                <div className="font-medium text-white text-sm">{feature.name}</div>
                <div className="text-xs text-gray-500">{feature.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-[#CCFF00]/20 to-[#CCFF00]/5 border border-[#CCFF00]/30 rounded-3xl p-12 text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Prêt à digitaliser votre établissement ?
            </h2>
            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              Rejoignez les restaurants et hôtels qui font confiance à ATTABL. 14 jours d&apos;essai
              gratuit, sans engagement.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button className="bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-xl px-8 h-12">
                  Commencer gratuitement
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button
                  variant="outline"
                  className="border-white/20 hover:bg-white/10 rounded-xl px-8 h-12"
                >
                  Nous contacter
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Layout className="h-5 w-5 text-[#CCFF00]" />
            <span className="font-bold">ATTABL</span>
          </div>
          <div className="text-sm text-gray-500">© 2026 ATTABL. Tous droits réservés.</div>
        </div>
      </footer>
    </div>
  );
}

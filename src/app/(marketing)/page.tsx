"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  QrCode,
  Zap,
  BarChart3,
  Shield,
  ArrowRight,
  Check
} from 'lucide-react';
import { useState } from 'react';
import { PricingCard, PricingPlan, BillingInterval } from '@/components/shared/PricingCard';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const features = [
    {
      icon: QrCode,
      title: 'Menu QR Code',
      description: 'Vos clients scannent, consultent et commandent en un instant',
    },
    {
      icon: Zap,
      title: 'Commandes temps réel',
      description: 'Synchronisation instantanée entre la salle et la cuisine',
    },
    {
      icon: BarChart3,
      title: 'Analytics puissants',
      description: 'Suivez vos ventes, identifiez les tendances, optimisez',
    },
    {
      icon: Shield,
      title: 'Multi-tenant sécurisé',
      description: 'Vos données sont isolées et protégées',
    },
  ];

  const handlePlanSelect = async (plan: PricingPlan, interval: BillingInterval) => {
    // Sur la landing page, on redirige vers le signup avec les paramètres en URL
    // Le signup traitera ensuite la création du checkout
    router.push(`/signup?plan=${plan}&interval=${interval}`);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
              <span className="text-white font-bold text-xl">A</span>
            </div>
            <span className="text-2xl font-bold tracking-tight">ATTABL</span>
          </div>
          <nav className="hidden md:flex gap-8">
            <a href="#features" className="text-gray-600 hover:text-gray-900 font-medium">Fonctionnalités</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900 font-medium">Tarifs</a>
          </nav>
          <div className="flex gap-4">
            <Link href="/login">
              <Button variant="ghost" className="font-medium">Connexion</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-blue-600 hover:bg-blue-700 shadow-md">Commencer gratuitement</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 bg-gradient-to-b from-blue-50/50 to-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('/grid.svg')] opacity-10"></div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <Badge className="mb-6 bg-blue-100 text-blue-700 hover:bg-blue-200 px-4 py-1.5 text-sm rounded-full transition-all">
            ✨ Nouveau : Module de commande en chambre disponible
          </Badge>
          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight text-gray-900">
            ATTABL <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-500">
              Commandez mieux
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            La solution tout-en-un pour digitaliser les restaurants et hôtels de luxe.
            De la commande à la satisfaction client.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/signup">
              <Button size="lg" className="text-lg px-8 h-14 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200/50 rounded-full">
                Essai gratuit 14 jours
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg px-8 h-14 rounded-full border-2 hover:bg-gray-50">
              Voir la démo
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-6 font-medium">
            <Check className="inline h-4 w-4 mr-1 text-green-500" /> Aucune carte bancaire requise
            <span className="mx-2">•</span>
            <Check className="inline h-4 w-4 mr-1 text-green-500" /> Configuration en 5 minutes
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">
              Tout ce dont vous avez besoin
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Une plateforme complète pour moderniser votre service et augmenter vos revenus
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <Card key={feature.title} className="border hover:border-blue-500/50 hover:shadow-lg transition-all duration-300 group">
                <CardContent className="pt-8">
                  <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="h-7 w-7 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-gray-50/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">
              Tarifs simples et transparents
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Choisissez le plan adapté à votre croissance
            </p>

            {/* Billing Toggle */}
            <div className="relative inline-flex bg-white p-1 rounded-full border shadow-sm">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${billingInterval === 'monthly'
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setBillingInterval('yearly')}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${billingInterval === 'yearly'
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Annuel
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${billingInterval === 'yearly' ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700'
                  }`}>
                  -20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
            {/* Essentiel */}
            <PricingCard
              plan="essentiel"
              billingInterval={billingInterval}
              onSelect={handlePlanSelect}
            />

            {/* Premium */}
            <PricingCard
              plan="premium"
              billingInterval={billingInterval}
              onSelect={handlePlanSelect}
            />

            {/* Enterprise (Static Card) */}
            <Card className="border-gray-200 border bg-gray-50/50">
              <CardContent className="pt-8 flex flex-col h-full">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900">Entreprise</h3>
                  <p className="text-sm text-gray-500 mt-2">Pour les grands groupes hôteliers</p>
                </div>

                <div className="text-center mb-6">
                  <span className="text-3xl font-bold text-gray-900">Sur mesure</span>
                </div>

                <div className="space-y-4 mb-8 flex-1">
                  {[
                    "Espaces illimités",
                    "Articles illimités",
                    "Admins illimités",
                    "Branding personnalisé (Logo + Domaine)",
                    "Support dédié 24/7",
                    "API access",
                    "SLA garanti"
                  ].map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-600 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                <Link href="mailto:contact@attabl.com" className="w-full">
                  <Button variant="outline" className="w-full h-12 text-lg font-semibold bg-white hover:bg-gray-50">
                    Nous contacter
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-blue-600 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-500/20 skew-x-12 transform origin-bottom-left"></div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Prêt à transformer votre restaurant ?
          </h2>
          <p className="text-xl mb-10 max-w-2xl mx-auto opacity-90 text-blue-100">
            Rejoignez les restaurants qui ont déjà augmenté leur ticket moyen de 20% avec ATTABL.
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="h-16 px-10 text-xl font-bold rounded-full shadow-2xl hover:scale-105 transition-transform duration-200">
              Commencer maintenant
              <ArrowRight className="ml-2 h-6 w-6" />
            </Button>
          </Link>
          <p className="mt-8 text-sm text-blue-200 opacity-80">
            Essai gratuit de 14 jours • Pas de carte requise • Annulation à tout moment
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-gray-900 text-gray-400 border-t border-gray-800">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">A</div>
                <span className="text-white font-bold text-xl tracking-tight">ATTABL</span>
              </div>
              <p className="text-sm leading-relaxed mb-6">
                La plateforme de commande digitale pour les restaurateurs exigeants.
              </p>
              <div className="flex gap-4">
                {/* Social icons placeholders */}
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6 tracking-wide uppercase text-xs">Produit</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Tarifs</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Témoignages</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Intégrations</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6 tracking-wide uppercase text-xs">Entreprise</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">À propos</a></li>
                <li><a href="mailto:contact@attabl.com" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Carrières</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6 tracking-wide uppercase text-xs">Légal</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Conditions d'utilisation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Politique de confidentialité</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Mentions légales</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cookies</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <p>© 2026 ATTABL Inc. Tous droits réservés.</p>
            <div className="flex gap-6">
              <span>Fait avec ❤️ pour l'Afrique</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  QrCode,
  Zap,
  BarChart3,
  Shield,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

export default function HomePage() {
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

  const pricing = [
    {
      name: 'Starter',
      price: '15,000',
      period: 'FCFA/mois',
      features: [
        '1 espace restaurant',
        '100 articles au menu',
        '2 comptes admin',
        'Support par email',
      ],
      cta: 'Commencer',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '35,000',
      period: 'FCFA/mois',
      features: [
        '3 espaces (restaurant, bar, pool)',
        '500 articles au menu',
        '5 comptes admin',
        'Multi-langues (FR/EN)',
        'Support prioritaire',
      ],
      cta: 'Essai gratuit 14 jours',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Sur mesure',
      period: '',
      features: [
        'Espaces illimités',
        'Articles illimités',
        'Admins illimités',
        'Branding personnalisé',
        'Support dédié 24/7',
      ],
      cta: 'Nous contacter',
      highlighted: false,
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">A</span>
            </div>
            <span className="text-2xl font-bold">ATTABL</span>
          </div>
          <nav className="hidden md:flex gap-8">
            <a href="#features" className="text-gray-600 hover:text-gray-900">Fonctionnalités</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900">Tarifs</a>
            <a href="#about" className="text-gray-600 hover:text-gray-900">À propos</a>
          </nav>
          <div className="flex gap-4">
            <Link href="/login">
              <Button variant="ghost">Connexion</Button>
            </Link>
            <Link href="/signup">
              <Button>Commencer gratuitement</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-blue-50 to-white">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            ATTABL
          </h1>
          <p className="text-2xl md:text-3xl text-gray-600 mb-4">
            Commandez mieux
          </p>
          <p className="text-xl text-gray-500 mb-8 max-w-2xl mx-auto">
            Le bonheur de vos clients se commande désormais en quelques clics.
            Digitalisez votre restaurant de luxe.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="text-lg px-8">
                Essai gratuit 14 jours
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg px-8">
              Voir la démo
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Aucune carte bancaire requise • Configuration en 5 minutes
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Tout ce dont vous avez besoin
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Une plateforme complète pour moderniser votre service
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <Card key={feature.title} className="border-2 hover:border-blue-500 transition">
                <CardContent className="pt-6">
                  <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Tarifs simples et transparents
            </h2>
            <p className="text-xl text-gray-600">
              Choisissez le plan adapté à votre restaurant
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pricing.map((plan) => (
              <Card
                key={plan.name}
                className={`${plan.highlighted ? 'border-blue-500 border-2 shadow-xl scale-105' : ''}`}
              >
                <CardContent className="pt-6">
                  {plan.highlighted && (
                    <div className="bg-blue-500 text-white text-sm font-semibold px-3 py-1 rounded-full inline-block mb-4">
                      Populaire
                    </div>
                  )}
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className="text-gray-600 ml-2">{plan.period}</span>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup">
                    <Button
                      className="w-full"
                      size="lg"
                      variant={plan.highlighted ? 'default' : 'outline'}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Prêt à transformer votre restaurant ?
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
            Rejoignez les restaurants qui ont déjà adopté ATTABL
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="text-lg px-8">
              Commencer maintenant
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-gray-900 text-gray-400">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white font-bold">A</span>
                </div>
                <span className="text-white font-bold text-xl">ATTABL</span>
              </div>
              <p className="text-sm">
                Commandez mieux.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Fonctionnalités</a></li>
                <li><a href="#" className="hover:text-white">Tarifs</a></li>
                <li><a href="#" className="hover:text-white">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Entreprise</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">À propos</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">Carrières</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Confidentialité</a></li>
                <li><a href="#" className="hover:text-white">CGU</a></li>
                <li><a href="#" className="hover:text-white">Mentions légales</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-sm">
            © 2026 ATTABL. Tous droits réservés.
          </div>
        </div>
      </footer>
    </div>
  );
}

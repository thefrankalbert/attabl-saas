import {
  BookOpen,
  UtensilsCrossed,
  ClipboardList,
  CreditCard,
  Mail,
  ExternalLink,
  Laptop,
  QrCode,
  Users,
  Package,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SupportFAQ } from '@/components/admin/support/SupportFAQ';

const QUICK_LINKS = [
  {
    icon: BookOpen,
    title: 'Guide de démarrage',
    description: 'Premiers pas avec ATTABL : configuration, menu et QR codes.',
    href: '#',
  },
  {
    icon: UtensilsCrossed,
    title: 'Gestion du menu',
    description: 'Catégories, articles, options, variantes de prix et photos.',
    href: '#',
  },
  {
    icon: ClipboardList,
    title: 'Commandes & KDS',
    description: 'Écran cuisine, routage des commandes, mode service et suivi en temps réel.',
    href: '#',
  },
  {
    icon: Laptop,
    title: 'Caisse (POS)',
    description: 'Point de vente intégré, prise de commandes rapide et encaissement.',
    href: '#',
  },
  {
    icon: QrCode,
    title: 'QR Codes',
    description: 'Génération de QR codes par table ou généraux, téléchargement HD.',
    href: '#',
  },
  {
    icon: Package,
    title: 'Inventaire & Fournisseurs',
    description: 'Gestion des stocks, fiches techniques (recettes), suivi fournisseurs.',
    href: '#',
  },
  {
    icon: Users,
    title: 'Équipe & Permissions',
    description: 'Gestion des membres, rôles personnalisés et permissions granulaires.',
    href: '#',
  },
  {
    icon: BarChart3,
    title: 'Rapports & Analyse',
    description: "Chiffre d'affaires, commandes, produits populaires et exports.",
    href: '#',
  },
  {
    icon: CreditCard,
    title: 'Abonnement & Facturation',
    description: 'Plans Starter, Pro et Business. Facturation mensuelle, semestrielle ou annuelle.',
    href: '#',
  },
];

export default function SupportPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-3xl py-8 px-4 space-y-8">
          {/* Title kept for screen readers only - the nav already identifies
              the page, so we don't repeat a heading + subtitle on screen. */}
          <h1 className="sr-only">Support &amp; Aide</h1>

          {/* Quick Links */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted mb-4">
              Guides rapides
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {QUICK_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <Card
                    key={link.title}
                    className="group hover:border-accent/40 transition-colors cursor-pointer"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-accent" />
                        </div>
                        <CardTitle className="flex items-center gap-1.5">
                          {link.title}
                          <ExternalLink className="w-3 h-3 text-app-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-app-text-secondary leading-relaxed">
                        {link.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* FAQ */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted mb-4">
              Questions fréquentes
            </h2>
            <Card>
              <CardContent className="p-0">
                <SupportFAQ />
              </CardContent>
            </Card>
          </section>

          {/* Contact Support */}
          <section>
            <Card className="border-accent/20 bg-accent-muted/30">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center shrink-0">
                    <Mail className="w-6 h-6 text-accent" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-app-text">
                      Besoin d&apos;aide supplémentaire ?
                    </h3>
                    <p className="text-sm text-app-text-secondary mt-1">
                      Notre équipe répond généralement sous 24 heures, du lundi au vendredi.
                    </p>
                  </div>
                  <a
                    href="mailto:support@attabl.com"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-text font-semibold text-sm hover:bg-accent-hover transition-colors shrink-0"
                  >
                    <Mail className="w-4 h-4" />
                    Contacter le support
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

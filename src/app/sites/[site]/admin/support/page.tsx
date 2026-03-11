import {
  BookOpen,
  UtensilsCrossed,
  ClipboardList,
  CreditCard,
  Mail,
  LifeBuoy,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SupportFAQ } from '@/components/admin/support/SupportFAQ';

const QUICK_LINKS = [
  {
    icon: BookOpen,
    title: 'Guide de d\u00e9marrage',
    description: 'Premiers pas avec ATTABL : configuration, menu et QR codes.',
    href: '#',
  },
  {
    icon: UtensilsCrossed,
    title: 'Gestion du menu',
    description: 'Cat\u00e9gories, articles, options, variantes et photos.',
    href: '#',
  },
  {
    icon: ClipboardList,
    title: 'Commandes & KDS',
    description: '\u00c9cran cuisine, routage des commandes et suivi en temps r\u00e9el.',
    href: '#',
  },
  {
    icon: CreditCard,
    title: 'Facturation',
    description: 'Abonnement, factures et gestion du plan.',
    href: '#',
  },
];

export default function SupportPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-3xl py-8 px-4 space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
              <LifeBuoy className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-app-text">Support & Aide</h1>
              <p className="text-sm text-app-text-secondary mt-0.5">
                Trouvez des r\u00e9ponses rapides ou contactez notre \u00e9quipe.
              </p>
            </div>
          </div>

          {/* Quick Links */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted mb-4">
              Guides rapides
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              Questions fr\u00e9quentes
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
                      Besoin d&apos;aide suppl\u00e9mentaire ?
                    </h3>
                    <p className="text-sm text-app-text-secondary mt-1">
                      Notre \u00e9quipe r\u00e9pond g\u00e9n\u00e9ralement sous 24 heures, du lundi
                      au vendredi.
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

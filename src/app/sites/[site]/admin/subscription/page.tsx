import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-600">Restaurant non trouvé</h2>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      trial: 'bg-blue-100 text-blue-800',
      past_due: 'bg-orange-100 text-orange-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: 'Actif',
      trial: 'Essai gratuit',
      past_due: 'Paiement en retard',
      cancelled: 'Annulé',
    };
    return labels[status] || status;
  };

  const getPlanLabel = (plan: string) => {
    const labels: Record<string, string> = {
      starter: 'Starter - 15,000 FCFA/mois',
      pro: 'Pro - 35,000 FCFA/mois',
      enterprise: 'Enterprise',
    };
    return labels[plan] || plan;
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Abonnement</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Statut actuel */}
        <Card>
          <CardHeader>
            <CardTitle>Statut de l&apos;abonnement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Plan actuel</p>
                <p className="text-xl font-bold">{getPlanLabel(tenant.subscription_plan)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Statut</p>
                <Badge className={getStatusBadge(tenant.subscription_status)}>
                  {getStatusLabel(tenant.subscription_status)}
                </Badge>
              </div>
              {tenant.subscription_current_period_end && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Prochain renouvellement</p>
                  <p className="font-semibold">
                    {new Date(tenant.subscription_current_period_end).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
              {tenant.subscription_status === 'trial' && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800">
                    Vous êtes en période d&apos;essai gratuit de 14 jours.
                    Aucun paiement ne sera prélevé avant la fin de l&apos;essai.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Limites du plan */}
        <Card>
          <CardHeader>
            <CardTitle>Utilisation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Administrateurs</span>
                  <span className="font-semibold">2 / {tenant.max_admins || 2}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${(2 / (tenant.max_admins || 2)) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Espaces (venues)</span>
                  <span className="font-semibold">1 / {tenant.max_venues || 1}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${(1 / (tenant.max_venues || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Articles au menu</span>
                  <span className="font-semibold">45 / {tenant.max_menu_items || 100}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${(45 / (tenant.max_menu_items || 100)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Gérer l&apos;abonnement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tenant.subscription_plan === 'starter' && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">Passez au plan Pro</h3>
              <p className="text-sm text-blue-700 mb-3">
                Débloquez 3 espaces, 500 articles, 5 admins et le support multi-langues.
              </p>
              <Button>
                Passer au Pro - 35,000 FCFA/mois
              </Button>
            </div>
          )}

          <p className="text-gray-600">
            Pour modifier votre mode de paiement ou annuler votre abonnement,
            contactez notre équipe support.
          </p>

          <div className="flex gap-4">
            <Button variant="outline">
              Télécharger les factures
            </Button>
            <Button variant="outline">
              Contacter le support
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historique de facturation */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Historique de facturation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Aucune facture disponible pour le moment.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

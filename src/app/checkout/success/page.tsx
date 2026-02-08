'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);

  useEffect(() => {
    // Vérifier le statut de la session
    async function verifySession() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/verify-checkout?session_id=${sessionId}`);
        const data = await response.json();

        if (data.slug) {
          setTenantSlug(data.slug);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error:', error);
        setLoading(false);
      }
    }

    verifySession();
  }, [sessionId]);

  // Déterminer l'URL du dashboard
  const getDashboardUrl = (slug: string) => {
    const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    if (isDev) {
      return `http://${slug}.localhost:3000/admin`;
    }
    return `https://${slug}.attabl.com/admin`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Paiement réussi !</h2>
          <p className="text-gray-600 mb-6">
            Votre abonnement est maintenant actif. Vous bénéficiez de 14 jours d&apos;essai gratuit.
          </p>
          <div className="space-y-3">
            {tenantSlug ? (
              <Button asChild size="lg" className="w-full">
                <Link href={getDashboardUrl(tenantSlug)}>Accéder à mon dashboard</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full">
                <Link href="/login">Se connecter</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}

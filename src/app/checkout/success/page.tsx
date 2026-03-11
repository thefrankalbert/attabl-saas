'use client';

import { Suspense, useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const t = useTranslations('checkout');

  useEffect(() => {
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
        logger.error('Checkout verification error', error);
        setLoading(false);
      }
    }

    verifySession();
  }, [sessionId]);

  const getDashboardUrl = (slug: string) => `/sites/${slug}/admin`;

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-app-text-muted" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-app-bg px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{t('successTitle')}</h2>
          <p className="text-app-text-muted mb-6">{t('successDescription')}</p>
          <div className="space-y-3">
            {tenantSlug ? (
              <Button asChild size="lg" className="w-full">
                <Link href={getDashboardUrl(tenantSlug)}>{t('goToDashboard')}</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full">
                <Link href="/login">{t('login')}</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href="/">{t('backToHome')}</Link>
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
        <div className="min-h-dvh flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-app-text-muted" />
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}

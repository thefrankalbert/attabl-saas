import { Card, CardContent } from '@/components/ui/card';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function CheckoutCancelPage() {
  const t = await getTranslations('checkout');

  return (
    <div className="min-h-dvh flex items-center justify-center bg-app-bg px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="h-16 w-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{t('cancelTitle')}</h2>
          <p className="text-app-text-muted mb-6">{t('cancelDescription')}</p>
          <div className="space-y-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/signup">{t('retry')}</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">{t('backToHome')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

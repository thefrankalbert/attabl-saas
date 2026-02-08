import { Card, CardContent } from '@/components/ui/card';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="h-16 w-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Paiement annulé</h2>
          <p className="text-gray-600 mb-6">
            Votre paiement a été annulé. Vous pouvez réessayer à tout moment.
          </p>
          <div className="space-y-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/signup">Réessayer</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

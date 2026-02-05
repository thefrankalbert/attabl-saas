'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [createdSlug, setCreatedSlug] = useState('');

  const [formData, setFormData] = useState({
    restaurantName: '',
    email: '',
    password: '',
    phone: '',
    plan: 'starter',
  });

  // Générer le slug en temps réel
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Créer le restaurant
      const signupResponse = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const signupData = await signupResponse.json();

      if (!signupResponse.ok) {
        throw new Error(signupData.error || 'Erreur lors de l\'inscription');
      }

      // Sauvegarder le slug pour la page de succès
      setCreatedSlug(signupData.slug);

      // 2. Créer la session Stripe Checkout
      const priceId = formData.plan === 'pro'
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO
        : process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER;

      const checkoutResponse = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          tenantId: signupData.tenantId,
          email: formData.email,
        }),
      });

      const checkoutData = await checkoutResponse.json();

      if (!checkoutResponse.ok) {
        // Si Stripe échoue, on redirige quand même vers le dashboard (mode trial)
        console.error('Stripe error:', checkoutData.error);
        setStep('success');
        setTimeout(() => {
          const isDev = window.location.hostname === 'localhost';
          if (isDev) {
            window.location.href = `http://${signupData.slug}.localhost:3000/admin`;
          } else {
            window.location.href = `https://${signupData.slug}.attabl.com/admin`;
          }
        }, 3000);
        return;
      }

      // 3. Rediriger vers Stripe Checkout
      window.location.href = checkoutData.url;

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Inscription réussie !</h2>
            <p className="text-gray-600 mb-4">
              Votre restaurant a été créé avec succès.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Votre URL : <strong>{createdSlug}.attabl.com</strong>
            </p>
            <p className="text-sm text-gray-500">
              Redirection vers votre dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link href="/" className="text-center block mb-4">
            <span className="text-2xl font-bold">ATTABL</span>
          </Link>
          <CardTitle>Créez votre compte</CardTitle>
          <CardDescription>
            Commencez votre essai gratuit de 14 jours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nom du restaurant */}
            <div>
              <Label htmlFor="restaurantName">Nom du restaurant *</Label>
              <Input
                id="restaurantName"
                type="text"
                placeholder="Ex: Radisson Blu N'Djamena"
                value={formData.restaurantName}
                onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                required
              />
              {formData.restaurantName && (
                <p className="text-xs text-gray-500 mt-1">
                  Votre URL sera : <strong>{generateSlug(formData.restaurantName)}.attabl.com</strong>
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email">Email professionnel *</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            {/* Mot de passe */}
            <div>
              <Label htmlFor="password">Mot de passe *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 caractères"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={8}
              />
            </div>

            {/* Téléphone */}
            <div>
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+235 XX XX XX XX"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            {/* Plan */}
            <div>
              <Label htmlFor="plan">Plan</Label>
              <select
                id="plan"
                className="w-full px-3 py-2 border rounded-md"
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
              >
                <option value="starter">Starter - 15,000 FCFA/mois</option>
                <option value="pro">Pro - 35,000 FCFA/mois</option>
              </select>
            </div>

            {/* Erreur */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création en cours...
                </>
              ) : (
                'Créer mon compte'
              )}
            </Button>

            <p className="text-sm text-center text-gray-600">
              Vous avez déjà un compte ?{' '}
              <Link href="/login" className="text-blue-600 hover:underline">
                Se connecter
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

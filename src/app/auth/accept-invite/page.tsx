'use client';

import { useState, Suspense } from 'react';
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

// --- ATTABL Logo ---
function AttablLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 w-fit">
      <div className="bg-black rounded-lg p-1.5">
        <svg
          className="h-5 w-5 text-[#CCFF00]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      </div>
      <span className="text-xl font-bold tracking-tight text-neutral-900">ATTABL</span>
    </Link>
  );
}

// --- Accept Invite Form ---
function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // No token in URL
  if (!token) {
    return (
      <div className="w-full">
        <AttablLogo />
        <div className="mt-10 bg-white rounded-2xl border border-neutral-100 p-8">
          <Alert variant="destructive" className="bg-red-50 text-red-700 border-red-200 rounded-lg">
            <AlertDescription className="text-sm">
              Lien d&apos;invitation invalide. Verifiez le lien dans votre email.
            </AlertDescription>
          </Alert>
          <p className="mt-6 text-center text-sm text-neutral-500">
            <Link href="/login" className="font-semibold text-neutral-900 hover:underline">
              Retour a la connexion
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="w-full">
        <AttablLogo />
        <div className="mt-10 bg-white rounded-2xl border border-neutral-100 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Invitation acceptee !</h2>
          <p className="text-neutral-500 text-sm">Redirection vers le tableau de bord...</p>
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400 mx-auto mt-4" />
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caracteres');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: fullName, password }),
      });

      const data: { success?: boolean; tenantSlug?: string; error?: string } = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'acceptation");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = `/sites/${data.tenantSlug}/admin`;
      }, 2000);
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <AttablLogo />

      <div className="mt-10 bg-white rounded-2xl border border-neutral-100 p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-2">
            Vous avez ete invite !
          </h1>
          <p className="text-neutral-500 text-sm">
            Rejoignez l&apos;equipe sur ATTABL en creant votre compte.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-neutral-700 font-medium text-sm">
              Nom complet
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jean Dupont"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              className="h-12 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 rounded-xl transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-neutral-700 font-medium text-sm">
              Mot de passe
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={100}
                className="h-12 pr-12 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 rounded-xl transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-neutral-700 font-medium text-sm">
              Confirmer le mot de passe
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Retapez votre mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                maxLength={100}
                className="h-12 pr-12 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 rounded-xl transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <Alert
              variant="destructive"
              className="bg-red-50 text-red-700 border-red-200 rounded-lg"
            >
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full h-12 bg-[#CCFF00] hover:bg-[#b8e600] text-black font-bold rounded-xl shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Acceptation en cours...
              </>
            ) : (
              "Accepter l'invitation"
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-widest">
            <span className="bg-white px-4 text-neutral-400">ou</span>
          </div>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-neutral-500">
          Vous avez deja un compte ?{' '}
          <Link href="/login" className="font-semibold text-neutral-900 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>

      {/* Help text below card */}
      <p className="mt-6 text-center text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
        Si vous avez deja un compte ATTABL, connectez-vous pour accepter automatiquement
        l&apos;invitation.
      </p>
    </div>
  );
}

// --- Main Page ---
export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
            </div>
          }
        >
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  );
}

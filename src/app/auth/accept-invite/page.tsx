'use client';

import { useState, useEffect, Suspense } from 'react';
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
          className="h-5 w-5 text-accent"
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
      <span className="text-xl font-semibold tracking-tight text-app-text">ATTABL</span>
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
  const [tokenExpired, setTokenExpired] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) return;
    async function validateToken() {
      try {
        const res = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, validate_only: true }),
        });
        if (!res.ok) {
          const data: { error?: string } = await res.json().catch(() => ({}));
          if (data.error?.toLowerCase().includes('expir') || res.status === 410) {
            setTokenExpired(true);
          }
        }
      } catch {
        // Network error - let the actual submit handle it
      }
    }
    validateToken();
  }, [token]);

  // No token in URL
  if (!token) {
    return (
      <div className="w-full">
        <AttablLogo />
        <div className="mt-10 bg-app-card rounded-xl border border-app-border p-8">
          <Alert
            variant="destructive"
            className="bg-red-500/10 text-red-500 border-red-500/20 rounded-lg"
          >
            <AlertDescription className="text-sm">
              Lien d&apos;invitation invalide. Verifiez le lien dans votre email.
            </AlertDescription>
          </Alert>
          <p className="mt-6 text-center text-sm text-app-text-secondary">
            <Link href="/login" className="font-semibold text-app-text hover:underline">
              Retour a la connexion
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Token expired state
  if (tokenExpired) {
    return (
      <div className="w-full">
        <AttablLogo />
        <div className="mt-10 bg-app-card rounded-xl border border-app-border p-8">
          <Alert
            variant="destructive"
            className="bg-red-500/10 text-red-500 border-red-500/20 rounded-lg"
          >
            <AlertDescription className="text-sm">
              Ce lien d&apos;invitation a expire. Demandez a l&apos;administrateur de vous renvoyer
              une invitation.
            </AlertDescription>
          </Alert>
          <p className="mt-6 text-center text-sm text-app-text-secondary">
            <Link href="/login" className="font-semibold text-app-text hover:underline">
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
        <div className="mt-10 bg-app-card rounded-xl border border-app-border p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-app-text mb-2">Invitation acceptee !</h2>
          <p className="text-app-text-secondary text-sm">Redirection vers le tableau de bord...</p>
          <Loader2 className="h-5 w-5 animate-spin text-app-text-muted mx-auto mt-4" />
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

      <div className="mt-10 bg-app-card rounded-xl border border-app-border p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-app-text mb-2">
            Vous avez ete invite !
          </h1>
          <p className="text-app-text-secondary text-sm">
            Rejoignez l&apos;equipe sur ATTABL en creant votre compte.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-app-text-secondary font-medium text-sm">
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
              className="h-10 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-1 focus:ring-accent rounded-md transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-app-text-secondary font-medium text-sm">
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
                className="h-10 pr-12 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-1 focus:ring-accent rounded-md transition-all"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Hide password"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text-secondary h-auto w-auto p-0"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="confirmPassword"
              className="text-app-text-secondary font-medium text-sm"
            >
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
                className="h-10 pr-12 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-1 focus:ring-accent rounded-md transition-all"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Hide password"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text-secondary h-auto w-auto p-0"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {error && (
            <Alert
              variant="destructive"
              className="bg-red-500/10 text-red-500 border-red-500/20 rounded-lg"
            >
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full h-9 bg-accent hover:bg-accent/90 text-accent-text text-sm font-medium rounded-md shadow-sm transition-colors"
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
            <div className="w-full border-t border-app-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-widest">
            <span className="bg-app-card px-4 text-app-text-muted">ou</span>
          </div>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-app-text-secondary">
          Vous avez deja un compte ?{' '}
          <Link href="/login" className="font-semibold text-app-text hover:underline">
            Se connecter
          </Link>
        </p>
      </div>

      {/* Help text below card */}
      <p className="mt-6 text-center text-xs text-app-text-muted max-w-sm mx-auto leading-relaxed">
        Si vous avez deja un compte ATTABL, connectez-vous pour accepter automatiquement
        l&apos;invitation.
      </p>
    </div>
  );
}

// --- Main Page ---
export default function AcceptInvitePage() {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-app-bg px-4 py-6 sm:py-10">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-app-text-muted" />
            </div>
          }
        >
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  );
}

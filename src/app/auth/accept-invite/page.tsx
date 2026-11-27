'use client';

import { useState, useEffect, Suspense } from 'react';
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { CenteredSkeleton } from '@/components/shared/CenteredSkeleton';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { useTranslations } from 'next-intl';
import { passwordIssueMessage } from '@/lib/validations/password-rules';
import { PasswordRulesList, usePasswordIssueText } from '@/components/auth/PasswordRules';

// --- Accept Invite Form ---
function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const t = useTranslations('auth.invite');
  const tForm = useTranslations('auth.form');
  const passwordIssueText = usePasswordIssueText();

  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  // Le formulaire n'apparait qu'une fois le jeton verifie par le serveur.
  const [validating, setValidating] = useState(Boolean(token));
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validate token on mount via the read-only endpoint. It never creates an
  // account and uses a separate fail-open, token-keyed limiter, so loading or
  // refreshing the page can never exhaust the acceptance retry budget.
  useEffect(() => {
    if (!token) return;
    async function validateToken() {
      try {
        const res = await fetch('/api/invitations/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (res.status === 410) {
          setTokenExpired(true);
        } else if (res.status === 400 || res.status === 404) {
          // Lien errone, deja utilise ou annule. Sans cet etat, la page
          // affichait "Vous avez ete invite !" et le formulaire complet, puis
          // refusait la saisie avec "Donnees invalides" (audit 2026-11-10,
          // C-037). Un 429 ou un 500 ne dit rien du lien: on laisse l'envoi
          // trancher.
          setTokenInvalid(true);
        }
      } catch {
        // Network error - let the actual submit handle it
      } finally {
        setValidating(false);
      }
    }
    validateToken();
  }, [token]);

  if (token && validating) {
    return <CenteredSkeleton />;
  }

  // No token in URL, or a token the server does not recognise
  if (!token || tokenInvalid) {
    return (
      <div className="w-full">
        <h1 className="sr-only">{t('srTitle')}</h1>
        <div>
          <Alert
            variant="destructive"
            className="rounded-lg border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-fg)]"
          >
            <AlertDescription className="text-sm">{t('invalidLink')}</AlertDescription>
          </Alert>
          <p className="mt-6 text-center text-sm text-[var(--secondary)]">
            <Link href="/login" className="auth-link">
              {t('backToLogin')}
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
        <h1 className="sr-only">{t('srTitle')}</h1>
        <div>
          <Alert
            variant="destructive"
            className="rounded-lg border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-fg)]"
          >
            <AlertDescription className="text-sm">{t('expiredLink')}</AlertDescription>
          </Alert>
          <p className="mt-6 text-center text-sm text-[var(--secondary)]">
            <Link href="/login" className="auth-link">
              {t('backToLogin')}
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
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[var(--ok-fg)]" />
          <h1 className="auth-serif auth-title mb-2">{t('successTitle')}</h1>
          <p className="text-sm text-[var(--secondary)]">{t('successRedirect')}</p>
          <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-[var(--muted)]" />
        </div>
      </div>
    );
  }

  // Adhesion d'un compte qui existe DEJA: aucun mot de passe a saisir (le
  // serveur l'ignorait, ce qui faisait croire a l'invite qu'il en changeait
  // un). Le serveur exige a la place la session du titulaire; s'il n'y en a
  // pas, il repond 401 et on renvoie vers la connexion, qui ramene ici.
  const handleJoinWithAccount = async () => {
    setError(null);
    setJoining(true);
    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data: { success?: boolean; tenantSlug?: string; error?: string } = await res.json();

      if (!res.ok) {
        setError(data.error || t('acceptError'));
        setNeedsLogin(res.status === 401);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        // Rechargement complet VOULU: l'invitation vient de creer une
        // appartenance, et seul un chargement serveur neuf lit la session et
        // les droits a jour. `router.push` garderait le cache client d'avant.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement complet voulu apres acceptation d'une invitation (2026-11-13)
        window.location.href = `/sites/${data.tenantSlug}/admin`;
      }, 2000);
    } catch {
      setError(t('serverError'));
    } finally {
      setJoining(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    // Memes regles que le serveur et que la politique Auth (12 caracteres,
    // minuscule, majuscule, chiffre, symbole): le message nomme TOUT ce qui manque.
    const passwordIssue = passwordIssueMessage(password);
    if (passwordIssue) {
      setError(passwordIssueText(passwordIssue) ?? t('acceptError'));
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
        setError(data.error || t('acceptError'));
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        // Rechargement complet VOULU: l'invitation vient de creer une
        // appartenance, et seul un chargement serveur neuf lit la session et
        // les droits a jour. `router.push` garderait le cache client d'avant.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement complet voulu apres acceptation d'une invitation (2026-11-13)
        window.location.href = `/sites/${data.tenantSlug}/admin`;
      }, 2000);
    } catch {
      setError(t('serverError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="auth-serif auth-title mb-2">{t('title')}</h1>
          <p className="text-[15px] text-[var(--secondary)]">{t('subtitle')}</p>
        </div>

        {/* Compte existant: aucun mot de passe a saisir, la session suffit. Le
            serveur exige qu'elle porte l'adresse invitee. */}
        <div className="mb-6 space-y-2">
          <Button
            type="button"
            variant="outline"
            className="auth-btn-secondary h-auto min-h-[var(--auth-button)] whitespace-normal px-5 py-2"
            disabled={joining || loading}
            onClick={handleJoinWithAccount}
          >
            {joining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('joining')}
              </>
            ) : (
              t('joinWithAccount')
            )}
          </Button>
          {needsLogin && (
            <p className="text-center text-xs text-[var(--muted)]">{t('loginHint')}</p>
          )}
        </div>

        {/* Form */}
        <form method="post" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-[13.5px] font-medium text-[var(--fg)]">
              {t('fullNameLabel')}
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder={t('fullNamePlaceholder')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              className="auth-input placeholder:text-[var(--muted)] focus-visible:border-[var(--fg)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13.5px] font-medium text-[var(--fg)]">
              {t('passwordLabel')}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-describedby="password-rules"
                placeholder={tForm('passwordPlaceholderSignup')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={100}
                className="auth-input placeholder:text-[var(--muted)] focus-visible:border-[var(--fg)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0 pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={showPassword ? tForm('hidePassword') : tForm('showPassword')}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-[var(--muted)] hover:bg-transparent hover:text-[var(--fg)]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <div id="password-rules">
              <PasswordRulesList password={password} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-[13.5px] font-medium text-[var(--fg)]">
              {t('confirmLabel')}
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('confirmPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                maxLength={100}
                className="auth-input placeholder:text-[var(--muted)] focus-visible:border-[var(--fg)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0 pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={showConfirmPassword ? tForm('hidePassword') : tForm('showPassword')}
                aria-pressed={showConfirmPassword}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-[var(--muted)] hover:bg-transparent hover:text-[var(--fg)]"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {error && (
            <Alert
              variant="destructive"
              className="rounded-lg border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-fg)]"
            >
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="auth-btn-primary" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border)]" />
          </div>
          <div className="relative flex justify-center text-[13px]">
            <span className="bg-[var(--card)] px-3 text-[var(--muted)]">{t('or')}</span>
          </div>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-[var(--secondary)]">
          {t('hasAccount')}{' '}
          <Link href="/login" className="auth-link">
            {t('login')}
          </Link>
        </p>
      </div>

      {/* Help text below card */}
      <p className="mx-auto mt-6 max-w-sm text-center text-xs leading-relaxed text-[var(--muted)]">
        {t('helpText')}
      </p>
    </div>
  );
}

// --- Main Page ---
export default function AcceptInvitePage() {
  return (
    // Meme cadre photo que les pages de connexion (AuthFrame). Le conteneur
    // `h-full overflow-y-auto` est le seul qui defile sous 1024px (regle 08).
    <div className="h-full overflow-y-auto">
      <AuthFrame scene="invite">
        <Suspense
          fallback={
            <div className="p-8">
              <CenteredSkeleton />
            </div>
          }
        >
          <AcceptInviteForm />
        </Suspense>
      </AuthFrame>
    </div>
  );
}

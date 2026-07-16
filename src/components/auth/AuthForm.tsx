'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { Turnstile } from '@marsidev/react-turnstile';
import { HONEYPOT_FIELD } from '@/lib/honeypot';
import { GoogleIcon } from './GoogleIcon';
import { AuthCard } from './AuthCard';
import { ConfirmationSentScreen } from './ConfirmationSentScreen';
import { useAuthForm } from './useAuthForm';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

// ponytail: 4-level strength meter matching the prototype's 3-segment bar
// (0 = empty, 1-2 = weak/medium, 3 = strong). Pure heuristic, no lib needed.
function getPasswordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  if (score >= 3 && password.length >= 12) return 3;
  return score === 0 ? 1 : (score as 1 | 2);
}

const inputClass =
  'h-10 rounded-lg border-[var(--border)] bg-[var(--card)] px-3 text-[16px] md:text-[14px] text-[var(--heading)] shadow-none placeholder:text-[var(--muted)] focus-visible:border-[var(--fg)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0';
const labelClass = 'text-[13.5px] font-medium text-[var(--fg)]';

function AuthForm({ mode }: AuthFormProps) {
  const tForm = useTranslations('auth.form');
  const tErr = useTranslations('auth.errors');

  const {
    isConfirmed,
    urlError,
    loading,
    oauthLoading,
    error,
    email,
    setEmail,
    password,
    setPassword,
    restaurant,
    setRestaurant,
    showPassword,
    setShowPassword,
    confirmationSent,
    emailUndelivered,
    resending,
    resendCooldown,
    honeypotRef,
    cfToken,
    setCfToken,
    turnstileSiteKey,
    handleOAuthLogin,
    handleSubmit,
    isLogin,
    handleResendConfirmation,
  } = useAuthForm(mode);

  // Show confirmation sent screen after signup
  if (confirmationSent) {
    return (
      <ConfirmationSentScreen
        email={email}
        emailUndelivered={emailUndelivered}
        resending={resending}
        resendCooldown={resendCooldown}
        onResend={handleResendConfirmation}
      />
    );
  }

  const strength = getPasswordStrength(password);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-7 text-center">
        <h1 className="mb-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
          {isLogin ? tForm('loginTitle') : tForm('signupTitle')}
        </h1>
        <p className="text-sm text-[var(--secondary)]">
          {isLogin ? tForm('loginSubtitle') : tForm('signupSubtitle')}
        </p>
      </div>

      {/* Email confirmed success banner */}
      {isLogin && isConfirmed && (
        <Alert className="mb-4 rounded-lg border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok-fg)]">
          <MailCheck className="h-4 w-4" />
          <AlertDescription className="text-sm text-[var(--ok-fg)]">
            {tForm('emailConfirmedSuccess')}
          </AlertDescription>
        </Alert>
      )}

      {/* URL error banner (e.g. expired confirmation link) */}
      {isLogin &&
        urlError &&
        !error &&
        (() => {
          const ERROR_MESSAGES: Record<string, string> = {
            oauth_failed: tErr('oauthFailed'),
            auth_failed: tErr('authFailed'),
            session_expired: tErr('sessionExpired'),
            email_not_confirmed: tErr('emailNotConfirmedUrl'),
            access_denied: tErr('accessDenied'),
            invalid_token: tErr('invalidToken'),
            expired_link: tErr('expiredLink'),
          };
          const safeMessage = ERROR_MESSAGES[urlError] || tErr('generic');
          return (
            <Alert
              variant="destructive"
              className="mb-4 rounded-lg border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-fg)] [&>svg]:text-[var(--err-fg)]"
            >
              <AlertDescription className="text-sm">{safeMessage}</AlertDescription>
            </Alert>
          );
        })()}

      <AuthCard>
        {/* Google OAuth - first per design */}
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('google')}
          disabled={oauthLoading !== null}
          className="h-10 w-full rounded-lg border-[var(--border)] bg-[var(--card)] font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          {oauthLoading === 'google' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          <span className="text-sm">{tForm('google')}</span>
        </Button>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border)]" />
          </div>
          <div className="relative flex justify-center text-[10px] font-medium uppercase tracking-[0.2em]">
            <span className="bg-[var(--bg)] px-3 text-[var(--muted)]">{tForm('divider')}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="absolute -top-[9999px] -left-[9999px] overflow-hidden" aria-hidden="true">
            <Input
              ref={honeypotRef}
              type="text"
              name={HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              readOnly
              defaultValue=""
              onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
            />
          </div>

          {!isLogin && (
            <div className="space-y-1.5">
              <Label htmlFor="restaurant" className={labelClass}>
                {tForm('restaurantLabel')}
              </Label>
              <Input
                id="restaurant"
                type="text"
                name="restaurant"
                autoComplete="organization"
                placeholder={tForm('restaurantPlaceholder')}
                value={restaurant}
                onChange={(e) => setRestaurant(e.target.value)}
                required
                aria-required="true"
                minLength={2}
                maxLength={100}
                className={inputClass}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className={labelClass}>
              {tForm('emailLabel')}
            </Label>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete={isLogin ? 'email' : 'off'}
              placeholder={tForm('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className={labelClass}>
                {tForm('passwordLabel')}
              </Label>
              {isLogin && (
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-[var(--subtle)] transition-colors hover:text-[var(--fg)]"
                >
                  {tForm('forgotPassword')}
                </Link>
              )}
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder={
                  isLogin ? tForm('passwordPlaceholderLogin') : tForm('passwordPlaceholderSignup')
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
                minLength={isLogin ? undefined : 8}
                className={`${inputClass} pr-10`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-[var(--muted)] hover:bg-transparent hover:text-[var(--fg)]"
                aria-label={showPassword ? tForm('hidePassword') : tForm('showPassword')}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>

            {!isLogin && password.length > 0 && (
              <div className="flex items-center gap-1.5 pt-0.5">
                {[1, 2, 3].map((segment) => (
                  <span
                    key={segment}
                    className={`h-1 flex-1 rounded-full ${
                      segment > strength
                        ? 'bg-[var(--border)]'
                        : strength === 3
                          ? 'bg-[var(--ok-fg)]'
                          : 'bg-amber-500'
                    }`}
                  />
                ))}
                <span className="ml-1 text-[11px] text-[var(--muted)]">
                  {strength === 3
                    ? tForm('strengthStrong')
                    : strength === 2
                      ? tForm('strengthMedium')
                      : tForm('strengthWeak')}
                </span>
              </div>
            )}
          </div>

          {error && (
            <Alert
              variant="destructive"
              className="rounded-lg border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-fg)] [&>svg]:text-[var(--err-fg)]"
            >
              <AlertDescription className="text-sm">
                {error === 'email_not_confirmed' ? (
                  <span>
                    {tForm('emailNotConfirmed')}{' '}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleResendConfirmation}
                      disabled={resending}
                      className="h-auto p-0 font-semibold underline hover:bg-transparent hover:no-underline"
                    >
                      {resending ? tForm('resendSending') : tForm('resendLink')}
                    </Button>
                  </span>
                ) : (
                  error
                )}
              </AlertDescription>
            </Alert>
          )}

          {turnstileSiteKey && (
            <Turnstile
              siteKey={turnstileSiteKey}
              onSuccess={setCfToken}
              onExpire={() => setCfToken('')}
              onError={() => setCfToken('')}
              options={{ theme: 'auto', size: 'flexible', appearance: 'interaction-only' }}
            />
          )}

          <Button
            type="submit"
            className="h-10 w-full rounded-lg bg-[var(--fg)] text-sm font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--fg-hover)]"
            disabled={loading || (!!turnstileSiteKey && !cfToken)}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isLogin ? tForm('submittingLogin') : tForm('submittingSignup')}
              </>
            ) : isLogin ? (
              tForm('submitLogin')
            ) : (
              tForm('submitSignup')
            )}
          </Button>

          {!isLogin && (
            <p className="text-center text-xs text-[var(--muted)]">{tForm('trialNote')}</p>
          )}
        </form>
      </AuthCard>

      {/* Footer Link */}
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        {isLogin ? tForm('noAccount') : tForm('hasAccount')}{' '}
        <Link
          href={isLogin ? '/signup' : '/login'}
          className="font-medium text-[var(--fg)] hover:text-[var(--fg-hover)]"
        >
          {isLogin ? tForm('submitSignup') : tForm('submitLogin')}
        </Link>
      </p>
    </div>
  );
}

export { AuthForm };

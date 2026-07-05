'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, Lock, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { Turnstile } from '@marsidev/react-turnstile';
import { motion } from 'framer-motion';
import { HONEYPOT_FIELD } from '@/lib/honeypot';
import { GoogleIcon } from './GoogleIcon';
import { ConfirmationSentScreen } from './ConfirmationSentScreen';
import { useAuthForm } from './useAuthForm';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto w-full"
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-10 w-fit group">
        <span className="text-xl font-bold tracking-tight text-app-text group-hover:text-accent transition-colors">
          ATTABL
        </span>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-app-text mb-2">
          {isLogin ? tForm('loginTitle') : tForm('signupTitle')}
        </h1>
        <p className="text-app-text-secondary text-sm leading-relaxed">
          {isLogin ? tForm('loginSubtitle') : tForm('signupSubtitle')}
        </p>
      </div>

      {/* Email confirmed success banner */}
      {isLogin && isConfirmed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <Alert className="bg-accent/10 text-accent border-accent/20 rounded-xl">
            <MailCheck className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {tForm('emailConfirmedSuccess')}
            </AlertDescription>
          </Alert>
        </motion.div>
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
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              <Alert
                variant="destructive"
                className="bg-app-status-error-bg text-status-error border-status-error/20 rounded-xl"
              >
                <AlertDescription className="text-sm">{safeMessage}</AlertDescription>
              </Alert>
            </motion.div>
          );
        })()}

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
        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-app-text-secondary font-medium text-xs uppercase tracking-widest"
          >
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
            className="h-11 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all rounded-xl text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="password"
              className="text-app-text-secondary font-medium text-xs uppercase tracking-widest"
            >
              {tForm('passwordLabel')}
            </Label>
            {isLogin && (
              <Link
                href="/forgot-password"
                className="text-xs text-accent hover:text-accent-hover font-medium transition-colors whitespace-nowrap"
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
              className="h-12 pr-12 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all rounded-xl text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text-secondary transition-colors h-8 w-8"
              aria-label={showPassword ? tForm('hidePassword') : tForm('showPassword')}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert
              variant="destructive"
              className="bg-app-status-error-bg text-status-error border-status-error/20 rounded-xl"
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
                      className="font-bold underline hover:no-underline h-auto p-0 inline"
                    >
                      {resending ? tForm('resendSending') : tForm('resendLink')}
                    </Button>
                  </span>
                ) : (
                  error
                )}
              </AlertDescription>
            </Alert>
          </motion.div>
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
          className="w-full h-11 bg-accent hover:bg-accent-hover text-accent-text text-sm font-bold rounded-xl transition-all active:scale-[0.98]"
          disabled={loading || (!!turnstileSiteKey && !cfToken)}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isLogin ? tForm('submittingLogin') : tForm('submittingSignup')}
            </>
          ) : isLogin ? (
            tForm('submitLogin')
          ) : (
            tForm('submitSignup')
          )}
        </Button>

        {/* Trust signal for signup */}
        {!isLogin && (
          <p className="text-center text-xs text-app-text-muted">{tForm('trustSignup')}</p>
        )}
      </form>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-app-border" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-medium">
          <span className="bg-app-bg px-4 text-app-text-muted">{tForm('divider')}</span>
        </div>
      </div>

      {/* OAuth Buttons */}
      <div className="space-y-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('google')}
          disabled={oauthLoading !== null}
          className="w-full h-11 rounded-xl border-app-border bg-app-elevated hover:bg-app-hover text-app-text font-medium transition-all active:scale-[0.98]"
        >
          {oauthLoading === 'google' ? (
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          <span className="ml-3 text-sm">{tForm('google')}</span>
        </Button>
      </div>

      {/* Trust badge */}
      <div className="flex items-center justify-center gap-1.5 mt-6 text-app-text-muted">
        <Lock className="w-3 h-3" />
        <span className="text-[10px]">{tForm('trustBadge')}</span>
      </div>

      {/* Footer Link */}
      <p className="mt-4 text-center text-sm text-app-text-muted">
        {isLogin ? tForm('noAccount') : tForm('hasAccount')}{' '}
        <Link
          href={isLogin ? '/signup' : '/login'}
          className="font-bold text-accent hover:text-accent-hover transition-colors"
        >
          {isLogin ? tForm('submitSignup') : tForm('submitLogin')}
        </Link>
      </p>
    </motion.div>
  );
}

export { AuthForm };

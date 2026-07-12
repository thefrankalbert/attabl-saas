'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { logger } from '@/lib/logger';
import { HONEYPOT_FIELD } from '@/lib/honeypot';

type AuthMode = 'login' | 'signup';

export function useAuthForm(mode: AuthMode) {
  const tErr = useTranslations('auth.errors');

  const searchParams = useSearchParams();
  const urlEmail = searchParams.get('email') || '';
  const isConfirmed = searchParams.get('confirmed') === 'true';
  const urlError = searchParams.get('error') || '';

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'azure' | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState(urlEmail);
  const [password, setPassword] = useState('');
  const [restaurant, setRestaurant] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [emailUndelivered, setEmailUndelivered] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [cfToken, setCfToken] = useState('');
  const turnstileSiteKey = useMemo(() => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '', []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const supabase = createClient();

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setOauthLoading(provider);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err) {
      logger.error('OAuth login failed', err);
      setError(tErr('oauthGeneric'));
      setOauthLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const trimmedRestaurant = restaurant.trim();
        if (trimmedRestaurant.length < 2) {
          setError(tErr('restaurantNameRequired'));
          setLoading(false);
          return;
        }

        const hpValue = honeypotRef.current?.value?.trim() ?? '';
        const signupBody: Record<string, string> = {
          restaurantName: trimmedRestaurant,
          email,
          password,
          plan: 'starter',
          cfToken,
        };
        if (hpValue) signupBody[HONEYPOT_FIELD] = hpValue;

        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(signupBody),
        });

        const data = (await response.json()) as {
          error?: string;
          code?: string;
          emailDelivered?: boolean;
        };

        if (!response.ok) {
          const apiError =
            data.code === 'EMAIL_ALREADY_REGISTERED'
              ? tErr('emailAlreadyRegistered')
              : data.code === 'RESTAURANT_NAME_TAKEN'
                ? tErr('restaurantNameTaken')
                : data.code === 'CAPTCHA_FAILED'
                  ? tErr('captchaFailed')
                  : typeof data.error === 'string' && data.error.length > 0
                    ? data.error
                    : tErr('signupGeneric');
          throw new Error(apiError);
        }

        // Account created - show confirmation message. If the backend could not
        // hand the email off to any provider, warn the user explicitly instead
        // of silently telling them to check an inbox that will never receive it.
        setEmailUndelivered(data.emailDelivered === false);
        setConfirmationSent(true);
      } else {
        // Login flow - server-side with rate limiting
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            [HONEYPOT_FIELD]: honeypotRef.current?.value ?? '',
            cfToken,
          }),
        });

        const data = (await response.json()) as { error?: string; redirect?: string };

        if (!response.ok) {
          if (data.error === 'email_not_confirmed') {
            throw new Error('Email not confirmed');
          }
          throw new Error(data.error || tErr('loginGeneric'));
        }

        // Redirect based on server response
        window.location.href = data.redirect || '/admin/tenants';
      }
    } catch (err) {
      logger.error('Auth form submit failed', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      // The 'Email not confirmed' path re-throws with that literal string
      // (line 125). All other errors come pre-translated from /api/login or
      // /api/signup (rate limiting, validation, invalid credentials). No
      // longer match the Supabase English message - that was dead code
      // since the client never sees raw Supabase errors.
      if (errorMessage === 'Email not confirmed') {
        setError('email_not_confirmed');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  const handleResendConfirmation = useCallback(async () => {
    if (resending || !email || resendCooldown > 0) return;
    setResending(true);
    try {
      const response = await fetch('/api/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || tErr('resendGeneric'));
      }
      // Start 60s cooldown
      setResendCooldown(60);
      cooldownRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            cooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      logger.error('Failed to resend confirmation', err);
    } finally {
      setResending(false);
    }
  }, [email, resending, resendCooldown, tErr]);

  return {
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
  };
}

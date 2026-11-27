'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ScreenLockProps {
  mode: 'overlay' | 'password';
  isLocked: boolean;
  onUnlock: () => void;
  tenantName: string;
  isWarning?: boolean;
  remainingSeconds?: number;
}

/** Heure et date courantes, rafraichies chaque seconde tant que l'ecran est verrouille. */
function useClock(active: boolean): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** Majuscule a la premiere lettre seulement: "Mardi 17 novembre", pas "Mardi 17 Novembre". */
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ScreenLock({
  mode,
  isLocked,
  onUnlock,
  tenantName,
  isWarning = false,
  remainingSeconds = 0,
}: ScreenLockProps) {
  const t = useTranslations('screenLock');
  const locale = useLocale();
  const now = useClock(isLocked);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const supabase = createClient();

  // Get current user email on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, [supabase.auth]);

  const handleOverlayUnlock = useCallback(() => {
    if (mode === 'overlay' && isLocked) {
      onUnlock();
    }
  }, [mode, isLocked, onUnlock]);

  // Overlay mode: listen for click/keydown to unlock
  useEffect(() => {
    if (!isLocked || mode !== 'overlay') return;

    const handler = () => handleOverlayUnlock();
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);

    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [isLocked, mode, handleOverlayUnlock]);

  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });

      if (authError) {
        setError(t('wrongPassword'));
        setPassword('');
      } else {
        setPassword('');
        onUnlock();
      }
    } catch {
      setError(t('connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const clock = now ? now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
  const date = now
    ? capitalizeFirst(
        now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
      )
    : '';

  return (
    <>
      {/* Warning banner (before full lock) */}
      <AnimatePresence>
        {isWarning && !isLocked && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-app-text px-4 py-2.5 text-sm font-medium text-app-bg"
          >
            <span>{t('lockingIn', { time: formatTime(remainingSeconds) })}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full lock screen */}
      <AnimatePresence>
        {isLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
            onClick={mode === 'overlay' ? handleOverlayUnlock : undefined}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-app-bg/95 backdrop-blur-2xl" />

            {/* Content */}
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05, duration: 0.35, ease: 'easeOut' }}
              className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
              onClick={mode === 'password' ? (e) => e.stopPropagation() : undefined}
            >
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-app-text-muted">
                {tenantName}
              </p>

              <p
                className="mt-6 text-6xl font-light tabular-nums tracking-tight text-app-text sm:text-7xl"
                suppressHydrationWarning
              >
                {clock}
              </p>
              <p className="mt-2 text-sm text-app-text-secondary" suppressHydrationWarning>
                {date}
              </p>

              <p className="mt-10 text-sm text-app-text-muted">{t('sessionLocked')}</p>

              {mode === 'overlay' ? (
                <p className="mt-2 text-sm text-app-text-secondary">{t('clickToUnlock')}</p>
              ) : (
                <form
                  method="post"
                  onSubmit={handlePasswordUnlock}
                  className="mt-6 w-full max-w-xs space-y-3"
                >
                  <p className="truncate text-left text-xs text-app-text-muted">{userEmail}</p>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder={t('password')}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError('');
                      }}
                      required
                      autoFocus
                      className="h-12 rounded-xl border-app-border bg-app-elevated pr-12 text-app-text placeholder:text-app-text-muted"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2 text-app-text-muted hover:text-app-text"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>

                  {error && <p className="text-left text-sm text-status-error">{error}</p>}

                  <Button
                    type="submit"
                    disabled={loading || !password}
                    className="h-12 w-full rounded-xl font-semibold"
                  >
                    {loading ? t('verifying') : t('unlock')}
                  </Button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

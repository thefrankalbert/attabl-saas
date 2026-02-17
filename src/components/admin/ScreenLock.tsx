'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

export function ScreenLock({
  mode,
  isLocked,
  onUnlock,
  tenantName,
  isWarning = false,
  remainingSeconds = 0,
}: ScreenLockProps) {
  const t = useTranslations('screenLock');
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
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2.5 text-sm font-medium text-black"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{t('lockingIn', { seconds: formatTime(remainingSeconds) })}</span>
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
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={mode === 'overlay' ? handleOverlayUnlock : undefined}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/95 backdrop-blur-md" />

            {/* Content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4, type: 'spring', damping: 25 }}
              className="relative z-10 flex flex-col items-center text-center px-8"
              onClick={mode === 'password' ? (e) => e.stopPropagation() : undefined}
            >
              {/* Lock icon */}
              <motion.div
                initial={{ y: -10 }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="mb-8"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#CCFF00]/10 ring-1 ring-[#CCFF00]/20">
                  <Lock className="h-9 w-9 text-[#CCFF00]" />
                </div>
              </motion.div>

              {/* Logo */}
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-white/10 rounded-lg p-1.5">
                  <svg
                    className="h-4 w-4 text-[#CCFF00]"
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
                <span className="text-sm font-bold tracking-tight text-white/60">ATTABL</span>
              </div>

              {/* Tenant name */}
              <h2 className="text-xl font-semibold text-white mb-2">{tenantName}</h2>
              <p className="text-sm text-white/40 mb-8">{t('sessionLocked')}</p>

              {mode === 'overlay' ? (
                /* Overlay mode */
                <motion.p
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-sm text-white/60"
                >
                  {t('clickToUnlock')}
                </motion.p>
              ) : (
                /* Password mode */
                <form onSubmit={handlePasswordUnlock} className="w-full max-w-xs space-y-4">
                  <div className="space-y-1.5">
                    <div className="text-left text-xs text-white/40 mb-1">{userEmail}</div>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={t('password')}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError('');
                        }}
                        required
                        autoFocus
                        className="h-12 pr-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#CCFF00]/50 focus:ring-[#CCFF00]/20 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-red-400"
                    >
                      {error}
                    </motion.p>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !password}
                    className="w-full h-11 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-lg transition-all"
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

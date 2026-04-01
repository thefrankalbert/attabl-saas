'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { getSoundFile, DEFAULT_SOUND_ID } from '@/lib/sounds/sound-library';
import { logger } from '@/lib/logger';

// LocalStorage key for persisted sound choice
const LS_KEY = 'attabl_notification_sound';
const LS_ENABLED_KEY = 'attabl_notification_enabled';

/**
 * Shared AudioContext singleton - reused across the app to avoid
 * browser limits on AudioContext instances and ensure "unlock" state persists.
 */
let sharedAudioContext: AudioContext | null = null;
let audioContextUnlocked = false;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioContext) {
      const Ctor =
        window.AudioContext ||
        // webkitAudioContext is not in standard Window type but exists in Safari
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      sharedAudioContext = new Ctor();
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * "Unlock" the AudioContext and HTML5 Audio on first user gesture.
 * Browsers require a user interaction (click/touch/keydown) before
 * audio can play. We resume the AudioContext and play a silent buffer
 * so that subsequent programmatic .play() calls succeed.
 */
function unlockAudioOnUserGesture(): void {
  if (audioContextUnlocked) return;

  const unlock = () => {
    if (audioContextUnlocked) return;
    audioContextUnlocked = true;

    // Resume AudioContext if suspended
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // Ignore - will retry on next gesture
        audioContextUnlocked = false;
      });
    }

    // Play a silent buffer on every <audio> element with data-notification-audio
    // This "unlocks" HTML5 audio for future programmatic plays
    document.querySelectorAll<HTMLAudioElement>('[data-notification-audio]').forEach((el) => {
      const originalSrc = el.src;
      // Play + pause with zero volume to unlock
      el.muted = true;
      el.play()
        .then(() => {
          el.pause();
          el.muted = false;
          el.currentTime = 0;
          // Restore src in case it was changed
          if (el.src !== originalSrc) {
            el.src = originalSrc;
          }
        })
        .catch(() => {
          el.muted = false;
          // Unlock failed - will retry on next interaction
          audioContextUnlocked = false;
        });
    });
  };

  // Listen on common user-gesture events
  const events = ['click', 'touchstart', 'keydown'] as const;
  events.forEach((evt) => {
    document.addEventListener(evt, unlock, { once: false, passive: true });
  });
}

interface UseNotificationSoundOptions {
  /** Sound ID from the library (defaults to tenant setting or 'classic-bell') */
  soundId?: string | null;
  /** Tenant ID for scoping localStorage */
  tenantId?: string;
}

interface UseNotificationSoundReturn {
  /** Whether sound is enabled */
  soundEnabled: boolean;
  /** Toggle sound on/off */
  toggleSound: () => void;
  /** Play the current notification sound */
  play: () => void;
  /** Preview a specific sound by ID */
  preview: (soundId: string) => void;
  /** Current sound ID */
  currentSoundId: string;
  /** Change the active sound */
  setSoundId: (id: string) => void;
  /** Audio element ref (for mounting in DOM) */
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

/**
 * Hook for managing notification sounds in admin pages (KDS, Orders, etc.)
 *
 * Reliability features:
 * - "Unlocks" audio on first user interaction (browser autoplay policy)
 * - Preloads and reuses a single persistent Audio element
 * - Web Audio API fallback with shared AudioContext singleton
 * - Handles play() promise rejections with retry
 * - Works in background tabs via AudioContext resume
 * - Persists sound choice and enabled state in localStorage
 */
export function useNotificationSound(
  options: UseNotificationSoundOptions = {},
): UseNotificationSoundReturn {
  const { soundId: initialSoundId, tenantId } = options;
  const lsPrefix = tenantId ? `${tenantId}_` : '';

  // State - default to enabled (critical for restaurant order alerts)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(`${lsPrefix}${LS_ENABLED_KEY}`);
    // Default to true if never set (first-time users get sound on)
    if (stored === null) return true;
    return stored === 'true';
  });

  const [currentSoundId, setCurrentSoundId] = useState(() => {
    if (typeof window === 'undefined') return initialSoundId || DEFAULT_SOUND_ID;
    const stored = localStorage.getItem(`${lsPrefix}${LS_KEY}`);
    return stored || initialSoundId || DEFAULT_SOUND_ID;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  // Use refs to always have the latest values in callbacks without re-creating them
  const soundEnabledRef = useRef(soundEnabled);
  const currentSoundIdRef = useRef(currentSoundId);

  // Keep refs in sync with state
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    currentSoundIdRef.current = currentSoundId;
  }, [currentSoundId]);

  // Register the audio unlock listener once on mount
  useEffect(() => {
    unlockAudioOnUserGesture();
  }, []);

  // Sync soundId from props (e.g., when tenant settings change)
  useEffect(() => {
    if (initialSoundId && initialSoundId !== currentSoundId) {
      setCurrentSoundId(initialSoundId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSoundId]);

  // Update audio src when sound changes, and preload
  useEffect(() => {
    if (audioRef.current) {
      const newSrc = getSoundFile(currentSoundId);
      if (audioRef.current.src !== newSrc) {
        audioRef.current.src = newSrc;
        audioRef.current.load(); // Force preload
      }
    }
  }, [currentSoundId]);

  // Toggle sound enabled
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(`${lsPrefix}${LS_ENABLED_KEY}`, String(next));
      return next;
    });
  }, [lsPrefix]);

  // Play the notification sound - uses refs for latest state to avoid stale closures
  const play = useCallback(() => {
    if (!soundEnabledRef.current) return;

    // Ensure AudioContext is resumed (may be suspended in background tab)
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        logger.warn('Failed to resume AudioContext for notification sound');
      });
    }

    // Try HTML5 audio element first (most reliable when unlocked)
    if (audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = 0;
      audio
        .play()
        .then(() => {
          // Success - sound played
        })
        .catch((err: unknown) => {
          logger.warn('Notification sound play() rejected, trying fallback', {
            error: err instanceof Error ? err.message : String(err),
          });
          // Retry once after a microtask (sometimes helps with autoplay policy)
          setTimeout(() => {
            audio.currentTime = 0;
            audio.play().catch(() => {
              // HTML5 Audio completely blocked - use Web Audio API fallback
              playFallbackBeep();
            });
          }, 50);
        });
      return;
    }

    // No audio element mounted, use fallback
    playFallbackBeep();
  }, []);

  // Preview a sound (plays regardless of enabled state)
  const preview = useCallback((previewSoundId: string) => {
    const file = getSoundFile(previewSoundId);

    // Clean up previous preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    const audio = new Audio(file);
    previewAudioRef.current = audio;
    audio.play().catch(() => {
      playFallbackBeep();
    });
  }, []);

  // Change sound ID and persist
  const setSoundId = useCallback(
    (id: string) => {
      setCurrentSoundId(id);
      localStorage.setItem(`${lsPrefix}${LS_KEY}`, id);
    },
    [lsPrefix],
  );

  return {
    soundEnabled,
    toggleSound,
    play,
    preview,
    currentSoundId,
    setSoundId,
    audioRef,
  };
}

/**
 * Web Audio API fallback - plays a synthetic beep when MP3 is unavailable.
 * Uses the shared AudioContext singleton to avoid creating new contexts.
 * Two short beeps at 880Hz (A5) with sine wave.
 */
function playFallbackBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Resume if suspended (e.g., background tab)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // Cannot resume without user gesture - silently fail
      });
    }

    const now = ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = 880; // A5

      const beepStart = now + i * 0.2;
      gainNode.gain.setValueAtTime(0, beepStart);
      gainNode.gain.linearRampToValueAtTime(0.3, beepStart + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, beepStart + 0.15);

      oscillator.start(beepStart);
      oscillator.stop(beepStart + 0.2);
    }
  } catch (err) {
    logger.warn('Web Audio API fallback beep failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

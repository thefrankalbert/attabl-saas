'use client';

import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { getSoundFile, DEFAULT_SOUND_ID } from '@/lib/sounds/sound-library';
import { logger } from '@/lib/logger';

// ─── LocalStorage keys ──────────────────────────────────
const LS_KEY = 'attabl_notification_sound';
const LS_ENABLED_KEY = 'attabl_notification_enabled';

// ─── Shared AudioContext singleton ──────────────────────
let sharedAudioContext: AudioContext | null = null;
let audioContextUnlocked = false;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioContext) {
      const Ctor =
        window.AudioContext ||
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
 * Browsers require a user interaction before audio can play.
 */
function unlockAudioOnUserGesture(): void {
  if (audioContextUnlocked) return;

  const unlock = () => {
    if (audioContextUnlocked) return;
    audioContextUnlocked = true;

    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        audioContextUnlocked = false;
      });
    }

    document.querySelectorAll<HTMLAudioElement>('[data-notification-audio]').forEach((el) => {
      const originalSrc = el.src;
      el.muted = true;
      el.play()
        .then(() => {
          el.pause();
          el.muted = false;
          el.currentTime = 0;
          if (el.src !== originalSrc) {
            el.src = originalSrc;
          }
        })
        .catch(() => {
          el.muted = false;
          audioContextUnlocked = false;
        });
    });
  };

  const events = ['click', 'touchstart', 'keydown'] as const;
  events.forEach((evt) => {
    document.addEventListener(evt, unlock, { once: false, passive: true });
  });
}

/**
 * Web Audio API fallback — plays a synthetic beep when MP3 is unavailable.
 */
function playFallbackBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = 880;

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

// ─── Context types ──────────────────────────────────────

interface SoundContextValue {
  /** Whether sound is enabled */
  soundEnabled: boolean;
  /** Toggle sound on/off (persisted in localStorage per tenant) */
  toggleSound: () => void;
  /** Play the current notification sound */
  play: () => void;
  /** Preview a specific sound by ID (plays regardless of enabled state) */
  preview: (soundId: string) => void;
  /** Current sound ID */
  currentSoundId: string;
  /** Change the active sound (persisted in localStorage + updates audio element) */
  setSoundId: (id: string) => void;
  /** Audio element ref — mounted once by SoundProvider */
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const SoundContext = createContext<SoundContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────

interface SoundProviderProps {
  children: ReactNode;
  /** Initial sound ID from tenant database settings */
  notificationSoundId?: string | null;
  /** Tenant ID for scoping localStorage keys */
  tenantId: string;
}

export function SoundProvider({ children, notificationSoundId, tenantId }: SoundProviderProps) {
  const lsPrefix = tenantId ? `${tenantId}_` : '';

  // State — default to enabled (critical for restaurant order alerts)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(`${lsPrefix}${LS_ENABLED_KEY}`);
    if (stored === null) return true;
    return stored === 'true';
  });

  const [currentSoundId, setCurrentSoundId] = useState(() => {
    if (typeof window === 'undefined') return notificationSoundId || DEFAULT_SOUND_ID;
    const stored = localStorage.getItem(`${lsPrefix}${LS_KEY}`);
    return stored || notificationSoundId || DEFAULT_SOUND_ID;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
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
    if (notificationSoundId && notificationSoundId !== currentSoundId) {
      setCurrentSoundId(notificationSoundId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationSoundId]);

  // Update audio src when sound changes, and preload
  useEffect(() => {
    if (audioRef.current) {
      const newSrc = getSoundFile(currentSoundId);
      if (audioRef.current.src !== newSrc) {
        audioRef.current.src = newSrc;
        audioRef.current.load();
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

  // Play the notification sound
  const play = useCallback(() => {
    if (!soundEnabledRef.current) return;

    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        logger.warn('Failed to resume AudioContext for notification sound');
      });
    }

    if (audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = 0;
      audio
        .play()
        .then(() => {
          // Success
        })
        .catch((err: unknown) => {
          logger.warn('Notification sound play() rejected, trying fallback', {
            error: err instanceof Error ? err.message : String(err),
          });
          setTimeout(() => {
            audio.currentTime = 0;
            audio.play().catch(() => {
              playFallbackBeep();
            });
          }, 50);
        });
      return;
    }

    playFallbackBeep();
  }, []);

  // Preview a sound (plays regardless of enabled state)
  const preview = useCallback((previewSoundId: string) => {
    const file = getSoundFile(previewSoundId);

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

  const value: SoundContextValue = {
    soundEnabled,
    toggleSound,
    play,
    preview,
    currentSoundId,
    setSoundId,
    audioRef,
  };

  return (
    <SoundContext.Provider value={value}>
      {/* Single global audio element mounted once at the layout level */}
      <audio
        ref={audioRef}
        preload="auto"
        data-notification-audio
        src={getSoundFile(currentSoundId)}
      />
      {children}
    </SoundContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────

/**
 * Access the global sound context. Must be used within a SoundProvider.
 */
export function useSound(): SoundContextValue {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
}

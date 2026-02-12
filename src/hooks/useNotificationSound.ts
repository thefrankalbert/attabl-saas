'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { getSoundFile, DEFAULT_SOUND_ID } from '@/lib/sounds/sound-library';

// LocalStorage key for persisted sound choice
const LS_KEY = 'attabl_notification_sound';
const LS_ENABLED_KEY = 'attabl_notification_enabled';

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
 * Features:
 * - Plays pre-installed or custom notification sounds
 * - Persists sound choice and enabled state in localStorage
 * - Provides preview capability for sound selection UI
 * - Web Audio API fallback for when file is unavailable
 */
export function useNotificationSound(
  options: UseNotificationSoundOptions = {},
): UseNotificationSoundReturn {
  const { soundId: initialSoundId, tenantId } = options;
  const lsPrefix = tenantId ? `${tenantId}_` : '';

  // State
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(`${lsPrefix}${LS_ENABLED_KEY}`);
    return stored === 'true';
  });

  const [currentSoundId, setCurrentSoundId] = useState(() => {
    if (typeof window === 'undefined') return initialSoundId || DEFAULT_SOUND_ID;
    const stored = localStorage.getItem(`${lsPrefix}${LS_KEY}`);
    return stored || initialSoundId || DEFAULT_SOUND_ID;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sync soundId from props (e.g., when tenant settings change)
  useEffect(() => {
    if (initialSoundId && initialSoundId !== currentSoundId) {
      setCurrentSoundId(initialSoundId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSoundId]);

  // Update audio src when sound changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = getSoundFile(currentSoundId);
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
    if (!soundEnabled) return;

    // Try HTML audio element first
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Fallback: Web Audio API synthetic beep
        playFallbackBeep();
      });
      return;
    }

    // No audio element, use fallback
    playFallbackBeep();
  }, [soundEnabled]);

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
 * Web Audio API fallback — plays a synthetic beep when MP3 is unavailable
 * Two short beeps at 880Hz (A5) with sine wave
 */
function playFallbackBeep(): void {
  try {
    const audioCtx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    const now = audioCtx.currentTime;

    for (let i = 0; i < 2; i++) {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = 880; // A5

      const beepStart = now + i * 0.2;
      gainNode.gain.setValueAtTime(0, beepStart);
      gainNode.gain.linearRampToValueAtTime(0.3, beepStart + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, beepStart + 0.15);

      oscillator.start(beepStart);
      oscillator.stop(beepStart + 0.2);
    }
  } catch {
    // Web Audio API not available, silently fail
  }
}

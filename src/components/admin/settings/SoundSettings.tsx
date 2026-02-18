'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Check, Volume2, Upload, Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PremiumBadge } from '@/components/shared/UpgradeBanner';
import { SOUND_LIBRARY, DEFAULT_SOUND_ID, type SoundDefinition } from '@/lib/sounds/sound-library';

interface SoundSettingsProps {
  /** Currently selected sound ID */
  currentSoundId?: string;
  /** Callback when sound selection changes */
  onSoundChange: (soundId: string) => void;
  /** Tenant ID for custom sound uploads */
  tenantId?: string;
}

export function SoundSettings({
  currentSoundId = DEFAULT_SOUND_ID,
  onSoundChange,
}: SoundSettingsProps) {
  const t = useTranslations('settings');
  const { canAccess, effectivePlan } = useSubscription();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(currentSoundId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isPremium = effectivePlan === 'premium' || effectivePlan === 'enterprise';
  const canUpload = canAccess('customSoundUpload');

  // Cleanup audio on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePreview = (sound: SoundDefinition) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // If clicking the same sound that's playing, stop it
    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }

    // Play the new sound
    try {
      const audio = new Audio(sound.file);
      audioRef.current = audio;
      setPlayingId(sound.id);

      // Add error handler before play
      audio.onerror = () => {
        toast({ title: t('soundError'), description: t('soundPlayError'), variant: 'destructive' });
        setPlayingId(null);
        audioRef.current = null;
      };

      audio.play().catch(() => {
        toast({ title: t('soundError'), description: t('soundPlayError'), variant: 'destructive' });
        setPlayingId(null);
        audioRef.current = null;
      });

      audio.onended = () => {
        setPlayingId(null);
      };
    } catch {
      toast({ title: t('soundError'), description: t('soundPlayError'), variant: 'destructive' });
      setPlayingId(null);
    }
  };

  const handleSelect = (sound: SoundDefinition) => {
    // Check premium restriction
    if (sound.isPremium && !isPremium) {
      toast({
        title: t('premiumSound'),
        description: t('premiumSoundDesc'),
      });
      return;
    }

    setSelectedId(sound.id);
    onSoundChange(sound.id);
    toast({
      title: t('soundSelected'),
      description: t('soundSelectedDesc', { name: sound.name }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-neutral-500" />
          <h3 className="font-semibold text-neutral-900">{t('notificationSoundsTitle')}</h3>
        </div>
        {!isPremium && (
          <span className="text-xs text-neutral-500">{t('soundsAvailableCount')}</span>
        )}
      </div>

      {/* Sound List */}
      <div className="grid gap-2">
        {SOUND_LIBRARY.map((sound) => {
          const isSelected = selectedId === sound.id;
          const isPlaying = playingId === sound.id;
          const isLocked = sound.isPremium && !isPremium;

          return (
            <div
              key={sound.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group ${
                isSelected
                  ? 'border-amber-400 bg-amber-50'
                  : isLocked
                    ? 'border-neutral-100 bg-neutral-50/50 opacity-60'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
              }`}
              onClick={() => !isLocked && handleSelect(sound)}
            >
              {/* Play button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isLocked) handlePreview(sound);
                }}
                disabled={isLocked}
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  isPlaying
                    ? 'bg-amber-500 text-white'
                    : isLocked
                      ? 'bg-neutral-100 text-neutral-400'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              {/* Sound info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${isLocked ? 'text-neutral-400' : 'text-neutral-900'}`}
                  >
                    {sound.name}
                  </span>
                  {sound.isPremium && !isPremium && <PremiumBadge />}
                </div>
                <p className="text-xs text-neutral-500 truncate">{sound.description}</p>
              </div>

              {/* Duration */}
              <span className="text-xs text-neutral-400 flex-shrink-0">{sound.duration}s</span>

              {/* Selected indicator */}
              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom upload (Premium only) */}
      {canUpload ? (
        <div className="pt-2">
          <Button
            variant="outline"
            className="w-full h-11 border-dashed border-neutral-300 text-neutral-500 hover:text-neutral-700"
            onClick={() => {
              toast({
                title: t('comingSoon'),
                description: t('customSoundComingSoon'),
              });
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            {t('importCustomSound')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm">
          <Crown className="w-4 h-4 flex-shrink-0" />
          <span>{t('customSoundPremiumOnly')}</span>
        </div>
      )}
    </div>
  );
}

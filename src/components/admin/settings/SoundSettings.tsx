'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Check, Volume2, Upload, Crown, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PremiumBadge } from '@/components/shared/UpgradeBanner';
import {
  SOUND_LIBRARY,
  DEFAULT_SOUND_ID,
  isCustomSound,
  type SoundDefinition,
} from '@/lib/sounds/sound-library';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';

const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'];
const MAX_SOUND_SIZE = 2 * 1024 * 1024; // 2 MB

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
  tenantId,
}: SoundSettingsProps) {
  const t = useTranslations('settings');
  const { canAccess, effectivePlan } = useSubscription();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(currentSoundId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [uploadingSound, setUploadingSound] = useState(false);
  const [customSoundUrl, setCustomSoundUrl] = useState<string | null>(
    isCustomSound(currentSoundId) ? currentSoundId : null,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isPremium = effectivePlan === 'premium' || effectivePlan === 'enterprise';
  const canUpload = canAccess('customSoundUpload');

  // Sync local state when parent prop changes (e.g. after save + revalidation)
  useEffect(() => {
    setSelectedId(currentSoundId);
    setCustomSoundUrl(isCustomSound(currentSoundId) ? currentSoundId : null);
  }, [currentSoundId]);

  // Build display list: library sounds + custom sound (if any)
  const customSoundEntry: SoundDefinition | null = customSoundUrl
    ? {
        id: customSoundUrl,
        name: t('customSound'),
        description: t('customSoundDesc'),
        file: customSoundUrl,
        isPremium: false,
        duration: 0,
      }
    : null;

  const displaySounds = customSoundEntry ? [...SOUND_LIBRARY, customSoundEntry] : SOUND_LIBRARY;

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

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;

    // Reset file input so the same file can be re-selected
    e.target.value = '';

    // Validate file type
    if (!ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      toast({
        title: t('soundError'),
        description: t('invalidSoundFormat'),
        variant: 'destructive',
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_SOUND_SIZE) {
      toast({
        title: t('soundError'),
        description: t('soundTooLarge'),
        variant: 'destructive',
      });
      return;
    }

    setUploadingSound(true);
    try {
      const supabase = createClient();
      const fileExt = file.name.split('.').pop() || 'mp3';
      const filePath = `${tenantId}/custom-notification.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-sounds')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('tenant-sounds').getPublicUrl(filePath);

      // Set custom sound and auto-select it
      setCustomSoundUrl(publicUrl);
      setSelectedId(publicUrl);
      onSoundChange(publicUrl);

      toast({
        title: t('soundUploaded'),
        description: t('soundUploadedDesc'),
      });
    } catch (err) {
      logger.error('Failed to upload custom sound', err);
      toast({
        title: t('soundError'),
        description: t('soundUploadError'),
        variant: 'destructive',
      });
    } finally {
      setUploadingSound(false);
    }
  };

  const handleDeleteCustomSound = async () => {
    if (!tenantId || !customSoundUrl) return;

    try {
      const supabase = createClient();
      // Extract file path from URL
      const url = new URL(customSoundUrl);
      const pathMatch = url.pathname.match(/tenant-sounds\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from('tenant-sounds').remove([pathMatch[1]]);
      }
    } catch (err) {
      logger.error('Failed to delete custom sound from storage', err);
    }

    // Reset to default sound
    setCustomSoundUrl(null);
    setSelectedId(DEFAULT_SOUND_ID);
    onSoundChange(DEFAULT_SOUND_ID);

    toast({
      title: t('soundSelected'),
      description: t('soundSelectedDesc', { name: SOUND_LIBRARY[0].name }),
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
        {displaySounds.map((sound) => {
          const isSelected = selectedId === sound.id;
          const isPlaying = playingId === sound.id;
          const isLocked = sound.isPremium && !isPremium;
          const isCustom = isCustomSound(sound.id);

          return (
            <div
              key={sound.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all group ${
                isSelected
                  ? 'border-amber-400 bg-amber-50'
                  : isLocked
                    ? 'border-neutral-100 bg-neutral-50/50 opacity-60'
                    : isCustom
                      ? 'border-purple-200 bg-purple-50/30 hover:border-purple-300'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
              }`}
            >
              {/* Play button — preview only, does NOT select */}
              <button
                type="button"
                onClick={() => {
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

              {/* Sound info — click to select */}
              <button
                type="button"
                onClick={() => !isLocked && handleSelect(sound)}
                disabled={isLocked}
                className="flex-1 min-w-0 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${isLocked ? 'text-neutral-400' : 'text-neutral-900'}`}
                  >
                    {sound.name}
                  </span>
                  {sound.isPremium && !isPremium && <PremiumBadge />}
                  {isCustom && (
                    <span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                      {t('customBadge')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 truncate">{sound.description}</p>
              </button>

              {/* Duration (skip for custom since we don't know it) */}
              {!isCustom && (
                <span className="text-xs text-neutral-400 flex-shrink-0">{sound.duration}s</span>
              )}

              {/* Delete custom sound */}
              {isCustom && (
                <button
                  type="button"
                  onClick={handleDeleteCustomSound}
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

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

      {/* Custom upload */}
      {canUpload ? (
        <div className="pt-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,audio/mp3,.mp3,.wav,.ogg"
            onChange={handleSoundUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploadingSound}
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-11 border-dashed border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:text-neutral-700"
          >
            {uploadingSound ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('uploadingSound')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t('importCustomSound')}
              </>
            )}
          </Button>
          <p className="text-xs text-neutral-400 mt-1.5 text-center">
            MP3, WAV, OGG — {t('maxFileSize', { size: '2 MB' })}
          </p>
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

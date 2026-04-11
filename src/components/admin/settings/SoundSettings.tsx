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
import { useSound } from '@/contexts/SoundContext';
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
  const { effectivePlan } = useSubscription();
  const { toast } = useToast();
  const { setSoundId: setGlobalSoundId, preview: globalPreview } = useSound();
  const [selectedId, setSelectedId] = useState(currentSoundId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [uploadingSound, setUploadingSound] = useState(false);
  const [customSoundUrl, setCustomSoundUrl] = useState<string | null>(
    isCustomSound(currentSoundId) ? currentSoundId : null,
  );
  const localPreviewRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isPremium =
    effectivePlan === 'pro' || effectivePlan === 'business' || effectivePlan === 'enterprise';
  const canUpload = isPremium;

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

  // Cleanup preview audio on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        localPreviewRef.current.pause();
        localPreviewRef.current = null;
      }
    };
  }, []);

  const handlePreview = (sound: SoundDefinition) => {
    // Stop current playback
    if (localPreviewRef.current) {
      localPreviewRef.current.pause();
      localPreviewRef.current.currentTime = 0;
      localPreviewRef.current = null;
    }

    // If clicking the same sound that's playing, stop it
    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }

    // Play the new sound via global preview (handles autoplay policy)
    try {
      const audio = new Audio(sound.file);
      localPreviewRef.current = audio;
      setPlayingId(sound.id);

      audio.onerror = () => {
        toast({ title: t('soundError'), description: t('soundPlayError'), variant: 'destructive' });
        setPlayingId(null);
        localPreviewRef.current = null;
      };

      audio.play().catch(() => {
        // Fallback to global preview which handles autoplay
        globalPreview(sound.id);
        setPlayingId(null);
        localPreviewRef.current = null;
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
    // Update the global sound context so new sound takes effect immediately
    setGlobalSoundId(sound.id);
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
      setGlobalSoundId(publicUrl);

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
    setGlobalSoundId(DEFAULT_SOUND_ID);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-app-text-secondary" />
          <h3 className="font-semibold text-app-text">{t('notificationSoundsTitle')}</h3>
        </div>
        {!isPremium && (
          <span className="text-xs text-app-text-secondary">{t('soundsAvailableCount')}</span>
        )}
      </div>

      {/* Sound List - 2-column grid on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {displaySounds.map((sound) => {
          const isSelected = selectedId === sound.id;
          const isPlaying = playingId === sound.id;
          const isLocked = sound.isPremium && !isPremium;
          const isCustom = isCustomSound(sound.id);

          return (
            <Button
              key={sound.id}
              type="button"
              variant="outline"
              onClick={() => !isLocked && handleSelect(sound)}
              disabled={isLocked}
              className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left group h-auto whitespace-normal ${
                isSelected
                  ? 'border-amber-500/40 bg-amber-500/10 ring-1 ring-amber-500/20'
                  : isLocked
                    ? 'border-app-border bg-app-bg/50 opacity-60 cursor-not-allowed'
                    : isCustom
                      ? 'border-purple-200 bg-purple-500/5 hover:border-purple-500/30 cursor-pointer'
                      : 'border-app-border bg-app-card hover:border-app-border-hover cursor-pointer'
              }`}
            >
              {/* Play button */}
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isLocked) handlePreview(sound);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    if (!isLocked) handlePreview(sound);
                  }
                }}
                className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                  isPlaying
                    ? 'bg-amber-500 text-white'
                    : isLocked
                      ? 'bg-app-elevated text-app-text-muted'
                      : 'bg-app-elevated text-app-text-secondary hover:bg-app-elevated'
                }`}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5 ml-0.5" />
                )}
              </div>

              {/* Sound info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-medium ${isLocked ? 'text-app-text-muted' : 'text-app-text'}`}
                  >
                    {sound.name}
                  </span>
                  {sound.isPremium && !isPremium && <PremiumBadge />}
                  {isCustom && (
                    <span className="text-[9px] uppercase tracking-wide bg-purple-500/10 text-purple-500 px-1 py-0.5 rounded-full flex-shrink-0">
                      {t('customBadge')}
                    </span>
                  )}
                  {!isCustom && (
                    <span className="text-[10px] text-app-text-muted flex-shrink-0">
                      {sound.duration}s
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-app-text-secondary truncate">{sound.description}</p>
              </div>

              {/* Delete custom sound */}
              {isCustom && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCustomSound();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      handleDeleteCustomSound();
                    }
                  }}
                  title="Supprimer"
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-app-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </div>
              )}

              {/* Selected indicator */}
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </Button>
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
            className="w-full h-11 border-dashed border-app-border-hover text-app-text-secondary hover:border-text-muted hover:text-app-text"
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
          <p className="text-xs text-app-text-muted mt-1.5 text-center">
            MP3, WAV, OGG - {t('maxFileSize', { size: '2 MB' })}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
          <Crown className="w-4 h-4 flex-shrink-0" />
          <span>{t('customSoundPremiumOnly')}</span>
        </div>
      )}
    </div>
  );
}

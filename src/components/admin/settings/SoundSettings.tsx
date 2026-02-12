'use client';

import { useState, useRef } from 'react';
import { Play, Pause, Check, Volume2, Upload, Crown } from 'lucide-react';
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
  const { canAccess, effectivePlan } = useSubscription();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(currentSoundId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isPremium = effectivePlan === 'premium' || effectivePlan === 'enterprise';
  const canUpload = canAccess('customSoundUpload');

  const handlePreview = (sound: SoundDefinition) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // If clicking the same sound that's playing, stop it
    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }

    // Play the new sound
    const audio = new Audio(sound.file);
    audioRef.current = audio;
    setPlayingId(sound.id);

    audio.play().catch(() => {
      toast({ title: 'Erreur', description: 'Impossible de jouer ce son.' });
    });

    audio.onended = () => setPlayingId(null);
  };

  const handleSelect = (sound: SoundDefinition) => {
    // Check premium restriction
    if (sound.isPremium && !isPremium) {
      toast({
        title: 'Son Premium',
        description: 'Ce son est réservé au plan Premium.',
      });
      return;
    }

    setSelectedId(sound.id);
    onSoundChange(sound.id);
    toast({
      title: 'Son sélectionné',
      description: `${sound.name} est maintenant votre son de notification.`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Sons de notification</h3>
        </div>
        {!isPremium && (
          <span className="text-xs text-gray-500">3 sons disponibles &middot; 10 avec Premium</span>
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
                    ? 'border-gray-100 bg-gray-50/50 opacity-60'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
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
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              {/* Sound info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}
                  >
                    {sound.name}
                  </span>
                  {sound.isPremium && !isPremium && <PremiumBadge />}
                </div>
                <p className="text-xs text-gray-500 truncate">{sound.description}</p>
              </div>

              {/* Duration */}
              <span className="text-xs text-gray-400 flex-shrink-0">{sound.duration}s</span>

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
            className="w-full h-11 border-dashed border-gray-300 text-gray-500 hover:text-gray-700"
            onClick={() => {
              toast({
                title: 'Bientot disponible',
                description: "L'upload de sons personnalisés arrive prochainement.",
              });
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            Importer un son personnalisé
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm">
          <Crown className="w-4 h-4 flex-shrink-0" />
          <span>L&apos;import de sons personnalisés est disponible avec le plan Premium.</span>
        </div>
      )}
    </div>
  );
}

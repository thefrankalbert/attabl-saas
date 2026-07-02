'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Check, Lock } from 'lucide-react';
import { useSound } from '@/contexts/SoundContext';
import { SOUND_LIBRARY } from '@/lib/sounds/sound-library';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { cn } from '@/lib/utils';

interface SoundPickerProps {
  onClose: () => void;
}

/** Sound picker popover - opens on long press of the sound button. */
export default function SoundPicker({ onClose }: SoundPickerProps) {
  const t = useTranslations('orders');
  const { preview: previewSound, currentSoundId, setSoundId } = useSound();
  const { effectivePlan } = useSubscription();
  const isPremium =
    effectivePlan === 'pro' || effectivePlan === 'business' || effectivePlan === 'enterprise';

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-app-card border border-app-border rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-app-border">
          <p className="text-xs font-bold text-app-text">
            {t('soundPicker') || 'Sonnerie de notification'}
          </p>
        </div>
        <div className="max-h-60 overflow-y-auto scrollbar-hide p-1.5 space-y-0.5">
          {SOUND_LIBRARY.map((sound) => {
            const isLocked = sound.isPremium && !isPremium;
            const isActive = currentSoundId === sound.id;
            return (
              <Button
                key={sound.id}
                type="button"
                variant="ghost"
                disabled={isLocked}
                onClick={() => {
                  if (!isLocked) {
                    setSoundId(sound.id);
                    previewSound(sound.id);
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm h-auto whitespace-normal',
                  isActive ? 'bg-accent-muted text-accent' : 'text-app-text hover:bg-app-hover',
                  isLocked && 'opacity-50 cursor-not-allowed',
                )}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium break-words">{sound.name}</span>
                  <span className="block text-[10px] text-app-text-muted break-words">
                    {sound.description}
                  </span>
                </span>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                {isLocked && <Lock className="w-3 h-3 shrink-0 text-app-text-muted" />}
              </Button>
            );
          })}
        </div>
      </div>
    </>
  );
}

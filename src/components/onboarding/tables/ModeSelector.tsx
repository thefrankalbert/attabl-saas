'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Zap, Settings, Clock } from 'lucide-react';
import type { ConfigMode } from './types';

const modeIds: ConfigMode[] = ['complete', 'minimum', 'skip'];
const modeIcons = [Settings, Zap, Clock] as const;

const modeLabelKeys: Record<ConfigMode, string> = {
  complete: 'modeComplete',
  minimum: 'modeMinimum',
  skip: 'modeSkip',
};

const modeDescKeys: Record<ConfigMode, string> = {
  complete: 'modeCompleteDesc',
  minimum: 'modeMinimumDesc',
  skip: 'modeSkipDesc',
};

interface ModeSelectorProps {
  mode: ConfigMode;
  onModeChange: (mode: ConfigMode) => void;
}

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
        {t('tablesModeLabel')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {modeIds.map((id, idx) => {
          const isActive = mode === id;
          const Icon = modeIcons[idx];
          return (
            <Button
              key={id}
              type="button"
              variant="outline"
              onClick={() => onModeChange(id)}
              className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 h-auto whitespace-normal ${
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-app-border hover:border-app-border-hover bg-app-elevated/30 hover:bg-app-elevated/60'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isActive ? 'bg-accent text-accent-text' : 'bg-app-elevated text-app-text-muted'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p
                  className={`font-semibold text-sm ${isActive ? 'text-app-text' : 'text-app-text-secondary'}`}
                >
                  {t(modeLabelKeys[id])}
                </p>
                <p className="text-xs text-app-text-muted mt-0.5 leading-relaxed">
                  {t(modeDescKeys[id])}
                </p>
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

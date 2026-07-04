'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Check, Zap, Settings, Clock } from 'lucide-react';
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
      <p className="mb-2 block text-xs font-medium text-app-text-secondary">
        {t('tablesModeLabel')}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {modeIds.map((id, idx) => {
          const isActive = mode === id;
          const Icon = modeIcons[idx];
          return (
            <Button
              key={id}
              type="button"
              variant="ghost"
              onClick={() => onModeChange(id)}
              className={`group h-auto items-start gap-3 whitespace-normal rounded-lg p-4 text-left transition-all duration-150 ${
                isActive
                  ? 'bg-app-hover shadow-sm ring-1 ring-accent hover:bg-app-hover'
                  : 'border border-app-border bg-app-elevated hover:border-app-border-hover hover:bg-app-hover'
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-app-card">
                <Icon className={`h-5 w-5 ${isActive ? 'text-app-text' : 'text-app-text-muted'}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    isActive ? 'text-app-text' : 'text-app-text-secondary'
                  }`}
                >
                  {t(modeLabelKeys[id])}
                  {isActive && <Check className="h-4 w-4 shrink-0 text-app-text" />}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-app-text-muted">
                  {t(modeDescKeys[id])}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

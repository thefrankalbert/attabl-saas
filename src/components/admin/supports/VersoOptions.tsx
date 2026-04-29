'use client';

import { useTranslations } from 'next-intl';
import type { VersoMode } from '@/types/supports.types';

interface VersoOptionsProps {
  value: VersoMode;
  onChange: (value: VersoMode) => void;
}

const OPTIONS: { value: VersoMode; labelKey: string }[] = [
  { value: 'none', labelKey: 'versoNone' },
  { value: 'logo', labelKey: 'versoLogo' },
  { value: 'mirror', labelKey: 'versoMirror' },
];

export function VersoOptions({ value, onChange }: VersoOptionsProps) {
  const t = useTranslations('sidebar.supports');

  return (
    <div className="space-y-2">
      {OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          {/* eslint-disable-next-line react/forbid-elements -- <input type="radio"> pas d'equivalent shadcn */}
          <input
            type="radio"
            name="verso-mode"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-accent w-3.5 h-3.5 shrink-0"
          />
          <span className="text-xs text-app-text-secondary group-hover:text-app-text transition-colors">
            {t(opt.labelKey)}
          </span>
        </label>
      ))}
    </div>
  );
}

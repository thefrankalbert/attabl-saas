'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
    <RadioGroup value={value} onValueChange={(v) => onChange(v as VersoMode)} className="space-y-2">
      {OPTIONS.map((opt) => (
        <div key={opt.value} className="flex items-center gap-2.5">
          <RadioGroupItem
            id={`verso-${opt.value}`}
            value={opt.value}
            className="h-3.5 w-3.5 border-accent text-accent"
          />
          <Label
            htmlFor={`verso-${opt.value}`}
            className="cursor-pointer text-xs text-app-text-secondary transition-colors hover:text-app-text"
          >
            {t(opt.labelKey)}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

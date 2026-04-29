'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UnitSystem } from '@/types/supports.types';

export function cmToUnit(cm: number, unit: UnitSystem): number {
  if (unit === 'mm') return Math.round(cm * 10 * 100) / 100;
  if (unit === 'px') return Math.round(cm * 118.11);
  return Math.round(cm * 100) / 100;
}

export function unitToCm(value: number, unit: UnitSystem): number {
  if (unit === 'mm') return value / 10;
  if (unit === 'px') return value / 118.11;
  return value;
}

interface UnitInputProps {
  label: string;
  valueCm: number;
  onChange: (valueCm: number) => void;
  unit: UnitSystem;
  minCm?: number;
  maxCm?: number;
  step?: number;
  className?: string;
}

export function UnitInput({
  label,
  valueCm,
  onChange,
  unit,
  minCm = 0,
  maxCm = 21.7,
  step,
  className,
}: UnitInputProps) {
  const displayValue = cmToUnit(valueCm, unit);
  const displayMin = cmToUnit(minCm, unit);
  const displayMax = cmToUnit(maxCm, unit);

  const displayStep =
    step !== undefined ? cmToUnit(step, unit) : unit === 'px' ? 1 : unit === 'mm' ? 0.5 : 0.1;

  return (
    <div className={className}>
      <Label className="text-xs text-app-text-secondary mb-1 block">{label}</Label>
      <Input
        type="number"
        value={displayValue}
        min={displayMin}
        max={displayMax}
        step={displayStep}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!isNaN(raw)) {
            onChange(unitToCm(raw, unit));
          }
        }}
        className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
      />
    </div>
  );
}

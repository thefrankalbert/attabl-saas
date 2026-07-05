import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

// --- Slider Helper ------------------------------------

interface SliderFieldProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

export function SliderField({ label, value, unit, min, max, step, onChange }: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-app-text-muted">{label}</Label>
        <span className="text-xs font-mono text-app-text-muted">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]: number[]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface ColorPickerFieldProps {
  /** htmlFor / id of the text input */
  id: string;
  /** Field label (already translated) */
  label: string;
  /** Current hex value */
  value: string;
  /** Swatch palette to pick from */
  colors: readonly string[];
  /** Whether the swatch grid is open */
  isOpen: boolean;
  /** Toggle the swatch grid open/closed */
  onToggle: () => void;
  /** Free text (hex) edit */
  onChange: (value: string) => void;
  /** Pick a color from the grid (also closes the grid) */
  onPick: (value: string) => void;
}

/**
 * A single tenant-branding color field: swatch toggle + hex input + palette grid.
 * Extracted from BrandingStep where primary and secondary colors shared identical
 * markup. Inline background-color styles are intentional here (dynamic tenant colors,
 * sanctioned by the frontend styling rules).
 */
export function ColorPickerField({
  id,
  label,
  value,
  colors,
  isOpen,
  onToggle,
  onChange,
  onPick,
}: ColorPickerFieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-medium text-app-text-secondary mb-1 block">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          className="w-11 h-11 rounded-xl border border-app-border shrink-0 cursor-pointer hover:border-accent/40 transition-colors"
          style={{ backgroundColor: value }}
        />
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 bg-app-elevated border-app-border rounded-xl font-mono uppercase text-xs"
        />
      </div>
      {isOpen && (
        <div className="mt-2 grid grid-cols-5 gap-2 p-3 rounded-xl bg-app-elevated border border-app-border">
          {colors.map((color) => (
            <Button
              key={color}
              type="button"
              variant="ghost"
              onClick={() => onPick(color)}
              className={`w-9 h-9 rounded-lg border transition-all p-0 min-w-0 ${
                value === color
                  ? 'border-accent scale-110'
                  : 'border-transparent hover:border-app-border-hover'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

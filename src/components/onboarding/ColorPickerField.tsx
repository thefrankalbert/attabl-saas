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
      <Label htmlFor={id} className="mb-2 block text-xs font-medium text-app-text-secondary">
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
          className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-app-border shadow-sm transition-all duration-150 hover:border-app-border-hover"
          style={{ backgroundColor: value }}
        />
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 font-mono text-base md:text-xs uppercase shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
        />
      </div>
      {isOpen && (
        <div className="mt-2 grid grid-cols-5 gap-2 rounded-lg border border-app-border bg-app-elevated p-3 shadow-sm">
          {colors.map((color) => (
            <Button
              key={color}
              type="button"
              variant="ghost"
              onClick={() => onPick(color)}
              className={`h-9 w-9 min-w-0 rounded-lg border p-0 transition-all duration-150 ${
                value === color
                  ? 'ring-1 ring-accent border-app-border'
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

'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ─────────────────────────────────────────────

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  presets?: string[];
  disabled?: boolean;
}

// ─── Constants ─────────────────────────────────────────

const DEFAULT_PRESETS: string[] = [
  '#000000',
  '#FFFFFF',
  '#1a1a2e',
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
];

// ─── Helpers ───────────────────────────────────────────

const HEX_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function isValidHex(value: string): boolean {
  return HEX_REGEX.test(value);
}

function normalizeHex(value: string): string {
  const cleaned = value.startsWith('#') ? value : `#${value}`;
  return cleaned.toLowerCase();
}

// ─── Component ─────────────────────────────────────────

export function ColorPicker({
  value,
  onChange,
  label,
  presets = DEFAULT_PRESETS,
  disabled = false,
}: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  const handleHexBlur = () => {
    const normalized = normalizeHex(hexInput);
    if (isValidHex(normalized)) {
      onChange(normalized);
    } else {
      setHexInput(value);
    }
  };

  const handleHexChange = (newValue: string) => {
    setHexInput(newValue);
  };

  const handlePresetClick = (preset: string) => {
    onChange(preset);
    setHexInput(preset);
  };

  const handleNativeChange = (newColor: string) => {
    onChange(newColor);
    setHexInput(newColor);
  };

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : undefined}>
      {/* Label */}
      {label && <Label className="mb-2 block text-sm font-medium text-gray-700">{label}</Label>}

      {/* Preset Swatches */}
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => handlePresetClick(preset)}
            className={`
              h-6 w-6 rounded-full border border-gray-300 cursor-pointer
              transition-all duration-150
              ${
                value.toLowerCase() === preset.toLowerCase()
                  ? 'ring-2 ring-offset-2 ring-gray-900'
                  : 'hover:scale-110'
              }
            `}
            style={{ backgroundColor: preset }}
            aria-label={`Couleur ${preset}`}
            title={preset}
          />
        ))}
      </div>

      {/* Native Color Input + Hex Text Input */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => handleNativeChange(e.target.value)}
          className="h-8 w-8 rounded-lg border border-gray-300 cursor-pointer p-0.5"
          aria-label="Sélecteur de couleur"
        />
        <Input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleHexBlur();
            }
          }}
          placeholder="#000000"
          className="flex-1 font-mono text-sm"
          maxLength={7}
          aria-label="Valeur hexadécimale"
        />
      </div>
    </div>
  );
}

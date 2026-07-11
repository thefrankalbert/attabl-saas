'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FOOD_ICONS } from '@/lib/config/lucide-food-icons';

interface CategoryIconPickerProps {
  value: string | null;
  usedIcons: string[];
  onChange: (iconName: string) => void;
}

export function CategoryIconPicker({ value, usedIcons, onChange }: CategoryIconPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? FOOD_ICONS.filter((icon) => {
        const q = search
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return (
          icon.name.toLowerCase().includes(q) ||
          icon.keywords.some((kw) =>
            kw
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .includes(q),
          )
        );
      })
    : FOOD_ICONS;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une icone..."
          className="pl-9 h-8 text-base md:text-sm"
        />
      </div>
      <div className="grid grid-cols-6 gap-1.5 max-h-48 overflow-y-auto scrollbar-hide">
        {filtered.map((icon) => {
          const Icon = icon.component;
          const isSelected = value === icon.name;
          const isUsed = usedIcons.includes(icon.name) && !isSelected;

          return (
            <Button
              key={icon.name}
              type="button"
              title={icon.name}
              onClick={() => onChange(icon.name)}
              variant="outline"
              className={cn(
                'flex items-center justify-center rounded-lg p-2 min-h-[44px] w-full transition-colors border',
                isSelected
                  ? 'border-accent bg-accent/10 text-accent hover:bg-accent/10 hover:text-accent'
                  : isUsed
                    ? 'border-app-border bg-app-bg text-app-text-muted/40 cursor-not-allowed'
                    : 'border-app-border bg-app-bg text-app-text-muted hover:border-app-text-secondary hover:text-app-text',
              )}
              disabled={isUsed}
              aria-pressed={isSelected}
            >
              <Icon className="w-4 h-4" />
            </Button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-6 text-center text-xs text-app-text-muted py-4">Aucune icone</p>
        )}
      </div>
    </div>
  );
}

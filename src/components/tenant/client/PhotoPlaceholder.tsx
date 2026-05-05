import { Utensils, GlassWater } from 'lucide-react';

export interface PhotoPlaceholderProps {
  kind?: 'food' | 'drink';
  className?: string;
}

export function PhotoPlaceholder({ kind = 'food', className = '' }: PhotoPlaceholderProps) {
  const Icon = kind === 'drink' ? GlassWater : Utensils;
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center bg-[var(--color-ivory)] ${className}`}
      aria-hidden
    >
      <Icon className="h-1/3 w-1/3 text-[var(--color-ivory-fg)]" strokeWidth={1.4} />
    </div>
  );
}

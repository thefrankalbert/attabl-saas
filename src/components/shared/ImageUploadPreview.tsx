'use client';

import type { ChangeEvent, RefObject } from 'react';
import { Trash2, Crop, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageUploadPreviewProps {
  value: string;
  /** Format du recadrage: l'apercu montre la photo entiere, comme recadree. */
  aspect: number;
  disabled?: boolean;
  isLoading: boolean;
  openRecrop: () => void;
  replaceInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

export default function ImageUploadPreview({
  value,
  aspect,
  disabled,
  isLoading,
  openRecrop,
  replaceInputRef,
  onFileSelect,
  onRemove,
}: ImageUploadPreviewProps) {
  return (
    <div className="@container w-full rounded-xl overflow-hidden border border-app-border bg-app-card shadow-sm">
      {/* Image preview: meme format que le recadrage (une hauteur fixe + cover
          coupait le haut et le bas de la photo), plafonne a 18rem de haut;
          au-dela, contain montre la photo entiere sur fond neutre. */}
      <div className="relative w-full max-h-72 bg-black/5" style={{ aspectRatio: aspect }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="object-contain w-full h-full" />
      </div>

      {/* Action toolbar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-app-border bg-app-bg/50">
        <ActionButton
          icon={<Crop className="h-3.5 w-3.5" />}
          label="Recadrer"
          onClick={openRecrop}
          disabled={disabled || isLoading}
        />

        <ActionButton
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          label="Remplacer"
          onClick={() => replaceInputRef.current?.click()}
          disabled={disabled || isLoading}
        />

        <div className="flex-1" />

        <ActionButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Supprimer"
          onClick={onRemove}
          disabled={disabled || isLoading}
          variant="danger"
        />

        {/* Hidden file input for replacing */}
        {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
        <input
          type="file"
          ref={replaceInputRef}
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileSelect}
          disabled={disabled || isLoading}
        />
      </div>
    </div>
  );
}

// --- Toolbar action button ---------------------------------

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <Button
      type="button"
      variant={variant === 'danger' ? 'ghost' : 'ghost'}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors h-auto',
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
          : 'text-app-text-secondary hover:bg-app-elevated hover:text-app-text',
      )}
    >
      {icon}
      {/* Libelle masque quand la carte est etroite (case de galerie): les trois
          boutons tiennent alors en icones au lieu de deborder de la carte. */}
      <span className="hidden @[22rem]:inline">{label}</span>
    </Button>
  );
}

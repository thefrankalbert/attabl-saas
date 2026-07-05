'use client';

import type { ChangeEvent, RefObject } from 'react';
import { Trash2, Crop, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageUploadPreviewProps {
  value: string;
  disabled?: boolean;
  isLoading: boolean;
  openRecrop: () => void;
  replaceInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

export default function ImageUploadPreview({
  value,
  disabled,
  isLoading,
  openRecrop,
  replaceInputRef,
  onFileSelect,
  onRemove,
}: ImageUploadPreviewProps) {
  return (
    <div className="w-full rounded-xl overflow-hidden border border-app-border bg-app-card shadow-sm">
      {/* Image preview */}
      <div className="relative w-full h-56 bg-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="object-cover w-full h-full" />
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
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors h-auto',
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
          : 'text-app-text-secondary hover:bg-app-elevated hover:text-app-text',
      )}
    >
      {icon}
      {label}
    </Button>
  );
}

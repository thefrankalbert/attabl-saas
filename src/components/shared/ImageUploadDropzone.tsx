'use client';

import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageUploadDropzoneProps {
  disabled?: boolean;
  isLoading: boolean;
  isDragging: boolean;
  error: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

export default function ImageUploadDropzone({
  disabled,
  isLoading,
  isDragging,
  error,
  fileInputRef,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
}: ImageUploadDropzoneProps) {
  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'relative w-full h-52 rounded-xl border-2 border-dashed',
          'flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-accent bg-accent/5 scale-[1.01]'
            : 'border-app-border hover:border-accent/40 hover:bg-app-hover/50',
          (disabled || isLoading) && 'opacity-50 pointer-events-none',
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileSelect}
          disabled={disabled || isLoading}
        />

        <div
          className={cn(
            'p-3 rounded-xl transition-colors',
            isDragging ? 'bg-accent/10 text-accent' : 'bg-app-elevated text-app-text-muted',
          )}
        >
          <ImagePlus className="h-7 w-7" />
        </div>

        <div className="text-center px-4">
          <p className="text-sm font-medium text-app-text-secondary">
            Cliquez ou glissez une image
          </p>
          <p className="text-xs text-app-text-muted mt-0.5">JPG, PNG, WebP - Max 10Mo</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}

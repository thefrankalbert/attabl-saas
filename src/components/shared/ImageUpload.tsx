'use client';

import { useState, useRef, useCallback, ChangeEvent, DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import {
  Trash2,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  X,
  Crop,
  RefreshCw,
  ImagePlus,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/image-compress';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
  value: string;
  bucket?: string;
  /** Aspect ratio for the cropper (default 4/3 for menu items, use 1 for square) */
  aspect?: number;
  /** Max output width in pixels (default 1200) */
  maxWidth?: number;
}

/** Turn the pixel crop from react-easy-crop into a Blob */
async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/jpeg',
      0.92,
    );
  });
}

export default function ImageUpload({
  disabled,
  onChange,
  onRemove,
  value,
  bucket = 'menu-items',
  aspect = 4 / 3,
  maxWidth = 1200,
}: ImageUploadProps) {
  const tc = useTranslations('common');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  // Track if we're re-cropping an existing image
  const [isRecrop, setIsRecrop] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const resetCrop = () => {
    setCropSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsRecrop(false);
  };

  /** Read a File as a data URL and open the cropper */
  const openCropper = (file: File) => {
    setError(null);

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Format non supporte. Utilisez JPG, PNG ou WebP.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("L'image doit faire moins de 10Mo");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  /** Open cropper with the current uploaded image for re-editing */
  const openRecrop = () => {
    if (!value) return;
    setCropSrc(value);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setIsRecrop(true);
  };

  /** Crop, compress, and upload */
  const handleCropAndUpload = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    setIsLoading(true);
    try {
      const croppedBlob = await getCroppedBlob(cropSrc, croppedAreaPixels);

      const compressed = await compressImage(croppedBlob, {
        maxWidth,
        maxHeight: Math.round(maxWidth / aspect),
        quality: 0.85,
        type: 'image/jpeg',
      });

      const supabase = createClient();
      const fileName = `${crypto.randomUUID()}_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, compressed, { upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(fileName);

      onChange(publicUrl);
      resetCrop();
    } catch (err: unknown) {
      logger.error('Upload error', err);
      setError("Erreur lors du telechargement de l'image");
    } finally {
      setIsLoading(false);
    }
  };

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      openCropper(e.target.files[0]);
    }
    if (e.target) e.target.value = '';
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      openCropper(e.dataTransfer.files[0]);
    }
  };

  // ─── Crop editor ───────────────────────────────────────────
  if (cropSrc) {
    return (
      <div className="w-full rounded-xl overflow-hidden border border-app-border bg-app-card shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
          <div className="flex items-center gap-2">
            <Crop className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold text-app-text">
              {isRecrop ? 'Recadrer' : 'Ajuster la photo'}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={tc('aria.close')}
            onClick={resetCrop}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-app-text-muted hover:text-app-text hover:bg-app-elevated transition-colors h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Cropper area */}
        <div className="relative w-full h-64 sm:h-72 bg-black/90">
          <Cropper
            image={cropSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape="rect"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            classes={{
              containerClassName: 'rounded-none',
              cropAreaClassName: '!border-2 !border-accent/60',
            }}
          />
        </div>

        {/* Zoom controls */}
        <div className="px-4 py-4 border-t border-app-border bg-app-bg/50">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
              className="p-2 rounded-lg text-app-text-secondary hover:text-app-text hover:bg-app-elevated transition-colors h-9 w-9"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <Slider
              min={100}
              max={300}
              step={5}
              value={[zoom * 100]}
              onValueChange={([v]) => setZoom(v / 100)}
              className="flex-1"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
              className="p-2 rounded-lg text-app-text-secondary hover:text-app-text hover:bg-app-elevated transition-colors h-9 w-9"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <div className="w-px h-5 bg-app-border" />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Reset"
              onClick={() => {
                setCrop({ x: 0, y: 0 });
                setZoom(1);
              }}
              className="p-2 rounded-lg text-app-text-secondary hover:text-app-text hover:bg-app-elevated transition-colors h-9 w-9"
              title="Reinitialiser"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Zoom percentage label */}
          <p className="text-[11px] text-app-text-muted text-center mt-2">
            Zoom {Math.round(zoom * 100)}%
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-4 py-3 border-t border-app-border">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 h-10 rounded-lg"
            onClick={resetCrop}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="default"
            className="flex-1 h-10 rounded-lg font-semibold"
            onClick={handleCropAndUpload}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Envoi...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Appliquer
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Preview with action toolbar ───────────────────────────
  if (value) {
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

  // ─── Dropzone (no image yet) ───────────────────────────────
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

// ─── Toolbar action button ─────────────────────────────────

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

'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Loader2, ZoomIn, ZoomOut, RotateCcw, Check, X, Crop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface ImageCropEditorProps {
  cropSrc: string;
  crop: Point;
  zoom: number;
  aspect: number;
  isLoading: boolean;
  isRecrop: boolean;
  setCrop: Dispatch<SetStateAction<Point>>;
  setZoom: Dispatch<SetStateAction<number>>;
  onCropComplete: (_: Area, croppedPixels: Area) => void;
  resetCrop: () => void;
  handleCropAndUpload: () => void;
}

export default function ImageCropEditor({
  cropSrc,
  crop,
  zoom,
  aspect,
  isLoading,
  isRecrop,
  setCrop,
  setZoom,
  onCropComplete,
  resetCrop,
  handleCropAndUpload,
}: ImageCropEditorProps) {
  const tc = useTranslations('common');

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

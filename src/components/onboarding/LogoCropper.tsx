'use client';

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/image-compress';

interface LogoCropperProps {
  imageSrc: string;
  onComplete: (publicUrl: string) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}

/** Turn the pixel crop from react-easy-crop into a Blob */
async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
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
      'image/png',
      1,
    );
  });
}

export function LogoCropper({ imageSrc, onComplete, onCancel, onError }: LogoCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;
    setApplying(true);
    try {
      const croppedBlob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      const compressed = await compressImage(croppedBlob, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.8,
        type: 'image/jpeg',
      });
      // Upload via API route (uses admin client server-side to bypass RLS)
      const formData = new FormData();
      formData.append('file', compressed, 'logo.jpg');
      formData.append('bucket', 'logos');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const { url } = await res.json();
      onComplete(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (onError) {
        onError(message);
      }
      onComplete(imageSrc);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[10px] bg-app-card overflow-hidden border border-app-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <h3 className="font-bold text-app-text">Recadrer le logo</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={applying}
            className="p-1.5 rounded-[10px] text-app-text-muted hover:text-app-text-secondary hover:bg-app-elevated transition-colors h-8 w-8"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Cropper Area */}
        <div className="relative w-full h-72 bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom Controls */}
        <div className="px-5 py-4 border-b border-app-border">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
              className="p-2 rounded-[10px] border border-app-border text-app-text-secondary hover:bg-app-elevated transition-colors h-10 w-10"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            {/* eslint-disable-next-line react/forbid-elements -- <input type="range"> is the native zoom slider for image cropping; shadcn Slider would require rewiring the zoom controls */}
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
              className="p-2 rounded-[10px] border border-app-border text-app-text-secondary hover:bg-app-elevated transition-colors h-10 w-10"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 rounded-[10px] border-app-border"
            onClick={onCancel}
            disabled={applying}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="flex-1 h-11 rounded-[10px] bg-accent text-accent-text font-bold hover:bg-accent-hover"
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Envoi...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Appliquer
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

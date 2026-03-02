'use client';

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compressImage, uploadToStorage } from '@/lib/image-compress';
import { createClient } from '@/lib/supabase/client';

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
      // 1. Crop the image to a blob
      const croppedBlob = await getCroppedBlob(imageSrc, croppedAreaPixels);

      // 2. Compress to max 512×512 JPEG
      const compressed = await compressImage(croppedBlob, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.8,
        type: 'image/jpeg',
      });

      // 3. Upload to Supabase Storage
      const supabase = createClient();
      const publicUrl = await uploadToStorage(compressed, 'logos', supabase);

      onComplete(publicUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (onError) {
        onError(message);
      }
      // Fallback: still try to return original (as data URL) so user isn't stuck
      onComplete(imageSrc);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-app-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <h3 className="font-semibold text-neutral-900">Recadrer le logo</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative w-full h-72 bg-neutral-900">
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
        <div className="px-5 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
              className="p-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[#CCFF00]"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
              className="p-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={onCancel}
            disabled={applying}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="flex-1 rounded-xl bg-[#CCFF00] text-black font-semibold hover:bg-[#b8e600]"
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Envoi…
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

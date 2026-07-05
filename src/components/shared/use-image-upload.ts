'use client';

import { useState, useRef, useCallback, ChangeEvent, DragEvent } from 'react';
import type { Area, Point } from 'react-easy-crop';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/image-compress';
import { getCroppedBlob } from './image-crop';

interface UseImageUploadParams {
  onChange: (value: string) => void;
  value: string;
  bucket: string;
  aspect: number;
  maxWidth: number;
}

export function useImageUpload({
  onChange,
  value,
  bucket,
  aspect,
  maxWidth,
}: UseImageUploadParams) {
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

  return {
    isLoading,
    isDragging,
    error,
    fileInputRef,
    replaceInputRef,
    cropSrc,
    crop,
    zoom,
    isRecrop,
    setCrop,
    setZoom,
    onCropComplete,
    resetCrop,
    openRecrop,
    handleCropAndUpload,
    onFileSelect,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}

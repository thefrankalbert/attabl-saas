'use client';

import { useImageUpload } from './use-image-upload';
import ImageCropEditor from './ImageCropEditor';
import ImageUploadPreview from './ImageUploadPreview';
import ImageUploadDropzone from './ImageUploadDropzone';

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

export default function ImageUpload({
  disabled,
  onChange,
  onRemove,
  value,
  bucket = 'menu-items',
  aspect = 4 / 3,
  maxWidth = 1200,
}: ImageUploadProps) {
  const {
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
  } = useImageUpload({ onChange, value, bucket, aspect, maxWidth });

  // --- Crop editor -------------------------------------------
  if (cropSrc) {
    return (
      <ImageCropEditor
        cropSrc={cropSrc}
        crop={crop}
        zoom={zoom}
        aspect={aspect}
        isLoading={isLoading}
        isRecrop={isRecrop}
        setCrop={setCrop}
        setZoom={setZoom}
        onCropComplete={onCropComplete}
        resetCrop={resetCrop}
        handleCropAndUpload={handleCropAndUpload}
      />
    );
  }

  // --- Preview with action toolbar ---------------------------
  if (value) {
    return (
      <ImageUploadPreview
        value={value}
        disabled={disabled}
        isLoading={isLoading}
        openRecrop={openRecrop}
        replaceInputRef={replaceInputRef}
        onFileSelect={onFileSelect}
        onRemove={onRemove}
      />
    );
  }

  // --- Dropzone (no image yet) -------------------------------
  return (
    <ImageUploadDropzone
      disabled={disabled}
      isLoading={isLoading}
      isDragging={isDragging}
      error={error}
      fileInputRef={fileInputRef}
      onFileSelect={onFileSelect}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    />
  );
}

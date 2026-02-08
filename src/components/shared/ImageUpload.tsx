'use client';

import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Trash, UploadCloud, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
  value: string;
  bucket?: string;
}

export default function ImageUpload({
  disabled,
  onChange,
  onRemove,
  value,
  bucket = 'menu-items',
}: ImageUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;

    setError(null);

    // Validation du type
    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image');
      return;
    }

    // Validation de la taille (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("L'image doit faire moins de 5Mo");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();

      // Nom unique pour le fichier pour éviter les conflits
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload vers Supabase Storage
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, {
        upsert: false,
      });

      if (uploadError) {
        throw uploadError;
      }

      // Récupération de l'URL publique
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(filePath);

      onChange(publicUrl);
    } catch (err: unknown) {
      console.error('Upload error:', err);
      setError("Erreur lors du téléchargement de l'image");
    } finally {
      setIsLoading(false);
    }
  };

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
    // Reset inputs value to allow re-selection of same file if needed
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
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  if (value) {
    return (
      <div className="relative w-full h-64 rounded-xl overflow-hidden border border-gray-200 group bg-gray-50">
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            type="button"
            onClick={onRemove}
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            disabled={disabled || isLoading}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Image preview" className="object-cover w-full h-full" />
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`
                relative w-full h-64 rounded-xl border-2 border-dashed
                flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
                ${disabled || isLoading ? 'opacity-50 pointer-events-none' : ''}
            `}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={onFileSelect}
          disabled={disabled || isLoading}
        />

        <div className="p-4 bg-gray-100 rounded-full text-gray-500">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          ) : (
            <UploadCloud className="h-8 w-8" />
          )}
        </div>

        <div className="text-center px-4">
          <p className="text-sm font-semibold text-gray-700">
            {isLoading ? 'Envoi en cours...' : 'Cliquez ou glissez une image ici'}
          </p>
          <p className="text-xs text-gray-500 mt-1">PNG, JPG supportés (Max 5Mo)</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

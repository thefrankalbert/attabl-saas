'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import ImageUpload from '@/components/shared/ImageUpload';

/** Nombre maximal de photos supplementaires d'un plat. */
const MAX_GALLERY = 5;

interface ItemPhotoFieldsProps {
  imageUrl: string;
  setImageUrl: (url: string) => void;
  galleryImages: string[];
  setGalleryImages: (updater: string[] | ((prev: string[]) => string[])) => void;
}

/**
 * Photo principale et photos supplementaires d'un plat (carrousel de la fiche
 * du plat, apres la photo principale). Sorti de ItemFormModal (plus de 400 lignes).
 */
export function ItemPhotoFields({
  imageUrl,
  setImageUrl,
  galleryImages,
  setGalleryImages,
}: ItemPhotoFieldsProps) {
  const t = useTranslations('items');
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-app-text">{t('imageUrl')}</Label>
        <ImageUpload
          value={imageUrl}
          onChange={(url) => setImageUrl(url)}
          onRemove={() => setImageUrl('')}
          bucket="menu-items"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-app-text">{t('galleryPhotos')}</Label>
        <p className="text-xs text-app-text-muted">{t('galleryPhotosDesc')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {galleryImages.map((url, idx) => (
            <ImageUpload
              key={`${url}-${idx}`}
              value={url}
              onChange={(next) =>
                setGalleryImages((prev) => prev.map((u, i) => (i === idx ? next : u)))
              }
              onRemove={() => setGalleryImages((prev) => prev.filter((_, i) => i !== idx))}
              bucket="menu-items"
              aspect={1}
            />
          ))}
          {galleryImages.length < MAX_GALLERY && (
            <ImageUpload
              key={`add-${galleryImages.length}`}
              value=""
              onChange={(url) => setGalleryImages((prev) => [...prev, url])}
              onRemove={() => {}}
              bucket="menu-items"
              aspect={1}
            />
          )}
        </div>
      </div>
    </>
  );
}

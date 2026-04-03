'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Trash2, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import Image from 'next/image';
import type { Ad } from '@/types/admin.types';
import { createAdService } from '@/services/ad.service';

interface AdsClientProps {
  tenantId: string;
  initialAds: Ad[];
}

export default function AdsClient({ tenantId, initialAds }: AdsClientProps) {
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [sortOrder, setSortOrder] = useState<number | string>(1);
  const [isActive, setIsActive] = useState(true);
  // keepExistingImage state reserved for future edit feature

  const t = useTranslations('ads');
  const tc = useTranslations('common');
  const { toast } = useToast();
  const supabase = createClient();

  const resetForm = () => {
    setImageFile(null);
    setPreviewUrl(null);
    setLink('');
    setSortOrder(ads.length + 1);
    setIsActive(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!imageFile) {
      toast({ title: t('imageRequired'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // 1. Upload Image
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${tenantId}/ads/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('images') // Assumes bucket exists
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('images').getPublicUrl(fileName);

      // 2. Insert DB Record
      const adService = createAdService(supabase);
      const newAd = await adService.createAd({
        tenant_id: tenantId,
        image_url: publicUrl,
        link: link || null,
        sort_order: Number(sortOrder) || 1,
        is_active: isActive,
      });

      setAds((prev) => [...prev, newAd as Ad].sort((a, b) => a.sort_order - b.sort_order));
      toast({ title: t('adCreated') });
      setIsModalOpen(false);
      resetForm();
    } catch (e: unknown) {
      logger.error('Failed to save ad', e);
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('unknownError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;

    try {
      const adService = createAdService(supabase);
      await adService.deleteAd(id);
      setAds((prev) => prev.filter((ad) => ad.id !== id));
      toast({ title: t('adDeleted') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const toggleActive = async (ad: Ad) => {
    try {
      const adService = createAdService(supabase);
      const data = await adService.toggleActive(ad.id, !ad.is_active);

      setAds((prev) => prev.map((a) => (a.id === ad.id ? (data as Ad) : a)));
      toast({ title: !ad.is_active ? t('activated') : t('deactivated') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center">
        <div className="inline-flex items-center gap-2 border border-app-border rounded-lg px-1.5 py-1">
          <span className="text-xs font-bold text-app-text-secondary tabular-nums px-1.5 shrink-0">
            {ads.length}
          </span>
          <Button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            variant="default"
            size="sm"
            className="gap-1.5 h-7 rounded-md shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> {t('newAd')}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-2 sm:mt-4">
        {ads.length > 0 ? (
          <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
            {ads.map((ad) => (
              <div
                key={ad.id}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group',
                  !ad.is_active && 'opacity-60',
                )}
              >
                <div className="w-16 h-10 rounded-lg bg-app-bg relative overflow-hidden shrink-0">
                  <Image src={ad.image_url} alt="" fill className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  {ad.link ? (
                    <a
                      href={ad.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-status-info hover:underline break-all block"
                    >
                      {ad.link}
                    </a>
                  ) : (
                    <span className="text-sm text-app-text-muted">{t('noLink')}</span>
                  )}
                </div>
                <span className="text-xs text-app-text-muted tabular-nums shrink-0">
                  #{ad.sort_order}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0',
                    ad.is_active
                      ? 'bg-status-success-bg text-status-success'
                      : 'bg-app-bg text-app-text-secondary',
                  )}
                >
                  {ad.is_active ? t('enable') : t('disable')}
                </span>
                <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => toggleActive(ad)}
                  >
                    {ad.is_active ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-status-error hover:text-status-error hover:bg-status-error-bg"
                    title="Supprimer"
                    onClick={() => handleDelete(ad.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-app-card rounded-xl border border-app-border p-16 text-center">
            <div className="w-16 h-16 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-8 h-8 text-app-text-muted" />
            </div>
            <h3 className="text-lg font-bold text-app-text">{t('noAds')}</h3>
            <p className="text-sm text-app-text-secondary mt-2">{t('noAdsDesc')}</p>
          </div>
        )}
      </div>

      <AdminModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('newAd')}>
        <div className="space-y-4">
          {/* Image */}
          <div className="space-y-2">
            <Label>{t('bannerImage')}</Label>
            <div className="border-2 border-dashed border-app-border rounded-xl p-4 text-center hover:bg-app-bg transition-colors cursor-pointer relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              {previewUrl ? (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-app-bg">
                  <Image src={previewUrl} alt="Preview" fill className="object-cover" unoptimized />
                </div>
              ) : (
                <div className="py-8 text-app-text-muted">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">{t('clickToAddImage')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Link */}
          <div className="space-y-2">
            <Label>{t('redirectLink')}</Label>
            <Input
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>

          {/* Sort Order */}
          <div className="space-y-2">
            <Label>{t('displayOrder')}</Label>
            <Input
              type="number"
              min={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-app-border-hover text-primary focus:ring-primary"
            />
            <Label htmlFor="active" className="cursor-pointer">
              {t('enableImmediately')}
            </Label>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('publish')}
            </Button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

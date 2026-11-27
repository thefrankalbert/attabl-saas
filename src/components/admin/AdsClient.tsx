'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Trash2, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import AdminModal from '@/components/admin/AdminModal';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import ImageUpload from '@/components/shared/ImageUpload';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import Image from 'next/image';
import type { Ad } from '@/types/admin.types';
import { actionCreateAd, actionDeleteAd, actionToggleAdActive } from '@/app/actions/ads';

interface AdsClientProps {
  tenantId: string;
  initialAds: Ad[];
}

export default function AdsClient({ tenantId, initialAds }: AdsClientProps) {
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [imageUrl, setImageUrl] = useState('');
  const [link, setLink] = useState('');
  const [sortOrder, setSortOrder] = useState<number | string>(1);
  const [isActive, setIsActive] = useState(true);

  const t = useTranslations('ads');
  const tc = useTranslations('common');
  const { confirm, Dialog: ConfirmDialog } = useConfirmDialog();
  const { toast } = useToast();

  const resetForm = () => {
    setImageUrl('');
    setLink('');
    setSortOrder(ads.length + 1);
    setIsActive(true);
  };

  const handleSave = async () => {
    if (!imageUrl) {
      toast({ title: t('imageRequired'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // L'image est deja envoyee par ImageUpload (route /api/upload, dossier du
      // restaurant derive de la session): il ne reste qu'a enregistrer l'annonce.
      const result = await actionCreateAd(tenantId, {
        tenant_id: tenantId,
        image_url: imageUrl,
        link: link.trim() || null,
        sort_order: Number(sortOrder) || 1,
        is_active: isActive,
      });

      if (result.error) {
        logger.error('Failed to save ad', result.error);
        toast({
          title: tc('error'),
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      setAds((prev) => [...prev, result.data as Ad].sort((a, b) => a.sort_order - b.sort_order));
      toast({ title: t('adCreated') });
      setIsModalOpen(false);
      resetForm();
    } catch (e: unknown) {
      logger.error('Failed to save ad', e);
      toast({
        title: tc('error'),
        description: t('unknownError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: tc('delete'),
      description: t('confirmDelete'),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      destructive: true,
    });
    if (!ok) return;

    const result = await actionDeleteAd(tenantId, id);
    if (result.error) {
      toast({ title: tc('error'), description: result.error, variant: 'destructive' });
      return;
    }
    setAds((prev) => prev.filter((ad) => ad.id !== id));
    toast({ title: t('adDeleted') });
  };

  const toggleActive = async (ad: Ad) => {
    const result = await actionToggleAdActive(tenantId, ad.id, !ad.is_active);
    if (result.error) {
      toast({ title: tc('error'), description: result.error, variant: 'destructive' });
      return;
    }
    setAds((prev) => prev.map((a) => (a.id === ad.id ? (result.data as Ad) : a)));
    toast({ title: !ad.is_active ? t('activated') : t('deactivated') });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 space-y-4">
        <AdminPageHeader
          title={t('title')}
          actions={
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
          }
        />
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
                  {ad.is_active ? t('enabled') : t('disabled')}
                </span>
                <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={ad.is_active ? t('deactivate') : t('activate')}
                    title={ad.is_active ? t('deactivate') : t('activate')}
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
                    aria-label={t('deleteAd')}
                    title={t('deleteAd')}
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
            <ImageUpload
              value={imageUrl}
              onChange={setImageUrl}
              onRemove={() => setImageUrl('')}
              bucket="images"
              aspect={2}
              maxWidth={1600}
            />
          </div>

          {/* Link */}
          <div className="space-y-2">
            <Label htmlFor="ad-link">{t('redirectLink')}</Label>
            <Input
              id="ad-link"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <p className="text-xs text-app-text-muted">{t('linkHint')}</p>
          </div>

          {/* Sort Order */}
          <div className="space-y-2">
            <Label htmlFor="ad-order">{t('displayOrder')}</Label>
            <Input
              id="ad-order"
              type="number"
              min={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
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
      {ConfirmDialog}
    </div>
  );
}

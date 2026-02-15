'use client';

import { useState } from 'react';
import {
  Plus,
  Loader2,
  Trash2,
  Image as ImageIcon,
  Link as LinkIcon,
  Eye,
  EyeOff,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { Ad } from '@/types/admin.types';

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
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);
  // keepExistingImage state reserved for future edit feature

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
      toast({ title: 'Image requise', variant: 'destructive' });
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
      const { data: newAd, error: dbError } = await supabase
        .from('ads')
        .insert({
          tenant_id: tenantId,
          image_url: publicUrl,
          link: link || null,
          sort_order: sortOrder,
          is_active: isActive,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setAds((prev) => [...prev, newAd as Ad].sort((a, b) => a.sort_order - b.sort_order));
      toast({ title: 'Publicité créée !' });
      setIsModalOpen(false);
      resetForm();
    } catch (e: unknown) {
      console.error(e);
      toast({
        title: 'Erreur',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette publicité ?')) return;

    try {
      await supabase.from('ads').delete().eq('id', id);
      setAds((prev) => prev.filter((ad) => ad.id !== id));
      toast({ title: 'Publicité supprimée' });
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  const toggleActive = async (ad: Ad) => {
    try {
      const { data } = await supabase
        .from('ads')
        .update({ is_active: !ad.is_active })
        .eq('id', ad.id)
        .select()
        .single();

      if (data) {
        setAds((prev) => prev.map((a) => (a.id === ad.id ? (data as Ad) : a)));
        toast({ title: !ad.is_active ? 'Activé' : 'Désactivé' });
      }
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Publicités & Bannières</h1>
          <p className="text-sm text-gray-500">
            Gérez les bannières promotionnelles de votre page d&apos;accueil.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" /> Nouvelle Publicité
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ads.map((ad) => (
          <div
            key={ad.id}
            className={cn(
              'group relative bg-white border rounded-xl overflow-hidden shadow-sm transition-all hover:shadow-md',
              !ad.is_active && 'opacity-60',
            )}
          >
            <div className="aspect-video bg-gray-100 relative">
              <Image src={ad.image_url} alt="" fill className="object-cover" />
              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded text-xs font-bold shadow-sm">
                Ordre: {ad.sort_order}
              </div>
            </div>

            <div className="p-4">
              {ad.link && (
                <div className="flex items-center gap-2 text-xs text-blue-600 mb-3 truncate">
                  <LinkIcon className="w-3 h-3 flex-shrink-0" />
                  <a
                    href={ad.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline truncate"
                  >
                    {ad.link}
                  </a>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => toggleActive(ad)}
                >
                  {ad.is_active ? (
                    <EyeOff className="w-3 h-3 mr-2" />
                  ) : (
                    <Eye className="w-3 h-3 mr-2" />
                  )}
                  {ad.is_active ? 'Désactiver' : 'Activer'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(ad.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {ads.length === 0 && (
          <div className="col-span-full py-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-900">Aucune publicité</h3>
            <p className="text-xs text-gray-500 mt-1">
              Créez votre première bannière pour commencer.
            </p>
          </div>
        )}
      </div>

      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nouvelle Publicité"
      >
        <div className="space-y-4">
          {/* Image */}
          <div className="space-y-2">
            <Label>Image de la bannière</Label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              {previewUrl ? (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
                  <Image src={previewUrl} alt="Preview" fill className="object-cover" unoptimized />
                </div>
              ) : (
                <div className="py-8 text-gray-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Cliquez pour ajouter une image</p>
                </div>
              )}
            </div>
          </div>

          {/* Link */}
          <div className="space-y-2">
            <Label>Lien de redirection (optionnel)</Label>
            <Input
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>

          {/* Sort Order */}
          <div className="space-y-2">
            <Label>Ordre d&apos;affichage</Label>
            <Input
              type="number"
              min={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 1)}
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Activer immédiatement
            </Label>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Publier
            </Button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

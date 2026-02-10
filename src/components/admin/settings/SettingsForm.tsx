'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Upload, Loader2, Save, Store, Palette, MapPin, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { updateTenantSettings } from '@/app/actions/tenant-settings';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { SoundSettings } from './SoundSettings';

const settingsSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  description: z.string().optional(),
  primaryColor: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Couleur invalide'),
  secondaryColor: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Couleur invalide'),
  address: z.string().optional(),
  phone: z.string().optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

interface SettingsFormProps {
  tenant: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    address?: string;
    phone?: string;
    notification_sound_id?: string;
  };
}

export function SettingsForm({ tenant }: SettingsFormProps) {
  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.logo_url || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSoundId, setSelectedSoundId] = useState(tenant.notification_sound_id || 'classic-bell');
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: tenant.name,
      description: tenant.description || '',
      primaryColor: tenant.primary_color || '#000000',
      secondaryColor: tenant.secondary_color || '#FFFFFF',
      address: tenant.address || '',
      phone: tenant.phone || '',
    },
  });

  const watchedPrimaryColor = watch('primaryColor');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: 'Fichier trop volumineux',
          description: 'Le logo ne doit pas dépasser 2MB',
          variant: 'destructive',
        });
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: SettingsFormValues) => {
    setSaving(true);
    try {
      let finalLogoUrl = tenant.logo_url || '';

      // Upload logo if changed — via Supabase Storage directement
      if (logoFile) {
        setUploading(true);
        const supabase = createClient();
        const fileExt = logoFile.name.split('.').pop() || 'png';
        const fileName = `${tenant.slug}/logo-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, logoFile, { upsert: true });

        if (uploadError) throw new Error(`Erreur upload logo: ${uploadError.message}`);

        const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);
        finalLogoUrl = publicUrl;
        setUploading(false);
      }

      // Prepare form data for server action
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('description', data.description || '');
      formData.append('primaryColor', data.primaryColor);
      formData.append('secondaryColor', data.secondaryColor);
      formData.append('address', data.address || '');
      formData.append('phone', data.phone || '');
      if (finalLogoUrl) formData.append('logoUrl', finalLogoUrl);
      formData.append('notificationSoundId', selectedSoundId);

      const result = await updateTenantSettings(formData);

      if (result.success) {
        toast({
          title: 'Paramètres mis à jour',
          description: 'Les modifications ont été enregistrées avec succès.',
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de la sauvegarde.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Identité */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Store className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Identité du restaurant</h2>
              <p className="text-sm text-gray-500">Informations visibles par vos clients</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du restaurant</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description courte</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="Cuisine locale et authentique..."
                  className="resize-none h-24"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label>Logo</Label>
              <div className="flex items-center gap-6">
                <div className="relative w-32 h-32 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden group hover:border-gray-300 transition-colors">
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      fill
                      className="object-contain p-2"
                    />
                  ) : (
                    <Upload className="h-8 w-8 text-gray-300" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs font-medium">Modifier</p>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  <p>Format recommandé : PNG ou JPG</p>
                  <p>Taille max : 2MB</p>
                  <p>Ratio : Carré (1:1)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Palette className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Personnalisation</h2>
              <p className="text-sm text-gray-500">Couleurs de votre menu digital</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Couleur principale</Label>
                <div className="flex gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border border-gray-200 shadow-sm"
                    style={{ backgroundColor: watchedPrimaryColor }}
                  />
                  <Input id="primaryColor" {...register('primaryColor')} className="font-mono" />
                </div>
                <p className="text-xs text-gray-500">Utilisée pour les boutons et titres</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondaryColor">Couleur secondaire</Label>
                <div className="flex gap-3">
                  <Input
                    id="secondaryColor"
                    type="color"
                    className="w-10 h-10 p-1 rounded-lg cursor-pointer"
                    {...register('secondaryColor')}
                  />
                  <Input {...register('secondaryColor')} className="font-mono flex-1" />
                </div>
                <p className="text-xs text-gray-500">Utilisée pour le texte sur fond coloré</p>
              </div>
            </div>

            {/* Preview Card */}
            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50">
              <h3 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">
                Aperçu bouton
              </h3>
              <div className="flex items-center justify-center h-24 bg-white rounded-lg border border-gray-200">
                <button
                  type="button"
                  className="px-6 py-2.5 rounded-lg font-medium shadow-sm transition-transform active:scale-95"
                  style={{
                    backgroundColor: watchedPrimaryColor,
                    color: watch('secondaryColor'),
                  }}
                >
                  Commander (1200 F)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Sounds */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sons de notification</h2>
              <p className="text-sm text-gray-500">Son joué lors de la réception de commandes</p>
            </div>
          </div>

          <SoundSettings
            currentSoundId={selectedSoundId}
            onSoundChange={setSelectedSoundId}
            tenantId={tenant.id}
          />
        </div>

        {/* Contact */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-50 rounded-lg">
              <MapPin className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Coordonnées</h2>
              <p className="text-sm text-gray-500">Adresse et contact</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="address">Adresse complète</Label>
              <Input
                id="address"
                {...register('address')}
                placeholder="123 Rue de la République..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" {...register('phone')} placeholder="+235 66 77 88 99" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4 pt-4">
          <Button
            type="submit"
            disabled={saving || uploading}
            className="min-w-[150px] bg-gray-900 text-white hover:bg-gray-800"
          >
            {saving || uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Enregistrer les modifications
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

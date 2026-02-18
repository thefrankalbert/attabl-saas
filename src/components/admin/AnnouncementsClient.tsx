'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, Loader2, Trash2, Megaphone, Calendar, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AdminModal from '@/components/admin/AdminModal';
import { logger } from '@/lib/logger';
import type { Announcement } from '@/types/admin.types';

interface AnnouncementsClientProps {
  tenantId: string;
  initialAnnouncements: Announcement[];
}

export default function AnnouncementsClient({
  tenantId,
  initialAnnouncements,
}: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  const { toast } = useToast();
  const t = useTranslations('announcements');
  const tc = useTranslations('common');
  const locale = useLocale();
  const supabase = createClient();

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setIsActive(true);
  };

  const handleSave = async () => {
    if (!title || !startDate) {
      toast({ title: t('fieldsRequired'), variant: 'destructive' });
      return;
    }

    if (endDate && new Date(endDate) < new Date(startDate)) {
      toast({
        title: t('endDateBeforeStartDate') || 'End date must be after start date',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: newAnnouncement, error } = await supabase
        .from('announcements')
        .insert({
          tenant_id: tenantId,
          title,
          description: description || null,
          start_date: new Date(startDate).toISOString(),
          end_date: endDate ? new Date(endDate).toISOString() : null,
          is_active: isActive,
        })
        .select()
        .single();

      if (error) throw error;

      setAnnouncements((prev) => [newAnnouncement as Announcement, ...prev]);
      toast({ title: t('announcementCreated') });
      setIsModalOpen(false);
      resetForm();
    } catch (e: unknown) {
      logger.error('Failed to save announcement', e);
      toast({
        title: tc('error'),
        description: e instanceof Error ? e.message : tc('errorGeneric'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteConfirm'))) return;

    try {
      await supabase.from('announcements').delete().eq('id', id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      toast({ title: t('announcementDeletedConfirm') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const toggleActive = async (announcement: Announcement) => {
    try {
      const { data } = await supabase
        .from('announcements')
        .update({ is_active: !announcement.is_active })
        .eq('id', announcement.id)
        .select()
        .single();

      if (data) {
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === announcement.id ? (data as Announcement) : a)),
        );
        toast({
          title: !announcement.is_active ? t('announcementEnabled') : t('announcementDisabled'),
        });
      }
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-neutral-500">{t('subtitleClient')}</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          variant="lime"
          className="gap-2"
        >
          <Plus className="w-4 h-4" /> {t('newAnnouncement')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {announcements.map((ann) => (
          <div
            key={ann.id}
            className="group bg-white border border-neutral-100 rounded-xl p-5 transition-all flex flex-col h-full"
          >
            <div className="flex justify-between items-start mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${ann.is_active ? 'bg-blue-50 text-blue-600' : 'bg-neutral-100 text-neutral-400'}`}
              >
                <Megaphone className="w-5 h-5" />
              </div>
              <div
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${ann.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}
              >
                {ann.is_active ? t('statusActive') : t('statusInactive')}
              </div>
            </div>

            <h3 className="font-bold text-neutral-900 mb-2 line-clamp-1">{ann.title}</h3>
            {ann.description && (
              <p className="text-sm text-neutral-500 line-clamp-2 mb-4 flex-1">{ann.description}</p>
            )}

            <div className="mt-auto space-y-4">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Calendar className="w-3 h-3" />
                <span>
                  {t('fromDate', { date: new Date(ann.start_date).toLocaleDateString(locale) })}
                </span>
                {ann.end_date && (
                  <span>
                    {t('toDate', { date: new Date(ann.end_date).toLocaleDateString(locale) })}
                  </span>
                )}
              </div>

              <div className="flex gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => toggleActive(ann)}
                >
                  {ann.is_active ? (
                    <EyeOff className="w-3 h-3 mr-2" />
                  ) : (
                    <Eye className="w-3 h-3 mr-2" />
                  )}
                  {ann.is_active ? t('hide') : t('show')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(ann.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {announcements.length === 0 && (
          <div className="col-span-full py-12 text-center bg-neutral-50 border border-dashed border-neutral-200 rounded-xl">
            <Megaphone className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-neutral-900">{t('noAnnouncements')}</h3>
            <p className="text-xs text-neutral-500 mt-1">{t('noAnnouncementsDesc')}</p>
          </div>
        )}
      </div>

      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('newAnnouncement')}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('titleField')}</Label>
            <Input
              placeholder={t('titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('descriptionField')}</Label>
            <Textarea
              placeholder={t('descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('startDateRequired')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('endDateOptional')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="active-mode" />
            <Label htmlFor="active-mode">{t('enableImmediately')}</Label>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={loading} variant="lime">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('publish')}
            </Button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

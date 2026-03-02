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
import { DatePickerField } from '@/components/ui/date-picker-field';
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
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
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
    setEditingAnnouncement(null);
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
        title: t('endDateBeforeStartDate'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title,
        description: description || null,
        start_date: new Date(startDate).toISOString(),
        end_date: endDate ? new Date(endDate).toISOString() : null,
        is_active: isActive,
      };

      if (editingAnnouncement) {
        const { data, error } = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', editingAnnouncement.id)
          .select()
          .single();

        if (error) throw error;
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === editingAnnouncement.id ? (data as Announcement) : a)),
        );
        toast({ title: t('announcementUpdated') });
      } else {
        const { data: newAnnouncement, error } = await supabase
          .from('announcements')
          .insert({ tenant_id: tenantId, ...payload })
          .select()
          .single();

        if (error) throw error;
        setAnnouncements((prev) => [newAnnouncement as Announcement, ...prev]);
        toast({ title: t('announcementCreated') });
      }

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

  const openEdit = (ann: Announcement) => {
    setEditingAnnouncement(ann);
    setTitle(ann.title);
    setDescription(ann.description || '');
    setStartDate(ann.start_date ? new Date(ann.start_date).toISOString().split('T')[0] : '');
    setEndDate(ann.end_date ? new Date(ann.end_date).toISOString().split('T')[0] : '');
    setIsActive(ann.is_active);
    setIsModalOpen(true);
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
          <h1 className="text-2xl font-bold tracking-tight text-app-text">{t('title')}</h1>
          <p className="text-sm text-app-text-secondary">{t('subtitleClient')}</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          variant="default"
          className="gap-2"
        >
          <Plus className="w-4 h-4" /> {t('newAnnouncement')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {announcements.map((ann) => (
          <div
            key={ann.id}
            className="group bg-app-card border border-app-border rounded-xl p-5 transition-all flex flex-col h-full cursor-pointer hover:border-app-border-hover"
            onClick={() => openEdit(ann)}
          >
            <div className="flex justify-between items-start mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${ann.is_active ? 'bg-blue-500/10 text-blue-500' : 'bg-app-bg text-app-text-muted'}`}
              >
                <Megaphone className="w-5 h-5" />
              </div>
              <div
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${ann.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-app-bg text-app-text-secondary'}`}
              >
                {ann.is_active ? t('statusActive') : t('statusInactive')}
              </div>
            </div>

            <h3 className="font-bold text-app-text mb-2">{ann.title}</h3>
            {ann.description && (
              <p className="text-sm text-app-text-secondary line-clamp-3 mb-4 flex-1">
                {ann.description}
              </p>
            )}

            <div className="mt-auto space-y-4">
              <div className="flex items-center gap-2 text-xs text-app-text-muted">
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

              <div className="flex gap-2 border-t pt-4" onClick={(e) => e.stopPropagation()}>
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
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => handleDelete(ann.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {announcements.length === 0 && (
          <div className="col-span-full py-12 text-center bg-app-bg border border-dashed border-app-border rounded-xl">
            <Megaphone className="w-10 h-10 text-app-text-muted mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-app-text">{t('noAnnouncements')}</h3>
            <p className="text-xs text-app-text-secondary mt-1">{t('noAnnouncementsDesc')}</p>
          </div>
        )}
      </div>

      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAnnouncement ? t('editAnnouncement') : t('newAnnouncement')}
        size="lg"
      >
        <div className="space-y-4 pt-4">
          <div>
            <Label className="mb-1.5 block text-app-text">{t('titleField')}</Label>
            <Input
              placeholder={t('titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg focus-visible:ring-accent/30"
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-app-text">{t('descriptionField')}</Label>
            <Textarea
              placeholder={t('descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] rounded-lg focus-visible:ring-accent/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-app-text">{t('startDateRequired')}</Label>
              <DatePickerField
                value={startDate}
                onChange={setStartDate}
                placeholder={t('startDateRequired')}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-app-text">{t('endDateOptional')}</Label>
              <DatePickerField
                value={endDate}
                onChange={setEndDate}
                placeholder={t('endDateOptional')}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="active-mode" />
            <Label htmlFor="active-mode" className="text-app-text">
              {t('enableImmediately')}
            </Label>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={loading} variant="default">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingAnnouncement ? tc('save') : t('publish')}
            </Button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

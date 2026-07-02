'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, Loader2, Trash2, Megaphone, Calendar, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AdminModal from '@/components/admin/AdminModal';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { logger } from '@/lib/logger';
import type { Announcement } from '@/types/admin.types';
import {
  actionCreateAnnouncement,
  actionUpdateAnnouncement,
  actionDeleteAnnouncement,
  actionToggleAnnouncementActive,
} from '@/app/actions/announcements';
import { revalidateMenuCache } from '@/lib/revalidate';

interface AnnouncementsClientProps {
  tenantId: string;
  tenantSlug: string;
  initialAnnouncements: Announcement[];
}

export default function AnnouncementsClient({
  tenantId,
  tenantSlug,
  initialAnnouncements,
}: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [announcementPendingDelete, setAnnouncementPendingDelete] = useState<string | null>(null);
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
        const result = await actionUpdateAnnouncement(tenantId, editingAnnouncement.id, payload);
        if (result.error) {
          logger.error('Failed to update announcement', result.error);
          toast({
            title: tc('error'),
            description: result.error,
            variant: 'destructive',
          });
          return;
        }
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === editingAnnouncement.id ? (result.data as Announcement) : a)),
        );
        toast({ title: t('announcementUpdated') });
      } else {
        const result = await actionCreateAnnouncement(tenantId, payload);
        if (result.error) {
          logger.error('Failed to create announcement', result.error);
          toast({
            title: tc('error'),
            description: result.error,
            variant: 'destructive',
          });
          return;
        }
        setAnnouncements((prev) => [result.data as Announcement, ...prev]);
        toast({ title: t('announcementCreated') });
      }

      revalidateMenuCache(tenantSlug);
      setIsModalOpen(false);
      resetForm();
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

  const performDelete = async (id: string) => {
    const result = await actionDeleteAnnouncement(tenantId, id);
    if (result.error) {
      logger.error('Failed to delete announcement', result.error, { announcementId: id, tenantId });
      toast({
        title: tc('error'),
        description: result.error,
        variant: 'destructive',
      });
      return;
    }
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    if (editingAnnouncement?.id === id) {
      setIsModalOpen(false);
      resetForm();
    }
    toast({ title: t('announcementDeletedConfirm') });
    revalidateMenuCache(tenantSlug);
  };

  const requestDelete = (id: string) => {
    setAnnouncementPendingDelete(id);
  };

  const toggleActive = async (announcement: Announcement) => {
    const result = await actionToggleAnnouncementActive(
      tenantId,
      announcement.id,
      !announcement.is_active,
    );
    if (result.error) {
      toast({ title: tc('error'), variant: 'destructive' });
      return;
    }
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === announcement.id ? (result.data as Announcement) : a)),
    );
    revalidateMenuCache(tenantSlug);
    toast({
      title: !announcement.is_active ? t('announcementEnabled') : t('announcementDisabled'),
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 space-y-4">
        <AdminPageHeader
          title={t('title')}
          count={announcements.length}
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
              <Plus className="w-3.5 h-3.5" /> {t('newAnnouncement')}
            </Button>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-2 @sm:mt-4">
        {announcements.length > 0 ? (
          <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
            {announcements.map((ann) => (
              <div
                key={ann.id}
                className="flex items-center gap-4 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group cursor-pointer"
                onClick={() => openEdit(ann)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-app-text text-sm break-words">{ann.title}</p>
                  {ann.description && (
                    <p className="text-xs text-app-text-muted break-words mt-0.5">
                      {ann.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-app-text-muted shrink-0">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(ann.start_date).toLocaleDateString(locale)}</span>
                  {ann.end_date && (
                    <span>- {new Date(ann.end_date).toLocaleDateString(locale)}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0',
                    ann.is_active
                      ? 'bg-status-success-bg text-status-success'
                      : 'bg-app-bg text-app-text-secondary',
                  )}
                >
                  {ann.is_active ? t('statusActive') : t('statusInactive')}
                </span>
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title={ann.is_active ? t('hide') : t('show')}
                    onClick={() => toggleActive(ann)}
                  >
                    {ann.is_active ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-status-error hover:text-status-error hover:bg-status-error-bg"
                    title={t('deleteAction')}
                    aria-label={t('deleteAction')}
                    onClick={() => requestDelete(ann.id)}
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
              <Megaphone className="w-8 h-8 text-app-text-muted" />
            </div>
            <h3 className="text-lg font-bold text-app-text">{t('noAnnouncements')}</h3>
            <p className="text-sm text-app-text-secondary mt-2">{t('noAnnouncementsDesc')}</p>
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

          <div
            className={cn(
              'pt-4 flex gap-2',
              editingAnnouncement ? 'justify-between' : 'justify-end',
            )}
          >
            {editingAnnouncement && (
              <Button
                type="button"
                variant="ghost"
                className="text-status-error hover:text-status-error hover:bg-status-error-bg gap-1.5"
                onClick={() => requestDelete(editingAnnouncement.id)}
              >
                <Trash2 className="w-4 h-4" />
                {t('deleteAction')}
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleSave} disabled={loading} variant="default">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingAnnouncement ? tc('save') : t('publish')}
              </Button>
            </div>
          </div>
        </div>
      </AdminModal>

      <AlertDialog
        open={announcementPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setAnnouncementPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteAnnouncement')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (announcementPendingDelete) {
                  void performDelete(announcementPendingDelete);
                  setAnnouncementPendingDelete(null);
                }
              }}
              className="bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90"
            >
              {t('deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

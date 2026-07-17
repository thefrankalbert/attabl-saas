'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Pencil, Power, RotateCcw, Lock, ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  actionCreateVenue,
  actionRenameVenue,
  actionDeactivateVenue,
  actionReactivateVenue,
} from '@/app/actions/venues';

export type EspaceRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  tableCount: number;
};

interface EspacesManagerProps {
  espaces: EspaceRow[];
  /** Nombre max autorise par le plan (-1 = illimite). */
  maxEspaces: number;
  /** Nombre d espaces actifs (compte pour le paywall). */
  activeCount: number;
  /** URL de l abonnement pour l upsell. */
  subscriptionUrl: string;
  /** URL de retour vers la racine des parametres. */
  backUrl: string;
}

export function EspacesManager({
  espaces,
  maxEspaces,
  activeCount,
  subscriptionUrl,
  backUrl,
}: EspacesManagerProps) {
  const t = useTranslations('espaces');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const atLimit = maxEspaces !== -1 && activeCount >= maxEspaces;
  const activeEspaces = espaces.filter((e) => e.is_active);
  // "Principal" = le plus ancien espace ACTIF (aucune colonne is_default en base).
  const activeSorted = [...activeEspaces].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const principalId = activeSorted[0]?.id;

  function handleAdd() {
    startTransition(async () => {
      const res = await actionCreateVenue({ name: addName });
      if (res.success) {
        toast.success(t('toastCreated'));
        setAddOpen(false);
        setAddName('');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRename() {
    if (!renameId) return;
    startTransition(async () => {
      const res = await actionRenameVenue({ id: renameId, name: renameName });
      if (res.success) {
        toast.success(t('toastRenamed'));
        setRenameId(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDeactivate(id: string) {
    if (activeEspaces.length < 2) {
      toast.error(t('toastLastSpace'));
      return;
    }
    startTransition(async () => {
      const res = await actionDeactivateVenue({ id });
      if (res.success) {
        toast.success(t('toastDeactivated'));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      const res = await actionReactivateVenue({ id });
      if (res.success) {
        toast.success(t('toastReactivated'));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="h-full flex flex-col gap-4 sm:gap-6">
      <Link
        href={backUrl}
        className="inline-flex items-center gap-1 text-sm text-app-text-secondary hover:text-app-text min-h-[44px]"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('backToSettings')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-app-text">{t('title')}</h2>
          <p className="mt-1 text-sm text-app-text-secondary">{t('subtitle')}</p>
        </div>
        {atLimit ? (
          <div className="flex flex-col items-end gap-1">
            <Button disabled className="min-h-[44px]">
              <Plus className="mr-2" />
              {t('add')}
            </Button>
            <Link href={subscriptionUrl} className="text-xs text-status-info hover:underline">
              {t('limitReached')}
            </Link>
          </div>
        ) : (
          <Button className="min-h-[44px]" onClick={() => setAddOpen(true)} disabled={isPending}>
            <Plus className="mr-2" />
            {t('add')}
          </Button>
        )}
      </div>

      {espaces.length === 0 ? (
        <Card className="p-6 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-app-text-secondary">{t('empty')}</p>
        </Card>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 content-start">
          {espaces.map((e) => (
            <Card key={e.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-app-text truncate">{e.name}</p>
                  <p className="text-xs text-app-text-secondary">
                    {t('tablesCount', { count: e.tableCount })}
                    {!e.is_active ? ` - ${t('inactive')}` : ''}
                  </p>
                </div>
                {e.is_active && e.id === principalId && (
                  <span className="shrink-0 rounded-full bg-status-info-bg px-2 py-0.5 text-xs text-status-info">
                    {t('principal')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => {
                    setRenameId(e.id);
                    setRenameName(e.name);
                  }}
                  disabled={isPending}
                >
                  <Pencil className="mr-2" />
                  {t('rename')}
                </Button>
                {e.is_active ? (
                  activeEspaces.length < 2 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-[44px]"
                      disabled
                    >
                      <Lock className="mr-2" />
                      {t('required')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => handleDeactivate(e.id)}
                      disabled={isPending}
                    >
                      <Power className="mr-2" />
                      {t('deactivate')}
                    </Button>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    onClick={() => handleReactivate(e.id)}
                    disabled={isPending || atLimit}
                    title={atLimit ? t('reactivateLimit') : undefined}
                  >
                    <RotateCcw className="mr-2" />
                    {t('reactivate')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Ajouter */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('newSpace')}</DialogTitle>
            <DialogDescription>{t('newSpaceHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="espace-name">{t('nameLabel')}</Label>
            <Input
              id="espace-name"
              value={addName}
              onChange={(ev) => setAddName(ev.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={60}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setAddOpen(false)}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              className="min-h-[44px]"
              onClick={handleAdd}
              disabled={isPending || addName.trim().length === 0}
            >
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Renommer */}
      <Dialog open={renameId !== null} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('renameSpace')}</DialogTitle>
            <DialogDescription>{t('renameHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="espace-rename">{t('nameLabel')}</Label>
            <Input
              id="espace-rename"
              value={renameName}
              onChange={(ev) => setRenameName(ev.target.value)}
              maxLength={60}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setRenameId(null)}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              className="min-h-[44px]"
              onClick={handleRename}
              disabled={isPending || renameName.trim().length === 0}
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

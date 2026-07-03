'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  actionListHouseAccounts,
  actionCreateHouseAccount,
  actionAttachOrderToHouseAccount,
} from '@/app/actions/house-accounts';
import type { HouseAccountBalance } from '@/services/order-annotation.service';

interface AttachToHouseAccountProps {
  tenantId: string;
  orderId: string;
  /** Called after a successful attach so the parent can refresh. */
  onAttached: () => void;
}

/**
 * Put an order "sur l'ardoise": pick an open house account (or create one inline)
 * and attach the order to it. Only open accounts are selectable.
 */
export default function AttachToHouseAccount({
  tenantId,
  orderId,
  onAttached,
}: AttachToHouseAccountProps) {
  const t = useTranslations('houseAccount');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const { data: accounts = [], refetch } = useQuery<HouseAccountBalance[]>({
    queryKey: ['houseAccounts', tenantId],
    queryFn: async () => {
      const res = await actionListHouseAccounts(tenantId);
      if (res.error) throw new Error(res.error);
      return res.accounts ?? [];
    },
  });

  const openAccounts = accounts.filter((a) => a.status === 'open');

  const handleAttach = async () => {
    if (!selected) return;
    setLoading(true);
    const res = await actionAttachOrderToHouseAccount(tenantId, orderId, selected);
    setLoading(false);
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('attach') });
    setSelected('');
    onAttached();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    const res = await actionCreateHouseAccount(
      tenantId,
      newName.trim(),
      newDescription.trim() || undefined,
    );
    setLoading(false);
    if (res.error) {
      toast({ title: t('error'), description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('created') });
    setNewName('');
    setNewDescription('');
    setCreateOpen(false);
    await refetch();
    if (res.id) setSelected(res.id);
  };

  return (
    <div className="rounded-xl border border-app-border p-3 space-y-2">
      <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
        {t('title')}
      </p>

      <div className="flex gap-1.5">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={t('attach')} />
          </SelectTrigger>
          <SelectContent>
            {openAccounts.map((a) => (
              <SelectItem key={a.accountId} value={a.accountId}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={handleAttach}
          disabled={loading || !selected}
          className="h-9 text-xs shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('attach')}
        </Button>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setCreateOpen(true)}
        className="h-9 w-full text-xs"
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        {t('new')}
      </Button>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ha-name" className="text-xs">
                {t('name')}
              </Label>
              <Input
                id="ha-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={120}
                placeholder={t('namePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ha-description" className="text-xs">
                {t('description')}
              </Label>
              <Textarea
                id="ha-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={loading}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={loading || !newName.trim()}>
              {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

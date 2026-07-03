'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { actionAddOrderNote, actionListOrderNotes } from '@/app/actions/orders';
import type { OrderNote } from '@/services/order-annotation.service';

interface OrderNotesSectionProps {
  tenantId: string;
  orderId: string;
}

/**
 * Manager notes on an order: an append-only trail (the DB forbids UPDATE/DELETE).
 * Any staff member may add a note; each is stamped with who left it and when.
 */
export default function OrderNotesSection({ tenantId, orderId }: OrderNotesSectionProps) {
  const t = useTranslations('orderNote');
  const locale = useLocale();
  const { toast } = useToast();

  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    data: notes = [],
    refetch,
    isError,
  } = useQuery<OrderNote[]>({
    queryKey: ['orderNotes', tenantId, orderId],
    queryFn: async () => {
      const res = await actionListOrderNotes(tenantId, orderId);
      if (res.error) throw new Error(res.error);
      return res.notes ?? [];
    },
  });

  const handleAdd = async () => {
    if (!note.trim()) return;
    setLoading(true);
    const res = await actionAddOrderNote(tenantId, orderId, note.trim());
    setLoading(false);
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('added') });
    setNote('');
    await refetch();
  };

  return (
    <div className="rounded-xl border border-app-border p-3 space-y-2">
      <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
        {t('title')}
      </p>

      {isError ? null : notes.length === 0 ? (
        <p className="text-xs text-app-text-muted">{t('empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="text-xs text-app-text">
              <p className="whitespace-pre-wrap break-words">{n.note}</p>
              <p className="text-[10px] text-app-text-muted mt-0.5">
                {n.authorName ? t('by', { name: n.authorName }) : ''}
                {n.authorName ? ' - ' : ''}
                {new Date(n.createdAt).toLocaleString(locale)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className="text-sm"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={loading || !note.trim()}
          className="h-9 w-full text-xs"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5 mr-1.5" />
          )}
          {t('add')}
        </Button>
      </div>
    </div>
  );
}

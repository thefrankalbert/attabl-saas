'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { useToast } from '@/components/ui/use-toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrencyMinor } from '@/lib/utils/money';
import {
  actionListHouseAccounts,
  actionCreateHouseAccount,
  actionSettleHouseAccount,
} from '@/app/actions/house-accounts';
import type { HouseAccountBalance } from '@/services/order-annotation.service';
import type { CurrencyCode } from '@/types/admin.types';

interface HouseAccountsClientProps {
  tenantId: string;
  currency?: CurrencyCode;
}

const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;

/**
 * House accounts (ardoises) dashboard: every running tab with its outstanding
 * balance. Managers can open a new account and settle one. Outstanding =
 * due - net ledger over the account's non-paid/non-comp/non-cancelled orders.
 */
export default function HouseAccountsClient({
  tenantId,
  currency = 'XAF',
}: HouseAccountsClientProps) {
  const t = useTranslations('houseAccount');
  const tc = useTranslations('common');
  const { toast } = useToast();
  const { role } = usePermissions();
  const canManage = (MANAGER_ROLES as readonly string[]).includes(role);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [settleTarget, setSettleTarget] = useState<HouseAccountBalance | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    data: accounts = [],
    refetch,
    isError,
  } = useQuery<HouseAccountBalance[]>({
    queryKey: ['houseAccounts', tenantId],
    queryFn: async () => {
      const res = await actionListHouseAccounts(tenantId);
      if (res.error) throw new Error(res.error);
      return res.accounts ?? [];
    },
  });

  const fmt = (amount: number) => formatCurrencyMinor(amount, currency);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await actionCreateHouseAccount(
      tenantId,
      name.trim(),
      description.trim() || undefined,
    );
    setLoading(false);
    if (res.error) {
      toast({ title: t('error'), description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('created') });
    setName('');
    setDescription('');
    setCreateOpen(false);
    await refetch();
  };

  const handleSettle = async () => {
    if (!settleTarget) return;
    setLoading(true);
    const res = await actionSettleHouseAccount(tenantId, settleTarget.accountId);
    setLoading(false);
    if (res.error) {
      toast({ title: t('error'), description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('settled') });
    setSettleTarget(null);
    await refetch();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0">
        <AdminPageHeader
          title={t('title')}
          actions={
            canManage ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                {t('new')}
              </Button>
            ) : undefined
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isError || accounts.length === 0 ? (
          <p className="text-sm text-app-text-muted py-8 text-center">{t('empty')}</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('name')}</TableHead>
                    <TableHead className="text-right">{t('openOrders')}</TableHead>
                    <TableHead className="text-right">{t('outstanding')}</TableHead>
                    <TableHead />
                    {canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.accountId}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.openOrders}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono">
                        {fmt(a.outstanding)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={a.status}
                          openLabel={t('statusOpen')}
                          settledLabel={t('statusSettled')}
                        />
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {a.status === 'open' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSettleTarget(a)}
                              className="text-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                              {t('settle')}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2 p-1">
              {accounts.map((a) => (
                <Card key={a.accountId}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-app-text">{a.name}</span>
                      <StatusBadge
                        status={a.status}
                        openLabel={t('statusOpen')}
                        settledLabel={t('statusSettled')}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-app-text-muted">
                      <span>
                        {t('openOrders')}: {a.openOrders}
                      </span>
                      <span className="tabular-nums font-mono text-app-text">
                        {fmt(a.outstanding)}
                      </span>
                    </div>
                    {canManage && a.status === 'open' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettleTarget(a)}
                        className="w-full text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        {t('settle')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ha-list-name" className="text-xs">
                {t('name')}
              </Label>
              <Input
                id="ha-list-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder={t('namePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ha-list-desc" className="text-xs">
                {t('description')}
              </Label>
              <Textarea
                id="ha-list-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
            <Button onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle confirm */}
      <AlertDialog open={!!settleTarget} onOpenChange={(o) => !o && setSettleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settleConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSettle} disabled={loading}>
              {t('settle')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({
  status,
  openLabel,
  settledLabel,
}: {
  status: 'open' | 'settled';
  openLabel: string;
  settledLabel: string;
}) {
  return status === 'settled' ? (
    <Badge variant="outline" className="text-[10px]">
      {settledLabel}
    </Badge>
  ) : (
    <Badge className="bg-status-warning-bg text-status-warning border-0 text-[10px]">
      {openLabel}
    </Badge>
  );
}

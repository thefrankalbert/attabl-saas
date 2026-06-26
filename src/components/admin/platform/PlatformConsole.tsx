'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmActionDialog, type ConfirmActionState } from './ConfirmActionDialog';
import type { PlatformTenantRow, PlatformUserRow } from '@/types/platform-admin.types';
import {
  actionSuspendTenant,
  actionUnsuspendTenant,
  actionSoftDeleteTenant,
  actionRestoreTenant,
  actionBanAdminUser,
  actionUnbanAdminUser,
  actionSoftDeleteAdminUser,
  actionRestoreAdminUser,
  actionImpersonateTenant,
} from '@/app/actions/platform-admin';

interface PlatformConsoleProps {
  tenants: PlatformTenantRow[];
  users: PlatformUserRow[];
}

type ActionResult = { success?: boolean; error?: string };

export function PlatformConsole({ tenants, users }: PlatformConsoleProps) {
  const t = useTranslations('admin.platform');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<'active' | 'trash'>('active');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmActionState | null>(null);

  const usersByTenant = useMemo(() => {
    const map = new Map<string, PlatformUserRow[]>();
    for (const u of users) {
      const list = map.get(u.tenant_id) ?? [];
      list.push(u);
      map.set(u.tenant_id, list);
    }
    return map;
  }, [users]);

  const liveTenants = useMemo(() => tenants.filter((x) => !x.deleted_at), [tenants]);
  const deletedTenants = useMemo(() => tenants.filter((x) => x.deleted_at), [tenants]);

  const visible = useMemo(() => {
    const base = tab === 'active' ? liveTenants : deletedTenants;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((x) => x.name.toLowerCase().includes(q) || x.slug.toLowerCase().includes(q));
  }, [tab, liveTenants, deletedTenants, query]);

  /** Run a server action, surface the outcome, refresh server data on success. */
  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t('done'));
        setConfirm(null);
        router.refresh();
      }
    });
  }

  function impersonate(tenantId: string) {
    startTransition(async () => {
      const res = await actionImpersonateTenant(tenantId);
      if (res.error || !res.slug) {
        toast.error(res.error ?? t('done'));
        return;
      }
      window.open(`/sites/${res.slug}`, '_blank', 'noopener,noreferrer');
    });
  }

  function statusBadge(tn: PlatformTenantRow) {
    if (tn.deleted_at) return <Badge variant="destructive">{t('statusDeleted')}</Badge>;
    if (!tn.is_active) return <Badge variant="warning">{t('statusSuspended')}</Badge>;
    return <Badge variant="success">{t('statusActive')}</Badge>;
  }

  function userStatusBadge(u: PlatformUserRow) {
    if (u.deleted_at) return <Badge variant="destructive">{t('userDeleted')}</Badge>;
    if (u.banned_at || !u.is_active) return <Badge variant="warning">{t('userBanned')}</Badge>;
    return <Badge variant="success">{t('userActive')}</Badge>;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app-bg text-app-text">
      <header className="flex flex-col gap-3 border-b border-app-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold sm:text-xl">{t('title')}</h1>
          <p className="text-sm text-app-text-muted">{t('subtitle')}</p>
        </div>
        <Link
          href="/admin/tenants"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-app-border px-4 text-sm text-app-text-secondary transition-colors hover:bg-app-hover"
        >
          {t('back')}
        </Link>
      </header>

      <main id="main-content" className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'trash')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList>
                <TabsTrigger value="active">{t('tabActive')}</TabsTrigger>
                <TabsTrigger value="trash">
                  {t('tabTrash')}
                  {deletedTenants.length > 0 ? ` (${deletedTenants.length})` : ''}
                </TabsTrigger>
              </TabsList>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="sm:max-w-xs"
              />
            </div>

            <TabsContent value="active" className="mt-4">
              {visible.length === 0 ? (
                <p className="py-10 text-center text-sm text-app-text-muted">{t('noResults')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {visible.map((tn) => {
                    const tenantUsers = usersByTenant.get(tn.id) ?? [];
                    const isOpen = expanded === tn.id;
                    return (
                      <li
                        key={tn.id}
                        className="rounded-xl border border-app-border bg-app-elevated p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{tn.name}</span>
                              {statusBadge(tn)}
                            </div>
                            <span className="text-xs text-app-text-muted">
                              {tn.slug} - {tn.subscription_plan ?? '-'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-[44px]"
                              disabled={isPending}
                              onClick={() => impersonate(tn.id)}
                            >
                              {t('actionImpersonate')}
                            </Button>
                            {tn.is_active ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-[44px]"
                                disabled={isPending}
                                onClick={() =>
                                  setConfirm({
                                    title: t('confirmSuspendTitle'),
                                    description: t('confirmSuspendDesc', { name: tn.name }),
                                    confirmLabel: t('actionSuspend'),
                                    withReason: true,
                                    onConfirm: (reason) =>
                                      run(() => actionSuspendTenant(tn.id, reason)),
                                  })
                                }
                              >
                                {t('actionSuspend')}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-[44px]"
                                disabled={isPending}
                                onClick={() => run(() => actionUnsuspendTenant(tn.id))}
                              >
                                {t('actionUnsuspend')}
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              className="min-h-[44px]"
                              disabled={isPending}
                              onClick={() =>
                                setConfirm({
                                  title: t('confirmDeleteTitle'),
                                  description: t('confirmDeleteDesc', { name: tn.name }),
                                  confirmLabel: t('actionDelete'),
                                  destructive: true,
                                  withReason: true,
                                  requireText: tn.name,
                                  onConfirm: (reason) =>
                                    run(() => actionSoftDeleteTenant(tn.id, reason)),
                                })
                              }
                            >
                              {t('actionDelete')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-[44px]"
                              onClick={() => setExpanded(isOpen ? null : tn.id)}
                            >
                              {t('manageUsers')} ({tenantUsers.length})
                            </Button>
                          </div>
                        </div>

                        {isOpen && (
                          <ul className="mt-3 flex flex-col gap-2 border-t border-app-border pt-3">
                            {tenantUsers.length === 0 ? (
                              <li className="text-xs text-app-text-muted">{t('noUsers')}</li>
                            ) : (
                              tenantUsers.map((u) => (
                                <li
                                  key={u.id}
                                  className="flex flex-col gap-2 rounded-lg bg-app-bg p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm">{u.email}</span>
                                      {userStatusBadge(u)}
                                    </div>
                                    <span className="text-xs text-app-text-muted">{u.role}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {u.banned_at || !u.is_active ? (
                                      !u.deleted_at && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="min-h-[44px]"
                                          disabled={isPending}
                                          onClick={() => run(() => actionUnbanAdminUser(u.id))}
                                        >
                                          {t('unbanUser')}
                                        </Button>
                                      )
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-h-[44px]"
                                        disabled={isPending}
                                        onClick={() =>
                                          setConfirm({
                                            title: t('confirmBanTitle'),
                                            description: t('confirmBanDesc', { email: u.email }),
                                            confirmLabel: t('banUser'),
                                            withReason: true,
                                            onConfirm: (reason) =>
                                              run(() => actionBanAdminUser(u.id, reason)),
                                          })
                                        }
                                      >
                                        {t('banUser')}
                                      </Button>
                                    )}
                                    {u.deleted_at ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-h-[44px]"
                                        disabled={isPending}
                                        onClick={() => run(() => actionRestoreAdminUser(u.id))}
                                      >
                                        {t('restoreUser')}
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="min-h-[44px]"
                                        disabled={isPending}
                                        onClick={() =>
                                          setConfirm({
                                            title: t('confirmDeleteUserTitle'),
                                            description: t('confirmDeleteUserDesc', {
                                              email: u.email,
                                            }),
                                            confirmLabel: t('deleteUser'),
                                            destructive: true,
                                            withReason: true,
                                            onConfirm: (reason) =>
                                              run(() => actionSoftDeleteAdminUser(u.id, reason)),
                                          })
                                        }
                                      >
                                        {t('deleteUser')}
                                      </Button>
                                    )}
                                  </div>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="trash" className="mt-4">
              {visible.length === 0 ? (
                <p className="py-10 text-center text-sm text-app-text-muted">{t('emptyTrash')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {visible.map((tn) => (
                    <li
                      key={tn.id}
                      className="flex flex-col gap-3 rounded-xl border border-app-border bg-app-elevated p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tn.name}</span>
                          {statusBadge(tn)}
                        </div>
                        <span className="text-xs text-app-text-muted">{tn.slug}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        disabled={isPending}
                        onClick={() => run(() => actionRestoreTenant(tn.id))}
                      >
                        {t('actionRestore')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <ConfirmActionDialog state={confirm} onClose={() => setConfirm(null)} pending={isPending} />
    </div>
  );
}

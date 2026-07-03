'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { createCouponService } from '@/services/coupon.service';
import { actionDeleteCoupon, actionToggleCouponActive } from '@/app/actions/coupons';
import { logger } from '@/lib/logger';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
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
import { Plus, Trash2, Tag, ToggleLeft, ToggleRight, ListFilter } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import CouponForm from '@/components/admin/CouponForm';
import type { Coupon, CurrencyCode } from '@/types/admin.types';

interface CouponsClientProps {
  tenantId: string;
  initialCoupons: Coupon[];
  currency: CurrencyCode;
}

export default function CouponsClient({ tenantId, initialCoupons, currency }: CouponsClientProps) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [couponPendingDelete, setCouponPendingDelete] = useState<string | null>(null);
  const [, setLoading] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('coupons');
  const tc = useTranslations('common');
  const locale = useLocale();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const service = createCouponService(createClient());
      setCoupons(await service.listCoupons(tenantId));
    } catch (err) {
      logger.error('Failed to list coupons', err);
      toast({ title: t('loadError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast, t]);

  const performDelete = async (couponId: string) => {
    const result = await actionDeleteCoupon(tenantId, couponId);
    if (result.error) {
      logger.error('Failed to delete coupon', result.error);
      toast({ title: t('deleteError'), variant: 'destructive' });
      return;
    }
    toast({ title: t('couponDeleted') });
    refetch();
  };

  const toggleActive = async (coupon: Coupon) => {
    const result = await actionToggleCouponActive(tenantId, coupon.id, !coupon.is_active);
    if (result.error) {
      logger.error('Failed to toggle coupon', result.error);
      toast({ title: t('updateError'), variant: 'destructive' });
      return;
    }
    toast({ title: coupon.is_active ? t('couponDeactivated') : t('couponActivated') });
    refetch();
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setShowForm(true);
  };

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.discount_type === 'percentage') {
      return `${coupon.discount_value}%`;
    }
    return formatCurrency(coupon.discount_value, currency);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-4">
        <AdminPageHeader
          title={t('title')}
          actions={
            <Button
              onClick={() => {
                setEditingCoupon(null);
                setShowForm(true);
              }}
              variant="default"
              className="gap-2 shrink-0"
            >
              <Plus className="h-4 w-4" />
              {t('newCoupon')}
            </Button>
          }
        />
      </div>

      {/* Coupons List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
        {coupons.length > 0 ? (
          <div className="grid gap-3">
            {/* Table Header (desktop) */}
            <div className="hidden lg:grid lg:grid-cols-[1fr_120px_120px_120px_100px_80px] gap-4 px-4 py-2 text-xs font-bold text-app-text-muted uppercase tracking-widest">
              <span>{t('codeField')}</span>
              <span>{t('type')}</span>
              <span>{t('valueColumn')}</span>
              <span>{t('usagesColumn')}</span>
              <span>{t('statusColumn')}</span>
              <span className="text-right">{t('actionsColumn')}</span>
            </div>

            {coupons.map((coupon) => (
              <div
                key={coupon.id}
                className="bg-app-card rounded-xl border border-app-border p-4 cursor-pointer hover:border-app-border-hover"
                onClick={() => openEdit(coupon)}
              >
                <div className="lg:grid lg:grid-cols-[1fr_120px_120px_120px_100px_80px] lg:gap-4 lg:items-center space-y-3 lg:space-y-0">
                  {/* Code */}
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-app-text-muted flex-shrink-0" />
                    <span className="font-bold font-mono text-sm tracking-wider">
                      {coupon.code}
                    </span>
                  </div>

                  {/* Type */}
                  <div>
                    <span className="inline-flex items-center border border-[var(--border)] px-2 py-0.5 rounded-[0.625rem] text-xs font-medium text-[var(--muted-foreground)]">
                      {coupon.discount_type === 'percentage' ? '%' : t('fixedLabel')}
                    </span>
                  </div>

                  {/* Value */}
                  <div className="text-sm font-semibold text-app-text">
                    {formatDiscount(coupon)}
                  </div>

                  {/* Usage */}
                  <div className="text-sm text-app-text-secondary">
                    {coupon.current_uses}
                    {coupon.max_uses ? ` / ${coupon.max_uses}` : ' / ∞'}
                  </div>

                  {/* Status Toggle */}
                  <Button
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(coupon);
                    }}
                    className="flex items-center gap-1.5 group h-auto p-0"
                    title={coupon.is_active ? t('deactivate') : t('activate')}
                  >
                    {coupon.is_active ? (
                      <>
                        <ToggleRight className="h-5 w-5 text-[var(--success)]" />
                        <span className="text-xs font-medium text-[var(--success)] border border-[var(--border)] px-2 py-0.5 rounded-[0.625rem]">
                          {t('active')}
                        </span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="h-5 w-5 text-app-text-muted" />
                        <span className="text-xs font-medium text-app-text-secondary bg-app-bg px-2 py-0.5 rounded-[0.625rem]">
                          {t('inactive')}
                        </span>
                      </>
                    )}
                  </Button>

                  {/* Delete */}
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                      onClick={() => setCouponPendingDelete(coupon.id)}
                      className="text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--accent)]"
                      title={t('deleteAction')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Extra info row */}
                {(coupon.valid_from || coupon.valid_until || coupon.min_order_amount) && (
                  <div className="mt-3 pt-3 border-t border-app-border flex flex-wrap gap-3 text-xs text-app-text-secondary">
                    {coupon.valid_from && (
                      <span>
                        {t('startLabel')} {new Date(coupon.valid_from).toLocaleDateString(locale)}
                      </span>
                    )}
                    {coupon.valid_until && (
                      <span>
                        {t('endLabel')} {new Date(coupon.valid_until).toLocaleDateString(locale)}
                      </span>
                    )}
                    {coupon.min_order_amount && (
                      <span>
                        {t('minOrderLabel')} {formatCurrency(coupon.min_order_amount, currency)}
                      </span>
                    )}
                    {coupon.max_discount_amount && coupon.discount_type === 'percentage' && (
                      <span>
                        {t('maxDiscountLabel')}{' '}
                        {formatCurrency(coupon.max_discount_amount, currency)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center bg-app-bg rounded-xl border border-dashed border-app-border">
            <ListFilter className="w-10 h-10 text-app-text-muted mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-app-text">{t('noCoupons')}</h3>
            <p className="text-xs text-app-text-secondary mt-1">{t('noCouponsDesc')}</p>
            <Button
              onClick={() => {
                setEditingCoupon(null);
                setShowForm(true);
              }}
              variant="outline"
              className="mt-4 gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('newCoupon')}
            </Button>
          </div>
        )}
      </div>

      {/* Coupon Form Modal */}
      <CouponForm
        key={editingCoupon?.id ?? 'new'}
        tenantId={tenantId}
        currency={currency}
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingCoupon(null);
        }}
        onSuccess={() => {
          setShowForm(false);
          setEditingCoupon(null);
          refetch();
        }}
        initialData={editingCoupon}
      />

      {/* Delete confirmation (replaces window.confirm) */}
      <AlertDialog
        open={couponPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setCouponPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteAction')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmCoupon')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (couponPendingDelete) {
                  performDelete(couponPendingDelete);
                  setCouponPendingDelete(null);
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

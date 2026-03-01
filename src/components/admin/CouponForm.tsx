'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePickerField } from '@/components/ui/date-picker-field';
import AdminModal from '@/components/admin/AdminModal';
import type { Coupon, CurrencyCode } from '@/types/admin.types';

interface CouponFormProps {
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currency: CurrencyCode;
  initialData?: Coupon | null;
}

export default function CouponForm({
  tenantId,
  isOpen,
  onClose,
  onSuccess,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currency,
  initialData,
}: CouponFormProps) {
  const t = useTranslations('coupons');
  const tc = useTranslations('common');
  const [code, setCode] = useState(initialData?.code || '');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(
    initialData?.discount_type || 'percentage',
  );
  const [discountValue, setDiscountValue] = useState<number | ''>(
    initialData?.discount_value ?? '',
  );
  const [minAmount, setMinAmount] = useState<number | ''>(initialData?.min_order_amount ?? '');
  const [maxDiscount, setMaxDiscount] = useState<number | ''>(
    initialData?.max_discount_amount ?? '',
  );
  const [validFrom, setValidFrom] = useState(
    initialData?.valid_from ? new Date(initialData.valid_from).toISOString().split('T')[0] : '',
  );
  const [validUntil, setValidUntil] = useState(
    initialData?.valid_until ? new Date(initialData.valid_until).toISOString().split('T')[0] : '',
  );
  const [maxUses, setMaxUses] = useState<number | ''>(initialData?.max_uses ?? '');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast({ title: t('codeRequired'), variant: 'destructive' });
      return;
    }

    if (!discountValue || discountValue <= 0) {
      toast({ title: t('valueRequired'), variant: 'destructive' });
      return;
    }

    if (discountType === 'percentage' && discountValue > 100) {
      toast({ title: t('percentageMax'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const payload = {
      code: code.toUpperCase().trim(),
      discount_type: discountType,
      discount_value: Number(discountValue),
      min_order_amount: minAmount ? Number(minAmount) : null,
      max_discount_amount: maxDiscount ? Number(maxDiscount) : null,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      max_uses: maxUses ? Number(maxUses) : null,
    };

    let error;
    if (initialData) {
      ({ error } = await supabase.from('coupons').update(payload).eq('id', initialData.id));
    } else {
      ({ error } = await supabase.from('coupons').insert({
        tenant_id: tenantId,
        ...payload,
        is_active: true,
        current_uses: 0,
      }));
    }

    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        toast({ title: t('codeExists'), variant: 'destructive' });
      } else {
        toast({
          title: t('createError'),
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      toast({ title: t('couponCreated') });
      onSuccess();
    }
  };

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? t('editCoupon') : t('newCoupon')}
    >
      <form onSubmit={handleSubmit} className="pt-5 space-y-5">
        {/* Code */}
        <div className="space-y-2">
          <Label htmlFor="code">{t('codeField')}</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('codePlaceholder')}
            required
            className="font-mono uppercase tracking-wider"
          />
        </div>

        {/* Discount Type */}
        <div className="space-y-2">
          <Label>{t('discountType')}</Label>
          <Select
            value={discountType}
            onValueChange={(value: 'percentage' | 'fixed') => setDiscountType(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">{t('typePercentageLabel')}</SelectItem>
              <SelectItem value="fixed">{t('typeFixedLabel')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Discount Value */}
        <div className="space-y-2">
          <Label htmlFor="discountValue">{t('discountValue')}</Label>
          <Input
            id="discountValue"
            type="number"
            min="0"
            max={discountType === 'percentage' ? 100 : undefined}
            step={discountType === 'percentage' ? '1' : '0.01'}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value ? Number(e.target.value) : '')}
            placeholder={discountType === 'percentage' ? 'Ex: 15' : 'Ex: 1000'}
            required
          />
        </div>

        {/* Min Order Amount */}
        <div className="space-y-2">
          <Label htmlFor="minAmount">{t('minimumOrder')}</Label>
          <Input
            id="minAmount"
            type="number"
            min="0"
            step="0.01"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('optionalField')}
          />
        </div>

        {/* Max Discount (only for percentage) */}
        {discountType === 'percentage' && (
          <div className="space-y-2">
            <Label htmlFor="maxDiscount">{t('maximumDiscount')}</Label>
            <Input
              id="maxDiscount"
              type="number"
              min="0"
              step="0.01"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value ? Number(e.target.value) : '')}
              placeholder={t('optionalField')}
            />
          </div>
        )}

        {/* Date Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="validFrom">{t('startDateField')}</Label>
            <DatePickerField
              id="validFrom"
              value={validFrom}
              onChange={setValidFrom}
              placeholder={t('startDateField')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="validUntil">{t('endDateField')}</Label>
            <DatePickerField
              id="validUntil"
              value={validUntil}
              onChange={setValidUntil}
              placeholder={t('endDateField')}
            />
          </div>
        </div>

        {/* Max Uses */}
        <div className="space-y-2">
          <Label htmlFor="maxUses">{t('maxUsages')}</Label>
          <Input
            id="maxUses"
            type="number"
            min="0"
            step="1"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('unlimitedIfEmpty')}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="default" disabled={submitting}>
            {submitting ? tc('saving') : initialData ? tc('save') : t('createCoupon')}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

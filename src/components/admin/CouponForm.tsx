'use client';

import { useState } from 'react';
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
import { X } from 'lucide-react';
import type { CurrencyCode } from '@/types/admin.types';

interface CouponFormProps {
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
  currency: CurrencyCode;
}

export default function CouponForm({
  tenantId,
  onClose,
  onSuccess,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currency,
}: CouponFormProps) {
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [minAmount, setMinAmount] = useState<number | ''>('');
  const [maxDiscount, setMaxDiscount] = useState<number | ''>('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast({ title: 'Le code est requis', variant: 'destructive' });
      return;
    }

    if (!discountValue || discountValue <= 0) {
      toast({ title: 'La valeur de réduction est requise', variant: 'destructive' });
      return;
    }

    if (discountType === 'percentage' && discountValue > 100) {
      toast({ title: 'Le pourcentage ne peut pas dépasser 100%', variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.from('coupons').insert({
      tenant_id: tenantId,
      code: code.toUpperCase().trim(),
      discount_type: discountType,
      discount_value: Number(discountValue),
      min_order_amount: minAmount ? Number(minAmount) : null,
      max_discount_amount: maxDiscount ? Number(maxDiscount) : null,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      max_uses: maxUses ? Number(maxUses) : null,
      is_active: true,
      current_uses: 0,
    });

    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Ce code existe déjà', variant: 'destructive' });
      } else {
        toast({
          title: 'Erreur lors de la création',
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      toast({ title: 'Coupon créé avec succès' });
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold tracking-tight">Nouveau coupon</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Code */}
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EX: BIENVENUE10"
              required
              className="font-mono uppercase tracking-wider"
            />
          </div>

          {/* Discount Type */}
          <div className="space-y-2">
            <Label>Type de réduction</Label>
            <Select
              value={discountType}
              onValueChange={(value: 'percentage' | 'fixed') => setDiscountType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Pourcentage (%)</SelectItem>
                <SelectItem value="fixed">Montant fixe</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Discount Value */}
          <div className="space-y-2">
            <Label htmlFor="discountValue">Valeur de réduction</Label>
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
            <Label htmlFor="minAmount">Montant minimum de commande</Label>
            <Input
              id="minAmount"
              type="number"
              min="0"
              step="0.01"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value ? Number(e.target.value) : '')}
              placeholder="Optionnel"
            />
          </div>

          {/* Max Discount (only for percentage) */}
          {discountType === 'percentage' && (
            <div className="space-y-2">
              <Label htmlFor="maxDiscount">Réduction maximale</Label>
              <Input
                id="maxDiscount"
                type="number"
                min="0"
                step="0.01"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value ? Number(e.target.value) : '')}
                placeholder="Optionnel"
              />
            </div>
          )}

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="validFrom">Date de début</Label>
              <Input
                id="validFrom"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validUntil">Date de fin</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          {/* Max Uses */}
          <div className="space-y-2">
            <Label htmlFor="maxUses">Utilisations maximales</Label>
            <Input
              id="maxUses"
              type="number"
              min="0"
              step="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : '')}
              placeholder="Illimité si vide"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Création...' : 'Créer le coupon'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

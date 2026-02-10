'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Tag, ToggleLeft, ToggleRight, ListFilter } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
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
  const [, setLoading] = useState(false);
  const { toast } = useToast();

  const refetch = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erreur lors du chargement', variant: 'destructive' });
    } else {
      setCoupons(data || []);
    }
    setLoading(false);
  }, [tenantId, toast]);

  const handleDelete = async (couponId: string) => {
    if (!window.confirm('Supprimer ce coupon ?')) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', couponId)
      .eq('tenant_id', tenantId);

    if (error) {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
    } else {
      toast({ title: 'Coupon supprimé' });
      refetch();
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('coupons')
      .update({ is_active: !coupon.is_active })
      .eq('id', coupon.id);

    if (error) {
      toast({ title: 'Erreur lors de la mise à jour', variant: 'destructive' });
    } else {
      toast({ title: coupon.is_active ? 'Coupon désactivé' : 'Coupon activé' });
      refetch();
    }
  };

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.discount_type === 'percentage') {
      return `${coupon.discount_value}%`;
    }
    return formatCurrency(coupon.discount_value, currency);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Coupons</h1>
          <p className="text-xs text-gray-500 mt-1">Gérez vos codes de réduction</p>
        </div>

        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouveau coupon
        </Button>
      </div>

      {/* Coupons List */}
      {coupons.length > 0 ? (
        <div className="grid gap-3">
          {/* Table Header (desktop) */}
          <div className="hidden md:grid md:grid-cols-[1fr_120px_120px_120px_100px_80px] gap-4 px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            <span>Code</span>
            <span>Type</span>
            <span>Valeur</span>
            <span>Utilisations</span>
            <span>Statut</span>
            <span className="text-right">Actions</span>
          </div>

          {coupons.map((coupon) => (
            <div
              key={coupon.id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="md:grid md:grid-cols-[1fr_120px_120px_120px_100px_80px] md:gap-4 md:items-center space-y-3 md:space-y-0">
                {/* Code */}
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="font-bold font-mono text-sm tracking-wider">{coupon.code}</span>
                </div>

                {/* Type */}
                <div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      coupon.discount_type === 'percentage'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-purple-50 text-purple-700'
                    }`}
                  >
                    {coupon.discount_type === 'percentage' ? '%' : 'Fixe'}
                  </span>
                </div>

                {/* Value */}
                <div className="text-sm font-semibold text-gray-900">{formatDiscount(coupon)}</div>

                {/* Usage */}
                <div className="text-sm text-gray-600">
                  {coupon.current_uses}
                  {coupon.max_uses ? ` / ${coupon.max_uses}` : ' / ∞'}
                </div>

                {/* Status Toggle */}
                <button
                  onClick={() => toggleActive(coupon)}
                  className="flex items-center gap-1.5 group"
                  title={coupon.is_active ? 'Désactiver' : 'Activer'}
                >
                  {coupon.is_active ? (
                    <>
                      <ToggleRight className="h-5 w-5 text-green-600" />
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        Actif
                      </span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-5 w-5 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        Inactif
                      </span>
                    </>
                  )}
                </button>

                {/* Delete */}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(coupon.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Extra info row */}
              {(coupon.valid_from || coupon.valid_until || coupon.min_order_amount) && (
                <div className="mt-3 pt-3 border-t border-gray-50 flex flex-wrap gap-3 text-xs text-gray-500">
                  {coupon.valid_from && (
                    <span>Début : {new Date(coupon.valid_from).toLocaleDateString('fr-FR')}</span>
                  )}
                  {coupon.valid_until && (
                    <span>Fin : {new Date(coupon.valid_until).toLocaleDateString('fr-FR')}</span>
                  )}
                  {coupon.min_order_amount && (
                    <span>Min. commande : {formatCurrency(coupon.min_order_amount, currency)}</span>
                  )}
                  {coupon.max_discount_amount && coupon.discount_type === 'percentage' && (
                    <span>
                      Réduction max. : {formatCurrency(coupon.max_discount_amount, currency)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <ListFilter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-900">Aucun coupon</h3>
          <p className="text-xs text-gray-500 mt-1">Créez votre premier code de réduction</p>
          <Button onClick={() => setShowForm(true)} variant="outline" className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Nouveau coupon
          </Button>
        </div>
      )}

      {/* Coupon Form Modal */}
      {showForm && (
        <CouponForm
          tenantId={tenantId}
          currency={currency}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// Types coupons, promotions & publicites pour l'administration multi-tenant ATTABL SaaS

// --- Coupons -------------------------------------------------

export interface Coupon {
  id: string;
  tenant_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  current_uses: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// --- Promotions & Ads ----------------------------------------

export interface Announcement {
  id: string;
  tenant_id: string;
  title: string;
  title_en?: string;
  description?: string;
  description_en?: string;
  image_url?: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface Ad {
  id: string;
  tenant_id: string;
  image_url: string;
  link?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

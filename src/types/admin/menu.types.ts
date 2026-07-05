// Types menus, categories & articles pour l'administration multi-tenant ATTABL SaaS

import type { CurrencyCode, PreparationZone } from './enums.types';
import type { Venue } from './venue.types';

// --- Wizard types --------------------------------------------
/** Lightweight item projection used by the menu creation wizard. */
export interface WizardItem {
  id: string;
  name: string;
  price: number;
}

// --- Menus / Cartes -----------------------------------------

export interface Menu {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  parent_menu_id: string | null;
  name: string;
  name_en?: string;
  slug: string;
  description?: string;
  description_en?: string;
  image_url?: string;
  is_active: boolean;
  is_transversal_menu?: boolean;
  display_order: number;
  created_at: string;
  updated_at?: string;
  // Joined fields
  venue?: Venue;
  children?: Menu[];
  categories?: Category[];
}

// --- Categories ---------------------------------------------

export interface Category {
  id: string;
  tenant_id: string;
  menu_id?: string;
  name: string;
  name_en?: string;
  display_order?: number;
  is_active?: boolean;
  is_featured_on_home?: boolean;
  preparation_zone?: PreparationZone;
  icon?: string | null;
  created_at: string;
}

export type MultiCurrencyPrices = Partial<Record<CurrencyCode, number>> | null;

export interface MenuItem {
  id: string;
  tenant_id: string;
  name: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  price: number;
  prices?: MultiCurrencyPrices;
  image_url?: string;
  image_back_url?: string;
  is_available: boolean;
  is_featured: boolean;
  is_vegetarian?: boolean;
  is_spicy?: boolean;
  is_drink?: boolean;
  allergens?: string[];
  calories?: number;
  rating?: number;
  rating_count?: number;
  category_id: string;
  category?: Category;
  display_order?: number;
  deleted_at?: string | null;
  created_at: string;
  options?: ItemOption[];
  price_variants?: ItemPriceVariant[];
  modifiers?: ItemModifier[];
}

// Option selectionnable (ex: saveurs de jus - meme prix)
interface ItemOption {
  id: string;
  menu_item_id: string;
  name_fr: string;
  name_en?: string;
  display_order: number;
  is_default: boolean;
  created_at: string;
}

// Variante de prix (ex: Verre/Bouteille - prix differents)
export interface ItemPriceVariant {
  id: string;
  menu_item_id: string;
  variant_name_fr: string;
  variant_name_en?: string;
  price: number;
  prices?: MultiCurrencyPrices;
  display_order: number;
  is_default: boolean;
  created_at: string;
}

// Modificateur payant (ex: sauce truffe +5EUR, double portion +8EUR)
export interface ItemModifier {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  name: string;
  name_en?: string;
  price: number;
  prices?: MultiCurrencyPrices;
  is_available: boolean;
  is_required?: boolean;
  display_order: number;
  created_at: string;
}

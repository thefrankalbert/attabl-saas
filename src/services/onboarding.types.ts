export interface TableZoneData {
  name: string;
  prefix: string;
  tableCount: number;
  defaultCapacity?: number;
}

export interface OnboardingStepData {
  tenantName?: string;
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  tableConfigMode?: 'complete' | 'minimum' | 'skip';
  tableZones?: TableZoneData[];
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
}

export interface MenuItem {
  name: string;
  price?: number;
  category?: string;
  imageUrl?: string;
}

export interface OnboardingCompleteData {
  tenantName?: string;
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  tableConfigMode?: 'complete' | 'minimum' | 'skip';
  tableZones?: TableZoneData[];
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  currency?: string;
  language?: string;
  tenantSlug?: string;
  menuItems?: MenuItem[];
}

/**
 * Full draft data stored as JSONB in onboarding_progress.draft.
 * Mirrors the client-side OnboardingData interface so ALL fields are persisted.
 */
export interface OnboardingDraft {
  // Establishment
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  language?: string;
  currency?: string;
  // Type-specific
  starRating?: number;
  hasRestaurant?: boolean;
  hasTerrace?: boolean;
  hasWifi?: boolean;
  registerCount?: number;
  hasDelivery?: boolean;
  totalCapacity?: number;
  // Tables
  tableConfigMode?: string;
  tableZones?: TableZoneData[];
  // Branding
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  // Menu
  menuOption?: string;
  menuItems?: MenuItem[];
  // QR
  qrTemplate?: string;
  qrStyle?: string;
  qrCta?: string;
  qrDescription?: string;
  // Tenant name (editable during onboarding)
  tenantName?: string;
}

export interface OnboardingState {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  step: number;
  completed: boolean;
  data: OnboardingDraft;
}

export interface OnboardingService {
  saveStep(
    tenantId: string,
    step: number,
    data: OnboardingStepData,
    fullDraft?: OnboardingDraft,
  ): Promise<void>;
  completeOnboarding(tenantId: string, data: OnboardingCompleteData): Promise<{ slug?: string }>;
  getState(userId: string): Promise<OnboardingState>;
}

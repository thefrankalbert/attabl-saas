import type { OnboardingData } from '@/components/onboarding/types';

// --- Tokens (mirrors menu-tokens.ts) ----------------------------------------

export const C = {
  bg: '#FFFFFF',
  surface: '#F6F6F6',
  divider: '#EEEEEE',
  text: '#1A1A1A',
  textSecondary: '#737373',
  textMuted: '#B0B0B0',
  cartBg: '#1A1A1A',
  cartText: '#FFFFFF',
  iconInactive: '#B0B0B0',
  skeletonBase: '#E5E7EB',
  skeletonAlt: '#F3F4F6',
};

// --- Shared types -----------------------------------------------------------

export type PhoneMenuItem = OnboardingData['menuItems'][number];

export interface PhoneCategory {
  name: string;
  emoji: string;
}

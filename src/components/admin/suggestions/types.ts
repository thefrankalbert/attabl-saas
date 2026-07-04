import type { SuggestionType } from '@/types/inventory.types';

export interface MenuItem {
  id: string;
  name: string;
}

export interface Suggestion {
  id: string;
  menu_item_id: string;
  suggested_item_id: string;
  suggestion_type: SuggestionType;
  description: string | null;
  display_order: number;
  is_active: boolean;
  // Joined
  menu_item?: { name: string };
  suggested_item?: { name: string };
}

export interface SuggestionTypeConfig {
  value: SuggestionType;
  label: string;
  emoji: string;
  color: string;
}

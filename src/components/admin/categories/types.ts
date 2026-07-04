import type { Category } from '@/types/admin.types';

export type CategoryWithCount = Category & { items_count?: number };

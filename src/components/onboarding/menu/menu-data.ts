import type { OnboardingData } from '@/app/onboarding/page';

export interface CategoryItem {
  id: string;
  name: string;
  price: string;
  imageUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  expanded: boolean;
  items: CategoryItem[];
}

export function buildCategoriesFromData(menuItems: OnboardingData['menuItems']): Category[] {
  if (!menuItems || menuItems.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        name: '',
        expanded: true,
        items: [{ id: crypto.randomUUID(), name: '', price: '' }],
      },
    ];
  }

  const grouped = new Map<string, Array<{ name: string; price: number; imageUrl?: string }>>();
  for (const item of menuItems) {
    const cat = item.category || '';
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push({ name: item.name, price: item.price, imageUrl: item.imageUrl });
  }

  const result: Category[] = [];
  for (const [catName, items] of grouped) {
    result.push({
      id: crypto.randomUUID(),
      name: catName,
      expanded: true,
      items: items.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        price: item.price > 0 ? String(item.price) : '',
        imageUrl: item.imageUrl,
      })),
    });
  }

  return result;
}

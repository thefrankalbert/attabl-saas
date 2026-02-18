'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UtensilsCrossed, Plus, Trash2 } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

interface MenuStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

interface MenuItem {
  name: string;
  price: string;
}

export function MenuStep({ updateData }: MenuStepProps) {
  const [categoryName, setCategoryName] = useState('');
  const [items, setItems] = useState<MenuItem[]>([{ name: '', price: '' }]);

  const addItem = () => {
    if (items.length < 5) {
      setItems([...items, { name: '', price: '' }]);
    }
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: 'name' | 'price', value: string) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);

    // Update parent data
    updateData({
      menuItems: newItems.map((item) => ({
        name: item.name,
        price: parseFloat(item.price) || 0,
        category: categoryName,
      })),
      menuOption: categoryName ? 'manual' : 'skip',
    });
  };

  const updateCategoryName = (value: string) => {
    setCategoryName(value);
    updateData({
      menuItems: items.map((item) => ({
        name: item.name,
        price: parseFloat(item.price) || 0,
        category: value,
      })),
      menuOption: value ? 'manual' : 'skip',
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 text-neutral-600 text-sm font-medium mb-2">
          <UtensilsCrossed className="h-3.5 w-3.5" />
          Étape 4/5
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">Votre première catégorie</h1>
        <p className="text-neutral-500 text-sm">
          Créez une catégorie avec quelques articles pour démarrer. Vous pourrez en ajouter
          d&apos;autres plus tard.
        </p>
      </div>

      {/* Category Name */}
      <div className="mb-4">
        <Label htmlFor="categoryName" className="text-neutral-700 font-semibold text-sm">
          Nom de la catégorie
        </Label>
        <Input
          id="categoryName"
          type="text"
          placeholder="Ex: Plats principaux, Entrées, Boissons..."
          value={categoryName}
          onChange={(e) => updateCategoryName(e.target.value)}
          className="mt-1.5 h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
        />
      </div>

      {/* Items */}
      <div className="space-y-2.5">
        <Label className="text-neutral-700 font-semibold text-sm">Articles (optionnel)</Label>

        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Nom de l'article"
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
                className="h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
              />
            </div>
            <div className="w-28">
              <Input
                type="number"
                placeholder="Prix"
                value={item.price}
                onChange={(e) => updateItem(index, 'price', e.target.value)}
                className="h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => removeItem(index)}
              disabled={items.length === 1}
              className={`p-2 rounded-lg transition-colors ${
                items.length === 1
                  ? 'text-neutral-300 cursor-not-allowed'
                  : 'text-neutral-400 hover:text-red-500 hover:bg-red-50'
              }`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {items.length < 5 && (
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 px-3 py-2.5 w-full rounded-xl border-2 border-dashed border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 transition-colors text-sm"
          >
            <Plus className="h-4 w-4" />
            Ajouter un article
          </button>
        )}
      </div>

      {/* Skip Info */}
      <div className="mt-4 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
        <p className="text-xs text-neutral-600">
          <strong>💡 Astuce :</strong> Vous pouvez laisser cette étape vide et ajouter votre menu
          complet depuis le Dashboard.
        </p>
      </div>
    </div>
  );
}

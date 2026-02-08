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
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 text-gray-600 text-sm font-medium mb-4">
          <UtensilsCrossed className="h-4 w-4" />
          Étape 3/4
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Votre première catégorie</h1>
        <p className="text-gray-500">
          Créez une catégorie avec quelques articles pour démarrer. Vous pourrez en ajouter
          d&apos;autres plus tard.
        </p>
      </div>

      {/* Category Name */}
      <div className="mb-8">
        <Label htmlFor="categoryName" className="text-gray-700 font-semibold">
          Nom de la catégorie
        </Label>
        <Input
          id="categoryName"
          type="text"
          placeholder="Ex: Plats principaux, Entrées, Boissons..."
          value={categoryName}
          onChange={(e) => updateCategoryName(e.target.value)}
          className="mt-2 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-gray-900 rounded-xl"
        />
      </div>

      {/* Items */}
      <div className="space-y-4">
        <Label className="text-gray-700 font-semibold">Articles (optionnel)</Label>

        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Nom de l'article"
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
                className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-gray-900 rounded-xl"
              />
            </div>
            <div className="w-32">
              <Input
                type="number"
                placeholder="Prix"
                value={item.price}
                onChange={(e) => updateItem(index, 'price', e.target.value)}
                className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-gray-900 rounded-xl"
              />
            </div>
            <button
              type="button"
              onClick={() => removeItem(index)}
              disabled={items.length === 1}
              className={`p-3 rounded-xl transition-colors ${
                items.length === 1
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        ))}

        {items.length < 5 && (
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 px-4 py-3 w-full rounded-xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Ajouter un article
          </button>
        )}
      </div>

      {/* Skip Info */}
      <div className="mt-8 p-4 rounded-xl bg-gray-50 border border-gray-100">
        <p className="text-sm text-gray-600">
          <strong>💡 Astuce :</strong> Vous pouvez laisser cette étape vide et ajouter votre menu
          complet depuis le Dashboard.
        </p>
      </div>
    </div>
  );
}

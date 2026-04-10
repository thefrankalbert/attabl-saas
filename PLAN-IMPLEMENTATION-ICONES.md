# Plan d'Implementation -- Icones Fluent Emoji 3D pour ATTABL

## Contexte

- Table `categories` actuelle : pas de colonne `icon`
- Icones = dictionnaire JS client-side (`CATEGORY_ICONS` dans `ClientMenuPage.tsx`)
- Probleme : meme icone pour 12+ categories differentes (caribbean.png = fallback)
- Solution : ajouter un systeme d'icones en DB + librairie Fluent Emoji 3D

---

## ETAPE 1 : Installer la dependance

```bash
pnpm add @iconify/react
```

---

## ETAPE 2 : Migration DB -- Ajouter `icon` a la table `categories`

Creer le fichier `supabase/migrations/20260408_category_icons.sql` :

```sql
-- Ajouter la colonne icon a la table categories
-- Stocke l'identifiant Iconify (ex: "fluent-emoji:hamburger")
ALTER TABLE categories
ADD COLUMN icon TEXT;

-- Creer la table de reference des icones par defaut
-- Cette table sert de registre global : quand un restaurateur cree une categorie
-- "Burger", le systeme lui propose automatiquement l'icone correspondante
CREATE TABLE IF NOT EXISTS default_category_icons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  icon TEXT NOT NULL,
  display_label_fr TEXT,
  display_label_en TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index unique sur le keyword (lowercase) pour eviter les doublons
CREATE UNIQUE INDEX idx_default_category_icons_keyword
ON default_category_icons (LOWER(keyword));

-- RLS : lecture publique (tous les tenants), ecriture admin uniquement
ALTER TABLE default_category_icons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut lire les icones par defaut"
ON default_category_icons FOR SELECT
USING (true);

CREATE POLICY "Seul le service role peut modifier les icones par defaut"
ON default_category_icons FOR ALL
USING (auth.role() = 'service_role');

-- Seed : inserer le mapping complet des icones par defaut
INSERT INTO default_category_icons (keyword, icon, display_label_fr, display_label_en) VALUES
-- Plats principaux
('entree', 'fluent-emoji:green-salad', 'Entree', 'Starter'),
('entrees', 'fluent-emoji:green-salad', 'Entrees', 'Starters'),
('starters', 'fluent-emoji:green-salad', 'Entrees', 'Starters'),
('pour commencer', 'fluent-emoji:green-salad', 'Pour commencer', 'To start'),
('plat principal', 'fluent-emoji:fork-and-knife-with-plate', 'Plat principal', 'Main course'),
('plats principaux', 'fluent-emoji:fork-and-knife-with-plate', 'Plats principaux', 'Main courses'),
('plats', 'fluent-emoji:fork-and-knife-with-plate', 'Plats', 'Dishes'),
('main course', 'fluent-emoji:fork-and-knife-with-plate', 'Plat principal', 'Main course'),
('grillade', 'fluent-emoji:cut-of-meat', 'Grillade', 'Grill'),
('grills', 'fluent-emoji:cut-of-meat', 'Grillades', 'Grills'),
('grille', 'fluent-emoji:cut-of-meat', 'Grille', 'Grilled'),
('bbq', 'fluent-emoji:cut-of-meat', 'BBQ', 'BBQ'),
('burger', 'fluent-emoji:hamburger', 'Burger', 'Burger'),
('burgers', 'fluent-emoji:hamburger', 'Burgers', 'Burgers'),
('hamburger', 'fluent-emoji:hamburger', 'Hamburger', 'Hamburger'),
('hamburgers', 'fluent-emoji:hamburger', 'Hamburgers', 'Hamburgers'),
('pizza', 'fluent-emoji:pizza', 'Pizza', 'Pizza'),
('pizzas', 'fluent-emoji:pizza', 'Pizzas', 'Pizzas'),
('pates', 'fluent-emoji:spaghetti', 'Pates', 'Pasta'),
('pasta', 'fluent-emoji:spaghetti', 'Pates', 'Pasta'),
('pastas', 'fluent-emoji:spaghetti', 'Pates', 'Pasta'),
('lasagna', 'fluent-emoji:spaghetti', 'Lasagnes', 'Lasagna'),
('soupe', 'fluent-emoji:steaming-bowl', 'Soupe', 'Soup'),
('soup', 'fluent-emoji:steaming-bowl', 'Soupe', 'Soup'),
('soupes', 'fluent-emoji:steaming-bowl', 'Soupes', 'Soups'),
('salade', 'fluent-emoji:leafy-green', 'Salade', 'Salad'),
('salad', 'fluent-emoji:leafy-green', 'Salade', 'Salad'),
('sandwich', 'fluent-emoji:sandwich', 'Sandwich', 'Sandwich'),
('sandwiches', 'fluent-emoji:sandwich', 'Sandwiches', 'Sandwiches'),
('poisson', 'fluent-emoji:fish', 'Poisson', 'Fish'),
('fish', 'fluent-emoji:fish', 'Poisson', 'Fish'),
('fruits de mer', 'fluent-emoji:shrimp', 'Fruits de mer', 'Seafood'),
('seafood', 'fluent-emoji:shrimp', 'Fruits de mer', 'Seafood'),
('poulet', 'fluent-emoji:poultry-leg', 'Poulet', 'Chicken'),
('chicken', 'fluent-emoji:poultry-leg', 'Poulet', 'Chicken'),
('sushi', 'fluent-emoji:sushi', 'Sushi', 'Sushi'),
('taco', 'fluent-emoji:taco', 'Taco', 'Taco'),
('tacos', 'fluent-emoji:taco', 'Tacos', 'Tacos'),
('brochette', 'fluent-emoji:stuffed-flatbread', 'Brochette', 'Skewer'),
('kebab', 'fluent-emoji:stuffed-flatbread', 'Kebab', 'Kebab'),
('vegetarien', 'fluent-emoji:broccoli', 'Vegetarien', 'Vegetarian'),
('vegetarian', 'fluent-emoji:broccoli', 'Vegetarien', 'Vegetarian'),
('vegan', 'fluent-emoji:broccoli', 'Vegan', 'Vegan'),
-- Cuisines du monde
('asiatique', 'fluent-emoji:cooked-rice', 'Asiatique', 'Asian'),
('asian', 'fluent-emoji:cooked-rice', 'Asiatique', 'Asian'),
('noodles', 'fluent-emoji:cooked-rice', 'Nouilles', 'Noodles'),
('chinois', 'fluent-emoji:dumpling', 'Chinois', 'Chinese'),
('chinese', 'fluent-emoji:dumpling', 'Chinois', 'Chinese'),
('dim sum', 'fluent-emoji:dumpling', 'Dim Sum', 'Dim Sum'),
('indien', 'fluent-emoji:curry-rice', 'Indien', 'Indian'),
('indian', 'fluent-emoji:curry-rice', 'Indien', 'Indian'),
('curry', 'fluent-emoji:curry-rice', 'Curry', 'Curry'),
('africain', 'fluent-emoji:shallow-pan-of-food', 'Africain', 'African'),
('african', 'fluent-emoji:shallow-pan-of-food', 'Africain', 'African'),
('plats africains', 'fluent-emoji:shallow-pan-of-food', 'Plats africains', 'African dishes'),
('francais', 'fluent-emoji:croissant', 'Francais', 'French'),
('french', 'fluent-emoji:croissant', 'Francais', 'French'),
('viande', 'fluent-emoji:cut-of-meat', 'Viande', 'Meat'),
('steak', 'fluent-emoji:cut-of-meat', 'Steak', 'Steak'),
('americain', 'fluent-emoji:hot-dog', 'Americain', 'American'),
('american', 'fluent-emoji:hot-dog', 'Americain', 'American'),
('hot dog', 'fluent-emoji:hot-dog', 'Hot Dog', 'Hot Dog'),
('halal', 'fluent-emoji:flatbread', 'Halal', 'Halal'),
('fast food', 'fluent-emoji:french-fries', 'Fast Food', 'Fast Food'),
('fast-food', 'fluent-emoji:french-fries', 'Fast Food', 'Fast Food'),
('rapide', 'fluent-emoji:french-fries', 'Rapide', 'Quick'),
('frites', 'fluent-emoji:french-fries', 'Frites', 'Fries'),
-- Desserts
('dessert', 'fluent-emoji:shortcake', 'Dessert', 'Dessert'),
('desserts', 'fluent-emoji:shortcake', 'Desserts', 'Desserts'),
('douceurs', 'fluent-emoji:cookie', 'Douceurs', 'Sweets'),
('patisserie', 'fluent-emoji:birthday-cake', 'Patisserie', 'Pastry'),
('gateau', 'fluent-emoji:birthday-cake', 'Gateau', 'Cake'),
('tart', 'fluent-emoji:pie', 'Tarte', 'Tart'),
('glace', 'fluent-emoji:soft-ice-cream', 'Glace', 'Ice cream'),
('glaces', 'fluent-emoji:soft-ice-cream', 'Glaces', 'Ice cream'),
('ice cream', 'fluent-emoji:soft-ice-cream', 'Glace', 'Ice cream'),
-- Boissons (toutes distinctes)
('vin', 'fluent-emoji:wine-glass', 'Vin', 'Wine'),
('vins', 'fluent-emoji:wine-glass', 'Vins', 'Wines'),
('wine', 'fluent-emoji:wine-glass', 'Vin', 'Wine'),
('biere', 'fluent-emoji:beer-mug', 'Biere', 'Beer'),
('bieres', 'fluent-emoji:beer-mug', 'Bieres', 'Beers'),
('beer', 'fluent-emoji:beer-mug', 'Biere', 'Beer'),
('cocktail', 'fluent-emoji:cocktail-glass', 'Cocktail', 'Cocktail'),
('cocktails', 'fluent-emoji:cocktail-glass', 'Cocktails', 'Cocktails'),
('cocktails alcoolises', 'fluent-emoji:cocktail-glass', 'Cocktails alcoolises', 'Alcoholic cocktails'),
('cocktails sans alcool', 'fluent-emoji:tropical-drink', 'Cocktails sans alcool', 'Non-alcoholic cocktails'),
('aperitif', 'fluent-emoji:clinking-glasses', 'Aperitif', 'Aperitif'),
('aperitifs', 'fluent-emoji:clinking-glasses', 'Aperitifs', 'Aperitifs'),
('alcool', 'fluent-emoji:tumbler-glass', 'Alcool', 'Alcohol'),
('alcohol', 'fluent-emoji:tumbler-glass', 'Alcool', 'Alcohol'),
('boisson', 'fluent-emoji:cup-with-straw', 'Boisson', 'Drink'),
('boissons', 'fluent-emoji:cup-with-straw', 'Boissons', 'Drinks'),
('drinks', 'fluent-emoji:cup-with-straw', 'Boissons', 'Drinks'),
('beverages', 'fluent-emoji:cup-with-straw', 'Boissons', 'Beverages'),
('cafe', 'fluent-emoji:hot-beverage', 'Cafe', 'Coffee'),
('coffee', 'fluent-emoji:hot-beverage', 'Cafe', 'Coffee'),
('the', 'fluent-emoji:teacup-without-handle', 'The', 'Tea'),
('tea', 'fluent-emoji:teacup-without-handle', 'The', 'Tea'),
('boissons chaudes', 'fluent-emoji:teapot', 'Boissons chaudes', 'Hot drinks'),
('jus', 'fluent-emoji:tropical-drink', 'Jus', 'Juice'),
('juice', 'fluent-emoji:tropical-drink', 'Jus', 'Juice'),
('bubble tea', 'fluent-emoji:bubble-tea', 'Bubble tea', 'Bubble tea'),
-- Autres
('snack', 'fluent-emoji:popcorn', 'Snack', 'Snack'),
('snacks', 'fluent-emoji:popcorn', 'Snacks', 'Snacks'),
('boulangerie', 'fluent-emoji:baguette-bread', 'Boulangerie', 'Bakery'),
('epicerie', 'fluent-emoji:canned-food', 'Epicerie', 'Grocery'),
('courses', 'fluent-emoji:canned-food', 'Courses', 'Grocery'),
('grocery', 'fluent-emoji:canned-food', 'Courses', 'Grocery'),
('emporter', 'fluent-emoji:takeout-box', 'A emporter', 'Takeout'),
('a emporter', 'fluent-emoji:takeout-box', 'A emporter', 'Takeout'),
('takeout', 'fluent-emoji:takeout-box', 'A emporter', 'Takeout'),
('takeaway', 'fluent-emoji:takeout-box', 'A emporter', 'Takeaway'),
('petit-dejeuner', 'fluent-emoji:pancakes', 'Petit-dejeuner', 'Breakfast'),
('breakfast', 'fluent-emoji:pancakes', 'Petit-dejeuner', 'Breakfast'),
('fleurs', 'fluent-emoji:bouquet', 'Fleurs', 'Flowers'),
('flowers', 'fluent-emoji:bouquet', 'Fleurs', 'Flowers'),
('specialite', 'fluent-emoji:fondue', 'Specialite', 'Specialty'),
('specialty', 'fluent-emoji:fondue', 'Specialite', 'Specialty')
ON CONFLICT (LOWER(keyword)) DO NOTHING;
```

---

## ETAPE 3 : Creer le service icon (nouveau fichier)

Creer `src/services/icon.service.ts` :

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

// Fallback icon si rien ne match
const DEFAULT_ICON = 'fluent-emoji:fork-and-knife-with-plate';

export function createIconService(supabase: SupabaseClient) {
  return {
    /**
     * Cherche l'icone par defaut pour un nom de categorie.
     * Utilise la table default_category_icons pour le matching.
     */
    async getDefaultIcon(categoryName: string): Promise<string> {
      const normalized = categoryName
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      // 1. Match exact
      const { data: exact } = await supabase
        .from('default_category_icons')
        .select('icon')
        .ilike('keyword', normalized)
        .limit(1)
        .single();

      if (exact?.icon) return exact.icon;

      // 2. Match partiel (le keyword est contenu dans le nom)
      const { data: partial } = await supabase
        .from('default_category_icons')
        .select('icon, keyword')
        .order('keyword');

      if (partial) {
        for (const row of partial) {
          if (normalized.includes(row.keyword) || row.keyword.includes(normalized)) {
            return row.icon;
          }
        }
      }

      return DEFAULT_ICON;
    },

    /**
     * Retourne toutes les icones disponibles pour le picker admin.
     * Groupees par categorie logique.
     */
    async getAllAvailableIcons(): Promise<
      Array<{ keyword: string; icon: string; label_fr: string; label_en: string }>
    > {
      const { data } = await supabase
        .from('default_category_icons')
        .select('keyword, icon, display_label_fr, display_label_en')
        .order('keyword');

      // Deduplicate par icon (garder un seul label par icone)
      const seen = new Map<
        string,
        { keyword: string; icon: string; label_fr: string; label_en: string }
      >();
      for (const row of data ?? []) {
        if (!seen.has(row.icon)) {
          seen.set(row.icon, {
            keyword: row.keyword,
            icon: row.icon,
            label_fr: row.display_label_fr ?? row.keyword,
            label_en: row.display_label_en ?? row.keyword,
          });
        }
      }
      return Array.from(seen.values());
    },
  };
}
```

---

## ETAPE 4 : Modifier le category.service.ts

Ajouter la logique d'auto-assignation d'icone lors de la creation :

```typescript
// Dans createCategory(), apres l'insertion :
// Si aucune icone n'est specifiee, en assigner une automatiquement
if (!data.icon) {
  const iconService = createIconService(this.supabase);
  const defaultIcon = await iconService.getDefaultIcon(data.name);
  await this.supabase.from('categories').update({ icon: defaultIcon }).eq('id', newCategory.id);
  newCategory.icon = defaultIcon;
}
```

---

## ETAPE 5 : Modifier onboarding.service.ts

Quand les categories sont creees automatiquement pendant l'onboarding, assigner les icones :

```typescript
// Apres la creation de chaque categorie dans completeOnboarding() :
const iconService = createIconService(supabase);
const icon = await iconService.getDefaultIcon(categoryName);

// Inclure icon dans l'insert
{ tenant_id, menu_id, name: categoryName, icon, is_active: true, display_order: index }
```

---

## ETAPE 6 : Mettre a jour le type Category

Dans `src/types/admin.types.ts`, ajouter `icon` :

```typescript
export interface Category {
  id: string;
  tenant_id: string;
  menu_id?: string;
  name: string;
  name_en?: string;
  icon?: string; // <-- NOUVEAU : identifiant Iconify (ex: "fluent-emoji:hamburger")
  display_order?: number;
  is_active?: boolean;
  preparation_zone?: PreparationZone;
  created_at: string;
}
```

---

## ETAPE 7 : Creer le composant CategoryIcon

Creer `src/components/shared/CategoryIcon.tsx` :

```tsx
'use client';

import { Icon } from '@iconify/react';

interface CategoryIconProps {
  icon?: string | null;
  categoryName?: string;
  size?: number;
  className?: string;
}

// Fallback client-side rapide (pas de requete DB)
const QUICK_FALLBACK: Record<string, string> = {
  burger: 'fluent-emoji:hamburger',
  pizza: 'fluent-emoji:pizza',
  dessert: 'fluent-emoji:shortcake',
  entree: 'fluent-emoji:green-salad',
  // ... les plus courants pour le rendu instantane
};

const DEFAULT_ICON = 'fluent-emoji:fork-and-knife-with-plate';

export function CategoryIcon({ icon, categoryName, size = 40, className }: CategoryIconProps) {
  // 1. Si l'icone est stockee en DB, l'utiliser directement
  if (icon) {
    return <Icon icon={icon} width={size} height={size} className={className} />;
  }

  // 2. Fallback client-side si pas encore migre
  if (categoryName) {
    const normalized = categoryName.toLowerCase().trim();
    const fallback = QUICK_FALLBACK[normalized] ?? DEFAULT_ICON;
    return <Icon icon={fallback} width={size} height={size} className={className} />;
  }

  // 3. Icone par defaut
  return <Icon icon={DEFAULT_ICON} width={size} height={size} className={className} />;
}
```

---

## ETAPE 8 : Modifier ClientMenuPage.tsx

Remplacer le systeme PNG par le nouveau composant :

1. Supprimer `CATEGORY_ICONS` et `getCatImg()`
2. Importer `CategoryIcon`
3. Remplacer `<Image src={getCatImg(cat.name)}>` par `<CategoryIcon icon={cat.icon} categoryName={cat.name} size={40} />`
4. Ajouter `icon` dans le select Supabase de la page server

---

## ETAPE 9 : Ajouter un icon picker dans l'admin CategoriesClient

Permettre au restaurateur de changer l'icone de ses categories :

1. Dans le formulaire d'edition de categorie, ajouter un selecteur d'icones
2. Afficher une grille des icones disponibles (via `getAllAvailableIcons()`)
3. Sauvegarder le choix dans `categories.icon`

---

## ETAPE 10 : Migration des categories existantes

Script one-shot pour assigner des icones aux categories deja en base :

```sql
-- Script de migration des categories existantes
-- A executer une seule fois apres le deploiement

UPDATE categories c
SET icon = d.icon
FROM default_category_icons d
WHERE c.icon IS NULL
AND LOWER(TRIM(c.name)) = LOWER(d.keyword);

-- Pour les categories qui n'ont pas matche exactement,
-- un script Node.js avec matching partiel sera necessaire
```

---

## Resume de l'ordre d'execution dans Claude Code

```
1. pnpm add @iconify/react
2. Creer la migration SQL (etape 2)
3. pnpm db:migrate
4. Creer icon.service.ts (etape 3)
5. Modifier category.service.ts (etape 4)
6. Modifier onboarding.service.ts (etape 5)
7. Modifier admin.types.ts (etape 6)
8. Creer CategoryIcon.tsx (etape 7)
9. Modifier ClientMenuPage.tsx (etape 8)
10. Modifier PhonePreview.tsx (meme approche que etape 8)
11. Modifier CategoriesClient.tsx -- icon picker (etape 9)
12. Executer le script de migration des donnees (etape 10)
13. Supprimer /public/category-icons/ (cleanup)
14. pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

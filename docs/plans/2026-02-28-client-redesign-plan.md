# Client-Facing Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full overhaul of the client-facing restaurant ordering experience using "Uber Eats Elevated" design — premium minimal aesthetics with proven food-ordering UX patterns.

**Architecture:** Refactor all `src/components/tenant/` components with consistent tenant branding (via CSS custom properties), add Framer Motion animations, create new ItemDetailSheet bottom sheet component, redesign cart/orders pages. Font stays as Geist Sans (already clean geometric sans — no need to switch to Inter).

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Framer Motion 12, Radix UI, next-intl, Supabase realtime

**Design Doc:** `docs/plans/2026-02-28-client-redesign-design.md`

---

### Task 1: Design Foundation — i18n Keys + Remove CartSummary FAB

Add all new locale keys needed for the redesign across all 8 locale files. Remove the CartSummary FAB component (cart will live in bottom nav only).

**Files:**

- Modify: `src/messages/fr-FR.json` (and all 7 other locale files)
- Delete: `src/components/tenant/CartSummary.tsx`
- Modify: `src/components/tenant/ClientMenuPage.tsx` (remove CartSummary import & usage)

**Step 1: Add i18n keys to fr-FR.json**

Add these keys to the `"tenant"` section:

```json
"yourCart": "Votre panier",
"itemCount": "{count} article(s)",
"addToCart": "Ajouter au panier",
"selectSize": "Choisir la taille",
"specialInstructions": "Instructions spéciales",
"specialInstructionsPlaceholder": "Allergies, préférences...",
"extras": "Suppléments",
"size": "Taille",
"confirmOrder": "Confirmer la commande",
"clearCart": "Vider le panier",
"emptyCart": "Votre panier est vide",
"emptyCartDesc": "Parcourez notre menu pour ajouter des plats.",
"browseMenu": "Voir le menu",
"subtotal": "Sous-total",
"discount": "Réduction",
"tax": "TVA",
"serviceCharge": "Service",
"promoCode": "Code promo",
"promoCodePlaceholder": "Entrer un code",
"apply": "Appliquer",
"orderSent": "Commande envoyée !",
"orderSentDesc": "Votre commande #{number} a été transmise.",
"trackOrder": "Suivre ma commande",
"backToMenu": "Retour au menu",
"searchMenu": "Rechercher un plat...",
"noSearchResults": "Aucun résultat pour \"{query}\"",
"vegetarian": "Végétarien",
"spicy": "Épicé",
"allergenWarning": "Contient des allergènes",
"orderSentStep": "Envoyée",
"confirmedStep": "Confirmée",
"preparingStep": "En préparation",
"readyStep": "Prête",
"servedStep": "Servie",
"previousOrders": "Commandes précédentes",
"activeOrder": "Commande en cours",
"removeItem": "Retirer"
```

**Step 2: Add equivalent keys to en-US.json**

```json
"yourCart": "Your Cart",
"itemCount": "{count} item(s)",
"addToCart": "Add to Cart",
"selectSize": "Select size",
"specialInstructions": "Special instructions",
"specialInstructionsPlaceholder": "Allergies, preferences...",
"extras": "Extras",
"size": "Size",
"confirmOrder": "Confirm Order",
"clearCart": "Clear Cart",
"emptyCart": "Your cart is empty",
"emptyCartDesc": "Browse our menu to add dishes.",
"browseMenu": "Browse menu",
"subtotal": "Subtotal",
"discount": "Discount",
"tax": "Tax",
"serviceCharge": "Service charge",
"promoCode": "Promo code",
"promoCodePlaceholder": "Enter a code",
"apply": "Apply",
"orderSent": "Order sent!",
"orderSentDesc": "Your order #{number} has been sent.",
"trackOrder": "Track order",
"backToMenu": "Back to menu",
"searchMenu": "Search for a dish...",
"noSearchResults": "No results for \"{query}\"",
"vegetarian": "Vegetarian",
"spicy": "Spicy",
"allergenWarning": "Contains allergens",
"orderSentStep": "Sent",
"confirmedStep": "Confirmed",
"preparingStep": "Preparing",
"readyStep": "Ready",
"servedStep": "Served",
"previousOrders": "Previous orders",
"activeOrder": "Active order",
"removeItem": "Remove"
```

**Step 3: Copy en-US keys to en-GB, en-CA, en-AU, en-IE**

Same English keys for all English locales.

**Step 4: Copy fr-FR keys to fr-CA**

Same French keys.

**Step 5: Add es-ES translations**

```json
"yourCart": "Tu carrito",
"itemCount": "{count} artículo(s)",
"addToCart": "Agregar al carrito",
"selectSize": "Elige el tamaño",
"specialInstructions": "Instrucciones especiales",
"specialInstructionsPlaceholder": "Alergias, preferencias...",
"extras": "Extras",
"size": "Tamaño",
"confirmOrder": "Confirmar pedido",
"clearCart": "Vaciar carrito",
"emptyCart": "Tu carrito está vacío",
"emptyCartDesc": "Explora nuestro menú para agregar platos.",
"browseMenu": "Ver menú",
"subtotal": "Subtotal",
"discount": "Descuento",
"tax": "IVA",
"serviceCharge": "Servicio",
"promoCode": "Código promo",
"promoCodePlaceholder": "Introduce un código",
"apply": "Aplicar",
"orderSent": "¡Pedido enviado!",
"orderSentDesc": "Tu pedido #{number} ha sido enviado.",
"trackOrder": "Seguir pedido",
"backToMenu": "Volver al menú",
"searchMenu": "Buscar un plato...",
"noSearchResults": "Sin resultados para \"{query}\"",
"vegetarian": "Vegetariano",
"spicy": "Picante",
"allergenWarning": "Contiene alérgenos",
"orderSentStep": "Enviado",
"confirmedStep": "Confirmado",
"preparingStep": "En preparación",
"readyStep": "Listo",
"servedStep": "Servido",
"previousOrders": "Pedidos anteriores",
"activeOrder": "Pedido activo",
"removeItem": "Eliminar"
```

**Step 6: Remove CartSummary FAB**

Delete `src/components/tenant/CartSummary.tsx`.

In `src/components/tenant/ClientMenuPage.tsx`:

- Remove the import: `import CartSummary from './CartSummary'`
- Remove the JSX: `<CartSummary tenantSlug={...} primaryColor={...} />`

**Step 7: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (CartSummary is only used in ClientMenuPage)

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: add redesign i18n keys, remove CartSummary FAB"
```

---

### Task 2: BottomNav Redesign — Frosted Glass + Cart Badge Animation

Redesign the bottom navigation with frosted glass effect, refined icons, and animated cart badge using Framer Motion.

**Files:**

- Modify: `src/components/tenant/BottomNav.tsx`

**Context:** Current BottomNav (85 lines) uses `bg-white border-t`, `bg-red-500` badge, `text-gray-400` inactive. Needs to become frosted glass with tenant-branded cart badge and Framer Motion bounce animation.

**Step 1: Rewrite BottomNav**

Replace the entire `BottomNav.tsx` with:

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, Search, ShoppingBag, ScrollText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/contexts/CartContext';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  tenantSlug: string;
  primaryColor?: string;
  onSearchClick?: () => void;
}

export default function BottomNav({ tenantSlug, primaryColor, onSearchClick }: BottomNavProps) {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const router = useRouter();
  const t = useTranslations('tenant');

  const basePath = `/sites/${tenantSlug}`;

  const navItems = [
    {
      label: t('navMenu'),
      icon: Home,
      onClick: () => router.push(basePath),
      isActive: pathname === basePath || pathname === `${basePath}/`,
    },
    {
      label: t('navSearch'),
      icon: Search,
      onClick: onSearchClick || (() => {}),
      isActive: false,
    },
    {
      label: t('navCart'),
      icon: ShoppingBag,
      onClick: () => router.push(`${basePath}/cart`),
      isActive: pathname?.includes('/cart'),
      badge: totalItems > 0 ? totalItems : null,
    },
    {
      label: t('navOrders'),
      icon: ScrollText,
      onClick: () => router.push(`${basePath}/orders`),
      isActive: pathname?.includes('/orders'),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      style={{ paddingBottom: `max(env(safe-area-inset-bottom, 8px), 8px)` }}
    >
      {/* Frosted glass background */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-t border-neutral-100 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]" />

      <div className="relative flex items-center justify-around px-4 pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.onClick}
              className={cn(
                'flex flex-col items-center gap-0.5 p-2.5 rounded-xl min-w-[48px] min-h-[44px] transition-colors',
                item.isActive ? 'font-semibold' : 'text-neutral-400',
              )}
              style={item.isActive ? { color: primaryColor || '#000' } : undefined}
            >
              <div className="relative">
                <Icon className="w-6 h-6" strokeWidth={item.isActive ? 2.5 : 1.8} />
                {/* Animated cart badge */}
                <AnimatePresence>
                  {item.badge && (
                    <motion.div
                      key={item.badge}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white text-white text-[10px] font-bold px-1"
                      style={{ backgroundColor: primaryColor || '#000' }}
                    >
                      {item.badge}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <span className={cn('text-[10px]', item.isActive ? 'font-semibold' : 'font-medium')}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
```

**Key changes:**

- `bg-white/80 backdrop-blur-xl` for frosted glass
- Cart badge uses `primaryColor` instead of hardcoded `bg-red-500`
- Framer Motion `AnimatePresence` + spring bounce on badge update
- `border-neutral-100` instead of `border-gray-100`
- Shadow refined: `shadow-[0_-1px_3px_rgba(0,0,0,0.05)]`

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/tenant/BottomNav.tsx
git commit -m "refactor: redesign BottomNav with frosted glass + animated badge"
```

---

### Task 3: MenuItemCard Redesign — Image-Forward Horizontal Layout

Redesign the menu item card with consistent horizontal layout, tenant-branded colors, press animation, and a callback for opening the detail sheet.

**Files:**

- Modify: `src/components/tenant/MenuItemCard.tsx`

**Context:** Current card (381 lines) has text-left/image-right layout with floating add button. New design: image-left (96×96 rounded-xl), content-right, + button or quantity controls. Tap body opens detail sheet. Tap + adds directly. In-cart items show left border accent.

**Step 1: Rewrite MenuItemCard**

The component needs these changes:

1. Add `onOpenDetail?: () => void` prop — called when tapping the card body
2. New horizontal layout: image LEFT (96×96), content RIGHT
3. Remove variant dropdown and modifier pills from the card (moved to bottom sheet)
4. Add left border accent when item is in cart
5. Press animation: `active:scale-[0.98]` transition
6. Replace all hardcoded amber/gray colors with tenant primary or neutral
7. Simplify the add button to just a circular `+` using tenant primary
8. When in cart: show `[-] count [+]` quantity controls in the button area

**Props interface update:**

```tsx
interface MenuItemCardProps {
  item: MenuItem;
  restaurantId: string;
  priority?: boolean;
  category?: string;
  language?: 'fr' | 'en';
  currency?: string;
  onOpenDetail?: () => void;
}
```

**Card layout structure:**

```tsx
<div
  onClick={onOpenDetail}
  className={cn(
    'bg-white rounded-2xl border shadow-sm transition-all active:scale-[0.98] cursor-pointer',
    cartItem
      ? 'border-l-[3px] border-neutral-100'
      : 'border-neutral-100 hover:shadow-md',
    item.is_available === false && 'opacity-50 pointer-events-none',
  )}
  style={cartItem ? { borderLeftColor: 'var(--tenant-primary)' } : undefined}
>
  <div className="flex items-start gap-3 p-3">
    {/* Image - LEFT */}
    <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-100">
      {item.image_url && !imageError ? (
        <Image ... />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <FallbackIcon className="w-8 h-8 text-neutral-300" />
        </div>
      )}
    </div>

    {/* Content - RIGHT */}
    <div className="flex-1 min-w-0 flex flex-col justify-between h-24">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold text-sm text-neutral-900 line-clamp-1">{name}</h3>
          {item.is_vegetarian && <Leaf className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
          {item.is_spicy && <Flame className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        </div>
        <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{description}</p>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <span className="font-bold text-sm" style={{ color: 'var(--tenant-primary)' }}>
          {formatPrice(currentPrice, currency, locale)}
        </span>

        {/* Add / Quantity button */}
        <div onClick={(e) => e.stopPropagation()}>
          {cartItem ? (
            <QuantityControls ... />
          ) : (
            <AddButton onClick={handleAdd} />
          )}
        </div>
      </div>
    </div>
  </div>

  {/* Unavailable overlay */}
  {item.is_available === false && (
    <div className="absolute inset-0 bg-white/60 rounded-2xl flex items-center justify-center">
      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
        {t('unavailable')}
      </span>
    </div>
  )}
</div>
```

**Add button (circular, tenant primary):**

```tsx
<button
  onClick={handleQuickAdd}
  className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-transform active:scale-90"
  style={{ backgroundColor: 'var(--tenant-primary)' }}
>
  <Plus className="w-4 h-4" />
</button>
```

**Quantity controls:**

```tsx
<div
  className="flex items-center gap-2 rounded-full px-1 py-0.5"
  style={{ backgroundColor: 'var(--tenant-primary-10)' }}
>
  <button
    onClick={handleDecrement}
    className="w-7 h-7 rounded-full flex items-center justify-center"
    style={{ backgroundColor: 'var(--tenant-primary)' }}
  >
    <Minus className="w-3.5 h-3.5 text-white" />
  </button>
  <span className="text-sm font-bold min-w-[20px] text-center">{cartItem.quantity}</span>
  <button
    onClick={handleIncrement}
    className="w-7 h-7 rounded-full flex items-center justify-center"
    style={{ backgroundColor: 'var(--tenant-primary)' }}
  >
    <Plus className="w-3.5 h-3.5 text-white" />
  </button>
</div>
```

**Important:** The quick add (clicking +) should add the item with default variant/option (first one). Choosing specific variants/modifiers is done in the bottom sheet (Task 4).

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/components/tenant/MenuItemCard.tsx
git commit -m "refactor: redesign MenuItemCard with image-forward horizontal layout"
```

---

### Task 4: Item Detail Bottom Sheet — New Component

Create the `ItemDetailSheet` component — a Framer Motion bottom sheet that shows full item details with variants, modifiers, special instructions, and add-to-cart.

**Files:**

- Create: `src/components/tenant/ItemDetailSheet.tsx`

**Context:** This replaces the variant/modifier UI that was removed from MenuItemCard. Triggered when user taps a card body. Uses Framer Motion for spring animation, portal rendering, body scroll lock.

**Step 1: Create ItemDetailSheet.tsx**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { X, Plus, Minus, Leaf, Flame, AlertTriangle, Utensils, Wine, Check } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useCart } from '@/contexts/CartContext';
import type { MenuItem, ItemOption, ItemPriceVariant, ItemModifier } from '@/types/admin.types';
import { cn } from '@/lib/utils';
```

**Props:**

```tsx
interface ItemDetailSheetProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  category?: string;
  currency?: string;
}
```

**State:**

```tsx
const [selectedOption, setSelectedOption] = useState<ItemOption | null>(null);
const [selectedVariant, setSelectedVariant] = useState<ItemPriceVariant | null>(null);
const [selectedModifiers, setSelectedModifiers] = useState<ItemModifier[]>([]);
const [quantity, setQuantity] = useState(1);
const [notes, setNotes] = useState('');
const [imageError, setImageError] = useState(false);
const [showSuccess, setShowSuccess] = useState(false);
```

**Effects:**

- Reset state when `item` changes (new item opened)
- Initialize default variant/option from item data
- Lock body scroll when open: `document.body.style.overflow = 'hidden'`
- Cleanup: restore body scroll on unmount/close

**Price calculation:**

```tsx
const currentPrice = useMemo(() => {
  const base = selectedVariant?.variant_price ?? item?.price ?? 0;
  const modTotal = selectedModifiers.reduce((sum, m) => sum + (m.price_adjustment || 0), 0);
  return (base + modTotal) * quantity;
}, [selectedVariant, selectedModifiers, quantity, item]);
```

**JSX structure:**

```tsx
<AnimatePresence>
  {isOpen && item && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-[60]"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl max-h-[90vh] flex flex-col"
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 bg-neutral-200 rounded-full" />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {/* Hero image */}
          <div className="relative w-full aspect-video bg-neutral-100 mx-auto max-w-lg">
            {item.image_url && !imageError ? (
              <Image
                src={item.image_url}
                alt={item.name}
                fill
                className="object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <FallbackIcon className="w-12 h-12 text-neutral-300" />
              </div>
            )}
          </div>

          <div className="px-5 py-4 space-y-5 max-w-lg mx-auto">
            {/* Title + close */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-neutral-900">{name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {item.is_vegetarian && (
                    <Badge icon={Leaf} label={t('vegetarian')} color="green" />
                  )}
                  {item.is_spicy && <Badge icon={Flame} label={t('spicy')} color="red" />}
                  {item.allergens?.length > 0 && (
                    <Badge icon={AlertTriangle} label={t('allergenWarning')} color="orange" />
                  )}
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-neutral-100">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-neutral-600 leading-relaxed">{description}</p>

            {/* Variants (radio) */}
            {hasVariants && (
              <section>
                <h3 className="text-sm font-semibold text-neutral-900 mb-2">{t('size')}</h3>
                <div className="space-y-2">
                  {item.price_variants.map((variant) => (
                    <label
                      key={variant.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors',
                        selectedVariant?.id === variant.id
                          ? 'border-2'
                          : 'border-neutral-100 hover:border-neutral-200',
                      )}
                      style={
                        selectedVariant?.id === variant.id
                          ? { borderColor: 'var(--tenant-primary)' }
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                            selectedVariant?.id === variant.id ? '' : 'border-neutral-300',
                          )}
                          style={
                            selectedVariant?.id === variant.id
                              ? { borderColor: 'var(--tenant-primary)' }
                              : undefined
                          }
                        >
                          {selectedVariant?.id === variant.id && (
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: 'var(--tenant-primary)' }}
                            />
                          )}
                        </div>
                        <span className="text-sm font-medium">{variantName}</span>
                      </div>
                      <span
                        className="text-sm font-bold"
                        style={{ color: 'var(--tenant-primary)' }}
                      >
                        {formatPrice(variant.variant_price, currency, locale)}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {/* Modifiers (checkbox) */}
            {hasModifiers && (
              <section>
                <h3 className="text-sm font-semibold text-neutral-900 mb-2">{t('extras')}</h3>
                <div className="space-y-2">
                  {item.modifiers.map((mod) => {
                    const isSelected = selectedModifiers.some((m) => m.id === mod.id);
                    return (
                      <label
                        key={mod.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors',
                          isSelected ? 'border-2' : 'border-neutral-100 hover:border-neutral-200',
                        )}
                        style={isSelected ? { borderColor: 'var(--tenant-primary)' } : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-5 h-5 rounded-lg border-2 flex items-center justify-center',
                              isSelected ? '' : 'border-neutral-300',
                            )}
                            style={
                              isSelected
                                ? {
                                    borderColor: 'var(--tenant-primary)',
                                    backgroundColor: 'var(--tenant-primary)',
                                  }
                                : undefined
                            }
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-sm font-medium">{mod.name}</span>
                        </div>
                        <span className="text-sm text-neutral-500">
                          +{formatPrice(mod.price_adjustment, currency, locale)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Special instructions */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                {t('specialInstructions')}
              </h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('specialInstructionsPlaceholder')}
                className="w-full p-3 rounded-xl border border-neutral-100 text-sm resize-none h-20 focus:outline-none focus:border-neutral-300"
              />
            </section>
          </div>
        </div>

        {/* Sticky footer */}
        <div
          className="border-t border-neutral-100 px-5 py-4 bg-white"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}
        >
          <div className="flex items-center gap-4 max-w-lg mx-auto">
            {/* Quantity */}
            <div className="flex items-center gap-2 rounded-full px-1 py-1 bg-neutral-100">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold min-w-[24px] text-center">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Add to cart button */}
            <button
              onClick={handleAddToCart}
              className="flex-1 h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              {showSuccess ? (
                <>
                  <Check className="w-5 h-5" /> {t('addToCart')}
                </>
              ) : (
                <>
                  {t('addToCart')} · {formatPrice(currentPrice, currency, locale)}
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )}
</AnimatePresence>
```

**handleAddToCart:**

```tsx
const handleAddToCart = useCallback(() => {
  if (!item) return;
  const cartItem = {
    id: item.id,
    name: item.name,
    name_en: item.name_en,
    price: selectedVariant?.variant_price ?? item.price,
    image_url: item.image_url,
    quantity,
    category_name: category,
    selectedOption: selectedOption
      ? { name_fr: selectedOption.name_fr, name_en: selectedOption.name_en }
      : undefined,
    selectedVariant: selectedVariant
      ? {
          name_fr: selectedVariant.variant_name_fr,
          name_en: selectedVariant.variant_name_en,
          price: selectedVariant.variant_price,
        }
      : undefined,
    modifiers: selectedModifiers.map((m) => ({ name: m.name, price: m.price_adjustment || 0 })),
    customerNotes: notes || undefined,
  };
  addToCart(cartItem, restaurantId);
  setShowSuccess(true);
  setTimeout(() => {
    setShowSuccess(false);
    onClose();
  }, 600);
}, [
  item,
  selectedVariant,
  selectedOption,
  selectedModifiers,
  quantity,
  notes,
  addToCart,
  restaurantId,
  onClose,
  category,
]);
```

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/components/tenant/ItemDetailSheet.tsx
git commit -m "feat: add ItemDetailSheet bottom sheet component"
```

---

### Task 5: CategoryNav Enhancement — Cleaner Pills + Smoother Animations

Refine the category navigation with cleaner pill styling, neutral color palette, and Framer Motion `layoutId` for the active indicator sliding animation.

**Files:**

- Modify: `src/components/tenant/CategoryNav.tsx`

**Context:** Current CategoryNav (152 lines) uses inline styles for active state, `bg-gray-100` inactive. Needs: `rounded-full` pills, neutral palette, smooth `layoutId` animation for active background.

**Key changes:**

1. Import `motion` from `framer-motion`
2. Add `layoutId` animated background behind active pill:

```tsx
<button
  key={cat.id}
  onClick={() => scrollToCategory(cat.id)}
  className="relative px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
>
  {activeCategory === cat.id && (
    <motion.div
      layoutId="activeCategoryPill"
      className="absolute inset-0 rounded-full"
      style={{ backgroundColor: 'var(--tenant-primary)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    />
  )}
  <span
    className={cn('relative z-10', activeCategory === cat.id ? 'text-white' : 'text-neutral-600')}
  >
    {cat.name}
  </span>
</button>
```

3. Container: `bg-white/80 backdrop-blur-xl` (frosted glass, matching nav)
4. Remove hardcoded `bg-gray-200` borders → `border-neutral-100`
5. Pill gap: `gap-2`, padding: `px-4 py-3`

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/components/tenant/CategoryNav.tsx
git commit -m "refactor: enhance CategoryNav with layoutId pill animation"
```

---

### Task 6: ClientMenuPage Layout Overhaul

Major restructure of the main menu page layout with frosted glass header, integrated bottom sheet, simplified structure, and new page background.

**Files:**

- Modify: `src/components/tenant/ClientMenuPage.tsx`
- Modify: `src/app/sites/[site]/layout.tsx` (page background)

**Context:** Current ClientMenuPage (462 lines) has: header, AdsSlider, ClientShortcuts, venues, menu tabs, sub-menu tabs, CategoryNav, items grid, CartSummary FAB, TablePicker, QRScanner, InstallPrompt, BottomNav. CartSummary already removed in Task 1.

**Key changes:**

1. **Add ItemDetailSheet integration:**

```tsx
import ItemDetailSheet from './ItemDetailSheet';

// State
const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

// In JSX
<ItemDetailSheet
  item={selectedItem}
  isOpen={!!selectedItem}
  onClose={() => setSelectedItem(null)}
  restaurantId={tenant.id}
  currency={tenant.currency}
/>;
```

2. **Pass `onOpenDetail` to MenuItemCard:**

```tsx
<MenuItemCard
  key={item.id}
  item={item}
  restaurantId={tenant.id}
  currency={tenant.currency}
  onOpenDetail={() => setSelectedItem(item)}
  priority={index < 4}
  category={categoryName}
/>
```

3. **Header — frosted glass:**

```tsx
<header className="sticky top-0 z-40">
  <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-b border-neutral-100" />
  <div className="relative flex items-center justify-between px-4 py-3">
    <div className="flex items-center gap-3">
      {tenant.logo_url ? (
        <Image
          src={tenant.logo_url}
          alt={tenant.name}
          width={32}
          height={32}
          className="rounded-lg"
        />
      ) : (
        <span className="font-bold text-lg" style={{ color: 'var(--tenant-primary)' }}>
          {tenant.name}
        </span>
      )}
      {!tenant.logo_url && tenant.name && (
        <span className="text-sm font-semibold text-neutral-900 truncate">{tenant.name}</span>
      )}
    </div>
    {tableNumber && (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 rounded-full">
        <span className="text-xs font-semibold text-neutral-700">Table {tableNumber}</span>
      </div>
    )}
  </div>
</header>
```

4. **Page background:** Change `bg-gray-50` to `bg-[#FAFAFA]` in layout
5. **Venues → Cleaner pills with tenant primary active state** (replace `bg-gray-900`)
6. **Menu tabs → Cleaner underline style** (replace `bg-gray-900`)
7. **Sub-menu tabs → Neutral-based** (replace `bg-gray-700`)
8. **Items grid:** `grid-cols-1 md:grid-cols-2` (remove lg:grid-cols-3 for cleaner look)
9. **Category headers:** Add subtle section labels between categories
10. **Bottom padding:** `pb-32` to account for BottomNav

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/components/tenant/ClientMenuPage.tsx src/app/sites/[site]/layout.tsx
git commit -m "refactor: overhaul ClientMenuPage layout with frosted glass + ItemDetailSheet"
```

---

### Task 7: Cart Page Redesign

Full redesign of the cart page with compact item rows, promo code section, tenant-branded buttons, and refined summary card.

**Files:**

- Modify: `src/app/sites/[site]/cart/page.tsx`

**Context:** Current cart page (389 lines) uses hardcoded `amber-600` buttons, basic layout. Needs: tenant-branded everything, compact rows with 48px thumbnails, promo code, cleaner summary.

**Key changes:**

1. **Replace ALL `amber-600/700` with tenant primary:**

```tsx
// OLD:
className="bg-amber-600 hover:bg-amber-700"
// NEW:
style={{ backgroundColor: 'var(--tenant-primary)' }}
className="text-white font-semibold"
```

2. **Cart item rows — compact:**

```tsx
<div className="bg-white rounded-2xl border border-neutral-100 divide-y divide-neutral-50">
  {items.map(item => (
    <div key={item.id} className="flex items-center gap-3 p-4">
      {/* Thumbnail 48×48 */}
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-100">
        {item.image_url ? <Image .../> : <Utensils className="w-5 h-5 text-neutral-300" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-neutral-900 truncate">{item.name}</h3>
        {(item.selectedVariant || item.modifiers?.length) && (
          <p className="text-xs text-neutral-400 truncate">{optionText}</p>
        )}
      </div>

      {/* Quantity + Price */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-sm font-bold min-w-[20px] text-center">{item.quantity}</span>
          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="text-sm font-bold min-w-[60px] text-right" style={{ color: 'var(--tenant-primary)' }}>
          {formatPrice(item.price * item.quantity)}
        </span>
      </div>
    </div>
  ))}
</div>
```

3. **Promo code section:**

```tsx
<div className="bg-white rounded-2xl border border-neutral-100 p-4">
  <h3 className="text-sm font-semibold text-neutral-900 mb-3">{t('promoCode')}</h3>
  <div className="flex gap-2">
    <input
      type="text"
      placeholder={t('promoCodePlaceholder')}
      value={couponCode}
      onChange={(e) => setCouponCode(e.target.value)}
      className="flex-1 px-3 py-2 rounded-xl border border-neutral-100 text-sm focus:outline-none focus:border-neutral-300"
    />
    <button
      onClick={handleApplyCoupon}
      className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
      style={{ backgroundColor: 'var(--tenant-primary)' }}
    >
      {t('apply')}
    </button>
  </div>
  {appliedCoupon && (
    <div className="mt-2 flex items-center gap-2 text-green-600 text-xs">
      <Check className="w-3.5 h-3.5" /> -{formatPrice(appliedCoupon.discountAmount)}
    </div>
  )}
</div>
```

4. **Summary card — clean breakdown:**

```tsx
<div className="bg-white rounded-2xl border border-neutral-100 p-5">
  <div className="space-y-2 text-sm">
    <div className="flex justify-between text-neutral-600">
      <span>{t('subtotal')}</span>
      <span>{formatPrice(pricing.subtotal)}</span>
    </div>
    {pricing.discountAmount > 0 && (
      <div className="flex justify-between text-green-600">
        <span>{t('discount')}</span>
        <span>-{formatPrice(pricing.discountAmount)}</span>
      </div>
    )}
    {pricing.taxAmount > 0 && (
      <div className="flex justify-between text-neutral-600">
        <span>{t('tax')}</span>
        <span>{formatPrice(pricing.taxAmount)}</span>
      </div>
    )}
    <div className="border-t border-neutral-100 pt-2 mt-2">
      <div className="flex justify-between items-baseline">
        <span className="font-bold text-neutral-900">{t('total')}</span>
        <span className="text-xl font-bold" style={{ color: 'var(--tenant-primary)' }}>
          {formatPrice(pricing.total)}
        </span>
      </div>
    </div>
  </div>

  <button
    onClick={handleSubmit}
    disabled={isSubmitting}
    className="w-full h-12 rounded-xl text-white font-semibold mt-4 transition-transform active:scale-[0.98] disabled:opacity-50"
    style={{ backgroundColor: 'var(--tenant-primary)' }}
  >
    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t('confirmOrder')}
  </button>

  <button
    onClick={clearCart}
    className="w-full text-sm text-neutral-400 mt-3 hover:text-neutral-600"
  >
    {t('clearCart')}
  </button>
</div>
```

5. **Header — frosted glass:**

```tsx
<header className="sticky top-0 z-40">
  <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-b border-neutral-100" />
  <div className="relative flex items-center gap-3 px-4 py-3">
    <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-neutral-100">
      <ArrowLeft className="w-5 h-5" />
    </button>
    <h1 className="text-lg font-bold">
      {t('yourCart')} ({totalItems})
    </h1>
  </div>
</header>
```

6. **Success screen — use tenant primary accent, add tenant i18n keys**
7. **Empty state — use t('emptyCart'), t('emptyCartDesc'), t('browseMenu')**

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 3: Commit**

```bash
git add src/app/sites/[site]/cart/page.tsx
git commit -m "refactor: redesign cart page with tenant branding + promo code"
```

---

### Task 8: Order Tracking Redesign — Progress Bar + Expanded/Collapsed States

Redesign order tracking with a visual step progress bar, expanded active orders, collapsed past orders, and Framer Motion animations.

**Files:**

- Create: `src/components/tenant/OrderProgressBar.tsx`
- Modify: `src/components/tenant/ClientOrders.tsx`

**Step 1: Create OrderProgressBar.tsx**

A visual step progress indicator showing order status progression.

```tsx
'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface OrderProgressBarProps {
  status: string;
}

const STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'served'] as const;

export default function OrderProgressBar({ status }: OrderProgressBarProps) {
  const t = useTranslations('tenant');
  const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  const stepLabels = {
    pending: t('orderSentStep'),
    confirmed: t('confirmedStep'),
    preparing: t('preparingStep'),
    ready: t('readyStep'),
    served: t('servedStep'),
  };

  return (
    <div className="flex items-center justify-between w-full py-3">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-initial">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                  isCompleted && 'bg-green-500 text-white',
                  isActive && 'text-white',
                  isFuture && 'bg-neutral-100 text-neutral-400',
                )}
                style={isActive ? { backgroundColor: 'var(--tenant-primary)' } : undefined}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : isActive ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-2.5 h-2.5 rounded-full bg-white"
                  />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-[9px] font-medium whitespace-nowrap',
                  isActive ? 'text-neutral-900' : 'text-neutral-400',
                )}
              >
                {stepLabels[step]}
              </span>
            </div>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-1.5 mt-[-14px]">
                <div
                  className={cn(
                    'h-full rounded-full transition-colors',
                    isCompleted ? 'bg-green-500' : 'bg-neutral-100',
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Refactor ClientOrders.tsx**

Key changes to `ClientOrders.tsx`:

1. Import `OrderProgressBar` and `motion` from framer-motion
2. Split orders into `activeOrders` (pending/confirmed/preparing/ready) and `pastOrders` (served/cancelled)
3. Active orders: expanded with full OrderProgressBar
4. Past orders: collapsed, tap to expand
5. Replace hardcoded status badge colors with cleaner design
6. Replace `bg-amber-500` → tenant primary where applicable
7. Animate order cards with `motion.div` layout animation

```tsx
const activeOrders = orders.filter((o) => !['served', 'cancelled'].includes(o.status));
const pastOrders = orders.filter((o) => ['served', 'cancelled'].includes(o.status));

// Active order card
<motion.div layout className="bg-white rounded-2xl border border-neutral-100 p-4 space-y-3">
  <div className="flex items-center justify-between">
    <h3 className="font-bold text-sm">{t('orderNumber', { number: order.order_number })}</h3>
    <span className="text-xs text-neutral-400">{timeAgo}</span>
  </div>
  <OrderProgressBar status={order.status} />
  {/* Items list */}
  {/* Total */}
  {/* Cancel button for pending */}
</motion.div>;
```

**Step 3: Update orders page header**

In `src/app/sites/[site]/orders/page.tsx`:

- Apply frosted glass header (same pattern as cart page)

**Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 5: Commit**

```bash
git add src/components/tenant/OrderProgressBar.tsx src/components/tenant/ClientOrders.tsx src/app/sites/[site]/orders/page.tsx
git commit -m "refactor: redesign order tracking with progress bar + card animations"
```

---

### Task 9: Search Overlay

Create a full-screen search overlay triggered by the search button in BottomNav.

**Files:**

- Create: `src/components/tenant/SearchOverlay.tsx`
- Modify: `src/components/tenant/ClientMenuPage.tsx` (wire search)

**Step 1: Create SearchOverlay.tsx**

```tsx
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowLeft } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { MenuItem } from '@/types/admin.types';
import MenuItemCard from './MenuItemCard';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  items: MenuItem[];
  restaurantId: string;
  currency?: string;
  onOpenDetail: (item: MenuItem) => void;
}

export default function SearchOverlay({
  isOpen,
  onClose,
  items,
  restaurantId,
  currency,
  onOpenDetail,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('tenant');
  const locale = useLocale();
  const language = locale.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.name_en?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.description_en?.toLowerCase().includes(q),
    );
  }, [query, items]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed inset-0 z-[55] bg-[#FAFAFA] flex flex-col"
        >
          {/* Search header */}
          <div className="sticky top-0 z-10 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-3">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-neutral-100">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-neutral-100 rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchMenu')}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')}>
                  <X className="w-4 h-4 text-neutral-400" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 space-y-3">
            {query && results.length === 0 && (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-neutral-200 mx-auto mb-3" />
                <p className="text-sm text-neutral-500">{t('noSearchResults', { query })}</p>
              </div>
            )}
            {results.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                restaurantId={restaurantId}
                currency={currency}
                language={language}
                onOpenDetail={() => onOpenDetail(item)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Wire into ClientMenuPage**

```tsx
import SearchOverlay from './SearchOverlay';

// State
const [isSearchOpen, setIsSearchOpen] = useState(false);

// Flatten all items for search
const allItems = useMemo(() => itemsByCategory.flatMap(cat => cat.items), [itemsByCategory]);

// JSX
<SearchOverlay
  isOpen={isSearchOpen}
  onClose={() => setIsSearchOpen(false)}
  items={allItems}
  restaurantId={tenant.id}
  currency={tenant.currency}
  onOpenDetail={(item) => { setIsSearchOpen(false); setSelectedItem(item); }}
/>

// Pass to BottomNav
<BottomNav tenantSlug={...} primaryColor={...} onSearchClick={() => setIsSearchOpen(true)} />
```

**Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 4: Commit**

```bash
git add src/components/tenant/SearchOverlay.tsx src/components/tenant/ClientMenuPage.tsx
git commit -m "feat: add SearchOverlay with full-screen menu search"
```

---

### Task 10: Skeleton Loading + Supporting Component Cleanup

Add skeleton loading cards and clean up supporting components (AdsSlider, TablePicker, ClientShortcuts, ClientSettings) to match the new design system.

**Files:**

- Create: `src/components/tenant/SkeletonCard.tsx`
- Modify: `src/components/tenant/ClientMenuPage.tsx` (add skeletons)
- Modify: `src/components/tenant/AdsSlider.tsx` (styling cleanup)
- Modify: `src/components/tenant/TablePicker.tsx` (replace amber-500)
- Modify: `src/components/tenant/ClientShortcuts.tsx` (neutral palette)
- Modify: `src/components/tenant/ClientSettings.tsx` (neutral palette)
- Modify: `src/app/sites/[site]/settings/page.tsx` (frosted glass header)

**Step 1: Create SkeletonCard.tsx**

```tsx
export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-100 p-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-24 h-24 rounded-xl bg-neutral-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-neutral-100 rounded-lg w-3/4" />
          <div className="h-3 bg-neutral-100 rounded-lg w-full" />
          <div className="h-3 bg-neutral-100 rounded-lg w-1/2" />
          <div className="h-4 bg-neutral-100 rounded-lg w-1/4 mt-3" />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Use skeletons in ClientMenuPage**

Replace the current empty/loading state with skeleton cards:

```tsx
{
  /* While loading, show skeletons */
}
{
  isLoading && (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
```

**Step 3: AdsSlider cleanup**

- Change `rounded-xl` to `rounded-2xl`
- Change `shadow-sm` to `shadow-none border border-neutral-100`
- Dot indicators: keep as-is (already clean)

**Step 4: TablePicker — replace amber-500**

Replace in `TablePicker.tsx`:

```tsx
// OLD:
className="bg-amber-500 text-white"
// NEW:
className="text-white"
style={{ backgroundColor: 'var(--tenant-primary)' }}
```

Also replace `bg-gray-900 text-white` zone selection → keep as neutral dark for zones (this is fine) but table selection uses tenant primary.

**Step 5: ClientShortcuts cleanup**

- Replace `border-gray-100` → `border-neutral-100`
- Replace `text-gray-600` → `text-neutral-500`
- Keep the `style={{ color: primaryColor }}` on icons (already correct)

**Step 6: ClientSettings cleanup**

- Replace `border-gray-100` → `border-neutral-100`
- Replace `text-gray-600` → `text-neutral-500`
- Replace `bg-gray-50` → `bg-neutral-50`
- Green active dot: keep (semantic color, not branding)

**Step 7: Settings page header — frosted glass**

Same pattern as cart/orders pages.

**Step 8: Verify**

Run: `pnpm typecheck && pnpm lint`

**Step 9: Commit**

```bash
git add -A
git commit -m "refactor: add skeleton loading, clean up supporting components"
```

---

### Verification Checklist

After all 10 tasks, run the full verification:

```bash
pnpm typecheck    # TypeScript strict mode
pnpm lint         # ESLint 0 errors, 0 warnings
pnpm test         # All 395 tests pass
pnpm build        # Next.js production build
```

### Files Created (4 new)

- `src/components/tenant/ItemDetailSheet.tsx`
- `src/components/tenant/OrderProgressBar.tsx`
- `src/components/tenant/SearchOverlay.tsx`
- `src/components/tenant/SkeletonCard.tsx`

### Files Deleted (1)

- `src/components/tenant/CartSummary.tsx`

### Files Modified (~16)

- All 8 locale files (i18n keys)
- `src/components/tenant/ClientMenuPage.tsx`
- `src/components/tenant/MenuItemCard.tsx`
- `src/components/tenant/BottomNav.tsx`
- `src/components/tenant/CategoryNav.tsx`
- `src/components/tenant/ClientOrders.tsx`
- `src/components/tenant/AdsSlider.tsx`
- `src/components/tenant/TablePicker.tsx`
- `src/components/tenant/ClientShortcuts.tsx`
- `src/components/tenant/ClientSettings.tsx`
- `src/app/sites/[site]/cart/page.tsx`
- `src/app/sites/[site]/orders/page.tsx`
- `src/app/sites/[site]/settings/page.tsx`
- `src/app/sites/[site]/layout.tsx`

# Client-Facing Experience Redesign — Design Document

**Date:** 2026-02-28
**Status:** Approved
**Direction:** "Uber Eats Elevated" — proven food-ordering UX patterns elevated with premium minimal aesthetics

## Goals

- Full overhaul of the customer-facing experience (QR scan → order → track)
- Premium minimal visual language suitable for upscale restaurants (Radisson, Blue Table)
- Image-forward design (restaurants will have photos for most items)
- Bottom sheet item detail view (tap card → slide-up detail with variants/modifiers)
- Zero learning curve — customers recognize patterns from delivery apps
- Consistent tenant branding throughout (no hardcoded colors)

## Design System & Visual Language

### Typography

- **Font:** Inter (via Next.js font optimization)
- Headings: Inter 600 (semibold), `tracking-tight`
- Body: Inter 400, 14-16px
- Price: Inter 700 (bold), tenant primary color
- Captions: Inter 500, 12px, neutral-500

### Color System

- All accent colors via CSS custom properties (`--tenant-primary`, `--tenant-secondary`)
- Eliminate all hardcoded `amber-600` — use tenant branding everywhere
- Backgrounds: `#FFFFFF` (cards) + `#FAFAFA` (sections/page bg)
- Text: neutral-900 (headings), neutral-600 (body), neutral-400 (captions)
- Borders: neutral-100 (subtle), neutral-200 (hover)

### Spacing

- Container padding: 16px (mobile), 24px (tablet+)
- Card gap: 12px
- Section gap: 32px
- Inner card padding: 12-16px

### Border Radius

- Cards: 16px (`rounded-2xl`)
- Buttons: 12px (`rounded-xl`)
- Pills/badges: 9999px (`rounded-full`)
- Images: 12px (`rounded-xl`)

### Shadows

- Cards: `shadow-sm` (rest) → `shadow-md` (hover)
- Bottom sheet: `shadow-2xl`
- Bottom nav: `shadow-[0_-1px_3px_rgba(0,0,0,0.05)]`

## Menu Page Layout

### Header (sticky, blur backdrop)

- Logo (32px) + restaurant name + table badge (if selected)
- `backdrop-blur-xl bg-white/80` for frosted glass effect
- Minimal — no search here (search lives in bottom nav)

### Hero Area

- Ad carousel (full-width, `rounded-2xl`, 16:9 aspect ratio)
- Auto-rotate 5s, dot indicators
- If no ads: restaurant hero banner or skip section

### Quick Actions

- 2-3 column grid: Dine In, Takeaway, Call Waiter
- Clean icon + label, subtle border, rounded-2xl
- Active press scale feedback

### Venue Selector (conditional)

- Horizontal scroll pills (only if `venues.length > 1`)
- "All" default + venue names
- Active: tenant primary bg + white text

### Menu/Sub-menu Tabs (conditional)

- Horizontal tabs (only if multiple menus)
- Clean underline style or pill toggle

### Category Navigation (sticky)

- Horizontal scroll pills below header
- Intersection Observer scroll sync (existing pattern, refined)
- Active pill: tenant primary bg + white text
- Inactive: neutral-100 bg + neutral-600 text
- Smooth scroll centering on active change

### Menu Items Grid

- Single column list (mobile) — horizontal cards
- 2-column grid (tablet+) — can switch to vertical cards
- Each card: image left (96×96), text + price + add button right
- Category section headers with subtle divider

### Bottom Navigation (fixed, frosted glass)

- 4 items: Menu, Search, Cart (with badge), Orders
- `backdrop-blur-xl bg-white/80`
- Active: tenant primary color
- Cart badge: tenant primary bg, white text, bounce animation on update
- Safe area inset padding

### Remove floating FAB

- Cart button in bottom nav only — no duplication

## Menu Item Card

### Layout: Horizontal (image left, content right)

- Image: 96×96px, `rounded-xl`, lazy-loaded
- No-image fallback: category-appropriate icon on neutral-100 bg
- Name: Inter 600, 14px, line-clamp-2
- Description: Inter 400, 13px, neutral-500, line-clamp-2
- Price: Inter 700, 14px, tenant primary color
- Diet badges: 🍃 🔥 ⚠️ inline with name
- Add button: circular, tenant primary bg, "+" icon

### States

- **Default:** White bg, neutral-100 border, shadow-sm
- **In cart:** Subtle left border (3px) in tenant primary, quantity controls replace "+"
- **Unavailable:** 50% opacity, red "Indisponible" badge, no add button
- **Pressed:** `scale-[0.98]` transition (100ms)

### Interactions

- Tap card body → open bottom sheet detail
- Tap [+] button → add to cart directly (prevent event propagation)
- Tap [-]/[+] on in-cart items → adjust quantity inline

## Bottom Sheet — Item Detail

### Structure

- Drag handle indicator at top
- Hero image: full-width, 200px height, 16:9 aspect ratio, rounded-t-2xl
- No-image: gradient bg with category icon
- Title + close button (×)
- Diet badges row
- Full description (no truncation)
- Variants section (radio buttons with prices)
- Modifiers section (checkboxes with prices)
- Special instructions textarea (optional)
- Sticky footer: quantity selector + live price + "Add to cart" CTA

### Behavior

- Spring animation via Framer Motion (`stiffness: 300, damping: 30`)
- Backdrop: `bg-black/40`
- Swipe down to dismiss
- Content scrollable, footer sticky
- Price updates live as options change
- "Add to cart" → brief checkmark animation → auto-close (300ms delay)
- If required variant not selected → button disabled with "Select size" text

### Implementation

- Use Radix Dialog or custom Framer Motion `AnimatePresence` + `motion.div`
- Portal rendering for z-index management
- Body scroll lock when open

## Cart Page

### Header

- Back arrow + "Your Cart" + item count

### Item List

- Compact rows: thumbnail (48×48) + name + options + quantity + price
- Swipe-to-delete gesture (mobile)
- Trash icon fallback (for non-touch)
- Inline quantity controls per item

### Notes Section

- Collapsible textarea: "Add a note (allergies, preferences...)"
- Character limit display

### Promo Code

- Input + "Apply" button
- Success: green badge with discount amount
- Error: red shake animation

### Summary Card

- Subtotal, discount (if any), tax (if enabled), service charge (if enabled)
- Divider
- Total in large bold text
- "Confirm Order" CTA: full-width, tenant primary bg
- "Clear Cart" secondary action (outline variant)

### Empty State

- Illustration/icon in soft circle
- "Your cart is empty" heading
- "Browse the menu" CTA → links back

### Mobile Sticky Footer

- Fixed bottom bar (above bottom nav safe area)
- Total + "Confirm Order" button
- Only visible when items exist

## Order Tracking

### Active Order (expanded)

- Order number + relative timestamp
- Visual step progress bar:
  - Steps: Sent → Confirmed → Preparing → Ready → Served
  - Active step: filled circle + pulse animation
  - Completed: filled circle + checkmark
  - Future: hollow circle
  - Connected by line (filled = done, dashed = pending)
- Item list summary
- Total
- Cancel button (pending only, with confirmation dialog)

### Past Orders (collapsed)

- Order number + status badge + total + timestamp
- Tap to expand details

### Real-time

- Supabase channel for live status updates
- Step animation when status changes
- Pull-to-refresh

### Empty State

- Icon + "No orders yet" + "Browse the menu" CTA

## Animations & Micro-interactions

Using Framer Motion (already in project dependencies):

| Interaction          | Animation                                 |
| -------------------- | ----------------------------------------- |
| Page transitions     | Fade + slight slide (150ms)               |
| Bottom sheet open    | Spring up (stiffness: 300, damping: 30)   |
| Bottom sheet close   | Ease out down (200ms)                     |
| Add to cart          | Button scale pulse (1→1.15→1) + checkmark |
| Cart badge update    | Badge bounce (scale 1→1.3→1, spring)      |
| Category pill active | Background slide with Framer `layoutId`   |
| Item card press      | Scale 0.98 (100ms ease)                   |
| Skeleton loading     | Shimmer gradient animation                |
| Status progress      | Dot pulse + smooth width transition       |
| Remove from cart     | Slide left + fade out                     |
| Price update         | Counter animation (number tick up/down)   |

## Components Affected

### Modify (major refactor)

- `ClientMenuPage.tsx` — Layout restructure, remove shortcuts grid, add search
- `MenuItemCard.tsx` — New horizontal layout, bottom sheet trigger
- `BottomNav.tsx` — Frosted glass, refined styling
- `CategoryNav.tsx` — Cleaner pills, smoother animations
- `AdsSlider.tsx` — Rounded corners, cleaner dots
- `CartSummary.tsx` — **Remove** (replaced by bottom nav cart)
- Cart page (`/sites/[site]/cart/page.tsx`) — Full redesign
- `ClientOrders.tsx` — Progress bar, expanded/collapsed states
- `ClientShortcuts.tsx` — Simplified, may merge into header area
- `ClientSettings.tsx` — Minor cleanup
- `TablePicker.tsx` — Cleaner styling to match new system

### Create (new components)

- `ItemDetailSheet.tsx` — Bottom sheet item detail
- `SkeletonCard.tsx` — Loading placeholder cards
- `OrderProgressBar.tsx` — Step progress visualization
- `SearchOverlay.tsx` — Full-screen search with results

### Keep (minimal changes)

- `QRScanner.tsx` — Works well, just restyle to match
- `InstallPrompt.tsx` — Update colors to match
- `TenantContext.tsx` — No changes
- `CartContext.tsx` — No changes (state management unchanged)
- `ThemeProvider.tsx` — May add more CSS custom properties

## Out of Scope

- Payment integration (future)
- Multi-language menu AI translation (future)
- Reservation system (future)
- Social features / reviews (future)

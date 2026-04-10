# DESIGN.md — Digital Menu App

# Visual Style: UberEats-inspired

# Screen: Home / Main Interface

# Platform: Mobile (iOS & Android)

---

## Overview

A premium digital menu home screen modeled after UberEats.
Clean, bold, modern. Heavy use of white surfaces with a strong
green accent. Large food imagery. Clear hierarchy.
The customer should feel confident and hungry within 2 seconds
of landing on this screen.

Mood: Bold. Appetizing. Trustworthy. Fast.
Inspiration: UberEats home screen (2024–2025 version).

---

## Colors

### Brand

- **Primary** (#06C167): UberEats signature green.
  Used for: active category pills, add buttons, cart button,
  price highlights, badges, active tab indicator.
- **Primary Dark** (#05A557): Pressed/hover state of primary.
- **Primary Light** (#E6F9F0): Tint background for selected
  states, light badges.

### Backgrounds

- **App Background** (#FFFFFF): Pure white. The entire app
  background is white — like UberEats.
- **Surface** (#FFFFFF): Cards, modals, bottom sheets.
- **Surface Alt** (#F6F6F6): Search bar background, secondary
  inputs, inactive pill backgrounds.
- **Divider** (#EEEEEE): Horizontal rules between sections.

### Text

- **Text Primary** (#1A1A1A): All titles, item names,
  restaurant names. Near-black, never pure black.
- **Text Secondary** (#737373): Descriptions, subtitles,
  cuisine type, metadata.
- **Text Muted** (#B0B0B0): Placeholder text, timestamps,
  ratings count.
- **Text On Primary** (#FFFFFF): Text on green buttons/badges.

### Semantic

- **Rating** (#FFB800): Star icons, rating scores.
- **Promo** (#FF3008): Discount tags, promotional banners
  (UberEats red for promos).
- **Success** (#06C167): Same as Primary — order confirmed.
- **Error** (#FF3008): Out of stock, validation errors.

---

## Typography

Font: **Inter**
Weights used: Regular (400), Medium (500), SemiBold (600), Bold (700).

### Scale

- **Hero Title** — 26px, Bold (700), Text Primary:
  Welcome headline at top of screen.
- **Section Title** — 20px, Bold (700), Text Primary:
  "Popular near you", "Categories", section headers.
- **Item Name** — 16px, SemiBold (600), Text Primary:
  Menu item name on card.
- **Restaurant Name** — 15px, SemiBold (600), Text Primary.
- **Description** — 13px, Regular (400), Text Secondary:
  Item description, always max 2 lines, truncated.
- **Price** — 15px, Bold (700), Text Primary:
  Item price. Dark text, not colored.
- **Label** — 11px, Medium (500), UPPERCASE, letter-spacing 1px:
  Section labels, filter chips, badge text.
- **Button Text** — 15px, SemiBold (600), Text On Primary.
- **Tab Label** — 11px, Medium (500): Bottom nav labels.

### Rules

- Line height: always 1.4x font size.
- Never use font size below 11px.
- Item names: max 2 lines. Never truncate price.
- Descriptions: always numberOfLines={2}.

---

## Spacing System

Base unit: 4px.

- **4px** — Micro gaps (icon to text, badge padding vertical)
- **8px** — Small gaps (between chips, inner compact padding)
- **12px** — Card inner padding, gap between list items
- **16px** — Standard screen horizontal padding (EVERYWHERE)
- **20px** — Between major sections
- **24px** — Modal inner padding, hero content padding
- **32px** — Large section separation
- **56px** — Bottom floating bar height
- **80px** — Bottom safe area (above tab bar + floating cart)

Rule: Screen left/right padding is ALWAYS 16px, no exceptions.

---

## Border Radius

- **0px** — Hero banner image (full bleed, edge to edge)
- **8px** — Small tags, allergen badges, promo chips
- **10px** — Search bar
- **12px** — Menu item cards, featured cards, item images
- **16px top-only** — Bottom sheet modals
- **24px** — Category pill chips
- **50px** — Round icon buttons, avatar

---

## Shadows

Minimal. Use borders instead of shadows for cards.

- **Card**: border 1px solid #EEEEEE — no shadow.
- **Floating Cart Button**:
  shadowColor #000, offset {0,4}, opacity 0.15, radius 12
  elevation 8 (Android)
- **Modal**:
  shadowColor #000, offset {0,-2}, opacity 0.08, radius 16
- No other shadows anywhere.

---

## Components

### Top Header Bar

- Background: white.
- Left: location pin icon (Primary green) + table name
  (Text Primary, SemiBold 15px) + chevron down.
- Right: profile avatar (40px circle).
- Height: 56px.
- Padding horizontal: 16px.
- No border, no shadow.

### Search Bar

- Height: 48px.
- Background: #F6F6F6.
- Border radius: 10px.
- No border line.
- Left: search icon 20px, Text Muted color.
- Placeholder: "Search for dishes or drinks", Text Muted.
- Margin: 8px top, 16px horizontal.

### Promotional Banner Carousel

- Full width, height 160px.
- Border radius: 12px.
- Horizontal scrolling carousel, auto-scroll every 4 seconds.
- Each card: background image + gradient overlay
  (transparent to rgba(0,0,0,0.5)).
- Text on image: promo label (Label, white) +
  promo title (20px Bold, white).
- Dot indicators at bottom center.
- Margin: 16px horizontal.

### Category Filter Bar

- Horizontal ScrollView, no scroll indicator.
- Each chip: padding 8px 16px, border radius 24px.
- Font: 11px Medium UPPERCASE.
- Inactive: background #F6F6F6, text #737373.
- Active: background #06C167, text white.
- Gap between chips: 8px.
- Left padding: 16px.
- Bar height: 40px.
- Margin top: 20px.

### Section Header Row

- Layout: row, space-between.
- Left: 20px Bold, Text Primary (section title).
- Right: "See all" — 14px SemiBold, Primary green.
- Margin: 20px top, 16px horizontal, 12px bottom.

### Menu Item Card (Vertical List — default)

- Background: white.
- Border: 1px solid #EEEEEE.
- Border radius: 12px.
- Margin bottom: 12px.
- Margin horizontal: 16px.
- Layout: row.
  LEFT (flex 1, padding 12px):
  - Category: 11px Medium UPPERCASE, Text Muted.
  - Name: 16px SemiBold, Text Primary, max 2 lines.
  - Description: 13px Regular, Text Secondary, max 2 lines.
  - Rating row: star icon (FFB800) + score + count.
  - Price: 15px Bold, Text Primary.
    RIGHT:
  - Image: 90x90px, border radius 12px, resizeMode cover.
  - "+" button: 28px circle, Primary green, white "+",
    absolute bottom-right of image, offset -8px each.

### Menu Item Card (Horizontal Scroll — Featured)

- Width: 160px fixed.
- Border: 1px solid #EEEEEE.
- Border radius: 12px.
- Image: full width, height 110px, border radius 12px top only.
- Content padding: 10px.
- Name: 14px SemiBold, max 2 lines.
- Price: 13px Bold.
- "Add" button: full width, height 32px, Primary green,
  border radius 8px.

### Item Detail Bottom Sheet

- Border radius: 16px top corners only.
- Background: white.
- Food image: full width, height 260px, resizeMode cover.
- Close button: 36px white circle, top-right, absolute.
- Content padding: 24px.
  - Category: Label, Primary green, uppercase.
  - Name: 22px Bold, Text Primary.
  - Description: 14px Regular, Text Secondary, full text.
  - Divider: 1px #EEEEEE, margin vertical 16px.
  - Tags row: chips with 8px radius, #F6F6F6 background.
  - Divider.
  - Quantity row (centered):
    "−" (36px circle, border 1px #EEEEEE) +
    count (18px Bold) +
    "+" (36px circle, Primary green).
  - "Add to cart" button:
    Full width, 52px height, Primary green (#06C167),
    border radius 12px, 15px SemiBold white text.

### Floating Cart Bar

- Position: absolute bottom.
- Background: #1A1A1A (dark, like UberEats).
- Height: 56px.
- Border radius: 12px.
- Margin: 0 16px 16px 16px.
- Shadow: Floating Cart Button shadow.
- Layout (padding 16px):
  Left: white cart icon + green count badge.
  Center: "View cart" 15px SemiBold white.
  Right: total price 15px Bold white.
- Hidden when cart is empty.

### Bottom Tab Bar

- Background: white.
- Border top: 1px solid #EEEEEE.
- Height: 60px + safe area bottom.
- 4 tabs: Home · Cart · Orders · Account.
- Active: icon + label in #06C167.
- Inactive: icon + label in #B0B0B0.
- Cart tab: green dot badge when items > 0.
- Icons: outline when inactive, filled when active.

### Rating Badge (inline, on cards)

- Star icon: 12px, #FFB800.
- Score: 13px Medium, Text Primary.
- Count: 13px Regular, Text Muted.
- Example: ★ 4.8 (120+)

### Promo Tag

- Background: #FF3008.
- Text: white, Label size (11px uppercase).
- Border radius: 8px.
- Padding: 3px 8px.
- Example: "20% OFF"

---

## Home Screen Layout (Top to Bottom)

```
┌──────────────────────────────────┐
│  Header: table + avatar          │  56px
├──────────────────────────────────┤
│  Search Bar                      │  64px
├──────────────────────────────────┤
│  Promo Banner Carousel           │  176px
├──────────────────────────────────┤
│  Category Filter Bar             │  60px
├──────────────────────────────────┤
│  Section: "Popular"              │
│    Menu Item Cards (list)        │  variable
├──────────────────────────────────┤
│  Section: "Drinks"               │
│    Horizontal Scroll Cards       │  variable
├──────────────────────────────────┤
│  [Bottom padding 80px]           │
└──────────────────────────────────┘
  Floating Cart Bar   (absolute)
  Bottom Tab Bar      (absolute)
```

---

## Do's and Don'ts

### Do

- Use Primary green (#06C167) only for active states,
  add buttons, cart, active tab. Nothing else.
- Keep ALL backgrounds white or #F6F6F6.
- Show food image on the RIGHT of list cards.
- Keep floating cart bar dark (#1A1A1A).
- Use 1px #EEEEEE borders instead of shadows for cards.
- Always show rating on every item card.
- Keep prices in dark text (Text Primary), not green.

### Don't

- Don't use any other color as primary accent.
- Don't add gradients to card backgrounds.
- Don't use border radius less than 8px anywhere.
- Don't bold descriptions — always Regular weight.
- Don't show floating cart when cart is empty.
- Don't center-align text in list cards — left-aligned only.
- Don't use pure black (#000000) anywhere.

---

## Motion

- Category pill: instant color change, no transition.
- Add "+" button: scale 0.85 to 1.0, 120ms.
- Bottom sheet open: slide up, 280ms, ease-out.
- Cart badge count: scale-up pulse 1.3 to 1.0, 150ms.
- Banner carousel: auto-scroll every 4 seconds, smooth.

---

## Placeholder Data

```json
{
  "restaurant": {
    "name": "Le Maquis Royal",
    "table": "Table 4",
    "banner": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5"
  },
  "categories": ["All", "Starters", "Main Course", "Grills", "Drinks", "Desserts"],
  "items": [
    {
      "id": "1",
      "name": "Poulet braisé sauce tomate",
      "description": "Grilled chicken with homemade tomato sauce, served with attiéké",
      "price": 3500,
      "currency": "FCFA",
      "rating": 4.8,
      "ratingCount": 94,
      "category": "Main Course",
      "image": "https://images.unsplash.com/photo-1598103442097-8b74394b95c8"
    },
    {
      "id": "2",
      "name": "Thiéboudienne",
      "description": "Traditional fish and rice slow cooked with vegetables",
      "price": 4000,
      "currency": "FCFA",
      "rating": 4.9,
      "ratingCount": 210,
      "category": "Main Course",
      "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19"
    },
    {
      "id": "3",
      "name": "Jus de gingembre frais",
      "description": "Fresh ginger juice with lemon and mint",
      "price": 800,
      "currency": "FCFA",
      "rating": 4.7,
      "ratingCount": 58,
      "category": "Drinks",
      "image": "https://images.unsplash.com/photo-1544145945-f90425340c7e"
    }
  ]
}
```

---

## How to Use This File

Place this file at the root of your project as `DESIGN.md`.

Start EVERY prompt to your AI agent with:

"Refer to DESIGN.md for ALL visual decisions.
Do not invent or guess any color, spacing, font size,
or border radius. Every token must come from DESIGN.md."

Then describe the screen or component you need.

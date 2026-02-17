# Landing Page Sections Redesign

## Date: 2026-02-15

## Context

The marketing landing page (main branch) has 5 sections that don't follow the project's visual identity. They use emojis, colorful gradient icon squares, and inconsistent styling. The hero section establishes the brand identity: dark backgrounds, `#CCFF00` accent, bold typography, subtle borders.

## Approach: Dark + Light Alternating

Sections alternate between dark (black) and light (white) backgrounds for visual rhythm, while maintaining the `#CCFF00` accent and text-only card design (no icons, no emojis).

## Section Designs

### 1. IndustrySection (DARK)

- Background: `bg-black`
- 4-column grid, rectangular cards (not square)
- Cards: `bg-zinc-900 border border-white/10 rounded-2xl`
- Content: title (white, `text-2xl font-bold`) + subtitle (`text-neutral-400 text-sm`)
- No emojis, no icons
- Hover: `border-[#CCFF00]/40` + `translate-y-[-4px]`
- Header: small caps label + `text-5xl font-bold text-white` title

### 2. FeaturesShowcase (LIGHT)

- Background: `bg-white`
- 2-column grid (md)
- Cards: `bg-neutral-50 border border-neutral-200 rounded-2xl p-8`
- Content: title (`text-xl font-semibold text-neutral-900`) + description (`text-neutral-600`)
- No icons, no blue circles
- Hover: `border-neutral-400 shadow-sm`

### 3. SegmentsSection (LIGHT)

- Background: `bg-white`
- 3-column grid (lg), 2-column (sm)
- Cards: `bg-white border border-neutral-200 rounded-2xl p-8`
- Content: title + description + "En savoir plus >" link
- No icons, no colored gradient squares
- Hover: `border-neutral-900 shadow-lg`

### 4. PhoneAnimation (DARK)

- Background: `bg-black`
- 2-column layout (text left, phone right)
- Text: label `text-neutral-400`, title `text-5xl font-bold text-white`, desc `text-xl text-neutral-400`
- Button: `border border-white/20` hover `bg-[#CCFF00] text-black`
- Phone: border `border-neutral-800`, gradient `from-[#CCFF00]/10 to-[#CCFF00]/5`
- Chat bubbles: user `bg-white/10 text-white`, AI `bg-[#CCFF00]/20 text-white`
- Title "Attabl AI" in `text-[#CCFF00]`

### 5. StatsBar + CTASection + Footer

**StatsBar (DARK):**

- Background: `bg-black border-t border-white/5`
- Numbers: `text-5xl font-bold text-white`
- Labels: `text-sm text-neutral-400`
- Vertical separators between metrics

**CTASection (DARK):**

- Background: `bg-neutral-900`
- Primary button: `bg-[#CCFF00] text-black font-bold rounded-xl` (replaces brand-orange)
- Secondary: `border border-white/20 text-white rounded-xl`

**Footer (DARK):**

- Background: `bg-black border-t border-white/10`
- Links: `text-neutral-400 hover:text-white`
- Newsletter: `bg-zinc-900` input, `bg-[#CCFF00] text-black` button
- Copyright: `text-neutral-500`

## Files to Modify

All files are in the main repo at `src/components/marketing/`:

1. `IndustrySection.tsx` - Remove emojis, apply dark card style
2. `FeaturesShowcase.tsx` - Remove icons, switch to light card style
3. `SegmentsSection.tsx` - Remove icons/gradients, apply light card style
4. `PhoneAnimation.tsx` - Switch to dark bg, apply #CCFF00 accents
5. `StatsBar.tsx` - Switch from green bg to black, enlarge numbers
6. `CTASection.tsx` - Replace brand-orange with #CCFF00
7. `Footer.tsx` - Switch from light to dark theme

## Constraints

- Text-only cards (no icons, no emojis)
- Accent color: `#CCFF00` only
- Font: existing font stack (Sora/Inter)
- Framer Motion animations preserved
- All existing links/navigation preserved

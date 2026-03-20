# Landing Page Rebranding — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete rebranding of the ATTABL marketing landing page from a restaurant-centric design to a multi-segment commerce platform, following the "Proposition B — Rupture Stratégique" spec.

**Architecture:** 8 existing marketing components get refactored/replaced in-place. All components are Client Components using Framer Motion for animations. Content is hardcoded in French in JSX (no i18n namespace for marketing yet). The worktree branch is `feature/landing-page-redesign` at `.worktrees/landing-page-redesign/`.

**Tech Stack:** Next.js 16 (App Router), React 19, Framer Motion, Tailwind CSS v4, Lucide React icons, TypeScript strict mode.

**Design tokens:**

- Background: `#1A1A2E` (dark sections)
- Accent: `#CCFF00` (CTAs, highlights, active states)
- Text: white on dark, neutral-900 on light
- Secondary accent: `#7C3AED` (labels)

**Working directory:** `/Users/a.g.i.c/Desktop/attabl-saas/.worktrees/landing-page-redesign`

---

## Phase 1: Hero + CTA + Pricing (Critical)

### Task 1: Hero Section — VideoHero.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/VideoHero.tsx` (100 lines → ~180 lines)
- Delete content from: `src/components/marketing/LogoMarquee.tsx` (will no longer be imported)

**Context:** Replace the full-screen video hero with a 2-column layout: text+CTAs left, dashboard screenshot right. Add micro-carousel of 4 segment pills that swap the dashboard image. Add stats banner below.

- [ ] **Step 1: Create placeholder dashboard images**

Create 4 placeholder SVG files for dashboard screenshots (will be replaced with real screenshots later):

```bash
mkdir -p public/images/dashboard
```

Create simple gradient placeholder images using a utility. For now, use colored div placeholders in the component.

- [ ] **Step 2: Rewrite VideoHero.tsx**

Replace the entire file. Key structure:

- Remove video background, LogoMarquee import
- 2-column grid layout (text left, dashboard right)
- Title: "Lancez. Gérez. Grandissez." with accent highlight on each verb
- Subtitle: "La plateforme commerce tout-en-un qui accompagne les entrepreneurs africains de l'idée au succès."
- 4 segment pills: Restaurant, Boutique, Salon, Hôtel (with Lucide icons)
- `activeSegment` state controls which dashboard image/placeholder is shown
- Crossfade animation (300ms) on segment change via AnimatePresence
- Single CTA: "Démarrer gratuitement" — bg-[#CCFF00] text-[#1A1A2E]
- Stats banner at bottom: 4 stats with dividers (+2 400 commerces, 12 pays, 3 devises, 100% cloud)

```tsx
// Key state
const [activeSegment, setActiveSegment] = useState<'restaurant' | 'boutique' | 'salon' | 'hotel'>(
  'restaurant',
);

// Segments config
const segments = [
  { id: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
  { id: 'boutique', label: 'Boutique', icon: Store },
  { id: 'salon', label: 'Salon', icon: Scissors },
  { id: 'hotel', label: 'Hôtel', icon: Hotel },
] as const;

// Stats
const stats = [
  { value: '+2 400', label: 'commerces actifs' },
  { value: '12', label: 'pays' },
  { value: '3', label: 'devises' },
  { value: '100%', label: 'cloud' },
];
```

Layout specs:

- Section: `bg-[#1A1A2E] min-h-screen`
- Desktop: `grid lg:grid-cols-2 gap-12 items-center`
- Mobile: stack vertical, pills in horizontal scroll
- Dashboard placeholder: `aspect-video rounded-2xl overflow-hidden` with gradient bg per segment
- Pills: active = `bg-[#CCFF00] text-[#1A1A2E]`, inactive = `border border-white/20 text-white`

- [ ] **Step 3: Update page.tsx to remove LogoMarquee dependency**

The `page.tsx` doesn't import LogoMarquee directly (it's imported inside VideoHero), so just verify the page still renders after VideoHero rewrite. No changes needed to page.tsx for this step.

- [ ] **Step 4: Verify in browser**

```bash
cd /Users/a.g.i.c/Desktop/attabl-saas/.worktrees/landing-page-redesign && pnpm dev
```

Open http://localhost:3001 (use different port if 3000 is taken). Verify:

- Title renders with accent highlights
- 4 segment pills are clickable
- Dashboard placeholder changes on pill click
- Stats banner shows 4 stats
- Mobile layout stacks correctly
- No console errors

- [ ] **Step 5: Run checks and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/VideoHero.tsx
git commit -m "feat(marketing): redesign hero section — segment pills + stats banner"
```

---

### Task 2: CTA Final — CTASection.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/CTASection.tsx` (41 lines → ~70 lines)

**Context:** Replace generic CTA with emotional copy targeting African entrepreneurs. Double CTA + reassurance text.

- [ ] **Step 1: Rewrite CTASection.tsx**

Key changes:

- Title: "Votre commerce mérite mieux qu'un carnet et une calculette." — words "carnet" and "calculette" in italic
- Subtitle: "ATTABL est la plateforme commerce #1 en Afrique. Créez votre compte en 2 minutes et commencez à vendre aujourd'hui."
- Primary CTA: "Créer mon compte gratuit" — `bg-[#CCFF00] text-[#1A1A2E] rounded-full px-8 py-4 hover:scale-105`
- Secondary CTA: "Parler à un conseiller" — `border border-white text-white rounded-full px-8 py-4 hover:bg-white/10`
- Reassurance line: "Utilisé par 2 400+ commerces • Support WhatsApp 24/7 • Disponible en français et en anglais"

Layout specs:

- Section: `bg-[#1A1A2E] py-24`
- Container: `max-w-[700px] mx-auto text-center`
- Title: `text-4xl font-bold text-white`
- CTAs: `flex flex-col sm:flex-row gap-4 justify-center`
- Reassurance: `text-sm text-gray-400 mt-6`

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/CTASection.tsx
git commit -m "feat(marketing): redesign CTA section — emotional copy + double CTA"
```

---

### Task 3: Pricing Page updates

**Files:**

- Modify: `src/app/(marketing)/pricing/page.tsx` (240 lines)

**Context:** Update copy to be inclusive, add segment recommendations per plan, update FAQ.

- [ ] **Step 1: Update pricing page copy**

Changes to make:

1. Replace any "restaurateurs et hôteliers" text with: "ATTABL accompagne les entrepreneurs à travers le continent africain. De N'Djamena à Abidjan, de Douala à Dakar."
2. Under each plan card, add "Idéal pour :" line:
   - Essentiel → "restaurants, cafés, boutiques, salons"
   - Premium → "hôtels, chaînes, multi-sites"
   - Enterprise → "franchises, grands groupes, collectivités"
3. Add FAQ item: "Est-ce qu'ATTABL fonctionne pour mon type de commerce ?" with answer listing all segments

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/app/\(marketing\)/pricing/page.tsx
git commit -m "feat(marketing): update pricing — inclusive copy + segment recommendations"
```

---

### Task 4: Phase 1 integration test

- [ ] **Step 1: Run all checks**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All 427 tests must pass, 0 lint errors.

- [ ] **Step 2: Visual verification**

Open the landing page and pricing page in browser. Verify:

- Hero: new layout with pills, stats, CTAs
- CTA: emotional copy, double buttons, reassurance
- Pricing: inclusive copy, segment recommendations
- No broken links
- Mobile responsive

- [ ] **Step 3: Commit phase marker**

```bash
git add -A
git commit -m "milestone: phase 1 complete — hero + CTA + pricing rebranding"
```

---

## Phase 2: Segments (onglets) + Features (6 cartes)

### Task 5: Segments Section — SegmentsSection.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/SegmentsSection.tsx` (105 lines → ~220 lines)

**Context:** Replace 9-card grid with 4 interactive tabs (Restauration, Commerce, Hôtellerie, Services). Each tab shows screenshot placeholder + features + CTA.

- [ ] **Step 1: Rewrite SegmentsSection.tsx**

Key structure:

- Title: "Quel que soit votre commerce, ATTABL parle votre langue"
- 4 horizontal tabs with active underline `border-b-[3px] border-[#CCFF00]`
- State: `activeTab` controls which content is shown
- AnimatePresence crossfade 300ms between tab contents
- Each tab content: grid 2 columns — screenshot placeholder (60%) + text panel (40%)
- Text panel: sub-segments list, stat quote, features bullet list, CTA button

```tsx
const tabs = [
  {
    id: 'food',
    label: 'Restauration',
    subSegments: 'restaurants, cafés, bars, food trucks, boulangeries',
    stat: '67% de nos utilisateurs sont dans la restauration',
    features: ['Menu QR', 'KDS', 'Gestion de tables', 'Commandes en salle et à emporter'],
    cta: { label: 'Découvrir ATTABL pour la restauration', href: '/restaurants' },
  },
  {
    id: 'retail',
    label: 'Commerce & Retail',
    subSegments: 'boutiques, marchés, pharmacies, épiceries',
    stat: 'Gestion de stock intégrée, adaptée au commerce africain',
    features: ['Catalogue digital', 'POS', 'Gestion de stock', 'Fournisseurs'],
    cta: { label: 'Découvrir ATTABL pour le commerce', href: '/retail' },
  },
  {
    id: 'hospitality',
    label: 'Hôtellerie',
    subSegments: 'hôtels, resorts, auberges',
    stat: 'Multi-venue, multi-devise, multi-langue',
    features: ['Room service digital', 'Multi-points de vente', 'Gestion par étage'],
    cta: { label: "Découvrir ATTABL pour l'hôtellerie", href: '/hotels' },
  },
  {
    id: 'services',
    label: 'Services',
    subSegments: 'salons de coiffure, instituts de beauté, coworking',
    stat: 'Rendez-vous et encaissement simplifiés',
    features: ['Catalogue de prestations', 'Planning', 'Encaissement', 'Fidélité'],
    cta: { label: 'Découvrir ATTABL pour les services', href: '/salons' },
  },
];
```

Layout specs:

- Section: `bg-white py-24`
- Tabs bar: `flex border-b border-neutral-200`
- Active tab: `border-b-[3px] border-[#CCFF00] font-bold text-neutral-900`
- Inactive tab: `text-neutral-500 hover:text-neutral-700`
- Content: `grid lg:grid-cols-5 gap-12` (3 cols screenshot, 2 cols text)
- Screenshot placeholder: `aspect-video bg-neutral-100 rounded-2xl` with gradient per tab
- Mobile: tabs scroll horizontal, content stacks vertical

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/SegmentsSection.tsx
git commit -m "feat(marketing): redesign segments section — interactive tabs by segment family"
```

---

### Task 6: Features Showcase — FeaturesShowcase.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/FeaturesShowcase.tsx` (55 lines → ~130 lines)

**Context:** Expand from 4 features to 6 features in 2 labeled rows (VENDRE / GÉRER).

- [ ] **Step 1: Rewrite FeaturesShowcase.tsx**

Key structure:

- Title: "Un écosystème complet, pas juste un outil"
- Row 1 label: "VENDRE" — uppercase, letter-spacing, `text-[#7C3AED]`
- Row 1 cards: Catalogue Digital (QrCode), Point de Vente (CreditCard), Paiements (Banknote)
- Row 2 label: "GÉRER" — same style
- Row 2 cards: Analytics & IA (BarChart3), Stock (Package), Équipe (Users)
- Each card: icon 40px + title + description
- Framer Motion: fade-in + slide-up, stagger 100ms
- Hover: `hover:scale-[1.02] hover:shadow-lg transition-all duration-200`

Layout specs:

- Section: `bg-neutral-50 py-24`
- Grid: `grid md:grid-cols-3 gap-6`
- Card: `bg-white p-6 rounded-xl border border-neutral-200`
- Icon container: `w-10 h-10 rounded-lg bg-[#CCFF00]/10 flex items-center justify-center mb-4`
- Icon: `text-[#CCFF00] w-5 h-5`

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/FeaturesShowcase.tsx
git commit -m "feat(marketing): redesign features — 6 cards in VENDRE/GÉRER rows"
```

---

### Task 7: Phase 2 integration

- [ ] **Step 1: Run all checks and verify visually**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 2: Commit phase marker**

```bash
git add -A
git commit -m "milestone: phase 2 complete — segments tabs + features 6-card grid"
```

---

## Phase 3: Product Showcase (bento) + Chiffres (compteurs)

### Task 8: Product Showcase — ProductShowcase.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/ProductShowcase.tsx` (93 lines → ~160 lines)

**Context:** Replace carousel with bento grid of 5 product cards using action verbs.

- [ ] **Step 1: Rewrite ProductShowcase.tsx**

Key structure:

- 5 cards in CSS grid: first card spans 2 columns
- Each card: verb label (uppercase, accent color) + title + description + placeholder visual
- Cards:
  1. PILOTER — "Dashboard temps réel" (col-span-2)
  2. VENDRE — "Catalogue & commandes digitales"
  3. PRÉPARER — "Routage intelligent des commandes"
  4. ENCAISSER — "POS multi-méthodes"
  5. GÉRER — "Stock, fournisseurs, alertes"

```tsx
const products = [
  { verb: 'PILOTER', title: 'Dashboard temps réel', description: '...', span: 2 },
  { verb: 'VENDRE', title: 'Catalogue & commandes digitales', description: '...', span: 1 },
  { verb: 'PRÉPARER', title: 'Routage intelligent des commandes', description: '...', span: 1 },
  { verb: 'ENCAISSER', title: 'POS multi-méthodes', description: '...', span: 1 },
  { verb: 'GÉRER', title: 'Stock, fournisseurs, alertes', description: '...', span: 1 },
];
```

Layout specs:

- Section: `bg-white py-24` or `bg-neutral-50`
- Grid: `grid grid-cols-1 md:grid-cols-2 gap-6`
- First card: `md:col-span-2`
- Card: `bg-white rounded-2xl border border-neutral-200 p-8 overflow-hidden`
- Verb label: `text-xs font-semibold uppercase tracking-widest text-[#CCFF00] mb-3`
- Animation: slide-up + fade-in, stagger 100ms
- Mobile: all cards single column

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/ProductShowcase.tsx
git commit -m "feat(marketing): redesign product showcase — bento grid with action verbs"
```

---

### Task 9: Chiffres Clés — IndustrySection.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/IndustrySection.tsx` (64 lines → ~120 lines)

**Context:** Replace industry cards with animated count-up counters.

- [ ] **Step 1: Rewrite IndustrySection.tsx with count-up animation**

Key structure:

- Title: "ATTABL en chiffres"
- 4 counters that animate from 0 to target when section enters viewport
- Use `useInView` from framer-motion + `useEffect` with requestAnimationFrame for count-up

```tsx
const counters = [
  { target: 2400, prefix: '+', suffix: '', label: 'commerces accompagnés', icon: Store },
  { target: 12, prefix: '', suffix: '', label: 'pays couverts en Afrique', icon: Globe },
  { target: 98.7, prefix: '', suffix: '%', label: 'de disponibilité plateforme', icon: Shield },
  { target: 1.2, prefix: '+', suffix: 'M', label: 'de commandes traitées', icon: ShoppingBag },
];
```

Animation specs:

- Use `useInView` hook from framer-motion with `once: true`
- When in view, animate number from 0 to target over 2 seconds with ease-out
- Stagger 200ms between counters
- For decimal values (98.7, 1.2), animate to 1 decimal place
- For integers (2400, 12), animate to whole number with locale formatting

Layout specs:

- Section: `bg-[#1A1A2E] py-24`
- Grid: `grid grid-cols-2 lg:grid-cols-4 gap-8`
- Icon: `text-[#CCFF00] w-8 h-8 mb-4`
- Counter: `text-5xl font-bold text-white tabular-nums`
- Label: `text-sm text-gray-400 mt-2`

- [ ] **Step 2: Verify counter animation and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/IndustrySection.tsx
git commit -m "feat(marketing): redesign industry section — animated counters"
```

---

### Task 10: Phase 3 integration

- [ ] **Step 1: Run checks and verify**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 2: Commit phase marker**

```bash
git add -A
git commit -m "milestone: phase 3 complete — bento grid + animated counters"
```

---

## Phase 4: Social Proof (témoignages) + Section IA (timeline)

### Task 11: Social Proof — SocialProof.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/SocialProof.tsx` (26 lines → ~150 lines)
- Note: This was a Server Component, it becomes a Client Component (needs animations + auto-play)

**Context:** Replace 4 static stats with a testimonial carousel + media logos banner.

- [ ] **Step 1: Rewrite SocialProof.tsx as Client Component**

Key structure:

- Add `'use client'` directive
- Title: "Ils nous font confiance"
- Carousel with 3 testimonials, auto-rotate every 6s
- Navigation dots below carousel
- Each testimonial: large quote, italic text, author name + business + city, segment badge pill

```tsx
const testimonials = [
  {
    quote:
      'ATTABL a transformé la gestion de notre restaurant. On a réduit les erreurs de commande de 40% en 2 mois.',
    author: 'Amadou K.',
    business: 'Le Jardin',
    city: "N'Djamena",
    segment: 'Restauration',
  },
  {
    quote:
      'Enfin un outil qui comprend le commerce africain. Le support mobile money a tout changé pour nous.',
    author: 'Grace M.',
    business: 'Sahel Boutique',
    city: 'Douala',
    segment: 'Retail',
  },
  {
    quote:
      "Le dashboard analytics m'a ouvert les yeux sur mes vraies marges. J'ai augmenté ma rentabilité de 18%.",
    author: 'Ibrahim D.',
    business: 'Hôtel Prestige',
    city: 'Abidjan',
    segment: 'Hôtellerie',
  },
];
```

- Media logos banner below: "Ils parlent de nous" with 4 placeholder text logos in grayscale
- State: `activeIndex` for carousel position
- Auto-play: `useEffect` with `setInterval(6000)`
- Animation: AnimatePresence crossfade between testimonials

Layout specs:

- Section: `bg-neutral-50 py-24`
- Container: `max-w-[800px] mx-auto text-center`
- Quote: `text-xl italic text-neutral-700 leading-relaxed`
- Author: `font-bold text-neutral-900`
- Segment badge: `px-3 py-1 rounded-full text-xs font-medium bg-[#CCFF00]/10 text-[#CCFF00]`
- Dots: `w-2 h-2 rounded-full` — active: `bg-[#CCFF00]`, inactive: `bg-neutral-300`
- Logos banner: `flex justify-center gap-12 grayscale hover:grayscale-0 transition`

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/SocialProof.tsx
git commit -m "feat(marketing): redesign social proof — testimonial carousel + logos"
```

---

### Task 12: Section IA — PhoneAnimation.tsx refonte

**Files:**

- Rewrite: `src/components/marketing/PhoneAnimation.tsx` (54 lines → ~200 lines)

**Context:** Replace static phone mockup with interactive AI timeline (3 moments of the day).

- [ ] **Step 1: Rewrite PhoneAnimation.tsx**

Key structure:

- Title: "Votre copilote business, de l'ouverture à la fermeture"
- Subtitle: "ATTABL AI analyse votre activité et vous suggère les bonnes décisions, tout au long de la journée."
- Horizontal timeline nav: 3 steps (08h, 13h, 21h) connected by a line
- Active step: green glow `bg-[#CCFF00]`
- Each step content: 2 columns — text/insight left, mini-screenshot placeholder right

```tsx
const timelineSteps = [
  {
    time: '08h',
    label: 'Matin — Anticipation',
    message:
      'Stock de café bas. Commande fournisseur suggérée : 5kg Arabica chez votre fournisseur habituel.',
    insight: 'ATTABL AI anticipe vos besoins avant que vous ne les ressentiez.',
  },
  {
    time: '13h',
    label: 'Rush — Optimisation',
    message:
      'Temps de préparation moyen : 8 min. 2 commandes en retard — réallocation suggérée vers le poste 2.',
    insight: 'En plein rush, ATTABL AI optimise vos opérations en temps réel.',
  },
  {
    time: '21h',
    label: 'Clôture — Bilan',
    message:
      'Journée record ! +15% vs mardi dernier. Votre top 3 : Burger Classic, Salade César, Jus Gingembre.',
    insight: 'ATTABL AI transforme vos données en décisions rentables.',
  },
];
```

- State: `activeStep` (0, 1, 2)
- Auto-play: optional, 5s per step
- Animation: slide horizontal + fade between steps

Layout specs:

- Section: `bg-[#1A1A2E] py-24`
- Timeline nav: 3 dots connected by horizontal line, centered
- Active dot: `w-4 h-4 bg-[#CCFF00] shadow-[0_0_12px_rgba(204,255,0,0.5)]`
- Inactive dot: `w-3 h-3 bg-white/20`
- Time label: `text-xs text-white/60` below dot, active: `text-[#CCFF00] font-bold`
- Content: `grid lg:grid-cols-2 gap-12`
- Message box: styled like a chat bubble / notification card
- Mobile: timeline vertical, content stacks

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/PhoneAnimation.tsx
git commit -m "feat(marketing): redesign AI section — interactive timeline"
```

---

### Task 13: Phase 4 integration

- [ ] **Step 1: Run all checks**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 2: Update page.tsx assembly order**

Verify that `src/app/(marketing)/page.tsx` imports match the new section order from the spec:

1. VideoHero (hero)
2. ProductShowcase (bento grid)
3. SegmentsSection (tabs)
4. PhoneAnimation (AI timeline)
5. IndustrySection (counters — "ATTABL en chiffres")
6. FeaturesShowcase (6 cards)
7. SocialProof (testimonials)
8. CTASection (final CTA)

This is already the current order in page.tsx — no changes needed unless imports changed.

- [ ] **Step 3: Final visual review and commit**

```bash
git add -A
git commit -m "milestone: phase 4 complete — testimonials + AI timeline"
```

---

## Phase 5: Footer updates + Final polish

### Task 14: Footer updates

**Files:**

- Modify: `src/components/marketing/Footer.tsx` (140 lines)

**Context:** Update Solutions links to include new segments (Commerces, Salons, Pharmacies) and ensure consistency.

- [ ] **Step 1: Update Footer Solutions links**

Add new segments to the Solutions column in Footer.tsx:

- Add: Commerces → /retail
- Add: Salons → /salons
- Add: Pharmacies → /pharmacies

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add src/components/marketing/Footer.tsx
git commit -m "feat(marketing): update footer — add new segment links"
```

---

### Task 15: Final integration + cleanup

- [ ] **Step 1: Run full quality gate**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All must pass: 0 type errors, 0 lint errors, 427+ tests, successful build.

- [ ] **Step 2: Clean up unused code**

Check if `LogoMarquee.tsx` is still imported anywhere. If not, consider keeping the file but noting it's unused (don't delete — might be useful later).

- [ ] **Step 3: Full visual QA**

Open all pages in browser and verify:

- [ ] Landing page: all 8 sections render correctly
- [ ] Mobile responsive: test at 375px, 768px, 1024px, 1440px
- [ ] Pricing page: inclusive copy, segment recommendations, FAQ
- [ ] All internal links work (/signup, /pricing, /restaurants, /retail, /salons, etc.)
- [ ] Animations: pills, tabs, counters, carousel, timeline all animate smoothly
- [ ] No console errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(marketing): complete landing page rebranding — all 5 phases done"
```

---

## Summary

| Phase | Tasks       | Components                     | Effort |
| ----- | ----------- | ------------------------------ | ------ |
| 1     | Tasks 1-4   | Hero, CTA, Pricing             | ~3-4h  |
| 2     | Tasks 5-7   | Segments tabs, Features 6-card | ~3-4h  |
| 3     | Tasks 8-10  | Bento grid, Counters           | ~2-3h  |
| 4     | Tasks 11-13 | Testimonials, AI Timeline      | ~3-4h  |
| 5     | Tasks 14-15 | Footer, Polish, QA             | ~1-2h  |

**Total: ~12-17h of development across 15 tasks, 5 phases.**

Each phase can be deployed independently. Phase 1 is the most impactful.

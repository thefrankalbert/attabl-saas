# ATTABL Design System Rules

## Identity

ATTABL is a premium SaaS platform for luxury restaurants and hotels.
Every UI element must reflect sophistication, restraint, and precision.
Think: Stripe dashboard meets a luxury hotel lobby.

## Design Philosophy

- LESS IS MORE. White space is your best friend.
- NO generic AI aesthetics (no gradient blobs, no neon accents, no emoji-heavy UIs)
- NO card-heavy layouts with identical padding everywhere
- Prefer subtle depth over flat design: use shadow-sm and border over heavy shadows
- Every element must breathe. Minimum gap-6 between sections, p-6 minimum on containers

## Color Palette (Luxury & Minimal)

- Primary background: bg-white or bg-zinc-50 (NEVER pure gray backgrounds)
- Text primary: text-zinc-900 (near black, never pure black)
- Text secondary: text-zinc-500
- Accent: ONE single brand color used sparingly (buttons, active states only)
- Borders: border-zinc-200 (subtle, almost invisible)
- Hover states: hover:bg-zinc-50 or hover:bg-accent/5
- NEVER use more than 3 colors on a single page

## Typography Hierarchy

- Page titles: text-2xl font-semibold tracking-tight (never text-4xl or bigger in dashboards)
- Section titles: text-lg font-medium
- Body text: text-sm text-zinc-600
- Labels: text-xs font-medium text-zinc-500 uppercase tracking-wide
- NEVER use font-bold on body text. Use font-medium instead.
- Line height: always use leading-relaxed on paragraphs

## Component Standards

- Buttons: subtle, not chunky. Use h-9 px-4 text-sm rounded-md not large padded buttons
- Cards: rounded-xl border border-zinc-200 bg-white shadow-sm NO heavy shadows
- Inputs: h-10 rounded-md border-zinc-200 text-sm with focus:ring-1 focus:ring-zinc-900
- Tables: clean with divide-y divide-zinc-100, NO zebra striping, NO heavy borders
- Modals: max-w-lg, centered, with generous padding
- Badges/Status: subtle pill shapes with soft backgrounds like bg-emerald-50 text-emerald-700

## Spacing & Layout Rules

- Dashboard layouts: sidebar (w-64) + main content area
- Content max-width: max-w-6xl mx-auto in main content areas
- Section spacing: space-y-8 between major sections
- Card grids: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- NEVER stack more than 3 cards in a row on desktop

## Icons (Lucide React)

- Size: h-4 w-4 for inline, h-5 w-5 for standalone
- Color: text-zinc-400 by default, accent color on active/hover
- NEVER use colored icons as decoration. Icons are functional.

## Animations (Framer Motion)

- Duration: 0.15s to 0.3s maximum. Luxury = subtle, not flashy.
- Use ONLY for: page transitions, modal open/close, hover states, skeleton loading
- NEVER animate: background colors continuously, text, icons spinning

## What to AVOID (AI Anti-Patterns)

- NO gradient backgrounds on cards or sections
- NO multiple font sizes fighting for attention
- NO rounded-full buttons (unless icon-only)
- NO colored sidebar backgrounds (use white or zinc-50)
- NO hero sections with giant text in dashboards
- NO rainbow color schemes for charts (use monochrome + 1 accent)

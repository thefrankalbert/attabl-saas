# ATTABL Frontend Code Rules

## Framework

- Next.js 14+ with App Router
- TypeScript strict mode
- Tailwind CSS for all styling (NO inline styles, NO CSS modules)
- Shadcn/ui as component foundation
- Lucide React for icons
- Framer Motion for animations (subtle only)

## Component Architecture

- Use Server Components by default, add 'use client' only when needed
- One component per file, named exports preferred
- Keep components under 150 lines. If longer, extract sub-components.
- Props interface defined above the component

## Shadcn/ui Usage

- ALWAYS check if a shadcn component exists before building custom
- Use shadcn primitives: Button, Input, Select, Dialog, Sheet, Table, Tabs, Card
- Customize via Tailwind className overrides, never modify shadcn source
- For data tables: use @tanstack/react-table with shadcn Table

## Responsive Design

- Mobile-first: write base styles for mobile, then md: and lg: breakpoints
- Sidebar: hidden on mobile, Sheet/Drawer on tablet, fixed on desktop
- Tables: horizontal scroll on mobile with overflow-x-auto
- Navigation: bottom bar on mobile, sidebar on desktop

## Code Quality

- NO console.log in production code
- NO any type in TypeScript
- Use early returns for guard clauses
- Handle loading states with Skeleton components (shadcn)
- Handle empty states with meaningful messages
- Handle error states gracefully

## File Naming

- Components: PascalCase (MenuList.tsx)
- Utilities: camelCase (formatPrice.ts)
- Route directories: kebab-case (menu-management/)

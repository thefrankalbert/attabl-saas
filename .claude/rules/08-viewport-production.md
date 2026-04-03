# Viewport & Production Parity Rules - ATTABL SaaS

## Root Layout Contract (CRITICAL)

The viewport chain MUST be unbroken from `<html>` to the scrolling container:

```
html (height: 100%, overflow: hidden)
  body (height: 100%, overflow: hidden)
    RootLayout (no height constraints - flex column via children)
      AdminLayoutClient (h-dvh overflow-hidden flex)
        Sidebar + Main content area (h-full, flex-1)
          <main#main-content> (flex-1 overflow-y-auto) <-- ONLY scrolling element
```

### Rules

1. `html` and `body` MUST have `height: 100%; overflow: hidden;` in globals.css
2. ONLY `<main#main-content>` is allowed to scroll (`overflow-y-auto`)
3. Child pages MUST use `h-full` to fill their parent - NEVER `h-screen` or `100vh`
4. The admin layout uses `h-dvh` as the single viewport anchor - no other component may use `h-dvh` or `h-screen`
5. NEVER add `overflow: auto/scroll` on intermediate containers between body and main-content

## Dev/Prod Parity (CRITICAL)

Turbopack (dev) and Webpack (prod/Vercel) handle CSS differently. Follow these rules to prevent "works locally, breaks in production":

1. ALWAYS test responsive changes with `pnpm build && pnpm start` before considering them done - Turbopack is more permissive than production builds
2. NEVER rely on implicit browser behavior for layout - always set explicit height/overflow constraints
3. Tailwind v4 class scanning differs between dev and prod - if a class only appears in a dynamic string or template literal, it may be purged in production. Always use complete class names, never string concatenation for Tailwind classes
4. PWA service worker is DISABLED in dev but ENABLED in production - cached CSS can cause stale layouts. When debugging production layout issues, clear service worker cache first

## Forbidden Patterns

- `h-screen` or `100vh` on any element (use `h-dvh` ONLY on AdminLayoutClient root)
- `overflow-y-auto` or `overflow-y-scroll` on anything other than `<main#main-content>` or explicitly scrollable lists
- Removing `overflow: hidden` from `html` or `body`
- Using `min-h-screen` as a layout fix - it masks the real problem
- Dynamic Tailwind class construction: `` `text-${size}` `` - always use full class names like `text-sm`, `text-lg`

## Responsive Testing Checklist

Before merging any layout or responsive change:

1. [ ] `pnpm build && pnpm start` - test in production mode locally
2. [ ] Test on 375px (mobile), 768px (tablet), 1280px (desktop)
3. [ ] Content fills viewport without floating or extra whitespace
4. [ ] No horizontal overflow on any breakpoint
5. [ ] Scrolling works ONLY in main-content area, not on body
6. [ ] Dark mode and light mode both render correctly

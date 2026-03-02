# ATTABL UI Patterns Reference

## Design Inspiration

When generating UI, reference the visual style of:

- Stripe Dashboard (clean tables, subtle colors, excellent typography)
- Linear (minimal sidebar, smooth transitions)
- Vercel Dashboard (black/white contrast, elegant states)
- Square for Restaurants (industry-specific, professional)

## Sidebar Pattern

- Width: w-64 on desktop, Sheet on mobile
- Background: bg-white with border-r border-zinc-200
- Nav items: text-sm, py-2 px-3 rounded-md
- Active item: bg-zinc-100 text-zinc-900 font-medium
- Inactive item: text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50
- Section labels: text-xs font-medium text-zinc-400 uppercase tracking-wider

## Data Table Pattern

- Header: text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-50/50
- Data rows: text-sm, py-3 px-4
- Row hover: hover:bg-zinc-50
- Borders: divide-y divide-zinc-100
- Actions: right-aligned DropdownMenu with "..." icon
- Status: small dot (h-2 w-2 rounded-full) + text

## Form Pattern

- Labels: text-sm font-medium text-zinc-700 mb-1.5
- Inputs: full width, h-10
- Helper text: text-xs text-zinc-500 mt-1
- Error text: text-xs text-red-600 mt-1
- Submit button: right-aligned, primary style

## Empty State Pattern

- Centered in content area
- Simple line icon (h-12 w-12 text-zinc-300)
- Title: text-lg font-medium text-zinc-900
- Description: text-sm text-zinc-500, max-w-sm, text-center
- CTA button below

## Loading Pattern

- Use shadcn Skeleton components matching the layout
- For tables: 5 skeleton rows matching column widths
- NEVER use spinner icons except for button loading states

## Restaurant-Specific

- Menu items: price right-aligned with currency formatting
- Categories: use Tabs or sidebar filter, NOT dropdown
- Status: Disponible (green-50/green-700), Indisponible (zinc-100/zinc-500), Epuise (red-50/red-600)
- Images: aspect-square or aspect-video, rounded-lg, object-cover

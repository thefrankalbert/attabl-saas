/**
 * Extra gallery photos of an item, without its primary image. `images` is a
 * jsonb column: 2 production rows held an object `{}` instead of a list
 * (measured 2026-11-14), and `.filter` on it crashed the edit form. Anything
 * that is not a list is treated as an empty gallery.
 */
export function galleryExtras(images: unknown, primary: string | null | undefined): string[] {
  if (!Array.isArray(images)) return [];
  return images.filter(
    (u): u is string => typeof u === 'string' && u !== '' && u !== (primary || ''),
  );
}

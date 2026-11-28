/**
 * Detail d'une ligne de commande suivie par le convive (suivi, confirmation,
 * recu, "Commander a nouveau").
 *
 * La ligne `order_items` porte le prix unitaire du plat (`price_at_order`),
 * ses supplements (`modifiers`, prix de la carte, unites MAJEURES) et une note
 * (`customer_notes`) ou la creation ecrit "Taille - Option - note libre"
 * (order-creation.ts). Sans ce detail, une ligne affichait 12 000 pour un total
 * de 12 600 (audit d'equipe du 2026-11-27, convive C15).
 */

export interface TrackedLineModifier {
  id?: string;
  name: string;
  price: number;
}

/** Lit `modifiers` (jsonb) sans faire confiance a sa forme. */
export function parseLineModifiers(raw: unknown): TrackedLineModifier[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackedLineModifier[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const { id, name, price } = m as Record<string, unknown>;
    if (typeof name !== 'string' || name.length === 0) continue;
    out.push({
      ...(typeof id === 'string' ? { id } : {}),
      name,
      price: typeof price === 'number' && Number.isFinite(price) ? price : 0,
    });
  }
  return out;
}

/** Prix d'UNE unite de la ligne, supplements compris (unites majeures). */
export function lineUnitTotal(unitPrice: number, modifiers: TrackedLineModifier[]): number {
  return modifiers.reduce((sum, m) => sum + m.price, unitPrice);
}

/** Lignes de detail a afficher sous le nom du plat: note puis supplements. */
export function lineDetails(
  notes: string | null | undefined,
  modifiers: TrackedLineModifier[],
): string[] {
  const details: string[] = [];
  const trimmed = notes?.trim();
  if (trimmed) details.push(trimmed);
  if (modifiers.length > 0) details.push(modifiers.map((m) => `+ ${m.name}`).join(', '));
  return details;
}

/** Tailles et options ACTUELLES d'un plat, lues a la carte au moment de recommander. */
export interface ReorderCatalogEntry {
  variants: { id: string; name_fr: string; name_en: string | null; price: number }[];
  options: { name_fr: string; name_en: string | null }[];
}

export interface ReorderLineInput {
  menu_item_id: string;
  name: string;
  name_en?: string;
  price: number;
  quantity: number;
  modifiers: TrackedLineModifier[];
  notes: string | null;
}

export interface ReorderLine {
  id: string;
  name: string;
  name_en?: string;
  price: number;
  quantity: number;
  selectedVariant?: { id: string; name_fr: string; name_en?: string; price: number };
  selectedOption?: { name_fr: string; name_en?: string };
  modifiers?: TrackedLineModifier[];
  customerNotes?: string;
}

/**
 * Reconstruit une ligne de panier a partir d'une ligne commandee. Rend `null`
 * quand le plat a des tailles et que la taille commandee ne se retrouve plus a
 * la carte: le convive doit la choisir a nouveau (le serveur refuserait un plat
 * a tailles sans taille). La note ecrite a la creation vaut
 * "Taille - Option - note libre"; seuls les morceaux qui ne sont ni la taille
 * ni l'option redeviennent la note.
 */
export function buildReorderLine(
  line: ReorderLineInput,
  catalog: ReorderCatalogEntry | undefined,
): ReorderLine | null {
  const segments = (line.notes ?? '')
    .split(' - ')
    .map((s) => s.trim())
    .filter(Boolean);
  const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

  let variant: ReorderCatalogEntry['variants'][number] | undefined;
  if (catalog && catalog.variants.length > 0) {
    variant = segments[0] ? catalog.variants.find((v) => same(v.name_fr, segments[0])) : undefined;
    if (!variant) return null;
    segments.shift();
  }

  let option: ReorderCatalogEntry['options'][number] | undefined;
  if (catalog && catalog.options.length > 0 && segments[0]) {
    option = catalog.options.find((o) => same(o.name_fr, segments[0]));
    if (option) segments.shift();
  }

  const customerNotes = segments.join(' - ');
  return {
    id: line.menu_item_id,
    name: line.name,
    ...(line.name_en ? { name_en: line.name_en } : {}),
    price: variant ? variant.price : line.price,
    quantity: line.quantity,
    ...(variant
      ? {
          selectedVariant: {
            id: variant.id,
            name_fr: variant.name_fr,
            ...(variant.name_en ? { name_en: variant.name_en } : {}),
            price: variant.price,
          },
        }
      : {}),
    ...(option
      ? {
          selectedOption: {
            name_fr: option.name_fr,
            ...(option.name_en ? { name_en: option.name_en } : {}),
          },
        }
      : {}),
    ...(line.modifiers.length > 0 ? { modifiers: line.modifiers } : {}),
    ...(customerNotes ? { customerNotes } : {}),
  };
}

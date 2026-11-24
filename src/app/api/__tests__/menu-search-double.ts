/**
 * Double de `from('menu_items')` pour la recherche convive (B4). Il APPLIQUE
 * les filtres comme PostgREST: `eq`, `is`, `in`, `order`, `range`, `limit`.
 * Un double qui ignorait `eq` laissait passer la suppression du filtre
 * `tenant_id` ou `is_available` sans qu'aucun test ne tombe (contre-audit 1,
 * defaut 3).
 */
export interface MenuRow {
  id: string;
  tenant_id: string;
  name: string;
  name_en?: string | null;
  description: string | null;
  price: number;
  is_available: boolean;
  deleted_at: string | null;
}

type Row = Record<string, unknown>;

export function menuQuery(rows: MenuRow[]) {
  let result: Row[] = rows.map((r) => ({ ...r }));
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      result = result.filter((r) => r[column] === value);
      return chain;
    },
    is: (column: string, value: unknown) => {
      result = result.filter((r) => (r[column] ?? null) === value);
      return chain;
    },
    in: (column: string, values: unknown[]) => {
      result = result.filter((r) => values.includes(r[column]));
      return chain;
    },
    order: (column: string) => {
      if (column === 'name') result.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return chain;
    },
    range: (from: number, to: number) => {
      result = result.slice(from, to + 1);
      return chain;
    },
    limit: (n: number) => {
      result = result.slice(0, n);
      return chain;
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: result, error: null }),
  };
  return chain;
}

/**
 * Natural order of table numbers: 1, 2, ... 9, 10 and BAR-2 before BAR-10.
 * The database sorts `table_number` as text (1, 10, 2), which showed "Salle 10"
 * right after "Salle 1" on the Tables settings page.
 */
export function sortByTableNumber<T extends { table_number: string }>(tables: T[]): T[] {
  return [...tables].sort((a, b) =>
    a.table_number.localeCompare(b.table_number, undefined, { numeric: true }),
  );
}

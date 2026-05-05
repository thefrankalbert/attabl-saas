export function normalizeSearch(text: string): string {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

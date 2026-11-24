export interface ZoneData {
  name: string;
  prefix: string;
  tableCount: number;
  defaultCapacity?: number;
  /** Prefixe saisi a la main (mode complet). Absent = brouillon ancien. */
  prefixManual?: boolean;
}

export type ConfigMode = 'complete' | 'minimum' | 'skip';

export const capacityOptions = [2, 4, 6, 8, 10, 12];

/**
 * Derive a prefix from a zone name: first 3 uppercase letters or digits.
 * B28: a name without any latin letter or digit (an Arabic name, for instance) gave "", refused at
 * launch; the zone then falls back to `Z<position>` (Z1, Z2...), unique per zone.
 */
export function derivePrefix(name: string, index = 0): string {
  const derived = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
  return derived || `Z${index + 1}`;
}

/** Longueur maximale d'un prefixe (zoneSchema, Reglages > Tables). */
const PREFIX_MAX = 5;

/**
 * Un prefixe saisi a la main ne compte qu'en mode complet. Un brouillon ancien
 * (sans `prefixManual`) garde un prefixe qui differe de celui du nom.
 */
function isManualPrefix(zone: ZoneData, index: number, mode: ConfigMode): boolean {
  if (mode !== 'complete' || !zone.prefix) return false;
  if (zone.prefixManual !== undefined) return zone.prefixManual;
  return zone.prefix !== derivePrefix(zone.name, index);
}

/**
 * Prefixes uniques (index unique `zones_tenant_upper_prefix_key`: "Salle" et
 * "Salon" donnaient SAL et SAL, deux noms arabes Z2 et Z2, et le lancement
 * echouait en 409 au dernier bouton).
 *
 * Contre-audit 3: les prefixes automatiques sont RECALCULES a chaque fois, a
 * partir des noms et des prefixes saisis du moment. Ils ne derivent donc pas
 * en silence: "SAL" saisi en zone 3 fait passer "Salle" a SAL2, et remettre la
 * zone 3 a "VIP" lui rend SAL. Secours `Z<n>` (premier libre) pour un nom sans
 * lettre latine, suffixe numerique pour un prefixe latin deja pris (SAL2,
 * SAL3...), 5 lettres ou chiffres majuscules au plus (numero de table
 * `PREFIXE-n`). Un prefixe saisi n'est jamais change; seul le mode complet les
 * garde: en mode rapide, ou rien ne se saisit, tout est recalcule.
 */
export function withUniquePrefixes(zones: ZoneData[], mode: ConfigMode): ZoneData[] {
  const manual = zones.map((z, i) => isManualPrefix(z, i, mode));
  const used = new Set(zones.filter((_, i) => manual[i]).map((z) => z.prefix.toUpperCase()));
  return zones.map((z, i) => {
    if (manual[i]) return z.prefixManual ? z : { ...z, prefixManual: true };
    const base = derivePrefix(z.name, i);
    let prefix = base;
    if (used.has(prefix)) {
      if (/^Z\d+$/.test(base) && !/[a-zA-Z0-9]/.test(z.name.normalize('NFD'))) {
        let k = 1;
        while (used.has(`Z${k}`)) k++;
        prefix = `Z${k}`;
      } else {
        let n = 2;
        const candidate = () => `${base.slice(0, PREFIX_MAX - String(n).length)}${n}`;
        while (used.has(candidate())) n++;
        prefix = candidate();
      }
    }
    used.add(prefix);
    return prefix === z.prefix && z.prefixManual === false
      ? z
      : { ...z, prefix, prefixManual: false };
  });
}

/**
 * Zones telles qu'elles partent dans le brouillon, puis au lancement:
 * prefixes uniques, et un nom par defaut ("Salle 2") pour une zone laissee sans
 * nom (contre-audit 2: elle etait creee sans nom). Contre-audit 3: le nom par
 * defaut choisi est le premier "Salle n" que personne ne porte deja.
 */
export function zonesForDraft(
  zones: ZoneData[],
  mode: ConfigMode,
  defaultName: (position: number) => string,
): ZoneData[] {
  const taken = new Set(zones.map((z) => z.name.trim().toLowerCase()).filter(Boolean));
  return withUniquePrefixes(zones, mode).map((z, i) => {
    if (z.name.trim()) return z;
    let n = i + 1;
    while (taken.has(defaultName(n).toLowerCase())) n++;
    const name = defaultName(n);
    taken.add(name.toLowerCase());
    return { ...z, name };
  });
}

import type { SupabaseClient } from '@supabase/supabase-js';

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'auth',
  'www',
  'mail',
  'app',
  'login',
  'signup',
  'checkout',
  'onboarding',
  'dashboard',
  'settings',
  'billing',
  '_next',
  'static',
  'public',
  'assets',
  'cdn',
  'docs',
  'help',
  'support',
  'status',
  'monitoring',
  'health',
  'webhook',
  'webhooks',
  'dev',
  'staging',
  'test',
  'demo',
  'attabl',
  'features',
  'pricing',
  'contact',
  'about',
  'terms',
  'privacy',
  'sitemap',
]);

const MAX_BASE_SLUG_LENGTH = 50;
const MAX_NAME_LENGTH = 200;

/** Retire les tirets de tete et de queue, sans expression reguliere (temps lineaire). */
function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start++;
  while (end > start && value[end - 1] === '-') end--;
  return value.slice(start, end);
}

/**
 * Slug generation service.
 *
 * Extracted from signup/signup-oauth routes to eliminate duplication.
 * Normalizes restaurant names into URL-safe slugs and ensures uniqueness.
 */
export interface SlugService {
  normalizeToSlug(name: string): string;
  generateUniqueSlug(name: string): Promise<string>;
}

export function createSlugService(supabase: SupabaseClient): SlugService {
  return {
    /**
     * Normalizes a name into a URL-safe slug.
     * - Lowercases
     * - Removes accents (NFD normalization)
     * - Replaces non-alphanumeric chars with hyphens
     * - Trims leading/trailing hyphens
     */
    normalizeToSlug(name: string): string {
      const hyphenated = name
        // Borne l'entree AVANT toute expression reguliere: un nom de plusieurs
        // milliers de caracteres n'a pas a etre parcouru.
        .slice(0, MAX_NAME_LENGTH)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]+/g, '-'); // Replace special chars with hyphens
      // Un slug est un label DNS (63 caracteres au plus). 50 laisse la place
      // aux suffixes de generateUniqueSlug ("-restaurant", "-9999").
      return trimHyphens(trimHyphens(hyphenated).slice(0, MAX_BASE_SLUG_LENGTH));
    },

    /**
     * Generates a unique slug by checking the database.
     * If the base slug already exists, appends a random 3-digit number.
     */
    async generateUniqueSlug(name: string): Promise<string> {
      // Un nom sans aucune lettre latine ni chiffre (arabe, chinois, emojis)
      // donne un slug vide, donc l'adresse "https://.attabl.com". Le repli vit
      // ici et non dans normalizeToSlug: chaque appelant a le sien (un espace
      // de restaurant retombe sur "espace").
      let baseSlug = this.normalizeToSlug(name) || 'restaurant';

      // If the slug is reserved, append a suffix to avoid conflicts with system routes
      if (RESERVED_SLUGS.has(baseSlug)) {
        baseSlug = `${baseSlug}-restaurant`;
      }

      // Check for existing slugs with this base (including numbered variants)
      const { data: existingSlugs } = await supabase
        .from('tenants')
        .select('slug')
        .like('slug', `${baseSlug}%`);

      if (!existingSlugs || existingSlugs.length === 0) {
        return baseSlug;
      }

      const existingSet = new Set(existingSlugs.map((t) => t.slug));

      if (!existingSet.has(baseSlug)) {
        return baseSlug;
      }

      // Find next available number suffix
      for (let i = 2; i <= 9999; i++) {
        const candidate = `${baseSlug}-${i}`;
        if (!existingSet.has(candidate)) {
          return candidate;
        }
      }

      // Fallback: use timestamp for guaranteed uniqueness
      return `${baseSlug}-${Date.now().toString(36)}`;
    },
  };
}

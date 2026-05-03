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

/**
 * Slug generation service.
 *
 * Extracted from signup/signup-oauth routes to eliminate duplication.
 * Normalizes restaurant names into URL-safe slugs and ensures uniqueness.
 */
export function createSlugService(supabase: SupabaseClient) {
  return {
    /**
     * Normalizes a name into a URL-safe slug.
     * - Lowercases
     * - Removes accents (NFD normalization)
     * - Replaces non-alphanumeric chars with hyphens
     * - Trims leading/trailing hyphens
     */
    normalizeToSlug(name: string): string {
      return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]+/g, '-') // Replace special chars with hyphens
        .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
    },

    /**
     * Generates a unique slug by checking the database.
     * If nickname is provided, slug = normalize(name)-normalize(nickname) — no numeric fallback.
     * If no nickname and the base slug is taken, appends -2, -3, etc.
     */
    async generateUniqueSlug(name: string, nickname?: string): Promise<string> {
      let baseSlug = this.normalizeToSlug(name);

      // If the slug is reserved, append a suffix to avoid conflicts with system routes
      if (RESERVED_SLUGS.has(baseSlug)) {
        baseSlug = `${baseSlug}-restaurant`;
      }

      // When a nickname is provided, use name-nickname as the slug (user chose it explicitly)
      if (nickname) {
        const normalizedNickname = this.normalizeToSlug(nickname);
        if (normalizedNickname) {
          return `${baseSlug}-${normalizedNickname}`;
        }
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

    /**
     * Checks whether a specific slug is available (not taken in the tenants table).
     */
    async checkSlugAvailable(slug: string): Promise<boolean> {
      const { data } = await supabase.from('tenants').select('slug').eq('slug', slug).maybeSingle();

      return data === null;
    },
  };
}

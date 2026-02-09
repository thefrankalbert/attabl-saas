import type { SupabaseClient } from '@supabase/supabase-js';

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
     * If the base slug already exists, appends a random 3-digit number.
     */
    async generateUniqueSlug(name: string): Promise<string> {
      const baseSlug = this.normalizeToSlug(name);

      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('slug')
        .eq('slug', baseSlug)
        .single();

      if (existingTenant) {
        return `${baseSlug}-${Math.floor(Math.random() * 1000)}`;
      }

      return baseSlug;
    },
  };
}

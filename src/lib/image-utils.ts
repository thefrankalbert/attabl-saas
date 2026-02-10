/**
 * Image utility helpers for ATTABL SaaS
 * Provides safe fallback images when items don't have uploaded images
 */

export const FALLBACK_IMAGES: Record<string, string> = {
    // Venue types
    pool: 'https://images.unsplash.com/photo-1572331165267-854da2b00ca1?q=80&w=800&auto=format&fit=crop',
    lobby:
        'https://images.unsplash.com/photo-1560624052-449f5ddf0c31?q=80&w=800&auto=format&fit=crop',
    room: 'https://images.unsplash.com/photo-1629891465228-442d87e0743b?q=80&w=800&auto=format&fit=crop',
    panorama:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop',
    terrace:
        'https://images.unsplash.com/photo-1514326640560-7d063ef2aed5?q=80&w=800&auto=format&fit=crop',

    // Food categories
    burger:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=800&auto=format&fit=crop',
    pizza:
        'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=800&auto=format&fit=crop',
    salad:
        'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop',
    drink:
        'https://images.unsplash.com/photo-1544145945-f90425340c7e?q=80&w=800&auto=format&fit=crop',
    dessert:
        'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?q=80&w=800&auto=format&fit=crop',
    coffee:
        'https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=800&auto=format&fit=crop',
    chicken:
        'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?q=80&w=800&auto=format&fit=crop',
    meat: 'https://images.unsplash.com/photo-1603073163308-9654c3fb70b5?q=80&w=800&auto=format&fit=crop',
    pasta:
        'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?q=80&w=800&auto=format&fit=crop',
    african:
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800&auto=format&fit=crop',

    // Default
    default:
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=800&auto=format&fit=crop',
};

/**
 * Returns a safe fallback image URL based on a keyword query.
 * Used when a menu item or venue does not have an uploaded image.
 */
export function getFallbackImageUrl(query: string): string {
    if (!query) return FALLBACK_IMAGES.default;
    const lower = query.toLowerCase();

    // Venue keywords
    if (lower.includes('pool') || lower.includes('piscine')) return FALLBACK_IMAGES.pool;
    if (lower.includes('lobby') || lower.includes('hall')) return FALLBACK_IMAGES.lobby;
    if (lower.includes('room') || lower.includes('service') || lower.includes('chambre'))
        return FALLBACK_IMAGES.room;
    if (lower.includes('panorama') || lower.includes('toit') || lower.includes('roof'))
        return FALLBACK_IMAGES.panorama;
    if (lower.includes('terrace') || lower.includes('terrasse') || lower.includes('tapas'))
        return FALLBACK_IMAGES.terrace;

    // Food keywords
    if (lower.includes('burger')) return FALLBACK_IMAGES.burger;
    if (lower.includes('pizza')) return FALLBACK_IMAGES.pizza;
    if (lower.includes('salad') || lower.includes('salade')) return FALLBACK_IMAGES.salad;
    if (
        lower.includes('drink') ||
        lower.includes('boisson') ||
        lower.includes('cocktail') ||
        lower.includes('vin') ||
        lower.includes('wine')
    )
        return FALLBACK_IMAGES.drink;
    if (
        lower.includes('dessert') ||
        lower.includes('cake') ||
        lower.includes('sucre') ||
        lower.includes('gateau')
    )
        return FALLBACK_IMAGES.dessert;
    if (lower.includes('cafe') || lower.includes('coffee') || lower.includes('the'))
        return FALLBACK_IMAGES.coffee;
    if (lower.includes('chicken') || lower.includes('poulet')) return FALLBACK_IMAGES.chicken;
    if (
        lower.includes('steak') ||
        lower.includes('viande') ||
        lower.includes('meat') ||
        lower.includes('boeuf')
    )
        return FALLBACK_IMAGES.meat;
    if (lower.includes('pasta') || lower.includes('pate') || lower.includes('spaghetti'))
        return FALLBACK_IMAGES.pasta;
    if (
        lower.includes('ndole') ||
        lower.includes('yassa') ||
        lower.includes('mafe') ||
        lower.includes('local')
    )
        return FALLBACK_IMAGES.african;

    return FALLBACK_IMAGES.default;
}

/**
 * Validates an image URL - returns null if invalid
 */
export function validateImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        new URL(url);
        return url;
    } catch {
        return null;
    }
}

/**
 * Returns the image URL for a menu item, with fallback
 */
export function getMenuItemImage(
    imageUrl: string | null | undefined,
    itemName: string,
): string {
    const validated = validateImageUrl(imageUrl);
    if (validated) return validated;
    return getFallbackImageUrl(itemName);
}

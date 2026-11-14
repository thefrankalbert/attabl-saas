import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRenderableImageUrl, renderableImageUrlSchema } from '../image-url.schema';
import { menuItemUpdateSchema } from '../menu-item.schema';
import { onboardingCompleteSchema } from '../onboarding.schema';

const STORAGE = 'https://abc.supabase.co/storage/v1/object/public/menu-items/t1/plat.jpg';

describe('renderableImageUrlSchema', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts our own Supabase storage URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    expect(isRenderableImageUrl(STORAGE)).toBe(true);
  });

  it('accepts an app-relative asset', () => {
    expect(isRenderableImageUrl('/images/plat.png')).toBe(true);
  });

  it('rejects a foreign host (next/image would throw and crash the POS)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    expect(isRenderableImageUrl('https://example.com/plat.jpg')).toBe(false);
    // another Supabase project is not in remotePatterns either
    expect(
      isRenderableImageUrl('https://other.supabase.co/storage/v1/object/public/x/plat.jpg'),
    ).toBe(false);
  });

  it('rejects http, protocol-relative, non-public paths and junk', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    expect(isRenderableImageUrl(STORAGE.replace('https:', 'http:'))).toBe(false);
    expect(isRenderableImageUrl('//example.com/plat.jpg')).toBe(false);
    expect(isRenderableImageUrl('/\\example.com/plat.jpg')).toBe(false);
    expect(isRenderableImageUrl('/images/a b.png')).toBe(false);
    expect(isRenderableImageUrl('https://abc.supabase.co/rest/v1/menu_items')).toBe(false);
    expect(isRenderableImageUrl('blob:https://attabl.com/123')).toBe(false);
    expect(isRenderableImageUrl('not a url')).toBe(false);
  });

  it('falls back to *.supabase.co when the env var is absent (same as next.config)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(renderableImageUrlSchema.safeParse(STORAGE).success).toBe(true);
    expect(renderableImageUrlSchema.safeParse('https://example.com/a.jpg').success).toBe(false);
  });

  it('is enforced by the menu item write schema', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    expect(menuItemUpdateSchema.safeParse({ image_url: STORAGE }).success).toBe(true);
    expect(menuItemUpdateSchema.safeParse({ image_url: null }).success).toBe(true);
    expect(menuItemUpdateSchema.safeParse({ image_url: 'https://example.com/a.jpg' }).success).toBe(
      false,
    );
    expect(menuItemUpdateSchema.safeParse({ images: ['https://example.com/a.jpg'] }).success).toBe(
      false,
    );
  });
});

describe('onboarding imageUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('drops a dead blob: URL from an old draft instead of rejecting the onboarding', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    const items = onboardingCompleteSchema.shape.data.shape.menuItems;
    const parsed = items.parse([
      { name: 'Plat A', imageUrl: 'blob:https://attabl.com/123' },
      { name: 'Plat B', imageUrl: STORAGE },
    ]);
    expect(parsed?.[0]?.imageUrl).toBeUndefined();
    expect(parsed?.[1]?.imageUrl).toBe(STORAGE);
  });
});

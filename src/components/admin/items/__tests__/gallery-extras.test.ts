import { describe, expect, it } from 'vitest';
import { galleryExtras } from '../gallery-extras';

describe('galleryExtras', () => {
  it('keeps the extra photos and drops the primary one', () => {
    expect(galleryExtras(['/a.jpg', '/b.jpg', '/c.jpg'], '/a.jpg')).toEqual(['/b.jpg', '/c.jpg']);
  });

  it('treats a non-list gallery (object {} found in production) as empty instead of crashing', () => {
    expect(galleryExtras({}, '/a.jpg')).toEqual([]);
    expect(galleryExtras({ 0: '/x.jpg' }, null)).toEqual([]);
    expect(galleryExtras(null, null)).toEqual([]);
  });

  it('drops empty and non-string entries', () => {
    expect(galleryExtras(['', null, 3, '/b.jpg'], undefined)).toEqual(['/b.jpg']);
  });
});

import { describe, it, expect } from 'vitest';
import {
  createVenueSchema,
  renameVenueSchema,
  deactivateVenueSchema,
} from '@/lib/validations/venue.schema';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('venue.schema', () => {
  it('accepte un nom valide', () => {
    expect(createVenueSchema.safeParse({ name: 'Panorama' }).success).toBe(true);
  });

  it('rejette un nom vide', () => {
    expect(createVenueSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejette un nom trop long (> 60)', () => {
    expect(createVenueSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
  });

  it('trim le nom', () => {
    const parsed = createVenueSchema.safeParse({ name: '  Lobby bar  ' });
    expect(parsed.success && parsed.data.name).toBe('Lobby bar');
  });

  it('rename exige un uuid valide', () => {
    expect(renameVenueSchema.safeParse({ id: 'nope', name: 'Pool' }).success).toBe(false);
    expect(renameVenueSchema.safeParse({ id: UUID, name: 'Pool' }).success).toBe(true);
  });

  it('deactivate exige un uuid valide', () => {
    expect(deactivateVenueSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(deactivateVenueSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});

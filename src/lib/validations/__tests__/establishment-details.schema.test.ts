import { describe, it, expect } from 'vitest';
import {
  detailsForType,
  establishmentDetailsSchema,
  parseEstablishmentDetails,
} from '../establishment-details.schema';

describe('establishmentDetailsSchema', () => {
  it('refuse une cle inconnue (rien d inattendu dans la colonne)', () => {
    expect(establishmentDetailsSchema.safeParse({ piscine: true }).success).toBe(false);
  });

  it('refuse des valeurs hors bornes', () => {
    expect(establishmentDetailsSchema.safeParse({ starRating: 0 }).success).toBe(false);
    expect(establishmentDetailsSchema.safeParse({ registerCount: 101 }).success).toBe(false);
  });
});

describe('parseEstablishmentDetails', () => {
  it('rend un objet vide pour une valeur stockee illisible', () => {
    expect(parseEstablishmentDetails('oops')).toEqual({});
    expect(parseEstablishmentDetails(null)).toEqual({});
  });
});

describe('detailsForType', () => {
  const tout = {
    starRating: 4,
    hasRestaurant: true,
    hasTerrace: true,
    hasWifi: false,
    registerCount: 2,
    hasDelivery: true,
    totalCapacity: 40,
  };

  it('ne garde que les details du type', () => {
    expect(detailsForType('hotel', tout)).toEqual({ starRating: 4, hasRestaurant: true });
    expect(detailsForType('bar', tout)).toEqual({ hasTerrace: true });
    expect(detailsForType('cafe', tout)).toEqual({ hasWifi: false });
    expect(detailsForType('fastfood', tout)).toEqual({ registerCount: 2, hasDelivery: true });
    expect(detailsForType('restaurant', tout)).toEqual({ totalCapacity: 40 });
  });

  it('ne garde rien pour un type sans details', () => {
    expect(detailsForType('other', tout)).toEqual({});
    expect(detailsForType(undefined, tout)).toEqual({});
  });
});

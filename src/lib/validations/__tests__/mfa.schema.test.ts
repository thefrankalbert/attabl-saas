import { describe, it, expect } from 'vitest';
import { mfaCodeSchema, mfaDisableSchema, mfaVerifySchema } from '../mfa.schema';

describe('mfaCodeSchema', () => {
  it('accepte 6 chiffres', () => {
    expect(mfaCodeSchema.safeParse('012345')).toEqual({ success: true, data: '012345' });
  });

  it('retire les espaces d un code copie en deux groupes', () => {
    expect(mfaCodeSchema.safeParse(' 123 456 ').data).toBe('123456');
  });

  it.each(['12345', '1234567', '12a456', '', '12.456', '123-456'])('refuse %j', (code) => {
    expect(mfaCodeSchema.safeParse(code).success).toBe(false);
  });

  it('refuse un non-texte', () => {
    expect(mfaCodeSchema.safeParse(123456).success).toBe(false);
  });
});

describe('mfaVerifySchema / mfaDisableSchema', () => {
  it('factorId optionnel mais UUID quand present', () => {
    expect(mfaVerifySchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(
      mfaVerifySchema.safeParse({
        code: '123456',
        factorId: '9b2f1c3e-4d5a-4b6c-8d7e-0f1a2b3c4d5e',
      }).success,
    ).toBe(true);
    expect(mfaVerifySchema.safeParse({ code: '123456', factorId: 'pas-un-uuid' }).success).toBe(
      false,
    );
  });

  it('desactivation: code obligatoire', () => {
    expect(mfaDisableSchema.safeParse({}).success).toBe(false);
    expect(mfaDisableSchema.safeParse({ code: '654321' }).success).toBe(true);
  });
});

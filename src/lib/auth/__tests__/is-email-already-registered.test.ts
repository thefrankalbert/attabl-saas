import { describe, it, expect } from 'vitest';
import { isEmailAlreadyRegisteredAuthError } from '../is-email-already-registered';

describe('isEmailAlreadyRegisteredAuthError', () => {
  it('detects email_exists code', () => {
    expect(isEmailAlreadyRegisteredAuthError({ code: 'email_exists', message: '' })).toBe(true);
  });

  it('detects user_already_exists code', () => {
    expect(isEmailAlreadyRegisteredAuthError({ code: 'user_already_exists' })).toBe(true);
  });

  it('detects message patterns', () => {
    expect(
      isEmailAlreadyRegisteredAuthError({
        message: 'A user with this email address has already been registered',
      }),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isEmailAlreadyRegisteredAuthError({ code: 'invalid_credentials' })).toBe(false);
  });
});

/**
 * Detect Supabase Auth errors for duplicate email on signup (admin.createUser).
 * Prefer stable error.code over localized message strings.
 */
export function isEmailAlreadyRegisteredAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as { code?: string; message?: string; status?: number };
  const code = (err.code ?? '').toLowerCase();

  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    code === 'email_address_in_use' ||
    code === 'identity_already_exists'
  ) {
    return true;
  }

  const msg = (err.message ?? '').toLowerCase();
  if (
    msg.includes('already') ||
    msg.includes('registered') ||
    msg.includes('exists') ||
    msg.includes('duplicate')
  ) {
    return true;
  }

  return err.status === 422 && msg.length > 0;
}

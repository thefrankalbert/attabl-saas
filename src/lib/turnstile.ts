const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function isTurnstileBypassed(): boolean {
  if (!process.env.TURNSTILE_SECRET_KEY?.trim()) return true;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) return true;
  if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
    return true;
  }
  return false;
}

export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  if (isTurnstileBypassed()) return true;

  const secret = process.env.TURNSTILE_SECRET_KEY!;
  if (!token.trim()) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.append('remoteip', ip);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, { method: 'POST', body });
  } catch {
    return false;
  }

  if (!res.ok) return false;

  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}

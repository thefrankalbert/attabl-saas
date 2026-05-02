const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;

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

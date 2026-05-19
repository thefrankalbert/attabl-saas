/**
 * Main app origin (marketing, auth, onboarding). Tenant subdomains serve /sites/[slug] only.
 */
export function getMainAppOrigin(): string {
  if (typeof window !== 'undefined') {
    const envOrigin = process.env.NEXT_PUBLIC_APP_URL;
    if (envOrigin) {
      try {
        return new URL(envOrigin).origin;
      } catch {
        // fall through
      }
    }
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return window.location.origin;
    }
    if (host.endsWith('.localhost')) {
      return `${window.location.protocol}//localhost:${window.location.port || '3000'}`;
    }
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    if (appDomain) {
      const domain = appDomain.replace(/^www\./, '').split(':')[0];
      return `${window.location.protocol}//${domain}`;
    }
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export function getMainAppPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getMainAppOrigin()}${normalized}`;
}

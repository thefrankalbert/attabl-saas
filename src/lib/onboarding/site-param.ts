/**
 * Appends the `?site=<slug>` of the current onboarding page to an API path.
 *
 * `/onboarding?site=B` sets up establishment B (the "resume" dialog of B links
 * there). Every API call made from the onboarding must name B too, otherwise
 * the server picks the default (most recent unfinished) establishment, which
 * for an owner of two unfinished restaurants is the other one. The server only
 * uses it to choose among the user's OWN memberships.
 */
export function withOnboardingSite(path: string): string {
  if (typeof window === 'undefined') return path;
  const site = new URLSearchParams(window.location.search).get('site');
  return site ? `${path}?site=${encodeURIComponent(site)}` : path;
}

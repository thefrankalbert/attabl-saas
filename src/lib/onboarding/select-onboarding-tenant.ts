/**
 * Selects which tenant an owner resumes on /onboarding when they own several.
 *
 * Product rule: the most recently created tenant whose onboarding is NOT finished.
 * If every tenant is finished, the most recently created overall (callers route such
 * users to the dashboard instead of /onboarding).
 *
 * This is deterministic and replaces the previous non-deterministic selection that
 * ordered admin_users by their uuid primary key (random, not recency-based).
 */
export interface OnboardingTenantCandidate {
  onboardingCompleted: boolean;
  createdAt: string | null;
}

/**
 * Returns the index of the chosen candidate, or -1 when the list is empty.
 * Keeping it index-based lets callers map back to their own row shape.
 */
export function pickOnboardingTenantIndex(candidates: OnboardingTenantCandidate[]): number {
  if (candidates.length === 0) return -1;

  const indexed = candidates.map((candidate, index) => ({ index, ...candidate }));
  const incomplete = indexed.filter((candidate) => !candidate.onboardingCompleted);
  const pool = incomplete.length > 0 ? incomplete : indexed;

  pool.sort((a, b) => {
    const at = a.createdAt ?? '';
    const bt = b.createdAt ?? '';
    if (at === bt) return 0;
    return at > bt ? -1 : 1; // most recent first
  });

  return pool[0].index;
}

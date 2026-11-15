import { actionReleaseStaleTables } from '@/app/actions/table-release';

/** At most one automatic table check per minute per screen: the rule only depends on time. */
const MIN_INTERVAL_MS = 60_000;
let lastRun = 0;

/**
 * Runs the automatic release of paid tables never marked served (see
 * actionReleaseStaleTables), throttled. Never throws: a failure (offline
 * till) must not stop the occupancy read that follows.
 */
export async function releaseStaleTablesThrottled(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL_MS) return;
  lastRun = now;
  try {
    await actionReleaseStaleTables();
  } catch {
    // Network or offline: the next screen load retries.
  }
}

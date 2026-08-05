/**
 * Pure helpers for classifying account inactivity based on `last_sign_in_at`.
 *
 * "24 months" is computed calendrically (via `Date#setMonth`) rather than as a fixed
 * day count, so the threshold correctly accounts for varying month lengths and leap years.
 */

const DELETION_THRESHOLD_MONTHS = 24;

/**
 * Returns `true` when `lastSignInAt` is 24+ calendar months before `now` (defaults to
 * the current time). Accounts with a `null` `last_sign_in_at` (never signed in) are
 * treated as inactive relative to their absence of activity.
 */
export function isInactiveForDeletion(lastSignInAt: string | null, now: Date = new Date()): boolean {
  if (lastSignInAt === null) {
    return true;
  }

  const lastSignIn = new Date(lastSignInAt);
  if (Number.isNaN(lastSignIn.getTime())) {
    return true;
  }

  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - DELETION_THRESHOLD_MONTHS);

  return lastSignIn.getTime() <= threshold.getTime();
}

/**
 * Pure helpers for classifying account inactivity based on `last_sign_in_at`.
 *
 * "24 months" is computed calendrically (via `Date#setMonth`) rather than as a fixed
 * day count, so the threshold correctly accounts for varying month lengths and leap years.
 */

const DELETION_THRESHOLD_MONTHS = 24;
const WARNING_THRESHOLD_MONTHS = 23;

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

/**
 * Returns `true` when `lastSignInAt` falls in the 23-24 calendar month inactivity window
 * (the 30-day warning period before automatic deletion). Mutually exclusive with
 * `isInactiveForDeletion` for the same inputs — an account is either past the 24-month
 * deletion threshold, inside the 23-24 month warning window, or neither.
 *
 * Accounts with a `null` `last_sign_in_at` are already covered by `isInactiveForDeletion`
 * (never signed in), so they never fall into the warning window here.
 */
export function isInWarningWindow(lastSignInAt: string | null, now: Date = new Date()): boolean {
  if (lastSignInAt === null) {
    return false;
  }

  const lastSignIn = new Date(lastSignInAt);
  if (Number.isNaN(lastSignIn.getTime())) {
    return false;
  }

  const warningStart = new Date(now);
  warningStart.setMonth(warningStart.getMonth() - WARNING_THRESHOLD_MONTHS);

  const deletionThreshold = new Date(now);
  deletionThreshold.setMonth(deletionThreshold.getMonth() - DELETION_THRESHOLD_MONTHS);

  return lastSignIn.getTime() <= warningStart.getTime() && lastSignIn.getTime() > deletionThreshold.getTime();
}

/**
 * Pure helpers for classifying account inactivity based on `last_sign_in_at`.
 *
 * "24 months" is computed calendrically (via `Date#setMonth`) rather than as a fixed
 * day count, so the threshold correctly accounts for varying month lengths and leap years.
 */

const DELETION_THRESHOLD_MONTHS = 24;
const WARNING_THRESHOLD_MONTHS = 23;

/**
 * Returns `true` when the account's last activity is 24+ calendar months before `now`
 * (defaults to the current time). Accounts with a `null` `last_sign_in_at` (never signed
 * in) fall back to `createdAt` — Supabase leaves `last_sign_in_at` unset until first
 * login, so freshly created/invited accounts must be judged by their account age, not
 * treated as infinitely inactive.
 */
export function isInactiveForDeletion(
  lastSignInAt: string | null,
  createdAt: string | null = null,
  now: Date = new Date(),
): boolean {
  const reference = lastSignInAt ?? createdAt;
  if (reference === null) {
    return true;
  }

  const lastActivity = new Date(reference);
  if (Number.isNaN(lastActivity.getTime())) {
    return true;
  }

  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - DELETION_THRESHOLD_MONTHS);

  return lastActivity.getTime() <= threshold.getTime();
}

/**
 * Returns `true` when the account's last activity falls in the 23-24 calendar month
 * inactivity window (the 30-day warning period before automatic deletion). Falls back
 * to `createdAt` the same way `isInactiveForDeletion` does. Mutually exclusive with
 * `isInactiveForDeletion` for the same inputs — an account is either past the 24-month
 * deletion threshold, inside the 23-24 month warning window, or neither.
 *
 * Accounts with no activity reference at all (`null` `last_sign_in_at` and `createdAt`)
 * are already covered by `isInactiveForDeletion`, so they never fall into the warning
 * window here.
 */
export function isInWarningWindow(
  lastSignInAt: string | null,
  createdAt: string | null = null,
  now: Date = new Date(),
): boolean {
  const reference = lastSignInAt ?? createdAt;
  if (reference === null) {
    return false;
  }

  const lastActivity = new Date(reference);
  if (Number.isNaN(lastActivity.getTime())) {
    return false;
  }

  const warningStart = new Date(now);
  warningStart.setMonth(warningStart.getMonth() - WARNING_THRESHOLD_MONTHS);

  const deletionThreshold = new Date(now);
  deletionThreshold.setMonth(deletionThreshold.getMonth() - DELETION_THRESHOLD_MONTHS);

  return lastActivity.getTime() <= warningStart.getTime() && lastActivity.getTime() > deletionThreshold.getTime();
}

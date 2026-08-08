import type { APIRoute } from "astro";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { CLEANUP_ENDPOINT_SECRET, SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isInactiveForDeletion, isInWarningWindow } from "@/lib/inactive-accounts";

export const prerender = false;

interface CleanupError {
  userId: string;
  message: string;
  action: "delete" | "warn";
}

/**
 * Constant-time string comparison to avoid a timing side-channel when checking the
 * bearer secret. Uses the Web Crypto API (available in the Cloudflare Workers runtime),
 * not Node's `crypto.timingSafeEqual`, so it works in production, not just locally.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/**
 * Iterates all Supabase Auth users (paginated), classifies each via
 * `isInactiveForDeletion` / `isInWarningWindow`, and either reports (dryRun) or
 * deletes the inactive ones / sends a warning e-mail (magic link OTP) to accounts in
 * the 23-24 month warning window. Protected by a static bearer secret since this is
 * invoked by an external scheduler, not an authenticated user session.
 */
export const POST: APIRoute = async (context) => {
  if (!CLEANUP_ENDPOINT_SECRET) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const authHeader = context.request.headers.get("Authorization");
  if (!timingSafeEqual(authHeader ?? "", `Bearer ${CLEANUP_ENDPOINT_SECRET}`)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Plain anon client for `signInWithOtp` — sending a warning e-mail is a regular auth
  // operation, not an admin one, so it must not use the service_role client.
  const anon = SUPABASE_URL && SUPABASE_KEY ? createSupabaseClient(SUPABASE_URL, SUPABASE_KEY) : null;
  if (!anon) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const dryRun = context.url.searchParams.get("dryRun") === "true";

  const deleted: string[] = [];
  const warned: string[] = [];
  const errors: CleanupError[] = [];
  let processed = 0;
  let page = 1;
  const perPage = 50;

  // NOTE: pagination is offset-based (page/perPage) while deletions happen inline within
  // the same loop. Deleting an account can shift subsequent pages, so an account could
  // in theory be skipped in a given run. This is accepted as self-healing: the job runs
  // daily via the GitHub Actions schedule, so any skipped account is correctly picked up
  // (and still correctly classified) on the next run.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[api/admin/cleanup-inactive-accounts] listUsers error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
    }

    const users = data.users;
    if (users.length === 0) {
      break;
    }

    for (const candidate of users) {
      processed += 1;

      const lastSignInAt = candidate.last_sign_in_at ?? null;
      const createdAt = candidate.created_at ?? null;

      if (isInactiveForDeletion(lastSignInAt, createdAt)) {
        if (dryRun) {
          deleted.push(candidate.id);
          continue;
        }

        try {
          const { error: deleteError } = await admin.auth.admin.deleteUser(candidate.id);
          if (deleteError) {
            throw deleteError;
          }
          deleted.push(candidate.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          // eslint-disable-next-line no-console
          console.error(`[api/admin/cleanup-inactive-accounts] deleteUser(${candidate.id}) error:`, err);
          errors.push({ userId: candidate.id, message, action: "delete" });
        }
        continue;
      }

      if (isInWarningWindow(lastSignInAt, createdAt) && candidate.email) {
        const alreadyWarned = Boolean(candidate.user_metadata?.retention_warning_sent_at);
        if (alreadyWarned) {
          // A warning e-mail was already sent earlier in this 23-24 month window; skip
          // re-sending it daily until the account either logs in (exits the window) or
          // crosses into deletion.
          continue;
        }

        if (dryRun) {
          warned.push(candidate.id);
          continue;
        }

        try {
          const { error: otpError } = await anon.auth.signInWithOtp({
            email: candidate.email,
            options: { shouldCreateUser: false },
          });
          if (otpError) {
            throw otpError;
          }
          const { error: markError } = await admin.auth.admin.updateUserById(candidate.id, {
            user_metadata: { ...candidate.user_metadata, retention_warning_sent_at: new Date().toISOString() },
          });
          if (markError) {
            // eslint-disable-next-line no-console
            console.error(
              `[api/admin/cleanup-inactive-accounts] updateUserById(${candidate.id}) mark-warned error:`,
              markError
            );
          }
          warned.push(candidate.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          // eslint-disable-next-line no-console
          console.error(`[api/admin/cleanup-inactive-accounts] signInWithOtp(${candidate.id}) error:`, err);
          errors.push({ userId: candidate.id, message, action: "warn" });
        }
      }
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return new Response(JSON.stringify({ processed, deleted, warned, errors, dryRun }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

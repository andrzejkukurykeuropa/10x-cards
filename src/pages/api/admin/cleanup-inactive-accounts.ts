import type { APIRoute } from "astro";
import { CLEANUP_ENDPOINT_SECRET } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isInactiveForDeletion } from "@/lib/inactive-accounts";

export const prerender = false;

interface CleanupError {
  userId: string;
  message: string;
}

/**
 * Iterates all Supabase Auth users (paginated), classifies each via
 * `isInactiveForDeletion`, and either reports (dryRun) or deletes the inactive ones.
 * Protected by a static bearer secret since this is invoked by an external scheduler,
 * not an authenticated user session.
 */
export const POST: APIRoute = async (context) => {
  if (!CLEANUP_ENDPOINT_SECRET) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const authHeader = context.request.headers.get("Authorization");
  if (authHeader !== `Bearer ${CLEANUP_ENDPOINT_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const dryRun = context.url.searchParams.get("dryRun") !== "false";

  const deleted: string[] = [];
  const errors: CleanupError[] = [];
  let processed = 0;
  let page = 1;
  const perPage = 50;

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

      if (!isInactiveForDeletion(candidate.last_sign_in_at ?? null)) {
        continue;
      }

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
        errors.push({ userId: candidate.id, message });
      }
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return new Response(JSON.stringify({ processed, deleted, errors, dryRun }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

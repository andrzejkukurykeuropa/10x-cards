import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase-admin";

export const prerender = false;

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[api/account] DELETE admin.deleteUser error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    await supabase.auth.signOut();
  } else {
    // eslint-disable-next-line no-console
    console.error("[api/account] DELETE signOut skipped: session client unavailable (missing config)");
  }

  return new Response(null, { status: 204 });
};

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const STUDY_QUEUE_COLUMNS =
  "id, question, answer, due_date, stability, difficulty, state, lapses, last_review, scheduled_days, repetitions";

const modeSchema = z.enum(["due", "all"]).catch("due");

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const mode = modeSchema.parse(context.url.searchParams.get("mode"));

  let query = supabase.from("flashcards").select(STUDY_QUEUE_COLUMNS).eq("user_id", user.id);

  if (mode === "due") {
    query = query.or(`due_date.is.null,due_date.lte.${new Date().toISOString()}`);
  }

  const { data, error } = await query.limit(500);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[study/queue] DB error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { scheduleReview } from "@/lib/services/fsrs";

export const prerender = false;

const STUDY_QUEUE_COLUMNS =
  "id, question, answer, due_date, stability, difficulty, state, lapses, last_review, scheduled_days, repetitions";

const SRS_COLUMNS = "due_date, stability, difficulty, scheduled_days, repetitions, lapses, state, last_review";

const submitReviewSchema = z.object({
  id: z.uuid(),
  rating: z.enum(["again", "hard", "good", "easy"]),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 422 });
  }

  const parsed = submitReviewSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid input", details: z.treeifyError(parsed.error) }), {
      status: 422,
    });
  }

  const { id, rating } = parsed.data;

  const { data: current, error: selectError } = await supabase
    .from("flashcards")
    .select(SRS_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (selectError) {
    if (selectError.code === "PGRST116") {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    // eslint-disable-next-line no-console
    console.error("[study/review] SELECT DB error:", selectError);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }

  let updates: ReturnType<typeof scheduleReview>;
  try {
    updates = scheduleReview(current, rating, new Date());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[study/review] scheduleReview error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }

  // Optimistic lock: only apply the update if last_review still matches what we just read,
  // so a concurrent review of the same card (e.g. double submit) can't silently overwrite it.
  let updateQuery = supabase.from("flashcards").update(updates).eq("id", id).eq("user_id", user.id);
  updateQuery =
    current.last_review === null
      ? updateQuery.is("last_review", null)
      : updateQuery.eq("last_review", current.last_review);

  const { data, error: updateError } = await updateQuery.select(STUDY_QUEUE_COLUMNS).single();

  if (updateError) {
    if (updateError.code === "PGRST116") {
      // The SELECT above confirmed the card exists for this user, so a missing row here means
      // it was concurrently modified (race) between our read and write, not a genuine 404.
      return new Response(JSON.stringify({ error: "Conflict: card was modified concurrently" }), { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("[study/review] UPDATE DB error:", updateError);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

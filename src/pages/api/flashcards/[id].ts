import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const updateFlashcardSchema = z
  .object({
    question: z.string().trim().min(1).optional(),
    answer: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.question !== undefined || data.answer !== undefined, {
    message: "At least one of question or answer must be provided",
  });

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 422 });
  }

  const parsed = updateFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid input", details: z.treeifyError(parsed.error) }), {
      status: 422,
    });
  }

  const updates: Record<string, string> = {};
  if (parsed.data.question !== undefined) updates.question = parsed.data.question;
  if (parsed.data.answer !== undefined) updates.answer = parsed.data.answer;

  const { data, error } = await supabase
    .from("flashcards")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, question, answer, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    // eslint-disable-next-line no-console
    console.error("[flashcards/[id]] PATCH DB error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
  }

  const { error, count } = await supabase
    .from("flashcards")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[flashcards/[id]] DELETE DB error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }

  if (count === 0) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  return new Response(null, { status: 204 });
};

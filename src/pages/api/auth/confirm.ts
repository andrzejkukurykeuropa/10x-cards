import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const { searchParams } = new URL(context.request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!token_hash || !type) {
    return context.redirect("/auth/signin?error=" + encodeURIComponent("Invalid confirmation link"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=" + encodeURIComponent("Supabase is not configured"));
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as Parameters<typeof supabase.auth.verifyOtp>[0]["type"],
  });

  if (error) {
    return context.redirect("/auth/signin?error=" + encodeURIComponent(error.message));
  }

  return context.redirect("/dashboard");
};

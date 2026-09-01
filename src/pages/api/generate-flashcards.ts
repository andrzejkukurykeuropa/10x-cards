import type { APIRoute } from "astro";
import { createGroq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";
import { GROQ_API_KEY } from "astro:env/server";
import { flashcardsOutputSchema } from "@/lib/ai-schemas";

export const prerender = false;

const MODEL_ID = "openai/gpt-oss-120b";

const inputSchema = z.object({
  text: z.string().min(40).max(1000),
});

const SYSTEM_PROMPT = `You are a language learning flashcard creator for Polish speakers.
Given a text, extract key vocabulary, phrases, grammar rules, and concepts.
Create between 3 and 10 flashcard pairs. Each flashcard must have:
- question: the foreign word, phrase or grammar point from the text (in the original language)
- answer: a clear, concise Polish translation or explanation
Focus on the most important and learnable content. Always translate/explain in Polish.`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500 });
  }

  let inputText: string;
  try {
    const body: unknown = await context.request.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid input", details: z.treeifyError(parsed.error) }), {
        status: 422,
      });
    }
    inputText = parsed.data.text;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 422 });
  }

  try {
    const groq = createGroq({ apiKey: GROQ_API_KEY });
    const { object } = await generateObject({
      model: groq(MODEL_ID),
      schema: flashcardsOutputSchema,
      system: SYSTEM_PROMPT,
      prompt: `Text:\n${inputText}`,
    });

    return new Response(JSON.stringify(object), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[generate-flashcards] error:", msg);
    return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500 });
  }
};

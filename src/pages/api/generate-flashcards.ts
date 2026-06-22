import type { APIRoute } from "astro";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { z } from "zod";
import { GROQ_API_KEY } from "astro:env/server";
import { flashcardsOutputSchema } from "@/lib/ai-schemas";

export const prerender = false;

const inputSchema = z.object({
  text: z.string().min(40).max(1000),
});

const SYSTEM_PROMPT = `You are a language learning flashcard creator.
Given a text, extract key vocabulary, phrases, grammar rules, and concepts.
Create between 3 and 10 flashcard pairs. Each flashcard must have:
- question: testing knowledge of a specific item from the text
- answer: a clear, concise explanation or translation
Focus on the most important and learnable content for a language learner.`;

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
    const { text: aiText } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      prompt: `${SYSTEM_PROMPT}\n\nText:\n${inputText}\n\nRespond with ONLY valid JSON matching this structure: {"flashcards":[{"question":"...","answer":"..."}]}`,
    });

    const parsed = flashcardsOutputSchema.safeParse(JSON.parse(aiText));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "AI returned invalid data" }), { status: 500 });
    }
    return new Response(JSON.stringify(parsed.data), {
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

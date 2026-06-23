import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FlashcardsOutput } from "@/lib/ai-schemas";

// ── Internal types ────────────────────────────────────────────────────────────

interface ProposalItem {
  id: string;
  question: string;
  answer: string;
  disposition: "pending" | "saving" | "accepted" | "rejected";
  isEditing: boolean;
  editQuestion: string;
  editAnswer: string;
  saveError: string | null;
}

type GeneratorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "reviewing"; proposals: ProposalItem[] }
  | { status: "summary"; accepted: number };

interface FlashcardGeneratorProps {
  onComplete: (acceptedCount: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIN_LEN = 40;
const MAX_LEN = 1000;

function makeProposal(q: string, a: string): ProposalItem {
  return {
    id: crypto.randomUUID(),
    question: q,
    answer: a,
    disposition: "pending",
    isEditing: false,
    editQuestion: q,
    editAnswer: a,
    saveError: null,
  };
}

// ── Sub-component: ProposalCard ───────────────────────────────────────────────

interface ProposalCardProps {
  proposal: ProposalItem;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onEditStart: (id: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: (id: string) => void;
  onEditChange: (id: string, field: "editQuestion" | "editAnswer", value: string) => void;
  onRetry: (id: string) => void;
}

function ProposalCard({
  proposal,
  onAccept,
  onReject,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditChange,
  onRetry,
}: ProposalCardProps) {
  const { id, question, answer, disposition, isEditing, editQuestion, editAnswer, saveError } = proposal;

  const isAccepted = disposition === "accepted";
  const isRejected = disposition === "rejected";
  const isSaving = disposition === "saving";
  const isPending = disposition === "pending";

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-opacity ${
        isAccepted ? "border-green-500/40 bg-green-500/5 opacity-60" : ""
      } ${isRejected ? "opacity-30" : ""} ${!isAccepted && !isRejected ? "bg-card" : ""}`}
    >
      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wide uppercase">
              Pytanie
            </label>
            <Textarea
              value={editQuestion}
              onChange={(e) => {
                onEditChange(id, "editQuestion", e.target.value);
              }}
              rows={2}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium tracking-wide uppercase">
              Odpowiedź
            </label>
            <Textarea
              value={editAnswer}
              onChange={(e) => {
                onEditChange(id, "editAnswer", e.target.value);
              }}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onEditSave(id);
              }}
              disabled={!editQuestion.trim() || !editAnswer.trim()}
            >
              Zapisz i zaakceptuj
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onEditCancel(id);
              }}
            >
              Anuluj
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Pytanie</p>
          <p className="mb-3 text-sm">{question}</p>
          <hr className="my-3" />
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Odpowiedź</p>
          <p className="mb-3 text-sm">{answer}</p>

          {saveError && (
            <p className="text-destructive mb-2 text-xs">
              {saveError}{" "}
              <button
                className="underline"
                onClick={() => {
                  onRetry(id);
                }}
              >
                Spróbuj ponownie
              </button>
            </p>
          )}

          {isAccepted && <p className="text-xs font-medium text-green-600">✓ Zaakceptowano</p>}
          {isRejected && <p className="text-muted-foreground text-xs">Odrzucono</p>}

          {(isPending || saveError) && !isSaving && !isAccepted && !isRejected && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onAccept(id);
                }}
              >
                Zaakceptuj
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onEditStart(id);
                }}
              >
                Edytuj
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onReject(id);
                }}
              >
                Odrzuć
              </Button>
            </div>
          )}

          {isSaving && <p className="text-muted-foreground mt-3 text-xs">Zapisywanie…</p>}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FlashcardGenerator({ onComplete }: FlashcardGeneratorProps) {
  const [text, setText] = useState("");
  const [state, setState] = useState<GeneratorState>({ status: "idle" });
  // Updated after each render (not during render) — safe to read in async event handlers
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isBlocked = state.status === "loading" || state.status === "reviewing";

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Computes next state and calls onComplete if transitioning to summary
  function toSummaryOrReviewing(proposals: ProposalItem[]): GeneratorState {
    const allDone =
      proposals.length > 0 && proposals.every((p) => p.disposition === "accepted" || p.disposition === "rejected");
    if (!allDone) return { status: "reviewing", proposals };
    const accepted = proposals.filter((p) => p.disposition === "accepted").length;
    onComplete(accepted);
    return { status: "summary", accepted };
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (text.length < MIN_LEN || isBlocked) return;
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/generate-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Błąd ${res.status}`);
      }

      const data = (await res.json()) as FlashcardsOutput;
      const proposals = data.flashcards.map((f) => makeProposal(f.question, f.answer));
      setState({ status: "reviewing", proposals });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Nieznany błąd" });
    }
  }

  function updateProposalPatch(id: string, patch: Partial<ProposalItem>) {
    setState((prev) => {
      if (prev.status !== "reviewing") return prev;
      return {
        ...prev,
        proposals: prev.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      };
    });
  }

  async function handleAccept(id: string, question?: string, answer?: string) {
    const current = stateRef.current;
    if (current.status !== "reviewing") return;
    const proposal = current.proposals.find((p) => p.id === id);
    if (!proposal) return;
    if (proposal.disposition === "saving") return;

    const q = question ?? proposal.question;
    const a = answer ?? proposal.answer;

    updateProposalPatch(id, { disposition: "saving", saveError: null });

    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, answer: a }),
      });

      if (!res.ok) throw new Error(`Błąd zapisu ${res.status}`);

      // Compute transition using latest state from ref (async-safe)
      const latest = stateRef.current;
      if (latest.status !== "reviewing") return;
      const updated = latest.proposals.map((p) =>
        p.id === id ? { ...p, disposition: "accepted" as const, question: q, answer: a } : p,
      );
      setState(toSummaryOrReviewing(updated));
    } catch (err) {
      updateProposalPatch(id, {
        disposition: "pending",
        saveError: err instanceof Error ? err.message : "Błąd zapisu",
        isEditing: true,
        editQuestion: q,
        editAnswer: a,
      });
    }
  }

  function handleReject(id: string) {
    if (state.status !== "reviewing") return;
    const updated = state.proposals.map((p) => (p.id === id ? { ...p, disposition: "rejected" as const } : p));
    setState(toSummaryOrReviewing(updated));
  }

  function handleEditStart(id: string) {
    if (state.status !== "reviewing") return;
    const proposal = state.proposals.find((p) => p.id === id);
    if (!proposal) return;
    updateProposalPatch(id, {
      isEditing: true,
      editQuestion: proposal.question,
      editAnswer: proposal.answer,
    });
  }

  function handleEditSave(id: string) {
    if (state.status !== "reviewing") return;
    const proposal = state.proposals.find((p) => p.id === id);
    if (!proposal) return;
    updateProposalPatch(id, { isEditing: false });
    void handleAccept(id, proposal.editQuestion, proposal.editAnswer);
  }

  function handleEditCancel(id: string) {
    updateProposalPatch(id, { isEditing: false });
  }

  function handleEditChange(id: string, field: "editQuestion" | "editAnswer", value: string) {
    updateProposalPatch(id, { [field]: value });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Text input — always visible, blocked during loading/reviewing */}
      <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
        <h3 className="mb-3 text-sm font-medium text-white/80">Wklej tekst do nauki</h3>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          disabled={isBlocked}
          maxLength={MAX_LEN}
          rows={5}
          placeholder="Wklej artykuł, dialog lub fragment podręcznika (min. 40 znaków)…"
          className="resize-none bg-white/5 text-white placeholder:text-white/30"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs ${text.length < MIN_LEN ? "text-white/40" : "text-white/60"}`}>
            {text.length} / {MAX_LEN}
          </span>
          <Button onClick={() => void handleGenerate()} disabled={text.length < MIN_LEN || isBlocked}>
            {state.status === "loading" ? "Generowanie…" : "Generuj fiszki"}
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {state.status === "loading" && (
        <div className="flex items-center justify-center gap-3 py-10 text-white/70">
          <span className="animate-spin text-xl">⏳</span>
          <span>AI generuje fiszki…</span>
        </div>
      )}

      {/* Error state */}
      {state.status === "error" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="mb-3 text-sm text-red-300">{state.message}</p>
          <Button
            variant="outline"
            onClick={() => {
              setState({ status: "idle" });
            }}
          >
            Spróbuj ponownie
          </Button>
        </div>
      )}

      {/* Reviewing state — proposals list */}
      {state.status === "reviewing" && (
        <div className="space-y-3">
          <p className="text-sm text-white/60">
            {state.proposals.filter((p) => p.disposition === "pending" || p.disposition === "saving").length} z{" "}
            {state.proposals.length} propozycji do obsłużenia
          </p>
          {state.proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onAccept={(id) => void handleAccept(id)}
              onReject={handleReject}
              onEditStart={handleEditStart}
              onEditSave={handleEditSave}
              onEditCancel={handleEditCancel}
              onEditChange={handleEditChange}
              onRetry={(id) => void handleAccept(id)}
            />
          ))}
        </div>
      )}

      {/* Summary state */}
      {state.status === "summary" && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-8 text-center">
          <p className="mb-2 text-2xl">🎉</p>
          <p className="mb-4 text-lg font-semibold text-white">Zaakceptowano {state.accepted} fiszek</p>
          <Button
            variant="outline"
            onClick={() => {
              setText("");
              setState({ status: "idle" });
            }}
          >
            Wygeneruj kolejne
          </Button>
        </div>
      )}
    </div>
  );
}

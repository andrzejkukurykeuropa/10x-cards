import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FlashcardDto, StudyMode, StudyRating } from "@/types";

// ── Internal types ────────────────────────────────────────────────────────────

type SessionState =
  | { status: "mode-select" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty"; mode: StudyMode }
  | {
      status: "session";
      mode: StudyMode;
      queue: FlashcardDto[];
      index: number;
      revealed: boolean;
      submitting: boolean;
      submitError: string | null;
      ratingCounts: Record<StudyRating, number>;
      confirmingExit: boolean;
    }
  | { status: "summary"; reviewed: number; ratingCounts: Record<StudyRating, number> };

const RATING_LABELS: Record<StudyRating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const EMPTY_RATING_COUNTS: Record<StudyRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };

// Fisher–Yates shuffle
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StudySession() {
  const [state, setState] = useState<SessionState>({ status: "mode-select" });
  // Updated after each render (not during render) — safe to read in async event handlers
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  async function handleSelectMode(mode: StudyMode) {
    setState({ status: "loading" });

    try {
      const res = await fetch(`/api/study/queue?mode=${mode}`);
      if (!res.ok) throw new Error(`Błąd ${res.status}`);

      const data = (await res.json()) as FlashcardDto[];
      if (data.length === 0) {
        setState({ status: "empty", mode });
        return;
      }

      setState({
        status: "session",
        mode,
        queue: shuffle(data),
        index: 0,
        revealed: false,
        submitting: false,
        submitError: null,
        ratingCounts: { ...EMPTY_RATING_COUNTS },
        confirmingExit: false,
      });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Nieznany błąd" });
    }
  }

  function handleReveal() {
    setState((prev) => (prev.status === "session" ? { ...prev, revealed: true } : prev));
  }

  function handleRequestExit() {
    setState((prev) => (prev.status === "session" ? { ...prev, confirmingExit: true } : prev));
  }

  function handleCancelExit() {
    setState((prev) => (prev.status === "session" ? { ...prev, confirmingExit: false } : prev));
  }

  function handleConfirmExit() {
    window.location.href = "/dashboard";
  }

  async function handleRate(rating: StudyRating) {
    const current = stateRef.current;
    if (current.status !== "session" || current.submitting) return;

    const card = current.queue[current.index];
    setState({ ...current, submitting: true, submitError: null });

    try {
      const res = await fetch("/api/study/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, rating }),
      });

      if (!res.ok) throw new Error(`Błąd zapisu ${res.status}`);

      const latest = stateRef.current;
      if (latest.status !== "session") return;

      const ratingCounts = { ...latest.ratingCounts, [rating]: latest.ratingCounts[rating] + 1 };
      const nextIndex = latest.index + 1;

      if (nextIndex < latest.queue.length) {
        setState({
          ...latest,
          index: nextIndex,
          revealed: false,
          submitting: false,
          submitError: null,
          ratingCounts,
        });
      } else {
        setState({ status: "summary", reviewed: latest.queue.length, ratingCounts });
      }
    } catch (err) {
      setState((prev) =>
        prev.status === "session"
          ? { ...prev, submitting: false, submitError: err instanceof Error ? err.message : "Błąd zapisu" }
          : prev,
      );
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (state.status === "mode-select") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-blue-100/80">Wybierz tryb sesji</p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => void handleSelectMode("due")}>Do powtórki dziś</Button>
          <Button variant="outline" onClick={() => void handleSelectMode("all")}>
            Wszystkie fiszki
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-3 py-10 text-white/70">
        <span className="animate-spin text-xl">⏳</span>
        <span>Ładowanie sesji…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
        <p className="mb-3 text-sm text-red-300">{state.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            setState({ status: "mode-select" });
          }}
        >
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="mb-4 text-blue-100/80">
          {state.mode === "due" ? "Brak fiszek do powtórki dziś 🎉" : "Kolekcja jest pusta"}
        </p>
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setState({ status: "mode-select" });
            }}
          >
            Wybierz inny tryb
          </Button>
          <a href="/dashboard">
            <Button variant="ghost">Powrót do dashboardu</Button>
          </a>
        </div>
      </div>
    );
  }

  if (state.status === "summary") {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-8 text-center">
        <p className="mb-2 text-2xl">🎉</p>
        <p className="mb-4 text-lg font-semibold text-white">Przejrzano {state.reviewed} fiszek</p>
        <div className="mb-6 flex justify-center gap-4 text-sm text-blue-100/80">
          {(Object.keys(RATING_LABELS) as StudyRating[]).map((rating) => (
            <span key={rating}>
              {RATING_LABELS[rating]}: {state.ratingCounts[rating]}
            </span>
          ))}
        </div>
        <div className="flex justify-center gap-3">
          <Button
            onClick={() => {
              setState({ status: "mode-select" });
            }}
          >
            Nowa sesja
          </Button>
          <a href="/dashboard">
            <Button variant="outline">Powrót do dashboardu</Button>
          </a>
        </div>
      </div>
    );
  }

  // status === "session"
  const card = state.queue[state.index];
  const reviewedCount = Object.values(state.ratingCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-blue-100/60">
          Karta {state.index + 1} z {state.queue.length}
        </p>
        <Button size="sm" variant="ghost" onClick={handleRequestExit}>
          Zakończ sesję
        </Button>
      </div>

      {state.confirmingExit ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="mb-4 text-white">
            Oceniono {reviewedCount} z {state.queue.length} fiszek. Na pewno zakończyć sesję?
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="destructive" onClick={handleConfirmExit}>
              Zakończ
            </Button>
            <Button variant="outline" onClick={handleCancelExit}>
              Anuluj
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <p className="mb-1 text-xs font-medium tracking-wide text-blue-100/60 uppercase">Pytanie</p>
            <p className="mb-4 text-white">{card.question}</p>

            {state.revealed && (
              <>
                <hr className="my-4 border-white/10" />
                <p className="mb-1 text-xs font-medium tracking-wide text-blue-100/60 uppercase">Odpowiedź</p>
                <p className="text-white">{card.answer}</p>
              </>
            )}
          </div>

          {state.submitError && (
            <p className="text-center text-sm text-red-300">{state.submitError} — wybierz ocenę ponownie poniżej.</p>
          )}

          {!state.revealed ? (
            <div className="flex justify-center">
              <Button onClick={handleReveal}>Pokaż odpowiedź</Button>
            </div>
          ) : (
            <div className="flex justify-center gap-3">
              {(Object.keys(RATING_LABELS) as StudyRating[]).map((rating) => (
                <Button key={rating} disabled={state.submitting} onClick={() => void handleRate(rating)}>
                  {RATING_LABELS[rating]}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

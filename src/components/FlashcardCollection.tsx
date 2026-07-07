import { useEffect, useState } from "react";
import type { FlashcardDto } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CollectionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "data"; flashcards: FlashcardDto[] };

interface ActiveCard {
  id: string;
  mode: "editing" | "saving" | "confirm-delete";
  editQuestion?: string;
  editAnswer?: string;
  error?: string;
}

interface FlashcardCollectionProps {
  refreshKey?: number;
}

export default function FlashcardCollection({ refreshKey }: FlashcardCollectionProps) {
  const [state, setState] = useState<CollectionState>({ status: "loading" });
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/flashcards", { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Błąd ${res.status}`);
        }
        return res.json() as Promise<FlashcardDto[]>;
      })
      .then((data: FlashcardDto[]) => {
        setState(data.length === 0 ? { status: "empty" } : { status: "data", flashcards: data });
        setActiveCard(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Nieznany błąd" });
      });
    return () => {
      ctrl.abort();
    };
  }, [refreshKey, localRefreshKey]);

  async function handleSave(cardId: string) {
    if (activeCard?.mode !== "editing") return;
    const { editQuestion, editAnswer } = activeCard;
    setActiveCard({ id: cardId, mode: "saving", editQuestion, editAnswer });
    try {
      const res = await fetch(`/api/flashcards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: editQuestion, answer: editAnswer }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActiveCard({
          id: cardId,
          mode: "editing",
          editQuestion,
          editAnswer,
          error: data.error ?? `Błąd ${res.status}`,
        });
        return;
      }
      setLocalRefreshKey((k) => k + 1);
    } catch {
      setActiveCard({ id: cardId, mode: "editing", editQuestion, editAnswer, error: "Błąd połączenia" });
    }
  }

  async function handleDelete(cardId: string) {
    try {
      const res = await fetch(`/api/flashcards/${cardId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActiveCard({ id: cardId, mode: "confirm-delete", error: data.error ?? `Błąd ${res.status}` });
        return;
      }
      setLocalRefreshKey((k) => k + 1);
    } catch {
      setActiveCard({ id: cardId, mode: "confirm-delete", error: "Błąd połączenia" });
    }
  }

  if (state.status === "loading") {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-12">
        <span>Ładowanie fiszek…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="border-destructive bg-destructive/10 text-destructive rounded-xl border p-4">
        <p>Nie udało się załadować fiszek: {state.message}</p>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="text-5xl">📚</span>
        <h2 className="text-xl font-semibold">Twoja kolekcja jest pusta</h2>
        <p className="text-muted-foreground">Wygeneruj pierwsze fiszki, wklejając tekst i uruchamiając AI.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {state.flashcards.map((card) => {
        const isActive = activeCard?.id === card.id;

        if (isActive && (activeCard.mode === "editing" || activeCard.mode === "saving")) {
          const isSaving = activeCard.mode === "saving";
          return (
            <div key={card.id} className="bg-card rounded-xl border p-4 shadow-sm">
              <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Pytanie</p>
              <Textarea
                value={activeCard.editQuestion ?? ""}
                onChange={(e) => {
                  if (!isSaving)
                    setActiveCard({
                      id: card.id,
                      mode: "editing",
                      editQuestion: e.target.value,
                      editAnswer: activeCard.editAnswer,
                    });
                }}
                disabled={isSaving}
                className="mb-3 text-sm"
              />
              <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Odpowiedź</p>
              <Textarea
                value={activeCard.editAnswer ?? ""}
                onChange={(e) => {
                  if (!isSaving)
                    setActiveCard({
                      id: card.id,
                      mode: "editing",
                      editQuestion: activeCard.editQuestion,
                      editAnswer: e.target.value,
                    });
                }}
                disabled={isSaving}
                className="text-sm"
              />
              {activeCard.error && <p className="text-destructive mt-2 text-xs">{activeCard.error}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => handleSave(card.id)} disabled={isSaving}>
                  {isSaving ? "Zapisywanie…" : "Zapisz"}
                </Button>
                {!isSaving && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveCard(null);
                    }}
                  >
                    Anuluj
                  </Button>
                )}
              </div>
            </div>
          );
        }

        if (isActive && activeCard.mode === "confirm-delete") {
          return (
            <div key={card.id} className="bg-card rounded-xl border p-4 shadow-sm">
              <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Pytanie</p>
              <p className="text-sm">{card.question}</p>
              <hr className="my-3" />
              <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Odpowiedź</p>
              <p className="text-sm">{card.answer}</p>
              <p className="mt-3 text-sm font-medium">Na pewno usunąć tę fiszkę?</p>
              {activeCard.error && <p className="text-destructive mt-1 text-xs">{activeCard.error}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => handleDelete(card.id)}>
                  Tak, usuń
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setActiveCard(null);
                  }}
                >
                  Nie
                </Button>
              </div>
            </div>
          );
        }

        const isMutating = activeCard?.mode === "saving";
        return (
          <div key={card.id} className="bg-card rounded-xl border p-4 shadow-sm">
            <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Pytanie</p>
            <p className="text-sm">{card.question}</p>
            <hr className="my-3" />
            <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Odpowiedź</p>
            <p className="text-sm">{card.answer}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isMutating}
                onClick={() => {
                  setActiveCard({ id: card.id, mode: "editing", editQuestion: card.question, editAnswer: card.answer });
                }}
              >
                Edytuj
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isMutating}
                onClick={() => {
                  setActiveCard({ id: card.id, mode: "confirm-delete" });
                }}
              >
                Usuń
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

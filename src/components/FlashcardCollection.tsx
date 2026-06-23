import { useEffect, useState } from "react";
import type { FlashcardDto } from "@/types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "data"; flashcards: FlashcardDto[] };

interface FlashcardCollectionProps {
  refreshKey?: number;
}

export default function FlashcardCollection({ refreshKey }: FlashcardCollectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/flashcards", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Błąd ${res.status}`);
        return res.json();
      })
      .then((data: FlashcardDto[]) => {
        setState(data.length === 0 ? { status: "empty" } : { status: "data", flashcards: data });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Nieznany błąd" });
      });
    return () => {
      ctrl.abort();
    };
  }, [refreshKey]);

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
      {state.flashcards.map((card) => (
        <div key={card.id} className="bg-card rounded-xl border p-4 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Pytanie</p>
          <p className="text-sm">{card.question}</p>
          <hr className="my-3" />
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Odpowiedź</p>
          <p className="text-sm">{card.answer}</p>
        </div>
      ))}
    </div>
  );
}

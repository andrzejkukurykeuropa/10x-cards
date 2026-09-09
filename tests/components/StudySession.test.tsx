// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudySession from "@/components/StudySession";
import type { FlashcardDto } from "@/types";

/**
 * SCOPE (test-plan §3 Faza 3, Ryzyko #4): warstwa komponentu. Pokrywa KLIENCKĄ
 * połowę Ryzyka #4 — „zła kolejność" / zgubiona ocena — dla najgorętszego pliku
 * obszaru (`src/components/StudySession.tsx`). Renderuje prawdziwy komponent;
 * `fetch` jest stubowany (routing po URL), scheduler / endpointy nie biegną.
 *
 * KONWENCJA „świadoma regresja" (test-plan §6.4 pkt 7 / §6.6): przypadek 3.2
 * utrwala OBECNY, niepożądany efekt wyścigu double-click. Komentarz blokowy +
 * nazwa testu mówią „dokumentujemy … , nie wymagamy …"; test jest zaprojektowany
 * tak, by ZŁAMAŁ SIĘ, gdy `handleRate` dostanie synchroniczny guard. Ten plik nie
 * zmienia kodu produkcyjnego.
 *
 * Globalne `environment` w vitest.config.ts to `node`; ten plik wybiera jsdom
 * przez docblock powyżej (wzorzec z `tests/components/FlashcardGenerator.test.tsx`).
 */

function makeCard(over: Partial<FlashcardDto>): FlashcardDto {
  return {
    id: crypto.randomUUID(),
    question: "Pytanie",
    answer: "Odpowiedź",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    due_date: null,
    repetitions: 0,
    stability: 0,
    difficulty: 0,
    state: "New",
    lapses: 0,
    last_review: null,
    scheduled_days: 0,
    ...over,
  };
}

const QUEUE: FlashcardDto[] = [
  makeCard({ question: "Pytanie 1", answer: "Odpowiedź 1" }),
  makeCard({ question: "Pytanie 2", answer: "Odpowiedź 2" }),
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();
// Reassignowane per test — odpowiada za n-te (0-indeksowane) żądanie `/api/study/review`.
let reviewResponder: (call: number) => Response = () => jsonResponse({}, 200);

beforeEach(() => {
  fetchMock.mockReset();
  reviewResponder = () => jsonResponse({}, 200);

  let reviewCall = 0;
  fetchMock.mockImplementation((input: string | URL) => {
    const href = input.toString();
    if (href.includes("/api/study/queue")) return Promise.resolve(jsonResponse(QUEUE));
    if (href.includes("/api/study/review")) return Promise.resolve(reviewResponder(reviewCall++));
    return Promise.reject(new Error(`nieoczekiwany fetch: ${href}`));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const reviewCallCount = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/study/review")).length;

const BANNER = /wybierz ocenę ponownie poniżej/;

async function enterSessionAndReveal() {
  render(<StudySession />);
  fireEvent.click(screen.getByRole("button", { name: "Do powtórki dziś" }));
  await screen.findByText("Karta 1 z 2");
  fireEvent.click(screen.getByRole("button", { name: "Pokaż odpowiedź" }));
}

describe("StudySession — ocena karty (Ryzyko #4, warstwa komponentu)", () => {
  it("3.1 kontrola pozytywna — pojedyncze kliknięcie oceny: jeden POST, przejście do następnej karty, brak bannera", async () => {
    await enterSessionAndReveal();

    fireEvent.click(screen.getByRole("button", { name: "Good" }));

    await screen.findByText("Karta 2 z 2");
    expect(reviewCallCount()).toBe(1);
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it("3.2 ŚWIADOMA REGRESJA §E.1 — dwa kliknięcia w jednym ticku: oba strzelają POST, fałszywy banner na następnej karcie", async () => {
    /*
     * DOKUMENTUJEMY §E.1: `handleRate` guard czyta `stateRef.current`
     * synchronizowany w `useEffect` (na commit, nie synchronicznie), a
     * `disabled={state.submitting}` działa dopiero po re-renderze. Dwa kliknięcia
     * w jednym ticku (tu: dwa różne przyciski oceny) oba przechodzą guard i oba
     * wywołują `fetch`. Drugie żądanie dostaje `409`, którego `catch` maluje
     * banner błędu na JUŻ-NASTĘPNEJ karcie (pierwsze żądanie się powiodło i
     * przesunęło `index`) i gubi tę ocenę z `ratingCounts` (Ryzyko #4 „zła
     * kolejność" / utrata postępu).
     *
     * NIE WYMAGAMY tego zachowania — ten test ZŁAMIE SIĘ, gdy `handleRate`
     * dostanie synchroniczny guard (np. `useRef` ustawiany na górze handlera
     * przed pierwszym `await`, resetowany w `finally`).
     */
    reviewResponder = (call) => (call === 0 ? jsonResponse({}, 200) : jsonResponse({ error: "conflict" }, 409));

    await enterSessionAndReveal();

    const good = screen.getByRole("button", { name: "Good" });
    const easy = screen.getByRole("button", { name: "Easy" });

    // Oba kliknięcia MUSZĄ trafić w tym samym ticku, ZANIM React przetworzy
    // setState({submitting:true}) i zanim useEffect zsynchronizuje stateRef —
    // dlatego jeden `act` i natywny `dispatchEvent`, nie dwa osobne `fireEvent`
    // (te flushują act między sobą i drugie kliknięcie trafiłoby w disabled).
    await act(async () => {
      good.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      easy.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // Domknij act po rozwiązaniu obu żądań fetch i wynikających setState.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Guard NIE zablokował drugiego żądania.
    await waitFor(() => {
      expect(reviewCallCount()).toBe(2);
    });

    // Obserwowalny efekt dla użytkownika: pierwsze żądanie się powiodło (przejście
    // do „Karta 2 z 2"), a mimo to widnieje banner błędu — namalowany przez `409`
    // drugiego żądania na następnej karcie.
    expect(await screen.findByText(BANNER)).toBeTruthy();
    expect(screen.getByText("Karta 2 z 2")).toBeTruthy();
  });

  it("3.3 kontrola pozytywna — banner błędu znika po udanym ponowieniu oceny", async () => {
    // Pierwszy przegląd 500 → banner; drugi (ta sama karta) 200 → banner znika,
    // widok przechodzi do następnej karty. Potwierdza, że mechanizm bannera sam
    // w sobie działa — kontrastuje z 3.2, gdzie banner jest FAŁSZYWY.
    reviewResponder = (call) => (call === 0 ? jsonResponse({ error: "boom" }, 500) : jsonResponse({}, 200));

    await enterSessionAndReveal();

    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(await screen.findByText(BANNER)).toBeTruthy();
    expect(screen.getByText("Karta 1 z 2")).toBeTruthy(); // nie przeszło dalej

    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    await screen.findByText("Karta 2 z 2");
    expect(screen.queryByText(BANNER)).toBeNull();
    expect(reviewCallCount()).toBe(2);
  });
});

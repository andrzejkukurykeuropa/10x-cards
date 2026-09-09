import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { POST as flashcardsPost } from "@/pages/api/flashcards";
import { GET as studyQueueGet } from "@/pages/api/study/queue";
import { POST as studyReviewPost } from "@/pages/api/study/review";
import type { FlashcardDto, StudyRating } from "@/types";
import { buildApiContext, createCookieJar } from "../helpers/api-context";
import { signInAsTestUser, cleanupFlashcards } from "../helpers/test-session";
import { TEST_USER_A } from "../helpers/test-users";

/**
 * SCOPE (test-plan §3 Faza 3, Ryzyko #4): warstwa integracyjna. Dowodzi na
 * poziomie HTTP (handler wywołany bezpośrednio, bez serwera), że zakończony
 * przegląd utrwala pola harmonogramu WŁAŚCIWEJ karty i że karta znika z
 * `mode=due`. Odróżnia się od `tests/api/study-isolation.test.ts`, który pokrywa
 * autoryzację (Ryzyko #3) — ten plik nie dotyka izolacji między użytkownikami.
 *
 * Prawdziwy `ts-fsrs` biegnie w handlerze — scheduler NIE jest mockowany.
 * Oczekiwany harmonogram jest wyprowadzany niezależnie jako właściwości
 * (kierunek, relacje, przynależność), nigdy przez ponowne uruchomienie
 * `scheduler.next` w teście (anty-wzorzec test-plan §2 #4).
 *
 * KONWENCJA "świadoma regresja" (test-plan §6.4 pkt 7 / §6.6): przypadki 2.3 i
 * 2.5 utrwalają OBECNE, niepożądane zachowanie. Komentarz blokowy + nazwa testu
 * mówią "dokumentujemy … , nie wymagamy …"; test jest zaprojektowany tak, by
 * ZŁAMAŁ SIĘ, gdy poprawka wejdzie. Ten plik nie zmienia kodu produkcyjnego.
 *
 * Wszystkie asercje są id-scoped: `fileParallelism` NIE jest wyłączone, a tabela
 * `flashcards` jest dzielona między stałych użytkowników i pliki testowe. `id`
 * rejestrujemy do `createdIds` ZARAZ po `201`, żeby `afterEach` posprzątał nawet
 * gdy asercja przeglądu zawiedzie.
 */

let sessionA: { cookieHeader: string; user: User };
const createdIds: string[] = [];

beforeAll(async () => {
  sessionA = await signInAsTestUser(TEST_USER_A);
});

afterEach(async () => {
  await cleanupFlashcards(createdIds.splice(0));
});

// Zawęża `string | null` bez asercji (`!` / `as` zabronione przez konfigurację
// ESLint) — twarda porażka testu, gdy pole nieoczekiwanie NULL.
function parseTime(iso: string | null): number {
  if (iso === null) throw new Error("oczekiwano niepustego znacznika czasu, otrzymano null");
  return new Date(iso).getTime();
}

async function createCard(): Promise<string> {
  const context = buildApiContext({
    method: "POST",
    url: "http://localhost/api/flashcards",
    headers: { "Content-Type": "application/json", Cookie: sessionA.cookieHeader },
    body: JSON.stringify({ question: "FSRS scheduling question", answer: "FSRS scheduling answer" }),
    cookies: createCookieJar(),
    locals: { user: sessionA.user },
  });
  const response = await flashcardsPost(context);
  expect(response.status).toBe(201);
  const body = (await response.json()) as { id: string };
  // Rejestruj natychmiast po 201 — przed jakąkolwiek asercją przeglądu.
  createdIds.push(body.id);
  return body.id;
}

// Świeży `Request` (i kontekst) per wywołanie — ciało `Request` jest jednorazowe.
async function review(id: string, rating: StudyRating): Promise<Response> {
  const context = buildApiContext({
    method: "POST",
    url: "http://localhost/api/study/review",
    headers: { "Content-Type": "application/json", Cookie: sessionA.cookieHeader },
    body: JSON.stringify({ id, rating }),
    cookies: createCookieJar(),
    locals: { user: sessionA.user },
  });
  return studyReviewPost(context);
}

async function queueRows(mode: "due" | "all"): Promise<FlashcardDto[]> {
  const context = buildApiContext({
    method: "GET",
    url: `http://localhost/api/study/queue?mode=${mode}`,
    headers: { Cookie: sessionA.cookieHeader },
    cookies: createCookieJar(),
    locals: { user: sessionA.user },
  });
  const response = await studyQueueGet(context);
  expect(response.status).toBe(200);
  return (await response.json()) as FlashcardDto[];
}

describe("POST /api/study/review — round-trip harmonogramu (Ryzyko #4)", () => {
  it("2.1 kontrola pozytywna — zakończony przegląd utrwala pola harmonogramu właściwej karty", async () => {
    const id = await createCard();

    const response = await review(id, "good");
    expect(response.status).toBe(200);
    const body = (await response.json()) as FlashcardDto;

    // Właściwości gwarantowane przez FSRS + okablowanie, nie wartości liczone
    // przez `scheduleReview`:
    expect(body.id).toBe(id);
    expect(body.state).toBe("Review"); // enable_short_term:false ⇒ New → Review
    expect(body.repetitions).toBe(1); // dokładnie +1 na udany przegląd
    expect(body.last_review).not.toBeNull();
    expect(parseTime(body.due_date)).toBeGreaterThan(Date.now());

    // "Utrwalone" = widoczne w świeżym GET, nie tylko w odpowiedzi POST (dowód,
    // że UPDATE trafił bazę).
    const row = (await queueRows("all")).find((f) => f.id === id);
    expect(row?.state).toBe("Review");
    expect(row?.repetitions).toBe(1);
    expect(row?.last_review).toBe(body.last_review);
    expect(row?.due_date).toBe(body.due_date);
  });

  it("2.2 zaplanowana karta opuszcza `mode=due`, pozostaje w `mode=all`", async () => {
    const id = await createCard();

    // Świeża karta (`due_date IS NULL`) jest w kolejce najbliższych powtórek.
    expect((await queueRows("due")).some((f) => f.id === id)).toBe(true);

    const response = await review(id, "good");
    expect(response.status).toBe(200);

    // Po przeglądzie `due_date` jest w przyszłości ⇒ karta wypada z `mode=due`…
    expect((await queueRows("due")).some((f) => f.id === id)).toBe(false);
    // …ale nadal istnieje i jest widoczna w `mode=all`.
    expect((await queueRows("all")).some((f) => f.id === id)).toBe(true);
  });

  it("2.3 ŚWIADOMA REGRESJA §D.2 — sekwencyjny replay zakończonego przeglądu re-graduje kartę i cofa harmonogram", async () => {
    /*
     * DOKUMENTUJEMY: `POST /api/study/review` nie jest idempotentny. CAS na
     * `last_review` chroni tylko przed RÓWNOLEGŁYM double-submit (§D.1, patrz
     * 2.4), nie przed SEKWENCYJNYM replayem już zakończonego przeglądu (retry
     * po zgubionej odpowiedzi, przycisk Wstecz + ponowna ocena, replay z kolejki
     * offline). Drugie żądanie czyta świeży wiersz po pierwszym przeglądzie,
     * liczy nowy harmonogram, a jego CAS `.eq("last_review", L1)` nadal pasuje
     * ⇒ UPDATE PRZECHODZI i karta jest oceniona drugi raz. Endpoint nigdy nie
     * sprawdza, czy karta była `due` ani czy pochodzi z kolejki. Powtórzone
     * `again` cofa harmonogram (utrata postępu, Ryzyko #4).
     *
     * NIE WYMAGAMY tego zachowania — ten test ZŁAMIE SIĘ, gdy w endpoincie
     * pojawi się kontrola idempotencji / sprawdzenie `due_date > now` (wtedy
     * drugie żądanie powinno zwrócić 4xx, nie 200).
     */
    const id = await createCard();

    const first = await review(id, "good");
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as FlashcardDto;
    expect(firstBody.state).toBe("Review");
    const dueAfterGood = parseTime(firstBody.due_date);

    // Replay tego samego `id` — obecny kontrakt: przechodzi (200), nie 409/404/422.
    const replay = await review(id, "again");
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as FlashcardDto;

    // Karta została oceniona drugi raz: `lapses` +1 (skutek `again`).
    expect(replayBody.lapses).toBe(1);
    // Harmonogram cofnięty: `again` daje krótszy interwał niż `good` z tego
    // samego stanu, a replay dzieje się ~natychmiast po pierwszym przeglądzie
    // ⇒ nowy `due_date` jest WCZEŚNIEJ niż ten ustawiony przez `good`.
    expect(parseTime(replayBody.due_date)).toBeLessThan(dueAfterGood);
  });

  it("2.4 kontrola pozytywna §D.1 — równoległy double-submit chroniony przez CAS ([200, 409], jeden przegląd zastosowany)", async () => {
    const id = await createCard();

    // `Promise.all` wymusza równoległość: oba żądania czytają `last_review = null`.
    const [a, b] = await Promise.all([review(id, "good"), review(id, "good")]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 409]);

    // Tylko jeden przegląd faktycznie zastosowany.
    const row = (await queueRows("all")).find((f) => f.id === id);
    expect(row?.repetitions).toBe(1);
  });

  it("2.5 ŚWIADOMA REGRESJA F5 — `GET /api/study/queue` nie ma kontraktu kolejności (asercja tylko przynależności zbioru)", async () => {
    /*
     * DOKUMENTUJEMY: `GET /api/study/queue` nie ma klauzuli `.order()` — kolejność
     * wierszy jest niezdefiniowana (porządek fizycznego skanu Postgresa), a
     * klient (`StudySession.tsx`) nakłada własny Fisher–Yates shuffle. Prezentacja
     * kart NIE jest częścią kontraktu API. `.limit(500)` dodatkowo ucina duże
     * zestawy `due` bez paginacji (F5, wciąż otwarte — nie testowane osobno,
     * tworzenie >500 fiszek dla stałych użytkowników jest wolne i daje wątpliwy
     * sygnał przy skali MVP).
     *
     * NIE WYMAGAMY kolejności — ten test asertuje tylko KOMPLETNOŚĆ ZBIORU i
     * ZŁAMIE SIĘ, gdy dojdzie deterministyczne sortowanie + paginacja (wtedy
     * dopisze się osobne asercje kolejności).
     */
    const ids = new Set([await createCard(), await createCard(), await createCard()]);

    const returned = (await queueRows("due")).map((f) => f.id).filter((rid) => ids.has(rid));

    // Przynależność zbioru, NIE sekwencja — brak `toEqual([a, b, c])` na tablicy.
    expect(new Set(returned)).toEqual(ids);
  });

  it("2.6 szybkie guardy kontraktu — 404 na nieznany UUID, 422 na złą ocenę", async () => {
    const missing = await review(crypto.randomUUID(), "good");
    expect(missing.status).toBe(404);

    const badRating = await review(crypto.randomUUID(), "invalid" as StudyRating);
    expect(badRating.status).toBe(422);
  });
});

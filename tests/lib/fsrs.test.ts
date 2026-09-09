import { describe, expect, it } from "vitest";
import { flashcardToCardInput, scheduleReview } from "@/lib/services/fsrs";
import type { Flashcard, StudyRating } from "@/types";

/**
 * SCOPE (test-plan §3 Faza 3, Ryzyko #4): warstwa jednostkowa. Dowodzi, że
 * `scheduleReview` / `flashcardToCardInput` poprawnie OKABLOWUJĄ `ts-fsrs` —
 * mapowanie pól (`reps` ⟷ `repetitions`, enum stanu ⟷ etykieta DB), grade
 * mapping, jednostka interwału (dni, nie minuty ⇐ `enable_short_term: false`).
 *
 * ZASADA ASERCJI: sprawdzamy WŁAŚCIWOŚĆ, którą algorytm FSRS gwarantuje z
 * definicji (kierunek zmiany, monotonia `again ≤ hard ≤ good ≤ easy`,
 * `repetitions` +1 dokładnie, granulacja dzienna), NIGDY wartości liczonej
 * przez `src/lib/services/fsrs.ts`. Nie odtwarzamy wzoru `next_recall_stability`
 * i nie uruchamiamy `scheduler.next` w teście do wyprodukowania "oczekiwanej"
 * liczby (anty-wzorzec test-plan §2 #4). Prawdziwy `scheduler` z modułu biegnie
 * bez mocka; brak Supabase, brak sieci.
 */

type FsrsRow = Pick<
  Flashcard,
  "due_date" | "stability" | "difficulty" | "scheduled_days" | "repetitions" | "lapses" | "state" | "last_review"
>;

// Ustalony `now` przekazywany jawnie do każdego wywołania — `enable_fuzz: false`
// ⇒ interwały deterministyczne, więc test nie jest flaky.
const NOW = new Date("2026-01-15T10:00:00.000Z");
const DAY_MS = 86_400_000;

const FRESH_ROW: FsrsRow = {
  due_date: null,
  stability: 0,
  difficulty: 0,
  scheduled_days: 0,
  repetitions: 0,
  lapses: 0,
  state: "New",
  last_review: null,
};

const GRADES: StudyRating[] = ["again", "hard", "good", "easy"];

// Zawęża `string | null` z FsrsRow bez asercji (`!`/`as` są zabronione przez
// konfigurację ESLint) — twarda porażka testu, gdy pole nieoczekiwanie NULL.
function toMs(iso: string | null): number {
  if (iso === null) throw new Error("oczekiwano niepustego znacznika czasu, otrzymano null");
  return new Date(iso).getTime();
}

describe("scheduleReview — świeża karta (state 'New'), każdy grade", () => {
  for (const grade of GRADES) {
    it(`'${grade}': wychodzi z 'New' do 'Review', repetitions +1, last_review = now, due w przyszłości`, () => {
      const result = scheduleReview(FRESH_ROW, grade, NOW);

      // `enable_short_term: false` ⇒ LongTermScheduler: każdy grade idzie prosto
      // do 'Review' (stany 'Learning'/'Relearning' nigdy nie są utrwalane).
      expect(result.state).toBe("Review");

      // Dokładnie +1 — łapie regresję `repetitions: card.reps + 1`.
      expect(result.repetitions).toBe(1);

      // `init()` stempluje last_review = now przy każdym grade.
      expect(typeof result.last_review).toBe("string");
      expect(toMs(result.last_review)).toBe(NOW.getTime());

      // Zaplanowana karta jest zawsze due PO chwili przeglądu.
      expect(toMs(result.due_date)).toBeGreaterThan(NOW.getTime());
    });
  }
});

describe("scheduleReview — granulacja dzienna (okablowanie `enable_short_term: false`)", () => {
  for (const grade of GRADES) {
    it(`'${grade}': scheduled_days to liczba całkowita ≥ 1 i due_date jest o tyle *dni* od now`, () => {
      const result = scheduleReview(FRESH_ROW, grade, NOW);

      expect(Number.isInteger(result.scheduled_days)).toBe(true);
      expect(result.scheduled_days).toBeGreaterThanOrEqual(1);

      // WŁAŚCIWOŚĆ, nie re-kalkulacja: interwał zwrócony przez scheduleReview,
      // przeliczony z powrotem na dni, musi równać się scheduled_days — czyli
      // due_date jest o scheduled_days *dni* od now, a nie o scheduled_days
      // *minut* (co zobaczylibyśmy, gdyby zniknął `enable_short_term: false`).
      const daysFromNow = Math.round((toMs(result.due_date) - NOW.getTime()) / DAY_MS);
      expect(daysFromNow).toBe(result.scheduled_days);
    });
  }
});

describe("scheduleReview — monotonia po jakości oceny (z tego samego świeżego wejścia)", () => {
  it("scheduled_days: again ≤ hard ≤ good ≤ easy", () => {
    const days = GRADES.map((g) => scheduleReview(FRESH_ROW, g, NOW).scheduled_days);
    const [again, hard, good, easy] = days;

    // Biblioteka gwarantuje strict `<` przez `+1` bumpy w LongTermScheduler;
    // asercja `≤` jest bezpieczna i odporna na przyszłe przypadki, gdzie surowe
    // interwały by się zrównały.
    expect(again).toBeLessThanOrEqual(hard);
    expect(hard).toBeLessThanOrEqual(good);
    expect(good).toBeLessThanOrEqual(easy);
  });

  it("due_date w tej samej kolejności rosnącej: again ≤ hard ≤ good ≤ easy", () => {
    const due = GRADES.map((g) => toMs(scheduleReview(FRESH_ROW, g, NOW).due_date));
    const [again, hard, good, easy] = due;

    expect(again).toBeLessThanOrEqual(hard);
    expect(hard).toBeLessThanOrEqual(good);
    expect(good).toBeLessThanOrEqual(easy);
  });
});

describe("scheduleReview — nazwy pól wyjściowych (kształt wiersza `flashcards`, nie `Card` z ts-fsrs)", () => {
  const result = scheduleReview(FRESH_ROW, "good", NOW);

  it("ma klucz `repetitions`, nie ma klucza `reps`", () => {
    expect(Object.keys(result)).toContain("repetitions");
    expect(Object.keys(result)).not.toContain("reps");
  });

  it("`state` to string-etykieta DB, nie liczbowy enum", () => {
    expect(typeof result.state).toBe("string");
    expect(["New", "Learning", "Review", "Relearning"]).toContain(result.state);
  });
});

describe("scheduleReview — `again` na karcie w stanie 'Review'", () => {
  // Wejście: wynik świeżego `good`, podany jako `row` do drugiego wywołania.
  const reviewRow = scheduleReview(FRESH_ROW, "good", NOW);
  const LATER = new Date("2026-01-18T10:00:00.000Z");

  it("pozostaje w 'Review' (LongTermScheduler nigdy nie utrwala 'Relearning')", () => {
    // To jest POPRAWNE zachowanie ts-fsrs przy `enable_short_term: false`, nie
    // regresja: model 2-stanowy (New → Review). Asercja pilnuje, że okablowanie
    // schedulera się nie zmieniło. (research.md:88-94)
    const result = scheduleReview(reviewRow, "again", LATER);
    expect(result.state).toBe("Review");
  });

  it("zwiększa `lapses` o dokładnie 1", () => {
    const result = scheduleReview(reviewRow, "again", LATER);
    expect(result.lapses).toBe(reviewRow.lapses + 1);
  });

  it("cofa harmonogram: due_date wcześniej niż przy równoległym `good` na tym samym wejściu", () => {
    // WŁAŚCIWOŚĆ kierunku, nie wartość: "again" musi skrócić interwał względem
    // "good" z identycznego stanu wejściowego. To OCZEKIWANE cofnięcie przy
    // realnym "again" — w odróżnieniu od cofnięcia przez replay zakończonego
    // przeglądu, które Faza 2 pinuje jako świadomą regresję (§D.2).
    const againResult = scheduleReview(reviewRow, "again", LATER);
    const goodResult = scheduleReview(reviewRow, "good", LATER);
    expect(toMs(againResult.due_date)).toBeLessThan(toMs(goodResult.due_date));
  });
});

describe("scheduleReview — `good`/`easy` na karcie w stanie 'Review'", () => {
  const reviewRow = scheduleReview(FRESH_ROW, "good", NOW);
  const LATER = new Date("2026-01-18T10:00:00.000Z");

  for (const grade of ["good", "easy"] as StudyRating[]) {
    it(`'${grade}': stability ściśle rośnie, difficulty pozostaje w [1, 10]`, () => {
      const result = scheduleReview(reviewRow, grade, LATER);
      expect(result.stability).toBeGreaterThan(reviewRow.stability);
      expect(result.difficulty).toBeGreaterThanOrEqual(1);
      expect(result.difficulty).toBeLessThanOrEqual(10);
    });
  }
});

describe("flashcardToCardInput — mapowanie wejścia", () => {
  it("`NULL due_date` ⇒ `.due` to przekazany `now` (traktowane jak 'do powtórki teraz')", () => {
    const input = flashcardToCardInput({ ...FRESH_ROW, due_date: null }, NOW);
    expect(input.due).toBe(NOW);
  });

  it("niepusty `due_date` ⇒ `.due` to ta sama wartość (string przekazany do ts-fsrs bez opakowania)", () => {
    const dueString = "2026-01-10T10:00:00.000Z";
    const input = flashcardToCardInput({ ...FRESH_ROW, due_date: dueString }, NOW);
    expect(input.due).toBe(dueString);
  });

  it("stałe: elapsed_days = 0, learning_steps = 0 (nieprzechowywane w schemacie DB)", () => {
    const input = flashcardToCardInput(FRESH_ROW, NOW);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- pole jest deprecated w ts-fsrs, ale `fsrs.ts` je ustawia; asertujemy okablowanie
    expect(input.elapsed_days).toBe(0);
    expect(input.learning_steps).toBe(0);
  });

  it("przenosi `repetitions` → `reps` i `state` bez zmiany", () => {
    const row: FsrsRow = { ...FRESH_ROW, repetitions: 3, state: "Review" };
    const input = flashcardToCardInput(row, NOW);
    expect(input.reps).toBe(3);
    expect(input.state).toBe("Review");
  });

  it("`last_review: null` ⇒ `.last_review === undefined`; niepusty ⇒ przekazany bez zmiany", () => {
    expect(flashcardToCardInput(FRESH_ROW, NOW).last_review).toBeUndefined();

    const stamp = "2026-01-14T09:00:00.000Z";
    expect(flashcardToCardInput({ ...FRESH_ROW, last_review: stamp }, NOW).last_review).toBe(stamp);
  });
});

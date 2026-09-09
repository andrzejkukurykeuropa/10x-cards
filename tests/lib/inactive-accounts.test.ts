import { describe, expect, it } from "vitest";
import { isInactiveForDeletion, isInWarningWindow } from "@/lib/inactive-accounts";

/**
 * SCOPE (test-plan §3 Faza 4, Ryzyko #6): warstwa jednostkowa. Dowodzi, że logika
 * selekcji zadania czyszczącego nieaktywne konta — dwa czyste klasyfikatory
 * `isInactiveForDeletion` / `isInWarningWindow` z `src/lib/inactive-accounts.ts` —
 * obejmuje wyłącznie konta spełniające dokładny próg nieaktywności, nigdy nie
 * dotyka aktywnego konta i daje identyczny wynik przy ponownym uruchomieniu.
 *
 * ZASADA ASERCJI: sprawdzamy WŁAŚCIWOŚĆ, nie wartość. Nie odtwarzamy `setMonth`
 * ani stałych progów w asercjach — asertujemy kierunek (konto starsze niż próg →
 * „usuń"), przynależność do półotwartego okna, wzajemną wykluczalność (nigdy oba
 * klasyfikatory `true` dla tego samego wejścia) i symetrię fallbacku `created_at`.
 *
 * Grupa „fail-closed" (brak referencji / niepoprawny znacznik → `isInactiveForDeletion`
 * `true`) jest CHARAKTERYZACJĄ celowego wyboru projektowego F1 — NIE jest to
 * świadoma regresja w rozumieniu §6.4 pkt 7 i nie oczekujemy, że poprawka ją odwróci.
 *
 * Prawdziwe funkcje z `@/lib/inactive-accounts` biegną bez mocka; brak Supabase,
 * brak sieci. Środowisko `node` (domyślne w `vitest.config.ts`).
 */

// Klasyfikatory liczą próg przez `new Date(now).setMonth(getMonth() - 24)` — arytmetyka
// na LOKALNYCH polach `Date`. Node 22 (`.nvmrc` = v22.14.0) re-odczytuje `process.env.TZ`
// przy każdej operacji `Date`, więc to jedno przypisanie przypina strefę dla całego
// pliku bez `setupFiles` ani zmian w `vitest.config.ts`.
process.env.TZ = "UTC";

// Środek dnia, środek miesiąca, miesiące docelowe bez problemu z długością: -24 mies. →
// 2024-06-15, -23 mies. → 2024-07-15 (żadnego poślizgu `setMonth` dla głównych grup).
const NOW = new Date("2026-06-15T12:00:00.000Z");

/**
 * Buduje znacznik ISO `now` cofnięty o `months` (przez `setMonth`) i opcjonalnie
 * `dayShift` dni. Ułamkowe miesiące są rozbijane na całe miesiące + ~30-dniową część,
 * żeby `setMonth` nie uciął ułamka do zera. Helper TYLKO konstruuje wejścia — nie
 * asertuje niczego i nie jest re-implementacją SUT (SUT porównuje instanty; helper
 * produkuje znacznik czasu).
 */
function monthsBefore(now: Date, months: number, dayShift = 0): string {
  const wholeMonths = Math.floor(months);
  const fractionDays = Math.round((months - wholeMonths) * 30);
  const d = new Date(now);
  d.setMonth(d.getMonth() - wholeMonths);
  d.setDate(d.getDate() - fractionDays + dayShift);
  return d.toISOString();
}

describe("kontrola pozytywna — aktywne konto", () => {
  it("logowanie wczoraj: ani do usunięcia, ani w oknie ostrzeżenia", () => {
    const yesterday = monthsBefore(NOW, 0, -1);
    expect(isInactiveForDeletion(yesterday, null, NOW)).toBe(false);
    expect(isInWarningWindow(yesterday, null, NOW)).toBe(false);
  });
});

describe("isInactiveForDeletion — kierunek i granica 24 mies.", () => {
  for (const activity of [monthsBefore(NOW, 24, -10), monthsBefore(NOW, 30)]) {
    it(`konto wyraźnie starsze niż próg (${activity}) → true`, () => {
      expect(isInactiveForDeletion(activity, null, NOW)).toBe(true);
    });
  }

  for (const activity of [monthsBefore(NOW, 24, 10), monthsBefore(NOW, 12)]) {
    it(`konto wyraźnie nowsze niż próg (${activity}) → false`, () => {
      expect(isInactiveForDeletion(activity, null, NOW)).toBe(false);
    });
  }

  it("granica należy do usunięcia: lastActivity dokładnie na progu 24 mies. → true", () => {
    // `monthsBefore(NOW, 24, 0)` odtwarza dokładnie ten sam instant, co `threshold`
    // w SUT; porównanie `<=` w `isInactiveForDeletion` znaczy, że wejście na
    // granicy jest klasyfikowane jako do usunięcia.
    expect(isInactiveForDeletion(monthsBefore(NOW, 24, 0), null, NOW)).toBe(true);
  });
});

describe("isInWarningWindow — półotwarte okno (24 mies, 23 mies]", () => {
  for (const activity of [monthsBefore(NOW, 23, -10), monthsBefore(NOW, 24, 5)]) {
    it(`wyraźnie w oknie (${activity}) → true, a isInactiveForDeletion → false (rozłączność)`, () => {
      expect(isInWarningWindow(activity, null, NOW)).toBe(true);
      expect(isInactiveForDeletion(activity, null, NOW)).toBe(false);
    });
  }

  it("za młode na okno (22 mies. temu) → false", () => {
    expect(isInWarningWindow(monthsBefore(NOW, 22), null, NOW)).toBe(false);
  });

  it("już do usunięcia (30 mies. temu) → false", () => {
    expect(isInWarningWindow(monthsBefore(NOW, 30), null, NOW)).toBe(false);
  });
});

describe("wzajemna wykluczalność — siatka wokół obu granic", () => {
  // Centralny test fazy (research OQ3, plan-brief.md:82): każda przyszła zmiana
  // `DELETION_THRESHOLD_MONTHS` / `WARNING_THRESHOLD_MONTHS`, która otworzyłaby lukę
  // albo nakładkę między oknami, łamie tę grupę.
  for (const m of [12, 22, 22.8, 23, 23.5, 24, 24.5, 30]) {
    it(`m=${m}: nigdy oba klasyfikatory true; najwyżej jeden true`, () => {
      const activity = monthsBefore(NOW, m);
      const del = isInactiveForDeletion(activity, null, NOW);
      const warn = isInWarningWindow(activity, null, NOW);

      expect(del && warn).toBe(false);
      expect([del, warn].filter((v) => v).length).toBeLessThanOrEqual(1);
    });
  }

  it("wejścia wyraźnie w każdej strefie → dokładnie jedno z {usuń, ostrzeż, żadne}", () => {
    const young = monthsBefore(NOW, 12);
    const midWarn = monthsBefore(NOW, 23, -20);
    const old = monthsBefore(NOW, 30);

    expect([isInactiveForDeletion(young, null, NOW), isInWarningWindow(young, null, NOW)]).toEqual([false, false]);
    expect([isInactiveForDeletion(midWarn, null, NOW), isInWarningWindow(midWarn, null, NOW)]).toEqual([false, true]);
    expect([isInactiveForDeletion(old, null, NOW), isInWarningWindow(old, null, NOW)]).toEqual([true, false]);
  });
});

describe("symetria fallbacku created_at", () => {
  for (const v of [monthsBefore(NOW, 30), monthsBefore(NOW, 23, -15), monthsBefore(NOW, 6), monthsBefore(NOW, 24, 0)]) {
    it(`last_sign_in_at=null + created_at=${v} klasyfikuje się identycznie jak last_sign_in_at=${v}`, () => {
      expect(isInactiveForDeletion(null, v, NOW)).toBe(isInactiveForDeletion(v, null, NOW));
      expect(isInWarningWindow(null, v, NOW)).toBe(isInWarningWindow(v, null, NOW));
    });
  }

  it("świeże created_at, last_sign_in_at=null → żaden klasyfikator nie zadziała", () => {
    const monthAgo = monthsBefore(NOW, 1);
    expect(isInactiveForDeletion(null, monthAgo, NOW)).toBe(false);
    expect(isInWarningWindow(null, monthAgo, NOW)).toBe(false);
  });
});

describe("fail-closed — brak referencji i niepoprawny znacznik (charakteryzacja F1)", () => {
  /*
   * Dokumentujemy CELOWY wybór projektowy F1 (`inactive-accounts.ts:24-31`,
   * archiwalny `impl-review.md` F1 CRITICAL): brak jakiejkolwiek referencji
   * aktywności albo śmieciowy znacznik → `isInactiveForDeletion` zwraca `true`
   * („w razie wątpliwości traktuj jako do usunięcia"). To NIE jest świadoma
   * regresja w rozumieniu §6.4 pkt 7 — nie oczekujemy, że przyszła poprawka to
   * odwróci. Fallback na `created_at` (F1) ratuje realny przypadek świeżych /
   * zaproszonych kont; ta grupa pilnuje zachowania, gdy fallback też jest pusty.
   */
  it("brak referencji (null, null) → isInactiveForDeletion true", () => {
    expect(isInactiveForDeletion(null, null, NOW)).toBe(true);
  });

  it("niepoprawny last_sign_in_at, brak created_at → true", () => {
    expect(isInactiveForDeletion("not-a-date", null, NOW)).toBe(true);
  });

  it("oba znaczniki niepoprawne → true", () => {
    expect(isInactiveForDeletion("not-a-date", "also-bad", NOW)).toBe(true);
  });

  it("isInWarningWindow dla tych samych wejść → false (już objęte przez usuwanie)", () => {
    expect(isInWarningWindow(null, null, NOW)).toBe(false);
    expect(isInWarningWindow("not-a-date", null, NOW)).toBe(false);
  });
});

describe("tolerancja arytmetyki kalendarzowej — koniec miesiąca / 29 lutego", () => {
  /*
   * `setMonth` na `now` w 31. dniu miesiąca (lub 29 lutego) może przeskoczyć o
   * 1-3 dni, gdy miesiąc docelowy jest krótszy. Poślizg jest AKCEPTOWANY — mieści
   * się w tolerancji dziennej cronu self-healing (F4). Dlatego asertujemy wyłącznie
   * kierunek, z marginesem wielu miesięcy po obu stronach granicy, nigdy porównania
   * co do dnia.
   */
  for (const now of [new Date("2026-05-31T12:00:00.000Z"), new Date("2028-02-29T12:00:00.000Z")]) {
    it(`now=${now.toISOString()}: 25 mies. temu → usuń, 20 mies. temu → nie`, () => {
      expect(isInactiveForDeletion(monthsBefore(now, 25), null, now)).toBe(true);
      expect(isInactiveForDeletion(monthsBefore(now, 20), null, now)).toBe(false);
    });

    it(`now=${now.toISOString()}: ~23,5 mies. temu → okno ostrzeżenia, 12 mies. temu → nie`, () => {
      expect(isInWarningWindow(monthsBefore(now, 23, -15), null, now)).toBe(true);
      expect(isInWarningWindow(monthsBefore(now, 12), null, now)).toBe(false);
    });
  }
});

describe("idempotencja / determinizm", () => {
  /*
   * Klasyfikator jest bezstanowy i re-wyprowadza wynik z wejścia przy każdym
   * wywołaniu — to jest „bezpieczeństwo przy ponownym uruchomieniu" z Ryzyka #6 na
   * warstwie czystej funkcji (zadanie czyszczące biegnie codziennie).
   */
  const inputs: [string | null, string | null][] = [
    [monthsBefore(NOW, 0, -1), null],
    [monthsBefore(NOW, 23, -15), null],
    [monthsBefore(NOW, 30), null],
    [null, null],
    [null, monthsBefore(NOW, 6)],
  ];

  for (const [lastSignIn, createdAt] of inputs) {
    it(`dwa kolejne wywołania zwracają identyczny wynik dla (${String(lastSignIn)}, ${String(createdAt)})`, () => {
      expect(isInactiveForDeletion(lastSignIn, createdAt, NOW)).toBe(isInactiveForDeletion(lastSignIn, createdAt, NOW));
      expect(isInWarningWindow(lastSignIn, createdAt, NOW)).toBe(isInWarningWindow(lastSignIn, createdAt, NOW));
    });
  }
});

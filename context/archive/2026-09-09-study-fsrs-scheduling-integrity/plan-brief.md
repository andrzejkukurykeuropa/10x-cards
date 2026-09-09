# Study/FSRS scheduling integrity — Krótki plan

> Pełny plan: `context/changes/study-fsrs-scheduling-integrity/plan.md`
> Badania: `context/changes/study-fsrs-scheduling-integrity/research.md`

## Co i dlaczego

Faza 3 fazowego wdrożenia testów (`test-plan.md` §3). Dostarcza pokrycie dla **Ryzyka #4** —
logika harmonogramowania FSRS uszkadza stan powtórek lub pokazuje karty w złej kolejności, a
użytkownik traci postęp nauki (Wysoki × Średnie). Kwestionujemy założenie: *„poprawność
biblioteki `ts-fsrs` implikuje, że nasz endpoint przeglądu poprawnie ją okablowuje."*

## Punkt wyjścia

Cała logika harmonogramowania to 3 czyste funkcje w `src/lib/services/fsrs.ts` +
`POST /api/study/review` (SELECT → compute → UPDATE, CAS na `last_review`, brak transakcji) +
`GET /api/study/queue` (predykat due, **brak `.order()`**, `.limit(500)`). Istnieje harness
testów integracyjnych z Fazy 1 (`buildApiContext`, `signInAsTestUser`, `cleanupFlashcards`,
2 stali użytkownicy) i warstwa komponentu jsdom/RTL z Fazy 2. **Zero testów** weryfikuje dziś
wyjście harmonogramu, round-trip przeglądu ani zachowanie klienta przy podwójnym kliknięciu.
Badanie wykryło 4 luki integralności; 3 mapują na Ryzyko #4 (§D.2 replay, F5 brak kolejności,
§E.1 double-click).

## Pożądany stan końcowy

`npm run test` przechodzi z trzema nowymi plikami: `tests/lib/fsrs.test.ts` (niezmienniki
mapowania), `tests/api/study-review.test.ts` (round-trip + świadome regresje §D.2 i F5 +
kontrola CAS §D.1), `tests/components/StudySession.test.tsx` (kontrola pojedynczego kliknięcia +
świadoma regresja §E.1). Niepożądane zachowania są **udokumentowane jako „świadome regresje"**
(łamią się, gdy poprawka wejdzie), nie naprawione. `git diff` dotyka wyłącznie `tests/**` i
`context/**`.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| §D.2 sekwencyjny replay | Labeled regression — pin obecne, bez zmian w `src/` | Reguła fazy „tylko testy" + precedens Faz 1–2; koszt×sygnał | Plan |
| Derywacja oczekiwań unit | Tylko niezmienniki / asercje jakościowe, bez liczbowych fixtures FSRS-6 | Odporność na zmianę wersji `ts-fsrs`; wystarcza do wykrycia błędnego okablowania | Plan |
| Double-click §E.1 | Test komponentu jsdom, labeled regression | `StudySession.tsx` to najgorętszy plik obszaru (4 commity/30d) | Plan |
| Kolejność kolejki | Pin braku `.order()` (F5) + „karta znika z due-queue" + unit monotonia `again<hard<good<easy` | Brak serwerowego kontraktu kolejności do naruszenia (badanie obala §2 #4) | Badania → Plan |
| `fileParallelism` | Izolacja per-test (unikalne id + cleanup), bez zmiany configu | F2 należy do Fazy 5; id-scoped asercje wystarczą | Plan |
| Multi-card „właściwa karta" | Bez dedykowanego testu | UPDATE keyed na `id`+`user_id`; asercje id-scoped w innych testach | Plan |
| OQ5 — `flashcards/[id].ts` PATCH | Potwierdzone: pisze tylko `question`/`answer` | Odczyt `[id].ts:46-56` | Plan |

## Zakres

**W zakresie:**
- Unit: `scheduleReview` / `flashcardToCardInput` — kierunek, granulacja dzienna, monotonia,
  nazwy pól, `NULL due_date`.
- Integracja: round-trip `review.ts` (utrwalenie + „karta znika z `mode=due`"), świadoma
  regresja §D.2, kontrola CAS §D.1, świadoma regresja F5 (kolejka bez kolejności), guardy 404/422.
- Komponent: kontrola pojedynczego kliknięcia, świadoma regresja §E.1, banner po `500` znika
  po ponowieniu.
- Wypełnienie `test-plan.md` §6.1 i §6.6 (notatki Fazy 3).

**Poza zakresem:**
- Jakiekolwiek zmiany w `src/**` lub `supabase/**` (naprawa §D.2 / F5 / §E.1 → osobna zmiana).
- Liczbowe fixtures FSRS-6; mockowanie `ts-fsrs`; re-uruchamianie `scheduler.next` w teście.
- Test truncacji `.limit(500)`; dedykowany test wielokartowy.
- Zmiana `vitest.config.ts` / `fileParallelism`; podłączanie bramy CI (Faza 5).
- `/10x-test-plan --refresh` (tylko odnotowanie potrzeby dla §4).
- Testy `elapsed_days` / kwantyzacji UTC / stref czasowych (zachowanie upstream).

## Architektura / Podejście

Trzy warstwy od najtańszej: **unit** (bez sieci, prawdziwy `scheduler`) → **integracja** (handler
wywołany bezpośrednio, lokalne Supabase, harness Fazy 1) → **komponent** (jsdom, `fetch`
stubowany). Zasada „niezależnego oczekiwania": asertuj **właściwość gwarantowaną przez algorytm
FSRS** (interwał rośnie z jakością oceny, `repetitions` +1, interwał całkowity ≥ 1 dzień), nie
wartość liczoną przez nasz kod. Każda faza = osobny commit z podfazą aktualizującą podręcznik §6.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Unit `fsrs.ts` | `tests/lib/fsrs.test.ts` — niezmienniki mapowania i okablowania | Asercje zbyt luźne, by złapać subtelny błąd skalujący (mitygacja: granulacja dzienna + monotonia + nazwy pól) |
| 2. Integracja `review.ts`/`queue.ts` | `tests/api/study-review.test.ts` — round-trip + regresje §D.2/F5 + kontrola §D.1 | Flake między plikami mutującymi `flashcards` dla `TEST_USER_A` (mitygacja: id-scoped + cleanup; eskalacja do Fazy 5, nie łatanie configu) |
| 3. Komponent `StudySession.tsx` | `tests/components/StudySession.test.tsx` — kontrola kliknięcia + regresja §E.1 | Flake od kolejności promisów w teście wyścigu (mitygacja: `fireEvent` synchroniczny + `waitFor`; 10× bez flake w weryfikacji ręcznej) |

**Wymagania wstępne:** lokalne Supabase (`npx supabase start`) dla Fazy 2; Fazy 1 i 3 bez.
Harness Fazy 1 + warstwa jsdom Fazy 2 już w repo.
**Szacowany wysiłek:** ~3 sesje (po jednej na fazę), każda mały commit + STOP na ręczne
potwierdzenie.

## Otwarte ryzyka i założenia

- Asercje jakościowe (bez liczbowych fixtures) mogą przepuścić błąd, który zachowuje kierunek
  ale psuje skalę; mitygowane przez asercję granulacji dziennej (`due_date − last_review` w dniach
  === `scheduled_days`), która łapie klasyczną regresję „minuty zamiast dni".
- Test §E.1 (3.2) zależy od okna wyścigu przed re-renderem Reacta — jeśli okaże się
  niedeterministyczny w jsdom, degraduj do asercji „guard nie jest synchroniczny" na poziomie
  kodu (dwa `fetch`) i odnotuj w §6.6 jako słabszy sygnał.
- Faza 2 zakłada, że `POST /api/flashcards` nadal tworzy karty w `state='New'` z `due_date IS
  NULL` (potwierdzone w badaniu — `flashcards.ts:71`).
- Wiersz §3 Faza 3 zostaje `planned` aż `/10x-test-plan` (orkiestrator) oznaczy go `complete`
  przy kolejnym uruchomieniu — ten plan tego nie robi.

## Kryteria sukcesu (podsumowanie)

- Zakończony przegląd udowodnienie utrwala pola harmonogramu właściwej karty (potwierdzone
  ponownym `GET queue`), a karta opuszcza kolejkę najbliższych powtórek.
- Sposób, w jaki `ts-fsrs` jest okablowane (grade mapping, nazwy pól, granulacja dzienna,
  monotonia jakości), jest zablokowany testem jednostkowym niezależnym od wewnętrznego wzoru.
- Trzy znane luki (§D.2 replay, F5 brak kolejności, §E.1 double-click) są udokumentowane testami,
  które **złamią się**, gdy poprawka wejdzie — bez zmiany kodu produkcyjnego w tej fazie.

# Follow-ups z przeglądu implementacji

Źródło: `reviews/impl-review.md` (2026-09-09, pełny przegląd planu).

## F1 — Wyzeruj dług lintu przed §3 Faza 5 (Quality-gates wiring)

**Decyzja triage**: Fix A — udokumentuj dług, otwórz osobną zmianę.

`npm run lint` jest czerwony (49 błędów) z powodu pre-istniejących naruszeń w
plikach spoza tej zmiany. Bramka lintu w Fazie 5 nie może zostać podłączona jako
wymagana, dopóki to nie zostanie naprawione.

Pliki:
- `src/components/AccountDeletion.tsx` — prettier/prettier
- `src/components/ui/checkbox.tsx` — prettier/prettier
- `src/components/ui/dialog.tsx` — prettier/prettier
- `src/lib/inactive-accounts.ts` — prettier/prettier (brakujące przecinki)
- `src/pages/api/admin/cleanup-inactive-accounts.ts` — prettier/prettier + `@typescript-eslint/no-unnecessary-condition` ×2 (linie 94, 118)
- `src/pages/api/generate-flashcards.ts` — `@typescript-eslint/no-deprecated` (`generateObject`, linia 48)

Akcja:
1. `/10x-new lint-debt-cleanup` (lub dołącz do zakresu Fazy 5).
2. `npm run lint:fix` pokrywa 46/49 (formatowanie).
3. Ręcznie: 2× `no-unnecessary-condition` w `cleanup-inactive-accounts.ts`
   (usuń zbędny `??` / opcjonalny łańcuch na wartości nie-nullowej);
   `no-deprecated` `generateObject` w `generate-flashcards.ts` — zweryfikuj,
   czy to świadoma decyzja lekcji m3l1; jeśli tak, `eslint-disable-next-line`
   z komentarzem, jeśli nie — migracja na `generateText` + `output`.
4. Dopiero wtedy podłącz `npm run lint` jako wymaganą bramę CI (Faza 5).

Odnotowane też w `context/foundation/test-plan.md` §6.6 („Dług lintu blokujący
§3 Faza 5").

## F2 — Sprostuj tekst planu: `again` na `Review` → pozostaje `Review`, nie `Relearning`

**Decyzja triage**: FIXED — `plan.md` § „## Addenda (przegląd implementacji, 2026-09-09)" pkt A1.

## F3 — Ponów wstrzyknięcia regresji 2.8 / 3.8 przy kolejnym dotknięciu obszaru

**Decyzja triage**: FIXED — oba wstrzyknięcia odtworzone w sesji przeglądu (2026-09-09)
i potwierdzone: 3.8 (guard `useRef` w `handleRate`) łamie tylko 3.2; 2.8 (check
`due_date > now` w `review.ts`) łamie tylko 2.3. Wstrzyknięcia cofnięte. Szczegóły w
`reviews/impl-review.md` F3.

# Kompletny przepływ AI — Krótki plan

> Pełny plan: `context/changes/ai-generation-flow/plan.md`

## Co i dlaczego

Implementujemy S-02 — gwiezdny klin produktu: użytkownik wkleja tekst, AI generuje propozycje fiszek, a on je akceptuje, edytuje lub odrzuca. Zaakceptowane trafiają natychmiast do kolekcji. Bez tego przepływu 10xCards nie różni się od zwykłego notatnika.

## Punkt wyjścia

Backend jest gotowy: `POST /api/generate-flashcards` (Groq/llama-3.3-70b) działa i zwraca JSON, `GET /api/flashcards` pobiera kolekcję, `FlashcardCollection.tsx` wyświetla fiszki. Brakuje: endpoint zapisu (`POST /api/flashcards`), UI generatora i spinającego opakowania.

## Pożądany stan końcowy

Dashboard ma sekcję „Generuj fiszki" nad „Moja kolekcja". Użytkownik wkleja tekst, klika generuj, widzi spinner, a potem listę propozycji. Akceptuje jednym kliknięciem (auto-zapis), edytuje inline lub odrzuca. Po obsłużeniu wszystkich widzi podsumowanie, a kolekcja poniżej odświeża się automatycznie.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Lokalizacja generatora | Nad kolekcją w dashboard.astro | Minimalny kontekst przełączania, naturalny przepływ góra-dół | Plan |
| Strategia zapisu | Auto-save per-karta po kliknięciu "Zaakceptuj" | Natychmiastowa informacja zwrotna, brak "zapomnianego" przycisku Zapisz | Plan |
| UX edycji | Inline — pola textarea w karcie | Brak modali = mniej kroków, naturalniejsze | Plan |
| Po obsłużeniu wszystkich | Podsumowanie z licznikiem | Wyraźne zakończenie sesji bez utraty informacji ile zapisano | Plan |
| Odświeżanie kolekcji | `refreshKey` prop + `FlashcardDashboard` wrapper | Jedno React island zarządza stanem obu sekcji bez event bus | Plan |
| Blokowanie nowej sesji | Zablokowany podczas reviewing | Zapobiega utracie pracy przez nadpisanie listy propozycji | Plan |
| Loading state | Spinner z komunikatem tekstowym | Wystarczy dla niestrumieniowanej odpowiedzi JSON | Plan |
| Błąd generowania | Inline w miejscu listy + "Spróbuj ponownie" | Tekst wejściowy zachowany, minimalne zakłócenie przepływu | Plan |

## Zakres

**W zakresie:**
- `POST /api/flashcards` — endpoint zapisu pojedynczej fiszki
- `FlashcardGenerator.tsx` — maszyna stanów idle → loading → reviewing → summary
- `FlashcardDashboard.tsx` — wrapper spinający generator + kolekcję z refreshKey
- Modyfikacja `FlashcardCollection.tsx` — dodanie `refreshKey` prop
- Aktualizacja `dashboard.astro` — podmiana wyspy na `FlashcardDashboard`
- Instalacja shadcn `textarea`

**Poza zakresem:**
- Zmiany w `POST /api/generate-flashcards` — działa, nie dotykamy
- Rate limiting / kontrola kosztów API
- Edycja fiszek już zapisanych w kolekcji (to S-03)
- Bulk save / checkbox select
- Persystencja tekstu wejściowego

## Architektura / Podejście

```
dashboard.astro
  └── <FlashcardDashboard client:load />       ← jedyna wyspa React
        ├── state: refreshCounter
        ├── <FlashcardGenerator onComplete={} />
        │     ├── Textarea + Generuj button
        │     ├── [loading] Spinner
        │     ├── [reviewing] Lista ProposalCard[]
        │     │     └── accept → POST /api/flashcards (auto-save)
        │     │     └── edit inline → POST /api/flashcards
        │     │     └── reject → wyszarzony
        │     └── [summary] "Zaakceptowano X fiszek" + reset
        └── <FlashcardCollection refreshKey={refreshCounter} />
              └── GET /api/flashcards (re-fetch gdy refreshKey zmieniony)
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Endpoint zapisu | `POST /api/flashcards` — zapis przez Supabase | Niskie — standardowy pattern jak GET obok |
| 2. FlashcardGenerator | Kompletna maszyna stanów + per-kartowy UX | Zarządzanie stanem propozycji: przejście do summary musi obserwować saving state |
| 3. Integracja dashboardu | FlashcardDashboard + refreshKey + podmiana wyspy | Zmiana z dwóch client:load na jedno — brak regresji w kolekcji |

**Wymagania wstępne:** F-01 ✅, F-02 ✅ (`generate-flashcards.ts` działa), Supabase lokalnie uruchomiony  
**Szacowany wysiłek:** ~1–2 sesje, 3 fazy

## Otwarte ryzyka i założenia

- **Zakładamy**: `POST /api/generate-flashcards` zwraca parseable JSON przy każdym wywołaniu — jeśli model zwróci niespójny format, `flashcardsOutputSchema.safeParse` zwróci 500 (istniejące zachowanie)
- **Ryzyko**: Inline editing z `textarea` wewnątrz flex/grid może wymagać dostosowania styli — weryfikacja ręczna w fazie 2

## Kryteria sukcesu (podsumowanie)

- Zalogowany użytkownik może wkleić tekst i otrzymać propozycje AI w < 10 s
- Zaakceptowane fiszki są widoczne w kolekcji natychmiast po zakończeniu sesji generowania
- Przepływ działa na produkcyjnym buildzie (`npm run build` przechodzi)

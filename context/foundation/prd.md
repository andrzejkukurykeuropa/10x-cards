---
project: "10xCards"
version: 1
status: draft
created: 2026-05-26
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Manualne tworzenie wysokiej jakości fiszek edukacyjnych jest czasochłonne, co zniechęca samouka uczącego się języków obcych do korzystania z efektywnej metody nauki, jaką jest spaced repetition. Gdy ma tekst do nauki i chce go przekształcić w fiszki, musi wykonywać żmudną, ręczną pracę zamiast skupić się na samej nauce.

Projekt edukacyjny — celem jest nauka budowania produktu od zera, a nie wypełnianie konkretnej luki rynkowej.

## User & Persona

**Samouk uczący się języków obcych** — osoba ucząca się jednego lub więcej języków samodzielnie, bez kursu. Sięga po 10xCards w momencie, gdy ma tekst (artykuł, fragment podręcznika, dialog) i chce go przekształcić w fiszki do nauki metodą spaced repetition, ale nie chce spędzać czasu na ręcznym formułowaniu pytań i odpowiedzi.

## Success Criteria

### Primary
- 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika bez edycji.
- 75% fiszek w kolekcji użytkownika pochodzi z AI (nie z ręcznego tworzenia).

### Secondary
- (brak — primary wystarczy)

### Guardrails
- Dane użytkownika (fiszki w kolekcji) nie mogą być tracone.

## User Stories

### US-01: Generowanie fiszek z tekstu

- **Given** zalogowany użytkownik z tekstem do nauki
- **When** wkleja tekst i inicjuje generowanie fiszek
- **Then** widzi listę propozycji fiszek (pytanie + odpowiedź) do przejrzenia

#### Acceptance Criteria
- Fiszki są wyświetlone jako lista par pytanie-odpowiedź.
- Użytkownik może każdą zaakceptować, edytować lub odrzucić.
- Zaakceptowane fiszki są automatycznie zapisywane do kolekcji.

## Functional Requirements

### Authentication
- FR-001: Użytkownik może zarejestrować konto (e-mail + hasło). Priority: must-have
  > Sokrates: Brak kontrargumentu — konta są niezbędne, fiszki muszą być przypisane do konkretnego użytkownika.

- FR-002: Użytkownik może zalogować się do konta. Priority: must-have
  > Sokrates: Brak kontrargumentu — wynika z FR-001.

### Flashcard Generation
- FR-003: Użytkownik może wkleić tekst i zainicjować generowanie fiszek. Priority: must-have
  > Sokrates: Rozważono kontrargument: "Koszt API AI może być zbyt wysoki bez kontroli budżetów." Zachowano jako must-have; kontrola budżetu to Open Question przed wdrożeniem produkcyjnym.

### Flashcard Review
- FR-004: Użytkownik może przejrzeć propozycje fiszek i każdą zaakceptować, edytować lub odrzucić. Priority: must-have
  > Sokrates: Brak kontrargumentu — bez etapu recenzji użytkownik nie ma kontroli jakości generowanych fiszek.

### Collection
- FR-005: Zaakceptowane fiszki są automatycznie zapisywane do kolekcji użytkownika. Priority: must-have
  > Sokrates: Zmieniono z "osobny przycisk zapisz" na auto-zapis po akceptacji — oddzielny przycisk "Zapisz" to zbędny krok w przepływie.

- FR-006: Użytkownik może przeglądać fiszki w kolekcji. Priority: must-have
  > Sokrates: Pełne CRUD może być za dużo dla MVP — przeglądanie musi-mieć, edycja i usuwanie przeniesione do nice-to-have.

- FR-007: Użytkownik może edytować fiszki w kolekcji. Priority: nice-to-have
  > Sokrates: Przeniesiono z must-have — edycja jest przydatna, ale nie blokuje wartości MVP.

- FR-008: Użytkownik może usuwać fiszki z kolekcji. Priority: nice-to-have
  > Sokrates: Przeniesiono z must-have — usuwanie przydatne, ale nie blokuje wartości MVP.

- FR-009: Użytkownik może ręcznie stworzyć fiszkę (pytanie + odpowiedź). Priority: nice-to-have
  > Sokrates: Zmieniono na nice-to-have — jeśli generowanie działa dobrze, manualne tworzenie jest zbędne dla MVP. Skupienie na AI-first.

## Non-Functional Requirements

- Użytkownik otrzymuje potwierdzenie przyjęcia żądania generowania w < 200 ms od interakcji; ciągła widoczna informacja zwrotna jest dostępna przez cały czas trwania operacji.
- Tekst wklejony do generatora nie jest przechowywany w systemie po zakończeniu przetwarzania żądania.
- Aplikacja pozostaje użyteczna w dwóch ostatnich głównych wersjach Chrome i Firefox.

## Business Logic

System analizuje wklejony tekst i wyodrębnia z niego pary pytań-odpowiedzi zoptymalizowane pod kątem nauki języków obcych.

Wejściem reguły jest dowolny tekst wklejony przez użytkownika (artykuł, dialog, fragment podręcznika). Wynikiem jest zestaw par pytanie-odpowiedź, gdzie pytanie testuje znajomość pojęcia lub słowa, a odpowiedź je dostarcza. Użytkownik napotyka regułę w momencie zainicjowania generowania i natychmiast widzi propozycje do weryfikacji.

## Access Control

Logowanie e-mail + hasło. Model płaski — każdy zalogowany użytkownik ma dostęp wyłącznie do własnych fiszek. Użytkownik niezalogowany nie ma dostępu do żadnej funkcji poza rejestracją i logowaniem.

## Non-Goals

- Brak własnego algorytmu powtórek (SRS) — integracja z gotowym algorytmem open-source (np. SM-2) zostanie dodana w v2, gdy podstawowy przepływ generowania działa.
- Brak importu plików (PDF, DOCX, itp.) — tylko tekst wklejany ręcznie w v1.
- Brak współdzielenia zestawów fiszek między użytkownikami.
- Brak integracji z zewnętrznymi platformami edukacyjnymi (Duolingo, Anki, itp.).
- Brak aplikacji mobilnej — tylko web w v1.

## Open Questions

1. **Kontrola kosztów generowania** — jak ograniczyć koszty gdy liczba użytkowników rośnie? Brak limitu per użytkownik może prowadzić do nieoczekiwanych kosztów operacyjnych. Owner: użytkownik. Priorytet: wysoki przed wdrożeniem produkcyjnym.

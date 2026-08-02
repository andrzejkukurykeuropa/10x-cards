---
project: "10xCards"
context_type: greenfield
created: 2026-05-26
updated: 2026-07-08
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "persona"
      decision: "Samouk uczący się języków obcych"
    - topic: "auth strategy"
      decision: "e-mail + hasło, model płaski"
    - topic: "mvp scope"
      decision: "AI generation + review + collection; spaced repetition → v2"
    - topic: "FR-005 save behavior"
      decision: "auto-save on acceptance, no separate save button"
    - topic: "FR-006 CRUD scope"
      decision: "browsing must-have; edit/delete nice-to-have"
    - topic: "FR-007 manual creation"
      decision: "nice-to-have — AI is the focus"
    - topic: "AI cost risk"
      decision: "risk acknowledged; no budget control in MVP → Open Question"
  frs_drafted: 13
  quality_check_status: accepted
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

## Timeline acknowledgment

Acknowledged on 2026-05-26: 6-tygodniowe MVP wymaga stałego zaangażowania po godzinach; użytkownik zaakceptował koszt.

## User Stories

### US-01: Generowanie fiszek z tekstu przez AI

- **Given** zalogowany użytkownik z tekstem do nauki
- **When** wkleja tekst i klika "Generuj fiszki"
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

### AI Generation
- FR-003: Użytkownik może wkleić tekst i wygenerować fiszki przez AI. Priority: must-have
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
  > Sokrates: Zmieniono na nice-to-have — jeśli AI działa dobrze, manualne tworzenie jest zbędne dla MVP. Skupienie na AI-first.

### Study Session
- FR-010: Użytkownik może otworzyć widok sesji nauki i widzieć fiszki z kolekcji po jednej (strona pytania). Priority: must-have. Change: nowa
  > Sokrates: Rozważono ryzyko: użytkownik bez fiszek lub bez fiszek do powtórki trafi na pustą sesję. Decyzja: stan pustego ekranu z komunikatem i linkiem do generatora jest wymagany.

- FR-011: Użytkownik może odsłonić odpowiedź fiszki i ocenić jakość zapamiętania wg skali zdefiniowanej przez wybraną bibliotekę SRS (spaced repetition), co aktualizuje termin następnej powtórki. Priority: must-have. Change: nowa
  > Sokrates: Rozważono złożoność persystencji stanu harmonogramu (easiness factor, interval, repetitions per fiszka). Decyzja: użyjemy zewnętrznej biblioteki SRS — skala ocen i algorytm są jej odpowiedzialnością; UI adaptuje się do API biblioteki.

- FR-012: Sesja nauki priorytetyzuje fiszki wg terminu wyznaczonego przez algorytm SRS (najpierw przeterminowane i zaplanowane na dziś), ale udostępnia też tryb „wszystkie fiszki" dla użytkownika, który chce powtórzyć kolekcję w całości. Priority: must-have. Change: nowa
  > Sokrates: Rozważono ryzyko: użytkownik może chcieć powtórzyć wszystkie fiszki bez względu na harmonogram. Decyzja: dwa tryby sesji — „Do powtórki dziś" (domyślny, wg harmonogramu SRS) i „Wszystkie fiszki" (na żądanie).

### Vocabulary Generation
- FR-013: Użytkownik może wybrać tryb generowania „słownikowy PL→IT": AI tworzy pary (pojedynczy wyraz PL, tłumaczenie IT) z wklejonego tekstu. Priority: must-have. Change: nowa
  > Sokrates: Brak kontrargumentu; FR-013 pozostaje bez zmian.

## Business Logic

System analizuje wklejony tekst i wyodrębnia z niego pary pytań-odpowiedzi zoptymalizowane pod kątem nauki języków obcych.

Wejściem reguły jest dowolny tekst wklejony przez użytkownika (artykuł, dialog, fragment podręcznika). Wynikiem jest zestaw par pytanie-odpowiedź, gdzie pytanie testuje znajomość pojęcia lub słowa, a odpowiedź je dostarcza. Użytkownik napotyka regułę w momencie kliknięcia "Generuj fiszki" i natychmiast widzi propozycje do weryfikacji. Reguła jest stosowana przez zewnętrzne API AI — szczegóły implementacji to decyzja downstream.

## Non-Functional Requirements

- Użytkownik widzi potwierdzenie przyjęcia żądania generowania w < 200 ms od kliknięcia; ciągły wskaźnik postępu jest widoczny przez cały czas generowania.
- Tekst wklejony do generatora nie jest przechowywany w systemie po zakończeniu zapytania.
- Aplikacja pozostaje użyteczna w dwóch ostatnich głównych wersjach Chrome i Firefox.

## Access Control

Logowanie e-mail + hasło. Model płaski — każdy zalogowany użytkownik ma dostęp wyłącznie do własnych fiszek. Użytkownik niezalogowany nie ma dostępu do żadnej funkcji poza rejestracją i logowaniem.

## Non-Goals

- Brak importu plików (PDF, DOCX, itp.) — tylko tekst wklejany ręcznie w v1.
- Brak współdzielenia zestawów fiszek między użytkownikami.
- Brak integracji z zewnętrznymi platformami edukacyjnymi (Duolingo, Anki, itp.).
- Brak aplikacji mobilnej — tylko web w v1.
- Brak własnych algorytmów SRS — implementacja harmonogramu powtórek via zewnętrzna biblioteka open-source.

## Open Questions

1. **Kontrola kosztów API AI** — jak ograniczyć koszty generowania gdy liczba użytkowników rośnie? Brak limitu per użytkownik może prowadzić do nieoczekiwanych kosztów operacyjnych. Owner: użytkownik. Priorytet: wysoki przed wdrożeniem produkcyjnym.

## Forward: tech-stack

(Notatki do zebrania przez 10x-tech-stack-selector po wygenerowaniu PRD. Użytkownik nie wskazał preferencji technologicznych — stack otwarty.)

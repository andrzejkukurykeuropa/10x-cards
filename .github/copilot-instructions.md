## MCP Servers — Cloudflare

Dodaj do ustawień IDE (np. `.vscode/mcp.json` lub konfiguracji MCP klienta):

```json
{
  "mcpServers": {
    "cloudflare-docs": {
      "command": "npx",
      "args": ["mcp-remote", "https://docs.mcp.cloudflare.com/mcp"]
    },
    "cloudflare-observability": {
      "command": "npx",
      "args": ["mcp-remote", "https://observability.mcp.cloudflare.com/mcp"]
    }
  }
}
```

<!-- BEGIN @przeprogramowani/10x-cli -->

---
name: 10xDevs AI Toolkit - Module 2, Lesson 1
description: Move from sprint-zero setup to project orchestration with the roadmap chain.
license: CC BY-NC-ND 4.0
metadata:
  module: 2
  lesson: 1
  author: 10xDevs
---

## 10xDevs AI Toolkit - Moduł 2, Lekcja 1

Przejdź od konfiguracji sprint-zero do orkiestracji projektu za pomocą **łańcucha mapy drogowej**:

```
(dokumenty podstawowe Modułu 1) -> /10x-roadmap -> elementy mapy drogowej gotowe do backlogu
```

`/10x-roadmap` to główny temat lekcji. `/10x-new` jest celowo wprowadzony w Module 2, Lekcji 2, gdy wybrany element mapy drogowej staje się folderem zmian implementacyjnych.

### Router zadań - Od czego zacząć

| Umiejętność | Użyj, gdy |
| --- | --- |
| **Mapa drogowa (główny temat lekcji)** | |
| `/10x-roadmap` | Masz `context/foundation/prd.md` i podstawę projektu, i potrzebujesz mapy drogowej MVP z podejściem vertical-first. Umiejętność odczytuje PRD, sprawdza podstawę kodu, używa dostępnych dokumentów podstawowych, takich jak `tech-stack.md`, `infrastructure.md` i `deploy-plan.md`, a następnie zapisuje `context/foundation/roadmap.md`. Użyj jej PRZED tworzeniem folderów dla poszczególnych zmian lub planów implementacji. |
| **Ponowne uruchomienie upstream w razie potrzeby** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Zgrupowane z Modułu 1, aby kontrakty podstawowe mogły zostać naprawione przed sekwencjonowaniem mapy drogowej. Jeśli generowanie mapy drogowej ujawni lukę w PRD, napraw PRD, zanim udasz, że backlog jest gotowy. |

### Jak działa przekazywanie w łańcuchu

- `/10x-roadmap` łączy produkt z implementacją. Nie wybiera frameworków, nie projektuje schematów ani nie pisze planu implementacji dla każdej zmiany.
- Wynikiem jest `context/foundation/roadmap.md`: uporządkowane kamienie milowe, pionowe wycinki, ograniczone podstawy, zależności, niewiadome, ryzyko i pola przekazania do backlogu.
- Elementy mapy drogowej powinny otrzymywać stabilne, czytelne dla człowieka identyfikatory w narzędziach backlogu. Rzeczywisty folder `context/changes/<change-id>/` jest tworzony w Lekcji 2 za pomocą `/10x-new`.

### Granice mapy drogowej

- Domyślnie pionowe wycinki: widoczne dla użytkownika rezultaty, które obejmują interfejs użytkownika, dane, logikę biznesową i integracje.
- Praca horyzontalna jest dozwolona tylko jako ograniczony element umożliwiający, który nazywa docelowy pionowy kamień milowy, który odblokowuje.
- Unikaj osieroconej pracy horyzontalnej, takiej jak "zbuduj całą bazę danych", "zbuduj wszystkie punkty końcowe API" lub "zaprojektuj cały interfejs użytkownika" przed pierwszym widocznym dla użytkownika przepływem.
- Mapa drogowa nie jest szacunkiem kalendarzowym. Nie wymyślaj dat, punktów historii ani prędkości sprintu, chyba że użytkownik wyraźnie poprosi o oddzielny artefakt planistyczny.

### Ścieżki podstawowe używane w tej lekcji

- `context/foundation/prd.md` - wejście
- `context/foundation/tech-stack.md` - opcjonalne wejście
- `context/foundation/infrastructure.md` - opcjonalne wejście
- `context/deployment/deploy-plan.md` - opcjonalne wejście
- `context/foundation/roadmap.md` - wyjście
- `context/foundation/lessons.md` - powtarzające się zasady i pułapki
- `docs/reference/contract-surfaces.md` - rejestr nazw nośnych

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "Ta zmiana jest zarchiwizowana. Zamiast tego otwórz nową zmianę za pomocą `/10x-new`."

<!-- END @przeprogramowani/10x-cli -->

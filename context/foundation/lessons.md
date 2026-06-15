# Lessons Learned

> Rejestr powtarzających się reguł i wzorców, tylko do dodawania. Ponownie odczytywany na początku przez /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Scope creep w integracji layoutu

**Context**: Podczas integracji nowego komponentu w istniejącej stronie (src/pages/dashboard.astro)
implementator zmodyfikował klasy kontenera layoutu poza zadeklarowanym zakresem zmiany.

**Problem**: Niezaplanowane zmiany layoutu w tym samym commicie co integracja
funkcjonalna komplikują przegląd i mogą maskować regresje wizualne.

**Rule**: [uzupełnij — np. "Zmiany layoutu wymagają osobnego PR/commitu oddzielonego od zmian funkcjonalnych"]

**Applies to**: [uzupełnij — np. "wszystkie Astro pages, integracje komponentów"]

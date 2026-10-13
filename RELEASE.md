# Test wydania

**Decyzja właściciela (2026-10-13):** przed mergem `release/…` → `main` finalna wersja gałęzi przechodzi na
teście dwa sprawdzenia:
1. **pomiar** — czy wydanie niczego nie spowolniło,
2. **test funkcjonalny w Chrome** (Claude in Chrome) — czy nowe działa i czy działa razem z tym, co już było.

Wynik trafia do opisu PR i do tabeli na dole. Merge i `deploy:prod` dopiero po obu.

## Kiedy

- **Tylko w procedurze wydania, raz — przed mergem do `main`.** Nie przy każdym pushu ani każdym `deploy:test`
  w trakcie pracy nad wydaniem (doprecyzowanie właściciela 13.10).
- **Na wersji, która pójdzie na produkcję** — po ostatniej zmianie plików aplikacji (`npm run files`), łącznie
  z datą w pierwszym wpisie `WHATS_NEW`. Na test wysyła ją `npm run deploy:test` — jak każde wdrożenie, na
  polecenie właściciela.
- Zmiana plików aplikacji po teście = test od nowa. Wyjątek: sama data w `WHATS_NEW` (przesunięte wydanie) —
  wtedy po `deploy:test` wystarczy otwarcie strony i data na liście „Co nowego".
- Nie w godzinie czyszczenia testu (19:00–19:59) — dzień przełamuje się pod pomiarem.
- Zmiany tylko w README, CLAUDE.md, testach i `scripts/` nie jadą do Apps Script — testu wydania nie wymagają.

## 1. Pomiar

**a) Otwieranie strony** — `npm run perf:test`: 120 otwarć po kolei, co 1 s (~5 min). Niczego nie zapisuje.
W tym czasie nikt nic nie zapisuje na teście — zapis unieważnia stan startowy w pamięci i miesza wynik.
Wynik: czas do pierwszego bajtu (mediana, 90%, najdłużej, ≥3 s, ≥5 s), ile stanów startowych z pamięci,
okno czasu. Surowe wyniki w pliku JSONL (ścieżka na początku).

**b) Wykonania testu** (Claude in Chrome, strona Wykonań projektu testowego, `scripts/executions.js`):
- `doGet` w oknie sondy;
- `getData` w **cichym oknie**: jedna otwarta karta aplikacji, 10 min bez żadnego zapisu (~40 odczytów).
  Odczyty w trakcie serii zapisów są wolniejsze i nieporównywalne (13.10: 2,1 s przy zapisach,
  wobec ok. 1,7 s bez nich);
- zapisy (`reserve`, `markWalked`, `setFree`, …) w oknie testu funkcjonalnego.

Dla każdej funkcji: mediana, 90%, najdłużej, stany inne niż „Ukończono".

**c) Trzy rezerwacje naraz** — trzy różne psy w ciągu sekundy (w teście funkcjonalnym). Ich trzy czasy
w Wykonaniach pokazują, ile czeka kolejny zapis na blokadę.

**d) Dziennik spowolnień** (Panel) — nowe wpisy z okna testu: na którym kroku.

Liczbę wywołań arkusza przy otwarciu strony i pod blokadą zapisu pilnuje dodatkowo `npm test` (B71, B72).

### Kiedy to spowolnienie

Porównanie z ostatnim wierszem tabeli, czyli z poprzednim wydaniem:
- **mediana gorsza o więcej niż 15%** albo **90% gorsze o więcej niż 25%** — w sondzie, w `doGet` z okna sondy
  albo w `getData` z cichego okna (przy mniej niż 20 wywołaniach — tylko do wiadomości);
- zapisy stoją w kolejce do blokady, więc ich czas zależy od tego, ile kliknięto naraz. Porównujemy trzy rezerwacje
  naraz i pojedyncze zapisy w podobnym układzie. Wyraźnie gorzej (ponad 25%) — szukamy przyczyny, jak niżej;
- pojedyncze długie wywołania (≥5 s) to zwykle przestoje Google (pomiar 9.10, CLAUDE.md) — nie są kryterium,
  chyba że Dziennik spowolnień pokazuje je na kroku, który wydanie zmieniało. Takiego wywołania w Wykonaniach,
  a bez wpisu w Dzienniku, nasz kod nie trwał długo — czas minął, zanim Google go uruchomił (13.10: `doGet` 110 s).

Skąd progi: dwie serie tego samego kodu 9.10 różniły się medianą o ~5% (2,2 i 2,3 s), a 90% jest mniej stabilne.

**Gdy próg przekroczony:**
1. Pomiar jeszcze raz, po co najmniej 30 min (przestoje Google przychodzą falami).
2. Dalej gorzej — przyczyna w zmianach wydania, zanim cokolwiek pójdzie na `main`.
3. Porównanie A/B na teście (poprzednie wydanie i kandydat, ta sama pora) to dwa wdrożenia — na polecenie
   właściciela.

## 2. Test funkcjonalny w Chrome

Robi go Claude przez rozszerzenie **Claude in Chrome** (Chrome właściciela, zalogowany do Google — także do
strony Wykonań). Pracuje w nowej karcie z linkiem testu i zamyka ją na końcu.

Kolejność:
1. **Nowości wydania** — każdy punkt z opisu PR i z „Co nowego", z przypadkami brzegowymi z PR.
2. **Lista niżej** — czy to, co już było, działa razem z nowym.

**Zasady:**
- **PIN-u Claude nie wpisuje.** Gdy test dochodzi do panelu admina, wpisuje go właściciel w karcie Claude'a;
  bez tego ta część zostaje dla właściciela.
- **Nie wolno:**
  - wysyłać nic WhatsAppem (limit bramki: 3 czaty w miesiącu na instancję wspólną z produkcją);
  - wysyłać maili;
  - zmieniać godziny czyszczenia;
  - zapisywać ustawień panelu (wolno najwyżej zapis próbny z przywróceniem).
- Okienka przeglądarki (`confirm`) wstrzymują rozszerzenie. Przyciski z pytaniem („Usuń psa", „Usuń
  zadanie", „Wszystkie po 2") klika właściciel.
- Stuknięcia jedno po drugim w ten sam kafelek osłona stuknięć po cichu odrzuca (bug nr 13) — to nie błąd.
  Kilka akcji naraz: od dołu listy, wtedy kafelki wyżej się nie przesuwają.
- **Dane próbne na końcu zwolnione albo usunięte.** Psy próbne mają w imieniu „Próba".
- Czego Chrome nie umie (przytrzymanie palcem, klawiatura telefonu, prawdziwy zasięg), zostaje na telefon —
  wypisane w opisie PR.

### Lista — wolontariusz

- [ ] **Otwarcie:**
  - „vX.Y · Co nowego?", pasek środowiska testowego;
  - lista bez „Wczytuję…";
  - konsola strony bez błędów.
- [ ] **Rezerwacja z imieniem:** kafelek zarezerwowany, kolor osoby, potem „Zwolnij".
- [ ] **„Wrócił ✓"**, potem „Cofnij".
- [ ] **Pies na dwa spacery:** 1/2 i 2/2 osobno (rezerwacja, spacer, cofnięcie).
- [ ] **Strzałka na jutro:** rezerwacja z wyprzedzeniem, powrót na dziś.
- [ ] **Trzy rezerwacje naraz** (pomiar c): każda zapisana, lista się nie rozjeżdża.
- [ ] **Spacer grupowy** — na telefonie (Chrome nie umie przytrzymać: przeciągnięcie w miejscu trwa krócej
  niż 550 ms):
  - przytrzymanie kafelka, zaznaczenie, „Grupa";
  - „Wrócił ✓" całej grupy;
  - zmiana składu i „Rozwiąż".
- [ ] **Psy innych grup:** „Bierze G7" → „✓ G7" → „Cofnij".
- [ ] **Miniony dzień:** lista z numerami psów, spacery grupowe, „📋 Skopiuj treść" (bez wysyłania maila).
- [ ] **Dwie karty:** zmiana z jednej widać w drugiej najpóźniej po ~15 s.
- [ ] **„Co nowego?":** lista otwiera się i zamyka; pasek „Nowa wersja" znika na dobre.

### Lista — panel admina

PIN wpisuje właściciel.

- [ ] **Pies próbny:**
  - dodanie;
  - edycja: imię, 2 spacery, grupa innej grupy, notatka;
  - zaraz po edycji akcja na jego spacerze widzi zmianę.
- [ ] **Zadanie:** dodanie na dziś i na jutro, odhaczenie.
- [ ] **Panel:**
  - liczniki, Dziennik spowolnień;
  - ustawienia maila (bez zapisu);
  - WhatsApp: stan konta, bez wysyłek.
- [ ] **Sprzątanie:** usunięcie psa próbnego i zadań, wyjście z trybu edycji.

## 3. Wynik

Do opisu PR:
- tabela „poprzednie wydanie / to wydanie";
- odhaczona lista;
- znalezione błędy;
- co zostaje na telefon.

Tu: wiersz w tabeli niżej.

## Historia pomiarów (test)

Strona — sonda, 120 otwarć (mediana / 90% / ile ≥3 s). Pozostałe kolumny — mediana z Wykonań. `getData` do 1.4
mierzony bez warunku cichego okna (zwykły ruch testu).

| wydanie | kiedy | wdrożenie testu | strona | `doGet` | `getData` | 3 rezerwacje naraz |
|---|---|---|---|---|---|---|
| 1.3 | 9.10.2026 | @31–@32 (1.3 + „Co nowego") | 2,20 / 3,14 s / 13 | 1,75 s | 1,69 s | 1,9 / 3,7 / 5,7 s |
| 1.4 (przed testem wydania) | 9.10.2026, 17:32 | @33 | 1,23 / 1,70 s / 3 | 0,79 s | 1,73 s | 1,8 / 2,8 / 2,8 s |
| 1.4 (test wydania, bez kolorów trudności) | 13.10.2026, 17:04–18:10 | @34 | 1,22 / 1,87 s / 2 | 0,81 s | **2,20 s** (cicho, n=30; powtórka 18:00: 2,22 s, n=28) | 2,0 / 2,8 / 4,2 s |

**13.10 — `getData` ponad progiem** (+27% wobec 1,73 s, w obu cichych oknach). Kod `getData` taki sam jak w @33.
`reportDiag` (bez zmian od 1.2) szedł 0,72 s wobec ok. 0,5 s 9.10, czyli Google był tego dnia wolniejszy. Ale Dziennik
spowolnień w wolnych odczytach pokazuje nowy krok 1.4 „pamięć" (odczyt znaczników i zapis stanu do `CacheService`):
0,2 / 1,0 / 1,5 / 1,8 s w czterech wpisach. Rozstrzygnięcie i ewentualna zmiana — decyzja właściciela (CLAUDE.md, „Stan").
Jedno otwarcie strony z 110 s (17:06:45) bez wpisu w Dzienniku — przestój Google przed naszym kodem.

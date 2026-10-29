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
  wobec ok. 1,7 s bez nich). **Karta musi być widoczna**: przy zasłoniętym oknie Chrome (np. komputer bez nikogo) lista
  się nie odświeża (`document.hidden`). Wtedy rozszerzenie trzyma kartę w ruchu seriami `wait`, po najwyżej ~80 s na
  serię, bo dłuższa przekracza limit narzędzia (29.10);
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
  - **wysyłać formularza schroniska** (od 1.6, raport do schroniska): to prawdziwy formularz — „Prześlij" zgłasza
    spacery schronisku. Wolno go otworzyć i obejrzeć (data, zaznaczone psy), potem zamknąć kartę;
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
- [ ] **Pies na dwa spacery:** 1/2 i 2/2 osobno (rezerwacja, spacer, cofnięcie); pole „Twoje imię" w 1/2 i 2/2
  z „OK" w ramce pola przy 360 px (od 1.5).
- [ ] **Strzałka na jutro:** rezerwacja z wyprzedzeniem, powrót na dziś.
- [ ] **Trzy rezerwacje naraz** (pomiar c): każda zapisana, lista się nie rozjeżdża.
- [ ] **Spacer grupowy** — na telefonie (Chrome nie umie przytrzymać: przeciągnięcie w miejscu trwa krócej
  niż 550 ms):
  - przytrzymanie kafelka, zaznaczenie, „Grupa";
  - „Wrócił ✓" całej grupy;
  - zmiana składu i „Rozwiąż".
- [ ] **Psy innych grup:** „Bierze G7" → „✓ G7" → „Cofnij".
- [ ] **Notatki i 💊 odkleszczanie** (od 1.6): przy psie kilka notatek (każda tylko na dniach do swojego terminu);
  💊 przypomnienie tydzień przed terminem (na górze, nad 📌); w dniu terminu zadanie „💊 Odkleszczanie" — odhaczenie
  (przypomnienie znika, w katalogu następny termin = dziś + okres) i cofnięcie tego samego dnia.
- [ ] **📝 Raport do schroniska** (od 1.6; formularz ustawiony w panelu): pod listą dnia po „Wrócił ✓" — liczba psów,
  psy spoza formularza wypisane (inna grupa, bez numeru); link otwiera formularz w nowej karcie z datą i zaznaczonymi
  psami — **bez „Prześlij"**, karta zamknięta; po powrocie „✓ Raport otwierany dziś o …", po kolejnym „Wrócił ✓" —
  „Doślij nowe". To samo w minionym dniu (nad mailem). Otwarcie zapisuje się na serwerze — druga karta widzi je po ~15 s.
- [ ] **Miniony dzień:** lista z numerami psów, spacery grupowe, „📋 Skopiuj treść" (bez wysyłania maila).
- [ ] **Dwie karty:** zmiana z jednej widać w drugiej najpóźniej po ~15 s.
- [ ] **„Co nowego?":** lista otwiera się i zamyka; pasek „Nowa wersja" znika na dobre.

### Lista — panel admina

PIN wpisuje właściciel.

- [ ] **Pies próbny:**
  - dodanie;
  - edycja: imię, 2 spacery, grupa innej grupy, notatka;
  - od 1.6: kilka notatek („+ Notatka", ✕, „nigdy nie znika" w swoim wierszu) i odkleszczanie (metoda z listy i nowa,
    okres, następne, „brak") — zmiana widać od razu u wolontariusza, a po „brak" nie zostaje żadne zadanie;
  - zaraz po edycji akcja na jego spacerze widzi zmianę.
- [ ] **Zadanie:** dodanie na dziś i na jutro, odhaczenie.
- [ ] **Panel** (od 1.5 w zwijanych sekcjach — rozwinąć stuknięciem w nagłówek, drugie zwija):
  - Diagnostyka: liczniki, Dziennik spowolnień;
  - Lista i e-mail: ustawienia maila (bez zapisu);
  - Raport do schroniska — formularz (od 1.6): link, „sprawdzony …", porównanie formularza z katalogiem; „Sprawdź
    formularz" (tylko odczyt formularza — wolno);
  - WhatsApp: stan konta, bez wysyłek;
  - pomocnik Grafiku (od 1.5): na teście sekcja „— produkcja" wyszarzona, „— test" działa — stan (czeka na produkcję albo
    pracuje), „Sprawdź bramkę", podgląd „jutro" / „tydzień" — bez „Wyślij mi" i bez zapisu; od 1.6 podgląd „dziś"
    ze „📋 Zadania na dziś" i przełącznik „…codziennie" przy „rano".
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
| 1.4 (pierwszy test wydania) | 13.10.2026, 17:04–18:10 | @34 | 1,22 / 1,87 s / 2 | 0,81 s | **2,20 s** (cicho, n=30; powtórka 18:00: 2,22 s, n=28) | 2,0 / 2,8 / 4,2 s |
| 1.4 (test wydania z poprawką B73) | 23.10.2026, 18:00–18:27 | @37 | 1,05 / 1,67 s / 0 | 0,74 s | 1,78 s (cicho, n=40; 90% 2,23 s) | 1,4 / 2,2 / 2,8 s |
| **1.5** | 29.10.2026, 07:29–11:45 | @52 | 1,14 / 1,77 s / 0 | 0,82 s | 1,80 s (cicho, n=40; 90% **3,01 s**) | **4,0 / 4,6 / 6,0 s**; po 30 min **2,3 / 3,3 / 4,0 s** |

**29.10 — dwa progi przekroczone; wydanie przyjęte przez właściciela (decyzja 29.10, po analizie niżej).** Wobec 1.4:
- strona +9% (90%: +6%), `doGet` +10%;
- `getData` w cichym oknie: mediana +1%, ale **90% +35%** (3,01 wobec 2,23 s; 4 z 40 odczytów ≥3 s: 3,0 / 3,2 / 3,3 / 8,6 s);
- **trzy rezerwacje naraz ponad progiem w obu próbach**: 08:06 — 4,0 / 4,6 / 6,0 s, 08:36 — 2,3 / 3,3 / 4,0 s. Druga mieści się
  w rozrzucie 1.4 (13.10: 2,0 / 2,8 / 4,2 s). Trzy zwolnienia naraz: 2,4 / 2,9 / 9,6 s i 2,5 / 2,9 / 4,4 s;
- pojedyncze zapisy w normie: `reserve` 2,0 s, `setFree` 1,96 s (mediany), `markWalked` 2,5 s (jeden pomiar).

Dlaczego to nie kod 1.5:
- 1.5 nie zmienia kodu `getData`, `doGet` ani zapisów (dochodzą `Helper.gs`, stałe, `doPost`, pola panelu);
- wolne odczyty z cichego okna nie mają wpisu serwera w Dzienniku spowolnień, więc nasz kod szedł krócej niż 3 s
  (8,6 s — telefon widział 9,1 s; czas minął przed startem naszego kodu). Tak samo zwolnienie 9,6 s (08:06);
- w trzech naraz kolejne zapisy dochodzą co tyle samo co w 1.4 (08:36: +1,0 / +0,7 s, 1.4: +0,8 / +0,6 s). Różnica siedzi w pierwszym zapisie: 2,3 s
  wobec 1,4 s, a dzisiejszy pojedynczy zapis to ~2,0 s. Pierwszy zapis trójki 23.10 był krótszy niż mediana pojedynczej
  rezerwacji tamtego dnia (2,2 s). Dziennik, trzecia rezerwacja 08:36: blokada 1,9 s, praca 0,5 s, zapis 0,7 s;
- Google był tego dnia wolniejszy: `reportDiag` (bez arkusza) 0,72–0,92 s zamiast ~0,5 s, `helperTick` 7,7–16,8 s.

Jedyny zmierzony koszt wydania: kod serwera +70% (`.gs` 154 → 262 KB, głównie `Helper.gs`). Pasuje do +80 ms w `doGet`
i mieści się w progach. Pierwsze ciche okno (07:49–07:59) dało tylko 13 odczytów (1,62 s, 90% 2,41 s), bo zasłonięte okno
Chrome nie odświeża listy. Drugie (11:35–11:45) szło z kartą trzymaną w ruchu przez rozszerzenie (sekcja 1b).

Test w Chrome bez błędów:
- nowe w 1.5: „OK" w polu 2/2 w ramce; Panel w sekcjach (rozwijanie, zwijanie, wyszarzona sekcja „— produkcja" z opisem,
  sekcja „— test": stan, „Sprawdź bramkę", podgląd „jutro" i „tydzień"); członkowie bez numerów telefonów; „Co nowego";
- rezerwacja, „Wrócił ✓", „Cofnij", 1/2 i 2/2, jutro, „Bierze TTB", trzy naraz, miniony dzień (16.10: numery, spacer
  grupowy), dwie karty;
- zmiana psa w panelu (notatka, 2 spacery) u wolontariusza po ~15 s, rezerwacja 2/2 zaraz po edycji przyjęta; pies przywrócony.

Pominięte: „Skopiuj treść" (schowek właściciela, kod bez zmian od 1.2), dodanie i usunięcie psa oraz zadania (okienka
potwierdzenia, właściciel poza komputerem). Spacer grupowy — na telefonie.

**23.10 — w normie.** Wobec 1.3: strona −52%, `doGet` −58%, `getData` +5% (próg 15%), trzy rezerwacje naraz krócej.
Wobec 13.10 `getData` −19% (90%: 3,47 → 2,23 s). Dziennik spowolnień bez ani jednego wpisu z testu (nic ≥3 s w naszym
kodzie). Zapisy w teście funkcjonalnym (Wykonania): `reserve` 2,2 s, `markWalked` 1,8 s, `setFree` 1,8 s (mediany).
Test w Chrome bez błędów:
- zmiana psa w panelu (notatka, 2 spacery) widoczna od razu u wolontariusza, rezerwacja 2/2 przyjęta;
- świeże otwarcie strony z pamięci ze zmianą i rezerwacją, po przywróceniu psa — od razu przywrócony;
- rezerwacja, „Wrócił ✓", „Cofnij", 1/2 i 2/2, jutro (rezerwacja, „Bierze TTB"), trzy naraz, miniony dzień;
- „Co nowego" (1.4 bez kolorów trudności, „nowa"), plakietki i legenda jak w 1.3, Panel.

Pominięte: „Skopiuj treść" (schowek właściciela, kod bez zmian od 13.10), dodanie i usunięcie psa oraz zadania
(okienka potwierdzenia; właściciel był poza komputerem) — zamiast tego zmiana i przywrócenie istniejącego psa.
Spacer grupowy — na telefonie.

**13.10 — `getData` ponad progiem** (+27% wobec 1,73 s, w obu cichych oknach). **Zamknięte 23.10 — właściciel
zna wynik i akceptuje rozwiązanie: poprawka B73 przed wydaniem, potem test wydania od nowa.** Kod `getData` taki sam jak w @33.
`reportDiag` (bez zmian od 1.2) szedł 0,72 s wobec ok. 0,5 s 9.10, czyli Google był tego dnia wolniejszy. Ale Dziennik
spowolnień w wolnych odczytach pokazuje nowy krok 1.4 „pamięć" (odczyt znaczników i zapis stanu do `CacheService`):
0,2 / 1,0 / 1,5 / 1,8 s w czterech wpisach. **Decyzja właściciela 23.10: poprawka przed wydaniem** — odczyt listy
wkłada do pamięci tylko zmiany (B73); test wydania od nowa, na wersji z poprawką.
Jedno otwarcie strony z 110 s (17:06:45) bez wpisu w Dzienniku — przestój Google przed naszym kodem.

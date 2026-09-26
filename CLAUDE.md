# G13 Spacery — kontekst projektu

Aplikacja Google Apps Script dla grupy wolontariuszy schroniska (grupa G13).
Zastępuje papierową kartkę z zapisami na spacery psów. Jeden link w przeglądarce,
bez kont i bez instalacji. Arkusz Google jest bazą danych.

**Komunikacja i kod po polsku** — komentarze, teksty w interfejsie, nazwy w arkuszu.
Nazwy funkcji i zmiennych po angielsku.

## Kto tego używa

Wolontariusze schroniska, głównie **na telefonach**, często w rękawicach i w biegu,
przy słabym zasięgu. To dyktuje wszystkie decyzje projektowe:

- **Zamrożony interfejs jest niedopuszczalny.** Lepiej pokazać nieaktualne dane niż
  nie reagować na dotyk. Użytkownik nie ma jak zgłosić błędu i nie będzie odświeżał strony.
- Zero konfiguracji po stronie użytkownika. Brak logowania, brak instalacji.
- Tryb edycji (dodawanie psów, zadania, ustawienia) chroniony PIN-em — używa go
  prowadząca grupę, nie zwykli wolontariusze.

## Struktura

| plik | rola |
|---|---|
| `Config.gs` | nazwy zakładek, mapy kolumn, limity długości, strefa, domyślna godzina resetu, okno Historii |
| `Utils.gs` | pomocnicze: `withLock_` (znosi zagnieżdżenie), `requirePin_`, daty (`addDays_`, `isDate_`), walidacje |
| `Settings.gs` | Script Properties: PIN (`pin_()`), godzina czyszczenia + wyzwalacz, `businessDate_()` |
| `Setup.gs` | `setup()`, `migrate()`, `installTriggers()` |
| `WebApp.gs` | `doGet()`, `include()`, `getData()`, `getDiagnostics()`, `getHistoryDays()`, `getHistory()` (stare karty), `checkPin()` |
| `Dogs.gs` | katalog psów + dzień psa (zakładka Spacery, jednorazowy import) + akcje na psach |
| `Tasks.gs` | zadania |
| `History.gs` | minione dni do podglądu + `endOfDay()` (domyka dni sprzed bieżącego) |
| `Index.html` / `Styles.html` / `Script.html` | frontend, składany przez `<?!= include(...) ?>` |
| `tests/` | dwa harnessy + scenariusze (patrz niżej) |

**Nazwy plików HTML w Apps Script muszą brzmieć dokładnie `Index`, `Styles`, `Script`** —
`include()` odwołuje się do nich po nazwie.

## Arkusz

- **Psy** — KATALOG, kim jest pies: `id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer | notatka | spacery | kto1 | godzina1 | notatka_do`.
  **`status`, `kto`, `godzina`, `kto1`, `godzina1` są martwe** od wprowadzenia dat — czyta je
  tylko jednorazowy `importDayState_()`. Nie pisz do nich i nie czytaj z nich stanu dnia.
  Zostają, bo cofnięcie wdrożenia do starej wersji znów by ich użyło.
- **Spacery** — stan psa KONKRETNEGO DNIA: `data | pies_id | status | kto | godzina | kto1 | godzina1 | grupa`.
  Wiersz na parę (dzień, pies), brak wiersza = wolny. Tylko dni otwarte (bieżący + przyszłe,
  ewentualnie niezamknięte) — `endOfDay()` przenosi zamknięte do Historii, grupy znikają razem
  z nimi. Kolumnę `grupa` do zakładki sprzed grup dokłada sam `ensureWalkColumns_()` przy
  pierwszym dostępie (getRange poza szerokość rzuca błędem).
- **Historia** — zamknięte dni: `data | pies | kto | godzina` (pies jako etykieta, nie id)
- **Zadania** — `id | tresc | data | status`

Statusy psa: `free` / `reserved` / `walked`. Trudności: `easy` / `med` / `hard`
(zielony / żółty / czerwony). Kolumny dat i godzin mają **format tekstowy `@`** —
bez tego arkusz parsuje `"17:21"` na `Date` z epoką 1899.

Dodanie kolumny wymaga trzech kroków: `Config.gs` (mapa + nagłówki) → `Setup.gs`
(`setup()` i `migrate()`) → odczyt/zapis w `Dogs.gs` lub `Tasks.gs`.

## Konwencje

- **Sufiks `_` = funkcja prywatna**, niewywoływalna z przeglądarki przez `google.script.run`.
  Wszystko bez sufiksu jest publicznym API — traktuj to jako powierzchnię ataku.
- Każda mutacja danych przechodzi przez `withLock_` (blokada + `SpreadsheetApp.flush()`
  przed zwolnieniem).
- Akcje wolontariuszy zwracają **tylko zmieniony wiersz** (`{dog}` / `{ok}`), nie pełny
  stan trzech zakładek. Akcje edycyjne mogą zwracać pełny stan.
- Akcje edycyjne wymagają PIN-u przez `requirePin_(pin)`.
- **PIN nie istnieje w kodzie.** Siedzi we właściwości skryptu `pin` (`pin_()` w `Settings.gs`),
  bez wartości domyślnej: nieustawiony = tryb edycji zamknięty. Nigdy nie wpisuj PIN-u
  do pliku „na chwilę" — pierwszy commit czyni go publicznym na zawsze, a `git rm`
  tego nie cofa. Testy tego pilnują (B9 skanuje źródła).
- **Minione dni jadą do przeglądarki blokami** (`getHistoryDays`, po dwa tygodnie), nigdy
  w całości. Arkusz trzyma komplet. Liczniki w panelu mają pokazywać komplet (`histCount_()`).
- **Każda akcja na psie niesie datę** (ostatni argument: `reserve(id, name, date)`,
  `markWalked(id, name, slot, date)`, `undoFirstWalk(id, date)`, `setFree(id, date)`).
  Brak daty = bieżący dzień — tak wołają karty otwarte przed wprowadzeniem dat i mają działać.
  Serwer (`actionDate_`) odrzuca dzień miniony; spacer (i jego cofnięcie) tylko w bieżącym.
- **Grupa (spacer grupowy) jest na dzień**: `setGroup(date, ids, gid)` — `gid` 0 = nowa
  (kolejny numer dnia, od numeru zależy kolor), >0 = zmiana składu; mniej niż 2 psy = rozwiązanie.
  Pies przeniesiony z innej grupy znika z tamtej; grupa z jednym psem przestaje istnieć;
  pies po spacerze nie dołącza do nowej. **Nie jest w `RETRIABLE`** — nowa grupa bierze kolejny
  numer, więc powtórka przepisałaby ją pod inny numer i kolor. Wspólny spacer to NIE osobny
  endpoint: klient woła zwykłe `markWalked` dla każdego zarezerwowanego psa z grupy.
  **Pies, który traci opiekuna, wypada z grupy**: `setFree` („Zwolnij" i „Cofnij") zeruje mu
  grupę, a grupa z jednym psem przestaje istnieć (zgłoszenie z terenu: kolor przy zwolnionym
  psie mylił). Zaplanowana grupa wolnych psów zostaje — wolnego nikt nie zwalnia. `setFree`
  zostaje w `RETRIABLE`: powtórka trafia na psa już wolnego i niczego nie rusza (B30).
- **Zadanie ma dzień, od którego się pokazuje** (kolumna `data`): `addTask(text, pin, date)`,
  brak daty = bieżący dzień rezerwacyjny (nie kalendarzowy — zadanie dodane po resecie nie może
  być od razu „od wczoraj"). Na liście bieżącego dnia: zadania z dniem ≤ bieżący; na przyszłym:
  tylko zaplanowane dokładnie na niego, bez odhaczania; `setTaskDone` odrzuca zadanie z przyszłości.
- **Notatka „nigdy"** — `notatka_do = NOTE_FOREVER` (`'nigdy'`, ta sama stała w `Config.gs`
  i `Script.html`): nie znika przy żadnym czyszczeniu. Uwaga: jako napis „nigdy" sortuje się
  po każdej dacie, więc nawet bez jawnego warunku zachowanie byłoby to samo — jawny warunek
  zostaje dla czytelności, testy tego odróżnić nie mogą.
- **Stan startowy jest wpisany w stronę** (`bootJson_()` → `<script type="application/json"
  id="boot">`), więc lista rysuje się bez drugiego przelotu do serwera. To stan początkowy,
  nie wartość w szablonie kafelka (bug nr 7). Błąd odczytu = `null` = zwykłe `getData`.
- **Dzień rezerwacyjny (`businessDate_()`) zaczyna się o godzinie resetu, nie o północy.**
  Reset ≥ 12:00: przed nim dziś, od niego jutro. Reset < 12:00: przed nim wczoraj, od niego
  dziś. Reguła „po resecie jutro" wzięta wprost ze zgłoszenia jest błędna dla resetu
  porannego (o 10:00 kazałaby rezerwować na jutro) — B16 tego pilnuje. `today` z `getData`
  to wciąż data KALENDARZOWA (odznaki „od wczoraj", terminy notatek); `businessDate` to dzień listy.
- **Środowisko rozpoznajemy po właściwości `env` (`env_()` w `Settings.gs`), a flaga jest
  odwrócona:** pasek „środowisko testowe" gaśnie wyłącznie przy wartości `prod`, wszystko
  inne — łącznie z brakiem właściwości — jest testem z urzędu. Projekt testowy to kopia
  produkcyjnego i nie ma własnych właściwości, więc gdyby to test musiał się oznaczać,
  zapomnienie dawałoby test wyglądający jak produkcja. **Nie „naprawiaj" tego kierunku.**

## Architektura frontendu

Interfejs jest **optymistyczny**: kliknięcie zmienia widok natychmiast, zapis leci w tle.

- **Stan: katalog + dni.** `state.dogs` to katalog (kim jest pies), `state.walks` to stan
  dnia pod kluczem `${data}|${id}`, a `dogAt(id, data)` / `dogsAt(data)` łączą je w obiekt,
  który dostaje rendering. `state.date` = dzień na ekranie, `state.bizDate` = bieżący dzień
  rezerwacyjny, `state.follow` = czy ekran idzie za bieżącym (po resecie przeskakuje sam —
  ale **nie** w chwili, gdy ktoś pisze imię: `busyEditing()`).
  Gdy serwer nie przysyła `walks` (stary kształt), stan z psów trafia pod bieżący dzień —
  na tym trzymają się wszystkie starsze testy.
- **Tryb edycji to katalog, nie dzień** (`renderCatalog`): bez paska dat, bez rezerwacji
  i spacerów, psy w kolejności z arkusza, ustawienie „2 spacery dziennie" zamiast postępu,
  zadania wszystkie z dniem + formularz z datą. Lista dnia (`renderDog`) nie ma już przycisków
  edycji. Wolontariusze nigdy nie widzą katalogu, prowadząca w edycji nigdy nie widzi dnia.
- **`busyEditing()` łapie wyłącznie pole wolontariusza `[data-entry]`**, fokus w polu, edycję
  psa i zaznaczanie grupy (`state.select`). Nigdy nie wracaj do ogólnego `.entry` — patrz bug nr 10.
- **Spacery grupowe.** Przytrzymanie kafelka (`LONG_PRESS_MS` = 550 ms od `pointerdown`,
  przesunięcie > 10 px albo puszczenie przerywa) włącza `state.select`; w tym trybie każde
  kliknięcie w liście tylko zaznacza (`togglePick`) — żadnej rezerwacji z puszczenia palca.
  **Kafelek w tym trybie to ten sam `renderDog`** (`pickBits`: klasa + kółko `position:absolute`
  w rogu, przyciski bledną, ale zostają). Osobny, krótszy kafelek skracał listę w chwili
  przytrzymania i pies uciekał spod palca z ekranu (S78). Jeśli przytrzymany pies wypada pod
  pasek na dole, `keepAboveBar` przesuwa listę dokładnie o tyle (S81).
  Przytrzymanie psa z grupy otwiera jej skład do zmiany / „Rozwiąż". Kolor grupy wynika z numeru
  (`GROUP_COLORS`), obok tła jest znacznik „👥 grupa" — w słońcu samo tło znika. Grupa trzyma
  się razem na liście: blok stoi tam, gdzie stanąłby jej najpilniejszy pies; po zatwierdzeniu
  lista układa się od razu (to cel akcji). **„Wyprowadzony ✓" w grupie jest aktywny, gdy nikt
  z grupy nie jest WOLNY** i odhacza wszystkich zarezerwowanych. Nie „wszyscy zarezerwowani" —
  w grupie psa 1- i 2-spacerowego po wspólnym spacerze pierwszy jest wyprowadzony, a drugi
  czeka na drugi spacer; dosłowna reguła blokowała go na zawsze (S80 łapie to wstrzyknięte).
  Cofnięcie cofa jednego psa i wyprowadza go z grupy (jak zwolnienie).
  `patchDog` psa z grupy przerysowuje też kafelki towarzyszy — od jego stanu zależy ich przycisk;
  `doFree` dodatkowo przerysowuje dawnych towarzyszy, bo po wyjściu psa `patchDog` ich nie widzi.
- **Akcja pamięta swój dzień.** `doReserve` & spółka biorą datę w chwili kliknięcia,
  wysyłają ją i zapisują odpowiedź pod NIĄ, nie pod `state.date` — wolontariusz mógł
  w międzyczasie przejść strzałką gdzie indziej (S56). Klik na dniu, który zamknął się pod
  palcami, dostaje `dayClosed()`: komunikat + przejście na bieżący dzień, nigdy ciszę (S58).
- **Kolejka zapisów z torami.** Tor = byt (`dog:1@2026-09-24`, `task:3`, `_full`). Ten sam
  pies tego samego dnia obsługiwany po kolei, różne psy i różne dni równolegle, sufit 4 naraz.
  Zapis, który utknął, blokuje wyłącznie swój tor.
- **`pendingKeys`** liczy zapisy w drodze per byt. Odpowiedź serwera stosujemy tylko
  wtedy, gdy dotyczy **ostatniej** operacji dla tego bytu — inaczej szybkie sekwencje
  (rezerwuj → zwolnij) cofałyby się same.
- **Samoleczenie.** Watchdog 12 s, jedno automatyczne ponowienie dla operacji
  idempotentnych (`RETRIABLE`), `checkStuck()` co 3 s **oraz** przy każdym
  `pointerdown`/`touchstart` i powrocie do karty. `render()` i `handleAction()`
  w `try/catch` z samonaprawą. Tor zwalniany **przed** jakąkolwiek logiką odpowiedzi.
- **Kolejność kafelków: najpierw dorobek (`walksDone`), potem status.** Góra listy to
  zawsze to, co dziś jeszcze nie zrobione. Sam status nie wystarcza, bo przy dwóch
  spacerach „wolny" znaczy dwie różne rzeczy: pies, który nie wyszedł ani razu, i pies
  po pierwszym spacerze. Ten drugi schodzi pod psy bez żadnego spaceru — także pod
  **zarezerwowane**, bo tam spacer jest wciąż przed nami, a nie za nami. Dopiero wewnątrz
  tego samego dorobku idzie status (wolny → zarezerwowany → wyprowadzony), a na końcu
  kolejność z arkusza. Dla psów jednospacerowych wychodzi dokładnie to, co dotąd.
  Kolejność jest przeliczana wyłącznie
  wtedy, gdy nikt nie jest w trakcie (`canReorder()`: zero zapisów w drodze, nic nie jest
  otwarte do edycji, `REORDER_QUIET_MS` = 4 s ciszy po ostatnim dotknięciu ekranu).
  Klik zmienia kafelek **w miejscu** przez `patchDog()`; lista układa się dopiero po ciszy,
  z timera umówionego w `markTap()`. Gdyby sortować od razu, pies uciekałby spod palca
  w środku akcji — a wolontariusz stoi wtedy z psem na smyczy. **Wyjątek: zmiana dnia**
  strzałką to cała nowa lista, więc kolejność liczy się od razu (`orderDate`, S60).
- **Oszczędne renderowanie.** Akcja na psie podmienia tylko jego kafelek (`patchDog()`)
  plus linijkę podsumowania. Pełny render porównuje HTML z poprzednim i przy braku
  różnic nie dotyka DOM. Ręczna zmiana DOM (otwarcie pola „Twoje imię") unieważnia
  cache przez `invalidateHtml()`.

## Testy — obowiązkowe przy każdej zmianie

```bash
npm test
```

Wymaga Node (sprawdzone na 24 LTS) i `npm install` w katalogu projektu — `jsdom` to jedyna
zależność, wyłącznie na potrzeby harnessów. Sam kod aplikacji nadal mieszka w Apps Script
i nic o npm nie wie. Pojedynczy zestaw: `node tests/scenarios3.js`.

Aktualnie **695 asercji, wszystkie zielone**. Nowa funkcja bez testu nie jest skończona.

**Test, który nie potrafi zapalić się na czerwono, niczego nie dowodzi.** Nowy test na buga
sprawdzaj na starym kodzie (`git stash push -- <pliki>` → uruchom → `git stash pop`),
a nowy mechanizm — wstrzykując celowo jego regresję. Dopiero czerwony wynik uznaj za dowód.

**Sprawdzaj STAN, nie tylko ekran.** Przy datach dwa testy (S56, S58) przechodziły mimo
wstrzykniętego błędu, bo patrzyły na DOM, który się akurat nie przerysował — a stan pod
spodem był już zepsuty (odpowiedź zapisana pod zły dzień; imię z kafelka 24.09 rezerwujące
psa na 25.09). Gdy błąd może siedzieć w stanie, wymuś przerysowanie ze stanu albo czytaj
`__state` wprost. I testuj to, **czego mechanizm faktycznie pilnuje**: ochrona zaznaczania
grupy przed odświeżeniem nie chroni zaznaczeń (te trzyma stan), tylko dnia przed przeskokiem
po resecie — pierwsza wersja S76 sprawdzała zaznaczenia i przechodziła bez tej ochrony.

Zestaw `scenarios12.js` jest **asynchroniczny**: przytrzymanie kafelka mierzy prawdziwy zegar
(czeka ~650 ms), dokładnie jak na telefonie.

- `tests/harness.js` — ładuje prawdziwe `Index`+`Styles`+`Script` w jsdom, klika jak
  człowiek, pozwala sterować tym **kiedy i czy w ogóle** odpowie „serwer"
  (`respondNext`, `failNext`, gubienie odpowiedzi, `__force` na watchdog).
- `tests/backend-harness.js` — uruchamia prawdziwe pliki `.gs` na atrapie arkusza
  z **zamrożonym, ale przestawialnym zegarem** (`env.setNow(iso)`), więc przejście przez
  godzinę resetu da się sprawdzić w jednym scenariuszu. Wszystkie `.gs` sklejane w jeden
  skrypt, bo w Apps Script dzielą wspólny zakres globalny. `build()` w `backend.js` startuje
  domyślnie o 10:00 i podaje stan dnia wprost (`walks`); import ze starych kolumn tylko
  z `legacy: true`.
- Testy node wymagają `process.exit()` — `setInterval` w aplikacji trzyma proces.

Zakres: S1–S8 podstawy, S9–S14 odporność + fuzz, S15–S18 notatki i dwa spacery,
S19–S24 kolejka równoległa, S25–S31 panel i wydajność, S32–S38 termin notatki,
S39 numer spaceru w `markWalked`, S40–S42 miniony dzień (podgląd), S43–S45 kolejność kafelków
i jej zamrożenie, S46 przełącznik dwóch spacerów, S47–S48 kolejność wg dorobku spacerów,
S49–S52 pasek środowiska testowego, S53–S62 nawigacja datą, rezerwacje z wyprzedzeniem,
przeskok dnia po resecie, S63 symetria strzałek, S64 stan wpisany w stronę, S65 tryb edycji
jako katalog, S66–S67 zadania na konkretny dzień, S68 notatka „nigdy", S69–S70 przerysowanie
w trybie edycji (bug nr 10), S71–S77 spacery grupowe (przytrzymanie, kolor, sąsiedztwo,
wspólny spacer, cofanie jednego, zmiana i rozwiązanie, przyszły dzień), S78 zaznaczanie bez
zmiany układu, S79 zwolniony pies wypada z grupy, S80 grupa psów 1- i 2-spacerowych,
S81 przytrzymany pies nie chowa się pod paskiem, B1–B6 notatki / archiwizacja / godzina resetu,
B7–B8 idempotencja `markWalked`, B9 PIN z właściwości, B10 Historia, B11–B12 `setAllWalks`,
B13–B14 pełny dzień psa 2-spacerowego i cofanie, B15 oznaczenie środowiska,
B16 dzień rezerwacyjny, B17 rezerwacje na daty, B18 przejście przez reset, B19 domykanie
zaległych dni, B20 podgląd minionych dni, B21 jednorazowy import, B22 usuwanie psa,
B23 zagnieżdżona blokada, B24–B25 zadania z datą, B26 notatka „nigdy", B27 `bootJson_`,
B28 `setGroup`, B29 dokładanie kolumny `grupa` do starej zakładki, B30 `setFree` a grupa,
T1–T3 konfiguracja wdrożeń (`tests/tooling.js`).

**Uwaga o zasięgu harnessów:** frontendowy zna tylko atrapę serwera, backendowy nie zna
kolejki. Bug z ponawianym `markWalked` (niżej, pkt 9) siedział dokładnie na styku i żaden
z nich osobno by go nie złapał. Przy zmianie kontraktu klient↔serwer dopisuj test po
**obu** stronach.

## Bugi, które już raz naprawiliśmy — nie wprowadzaj ich ponownie

1. **`[fn].apply(google.script.run, args)`** wywoływało funkcję na gołym runnerze
   zamiast na obiekcie z `withSuccessHandler` — callbacki ginęły, interfejs zamierał.
   Zawsze `runner[fn](...args)`.
2. **Brak `SpreadsheetApp.flush()`** przed zwolnieniem blokady → zapisy gubione.
3. **Kolumny dat/godzin bez formatu `@`** → daty z 1899 roku.
4. **`endOfDay` bez wyzwalacza** → Historia pusta i brak resetu. `installTriggers()`
   jest osobnym krokiem wdrożenia.
5. **Jeden zapis naraz w całej aplikacji** → rezerwacja kilku psów pod rząd ustawiała
   się w szereg po 1–3 s każdy i wyglądała jak zawieszenie.
6. **Gest liczący `click` zamiast `pointerdown`** → na telefonie seria szybkich tapnięć
   jest częściowo zjadana przez rozpoznawanie gestów.
7. **Wartość wpieczona w szablon HTML** (podpowiadane imię) → przy patchowaniu
   pojedynczego kafelka nie dociera do pozostałych. Takie rzeczy ustawiaj w handlerze.
8. **`google.script.run` potrafi nigdy nie oddzwonić** na telefonie, a timery w tle
   zasypiają. Stąd `checkStuck()` przy dotknięciu ekranu.
9. **Zapis nieidempotentny na liście `RETRIABLE`.** `markWalked` bez informacji, KTÓRY
   spacer odhaczamy: pierwszy spacer psa 2-spacerowego przechodził, odpowiedź ginęła,
   automatyczne ponowienie trafiało już w gałąź „drugi spacer" (bo `kto1` było wypełnione)
   i robiło z psa wyprowadzonego 2/2 z pustym „kto", a do Historii wpadał wpis bez osoby.
   Klient przekazuje teraz `slot` (1 = pierwszy z dwóch, 2 = ostatni), a serwer na powtórce
   oddaje stan i niczego nie rusza. **Zanim dopiszesz cokolwiek do `RETRIABLE`, sprawdź,
   czy dwa identyczne wywołania dają ten sam skutek co jedno.**
10. **Tryb edycji nigdy się nie przerysowywał.** Pole nowego zadania miało klasę `.entry`,
    a `busyEditing()` uznawało każde widoczne `.entry` za „ktoś wpisuje imię". W trybie edycji
    to pole jest widoczne zawsze, więc `safeRender()` nic nie robiło: dodany pies i dodane
    zadanie nie pojawiały się po odpowiedzi serwera, a odświeżanie co 15 s stało. Wyszło
    przy przebudowie trybu edycji (sonda na kodzie z produkcji: oba `false`). Teraz
    `busyEditing()` patrzy tylko na `[data-entry]`, a formularz zadania to `.taskform` (S69, S70).
    **Każde pole, które jest widoczne na stałe, nie może udawać „ktoś właśnie pisze".**

## Pułapki Apps Script

- `atHour(h)` to **okno h:00–h:59**, nie punkt czasowy. Dlatego dzień na liście zmienia się
  z zegara (`businessDate_`) punktualnie o h:00, a `endOfDay` tylko domyka zamknięte dni,
  kiedy do niego dojdzie. Archiwizuje pod datą z wiersza Spacery — nie zgaduje jej z zegara.
- **Blokada Apps Script nie jest wielokrotnego wejścia.** `withLock_` liczy zagnieżdżenie
  (`lockDepth_`) i wewnątrz już wziętej blokady po prostu wykonuje funkcję. Bez tego
  `getData()` spod akcji edycyjnej, zakładające brakującą zakładkę, zwolniłoby blokadę
  zewnętrzną w połowie jej pracy (B23).
- **Nie wdrażaj wersji z datami w godzinie resetu.** Jednorazowy import stanu dnia ze starych
  kolumn Psy daje mu datę bieżącego dnia rezerwacyjnego — po h:00 byłoby to już jutro.
- Ustawienie z Panelu godziny resetu, która **dziś już minęła**, od razu przełącza listę
  na kolejny dzień (to spójne z modelem, ale warto o tym wiedzieć — Panel to mówi).
- `getRange()` poza `getMaxColumns()` rzuca błędem — `migrate()` najpierw dokłada kolumny.
- Aplikacja działa w zagnieżdżonym iframie `googleusercontent.com`. Wbudowane
  przeglądarki (WhatsApp, Messenger) potrafią zablokować most `postMessage`
  i wtedy wywołania wiszą — to nie jest błąd kodu.

## Wdrożenie

Pliki jadą przez **clasp**, nie przez kopiowanie do edytora. Szczegóły i konfiguracja
raz-na-maszynę: README.

**Dwa środowiska.** Produkcja i test to dwa osobne projekty Apps Script, każdy z własnym
arkuszem, linkiem i PIN-em; kod jedzie do obu z tego repo. Test ma własny plik projektu
`.clasp.test.json` i własne komendy (`deploy:test`, `push:test`, `files:test`,
`deployments:test`) — jedyna różnica to `-P .clasp.test.json`. **Kolejność zawsze ta sama:
`npm run deploy:test` → sprawdzenie na telefonie → `npm run deploy:prod`.**

Identyfikatory obu wdrożeń są wpisane na stałe w `package.json` (decyzja właściciela:
nie ma argumentu do pomylenia, a produkcyjny i tak jest częścią publicznego linku).
Celowo **nie ma** gołego `deploy` — każde wdrożenie nazywa swoje środowisko.
`tests/tooling.js` (T1–T3) pilnuje, że każde wywołanie clasp w komendzie `:test` ma
`-P .clasp.test.json`, a komendy produkcyjne go nie mają. **Zmieniając skrypty w
`package.json`, nie omijaj tego testu.**

1. `npm run deploy:prod` — testy, wysyłka plików i nowa wersja **istniejącego**
   wdrożenia (link zostaje ten sam). Czerwony test przerywa wysyłkę.
2. **Właściwość skryptu `pin`** (Ustawienia projektu → Właściwości skryptu) — bez niej
   tryb edycji jest zamknięty. Ustawiana raz, poza kodem i poza repozytorium.
3. Przy zmianie struktury arkusza: uruchom `migrate()` z edytora (dokłada kolumny
   i formaty, danych nie rusza). Przy pustym projekcie: `setup()`.
4. `installTriggers()` — bez tego nie ma nocnego resetu.
5. Ustawienia web appki: „wykonaj jako: ja", „dostęp: wszyscy". Strefa `Europe/Warsaw`.

Pułapki clasp:
- **`clasp clone` ściąga pliki z serwera i nadpisuje lokalne** — nigdy go nie używaj
  w tym repo. `.clasp.json` piszemy ręcznie, ruch idzie wyłącznie lokalnie → Apps Script.
- **`clasp deploy` bez `-i` tworzy NOWE wdrożenie pod NOWYM adresem.** Stary link
  wolontariuszy zostałby wtedy na starej wersji. Stąd `redeploy <deploymentId>`
  w obu komendach wdrożeniowych.
- **`.claspignore` jest krytyczny** — bez niego `tests/*.js` (z `require`) wyjadą jako
  pliki projektu Apps Script. Po dodaniu nowego pliku sprawdź `npm run files`.
- clasp nie odpala funkcji: `migrate()` / `installTriggers()` nadal ręcznie z edytora.

Nowy plik `.gs` albo nowe uprawnienie (np. tworzenie wyzwalaczy) wymaga **ponownej
autoryzacji** przy pierwszym uruchomieniu.

## Stan i rzeczy otwarte

- Testy na żywo ze Stefanem wypadły pozytywnie. Kolejny test z większą grupą.
- **PIN wyjęty z kodu** do właściwości skryptu `pin`. Uwaga: `1234` zostaje w historii
  gita na zawsze, więc samo przeniesienie nic nie daje — liczy się to, że w Apps Script
  ustawiona jest **inna, nowa wartość**, i że trafiła do prowadzącej kanałem innym
  niż WhatsApp, którym szła poprzednia.
- Kartki zostają jako zapas na czas testów.
- **Do zrobienia: kolorystyka w pełnym słońcu.** Zgłoszone z terenu — na dworze, przy
  ostrym świetle, kontrast jest za słaby i ekranu nie da się odczytać. Dotyczy palety
  w `Styles.html` (`--paper`, `--card`, `--muted`, kolory trudności). Świadomie odłożone,
  nie jest zapomniane. Przy tym temacie pamiętaj, że rozjaśnianie tła nie wystarczy —
  liczy się kontrast tekstu i to, żeby kolory trudności dało się rozróżnić w słońcu.
- **Do rozstrzygnięcia:** na kafelku psa 2-spacerowego wciąż jest `1. spacer: Ania · 10:15`.
  Godzinę z kafelka „wyprowadzony" usunęliśmy jako zbędną — ta linijka jest tego samego
  rodzaju i przy włączonym trybie dwóch spacerów robi się jej dużo.

## Jak ze mną pracować

- Nie dokładaj funkcji, o które nie prosiłem. Jeśli widzisz przy okazji realny błąd,
  powiedz o nim — decyzję o naprawie podejmę sam.
- Zanim napiszesz kod, sprawdź istniejące rozwiązanie w repo. Sporo rzeczy, które
  wyglądają na nadmiarowe, jest wynikiem konkretnego bugu z listy wyżej.
- Testy do każdej zmiany, uruchomione, zielone.
- Mów wprost, gdy coś jest złym pomysłem.

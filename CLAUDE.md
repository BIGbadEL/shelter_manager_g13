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
| `Config.gs` | PIN, nazwy zakładek, mapy kolumn, limity długości, strefa, domyślna godzina resetu |
| `Utils.gs` | pomocnicze: `withLock_`, `requirePin_`, konwersje dat/godzin, walidacje |
| `Settings.gs` | godzina czyszczenia listy (Script Properties) + przekładanie wyzwalacza |
| `Setup.gs` | `setup()`, `migrate()`, `installTriggers()` |
| `WebApp.gs` | `doGet()`, `include()`, `getData()`, `getDiagnostics()`, `getHistory()`, `checkPin()` |
| `Dogs.gs` | odczyt psów + akcje na psach |
| `Tasks.gs` | zadania |
| `History.gs` | odczyt historii + `endOfDay()` (archiwizacja i reset) |
| `Index.html` / `Styles.html` / `Script.html` | frontend, składany przez `<?!= include(...) ?>` |
| `tests/` | dwa harnessy + scenariusze (patrz niżej) |

**Nazwy plików HTML w Apps Script muszą brzmieć dokładnie `Index`, `Styles`, `Script`** —
`include()` odwołuje się do nich po nazwie.

## Arkusz

- **Psy** — `id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer | notatka | spacery | kto1 | godzina1 | notatka_do`
- **Historia** — `data | pies | kto | godzina`
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

## Architektura frontendu

Interfejs jest **optymistyczny**: kliknięcie zmienia widok natychmiast, zapis leci w tle.

- **Kolejka zapisów z torami.** Tor = byt (`dog:1`, `task:3`, `_full`). Ten sam pies
  obsługiwany po kolei, różne psy równolegle, sufit 4 naraz. Zapis, który utknął,
  blokuje wyłącznie swój tor.
- **`pendingKeys`** liczy zapisy w drodze per byt. Odpowiedź serwera stosujemy tylko
  wtedy, gdy dotyczy **ostatniej** operacji dla tego bytu — inaczej szybkie sekwencje
  (rezerwuj → zwolnij) cofałyby się same.
- **Samoleczenie.** Watchdog 12 s, jedno automatyczne ponowienie dla operacji
  idempotentnych (`RETRIABLE`), `checkStuck()` co 3 s **oraz** przy każdym
  `pointerdown`/`touchstart` i powrocie do karty. `render()` i `handleAction()`
  w `try/catch` z samonaprawą. Tor zwalniany **przed** jakąkolwiek logiką odpowiedzi.
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

Aktualnie **227 asercji, wszystkie zielone**. Nowa funkcja bez testu nie jest skończona.

**Test, który nie potrafi zapalić się na czerwono, niczego nie dowodzi.** Nowy test na buga
sprawdzaj na starym kodzie (`git stash push -- <pliki>` → uruchom → `git stash pop`)
i dopiero czerwony wynik uznaj za dowód, że test faktycznie pilnuje tej regresji.

- `tests/harness.js` — ładuje prawdziwe `Index`+`Styles`+`Script` w jsdom, klika jak
  człowiek, pozwala sterować tym **kiedy i czy w ogóle** odpowie „serwer"
  (`respondNext`, `failNext`, gubienie odpowiedzi, `__force` na watchdog).
- `tests/backend-harness.js` — uruchamia prawdziwe pliki `.gs` na atrapie arkusza
  z **zamrożonym zegarem**, więc nocny reset da się sprawdzić o dowolnej dacie
  i godzinie. Wszystkie `.gs` sklejane w jeden skrypt, bo w Apps Script dzielą
  wspólny zakres globalny.
- Testy node wymagają `process.exit()` — `setInterval` w aplikacji trzyma proces.

Zakres: S1–S8 podstawy, S9–S14 odporność + fuzz, S15–S18 notatki i dwa spacery,
S19–S24 kolejka równoległa, S25–S31 panel i wydajność, S32–S38 termin notatki,
S39 numer spaceru w `markWalked`, B1–B6 backend, B7–B8 idempotencja `markWalked`.

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

## Pułapki Apps Script

- `atHour(h)` to **okno h:00–h:59**, nie punkt czasowy.
- Reset **przed 12:00** archiwizuje pod datą dnia poprzedniego (`archiveDate_()`) —
  inaczej wieczorne spacery trafiłyby do Historii pod jutrzejszą datą.
- `getRange()` poza `getMaxColumns()` rzuca błędem — `migrate()` najpierw dokłada kolumny.
- Aplikacja działa w zagnieżdżonym iframie `googleusercontent.com`. Wbudowane
  przeglądarki (WhatsApp, Messenger) potrafią zablokować most `postMessage`
  i wtedy wywołania wiszą — to nie jest błąd kodu.

## Wdrożenie

Pliki jadą przez **clasp** (`npm run deploy -- <deploymentId> -d "opis"`), nie przez
kopiowanie do edytora. Szczegóły i konfiguracja raz-na-maszynę: README.

1. `npm run deploy -- <deploymentId>` — testy, wysyłka plików i nowa wersja
   **istniejącego** wdrożenia (link zostaje ten sam). Czerwony test przerywa wysyłkę.
2. Przy zmianie struktury arkusza: uruchom `migrate()` z edytora (dokłada kolumny
   i formaty, danych nie rusza). Przy pustym projekcie: `setup()`.
3. `installTriggers()` — bez tego nie ma nocnego resetu.
4. Ustawienia web appki: „wykonaj jako: ja", „dostęp: wszyscy". Strefa `Europe/Warsaw`.

Pułapki clasp:
- **`clasp clone` ściąga pliki z serwera i nadpisuje lokalne** — nigdy go nie używaj
  w tym repo. `.clasp.json` piszemy ręcznie, ruch idzie wyłącznie lokalnie → Apps Script.
- **`clasp deploy` bez `-i` tworzy NOWE wdrożenie pod NOWYM adresem.** Stary link
  wolontariuszy zostałby wtedy na starej wersji. Stąd `redeploy <deploymentId>`.
- **`.claspignore` jest krytyczny** — bez niego `tests/*.js` (z `require`) wyjadą jako
  pliki projektu Apps Script. Po dodaniu nowego pliku sprawdź `npm run files`.
- clasp nie odpala funkcji: `migrate()` / `installTriggers()` nadal ręcznie z edytora.

Nowy plik `.gs` albo nowe uprawnienie (np. tworzenie wyzwalaczy) wymaga **ponownej
autoryzacji** przy pierwszym uruchomieniu.

## Stan i rzeczy otwarte

- Testy na żywo ze Stefanem wypadły pozytywnie. Kolejny test z większą grupą.
- **PIN nadal `1234`** w `Config.gs` — tymczasowy, był wysyłany WhatsAppem.
  Do zmiany po fazie testów i przekazania prowadzącej inną drogą.
- Kartki zostają jako zapas na czas testów.

## Jak ze mną pracować

- Nie dokładaj funkcji, o które nie prosiłem. Jeśli widzisz przy okazji realny błąd,
  powiedz o nim — decyzję o naprawie podejmę sam.
- Zanim napiszesz kod, sprawdź istniejące rozwiązanie w repo. Sporo rzeczy, które
  wyglądają na nadmiarowe, jest wynikiem konkretnego bugu z listy wyżej.
- Testy do każdej zmiany, uruchomione, zielone.
- Mów wprost, gdy coś jest złym pomysłem.

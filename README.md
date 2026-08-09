# G13 Spacery

Zapisy na spacery psów dla wolontariuszy schroniska (Grupa G13). Jeden link w przeglądarce, bez kont i instalacji. Arkusz Google to ukryta baza danych.

## Struktura

| Plik | Rola |
|---|---|
| `appsscript.json` | manifest projektu — strefa czasowa Europe/Warsaw, ustawienia web appki |
| `Config.gs` | PIN, nazwy zakładek, układ kolumn, limity — jedyne miejsce edycji przy zmianach struktury |
| `Utils.gs` | wspólne pomocnicze (blokada zapisu, konwersje dat/godzin, walidacje) |
| `Settings.gs` | godzina czyszczenia listy (Script Properties) + przekładanie wyzwalacza |
| `Setup.gs` | `setup()`, `migrate()`, `installTriggers()`, formaty tekstowe kolumn |
| `WebApp.gs` | `doGet()`, `include()`, API odczytu (`getData`, `getHistory`, `checkPin`) |
| `Dogs.gs` | psy: odczyt + akcje wolontariuszy i prowadzącej |
| `Tasks.gs` | zadania na dziś: odczyt + akcje |
| `History.gs` | historia + nocny reset `endOfDay()` |
| `Index.html` | szkielet strony (składa Styles + Script) |
| `Styles.html` | style |
| `Script.html` | logika interfejsu |
| `tests/` | harness jsdom (`scenarios`…`scenarios6`) + harness backendu na atrapie arkusza (`backend.js`) |

Zakładki arkusza (tworzy je `setup()`):
- **Psy** — `id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer | notatka | spacery | kto1 | godzina1 | notatka_do`
- **Historia** — `data | pies | kto | godzina`
- **Zadania** — `id | tresc | data | status`

Konwencja: funkcje z sufiksem `_` są prywatne (niewywoływalne z przeglądarki); pozostałe to publiczne API dla `google.script.run`.

## Testy

```bash
npm install jsdom
for f in scenarios scenarios2 scenarios3 scenarios4 scenarios5 scenarios6 backend; do node tests/$f.js; done
```

Dwa harnessy. Frontendowy ładuje prawdziwe `Index`+`Styles`+`Script` w jsdom, klika jak człowiek i pozwala sterować tym, kiedy (i czy w ogóle) odpowie „serwer". Backendowy (`backend-harness.js`) uruchamia prawdziwe pliki `.gs` na atrapie arkusza z zamrożonym zegarem — dzięki temu logikę nocnego resetu da się sprawdzić o dowolnej porze i dacie, bez czekania do 22:00.

## Uruchomienie od zera

1. Wklej wszystkie pliki do projektu Apps Script przypiętego do arkusza (nazwy plików HTML muszą być dokładnie `Index`, `Styles`, `Script`).
2. W `Config.gs` ustaw własny `PIN`.
3. Uruchom ręcznie **`setup()`** (zakładki + formaty + przykładowe psy).
4. Uruchom ręcznie **`installTriggers()`** — bez tego Historia będzie pusta, a lista nie wyzeruje się o 22:00.
5. Wdróż: *Aplikacja internetowa*, „wykonaj jako: ja", „dostęp: wszyscy".

Zmiany w kodzie wchodzą na link dopiero po: *Zarządzaj wdrożeniami → edytuj → Nowa wersja*.

## Migracja istniejącego arkusza

Masz arkusz z danymi ze starszej wersji? Zamiast `setup()` uruchom raz **`migrate()`** — dołoży brakujące kolumny/zakładki i formaty tekstowe, danych nie kasuje. Potem `installTriggers()`.

## Architektura zapisu (wydajność)

Interfejs jest **optymistyczny**: kliknięcie zmienia widok natychmiast, a zapis leci w tle. Klient trzyma **kolejkę zapisów z torami**: każdy pies i każde zadanie ma własny tor, na którym zapisy idą po kolei, ale **różne psy jadą równolegle** (sufit: 4 naraz). Dzięki temu rezerwacja trzech psów pod rząd to jeden przelot, a nie trzy ustawione w szereg. Watchdog **12 s**, więc zaginiona odpowiedź nigdy nie zawiesza aplikacji — wymusza tylko dosynchronizowanie. Akcje wolontariuszy zwracają z serwera **tylko zmieniony wiersz** (`{dog}` / `{ok}`), nie pełny stan trzech zakładek; pełny stan dojeżdża z okresowym odświeżaniem (15 s) i po akcjach prowadzącej. Konflikt rezerwacji (ktoś kliknął pierwszy) jest wykrywany po odpowiedzi serwera i pokazuje toast + faktyczny stan.

**Samoleczenie (odporność na zaginione odpowiedzi):** `google.script.run` na telefonie potrafi nigdy nie oddzwonić (uśpiona karta, mrugnięcie sieci). Warstwa niezawodności: watchdog **12 s** na każdy zapis; nieudany/zaginiony zapis idempotentny (rezerwacja, spacer, zwolnienie, odhaczenie, edycja, usunięcie) jest **raz automatycznie ponawiany**; wykrywanie zawieszenia działa nie tylko z timera (co 3 s), ale też przy **każdym dotknięciu ekranu** i powrocie do karty — bo przeglądarki mobilne usypiają timery w tle. Po definitywnej porażce stan jest przywracany ratunkowym `getData`. Dodatkowo: `render()` i obsługa kliknięć są opakowane w try/catch z samonaprawą (zamrożony interfejs jest niemożliwy), a wyjątek w reconcile nie może zablokować kolejki (tor jest zwalniany przed jakąkolwiek logiką odpowiedzi). Całość pokryta testami jsdom: 38 scenariuszy (w tym dokładnie „wyprowadzony → Cofnij → Zarezerwuj” z gubioną odpowiedzią) + fuzz 20 przebiegów losowych akcji z losowo gubionymi/opóźnianymi odpowiedziami.

**Wygaszanie starych odpowiedzi**: każdy pies/zadanie ma licznik zapisów w drodze (`pendingKeys`). Odpowiedź serwera jest stosowana tylko wtedy, gdy dotyczy **ostatniej** operacji dla danego bytu — starsza odpowiedź (np. na „zarezerwuj”, gdy lokalnie już kliknięto „zwolnij”) jest ignorowana. Dzięki temu przy szybkich sekwencjach widok nigdy nie „przeskakuje” wstecz. Dopóki byt ma zapis w drodze, przy jego nazwie kręci się dyskretny wskaźnik „zapisuję…”; pełny stan z akcji prowadzącej również czeka z nadpisaniem, aż kolejka się opróżni.

## Godzina czyszczenia listy

Domyślnie 22:00 (`DEFAULT_RESET_HOUR` w `Config.gs`). Prowadząca zmienia ją bez ruszania kodu: **⚙️ + PIN → zakładka „Panel" → Ustawienia**. Wybór zapisuje się w Script Properties i od razu **przekłada wyzwalacz** `endOfDay` (`setResetHour()` w `Settings.gs`).

Dwie rzeczy warto wiedzieć:

- `atHour(h)` w Apps Script to **okno h:00–h:59**, nie punkt czasowy — Google sam wybiera moment w tej godzinie.
- Reset **przed 12:00** archiwizuje spacery pod datą **dnia poprzedniego** (`archiveDate_()` w `History.gs`). Bez tego reset o 3:00 czy 6:00 wrzucałby wieczorne spacery do Historii pod datą następnego dnia i pies wyglądałby na wyprowadzonego dzisiaj.

## Zakładka „Panel"

Trzecia zakładka obok „Dziś" i „Historii", widoczna **tylko w trybie edycji**. Zawiera ustawienia (godzina czyszczenia) oraz diagnostykę: stan wyzwalacza resetu, czas i strefę serwera, liczniki rekordów, a przede wszystkim **czasy przelotu ostatnich 30 wywołań**. To jedyny sposób, żeby na telefonie rozstrzygnąć, czy wisi Apps Script, czy przeglądarka.

Awaryjne wejście bez PIN-u: **5 tapnięć w datę** w nagłówku (pokazuje wtedy tylko log wywołań, bez danych serwera). Gest liczy `pointerdown`, nie `click` — na telefonie szybka seria tapnięć bywa zjadana przez rozpoznawanie gestów przeglądarki i licznik nigdy nie dochodził do pięciu.

## Notatki i dwa spacery

- **Notatka** (`notatka`): ustawiana w edycji psa, widoczna na kafelku (📌). Domyślnie znika przy najbliższym czyszczeniu — do jednorazowych zdarzeń typu „Zdjęcia o 12:00 w parku”.
- **Termin notatki** (`notatka_do`, opcjonalny): pole daty pod notatką. Puste = zachowanie jak dotąd. Ustawione = notatka przeżywa czyszczenia i znika dopiero po tym dniu — do rzeczy zaplanowanych z wyprzedzeniem („w środę wpisuję spacer zapoznawczy w niedzielę”). Na kafelku pojawia się wtedy odznaka „do niedzieli” / „do 20.08”. Data z przeszłości i data bez notatki są odrzucane po obu stronach (interfejs pokazuje komunikat, serwer normalizuje do pustej).
- **Dwa spacery dziennie** (`spacery` = 1/2): pierwszy odbyty spacer zapisuje się w `kto1`/`godzina1`, a pies wraca na „wolny” z odznaką `spacery 1/2` i informacją, kto odbył pierwszy; dopiero drugi spacer daje pełne „wyprowadzony” (`2/2`). Oba spacery trafiają osobno do Historii przy nocnym resecie. Pomyłkę cofa przycisk „Cofnij 1. spacer”. Liczba odbytych spacerów jest wyliczana z danych (kto1 + status), nie przechowywana — brak ryzyka rozjazdu.
- Tryb edycji nazywa się po prostu trybem edycji (wejście przez ⚙️ + PIN); footer odchudzony.

## Naprawione bugi (changelog)

**Termin ważności notatki:**
- Notatka znikała *zawsze* przy najbliższym czyszczeniu, więc rzeczy planowane z wyprzedzeniem („w niedzielę spacer zapoznawczy”, wpisane w środę) nie dożywały swojego dnia. Doszła opcjonalna kolumna `notatka_do`; `endOfDay()` czyści notatkę tylko wtedy, gdy termin jest pusty albo już minął. Brak daty = dokładnie stare zachowanie.

**Wydajność na telefonie:**
- **Pełny render przy każdym kliknięciu** — `viewEl.innerHTML` przebudowywało całą listę, więc jedno tapnięcie kosztowało przeparsowanie i ułożenie od nowa wszystkich kafelków. Teraz akcja na psie podmienia **tylko jego kafelek** (`patchDog()`) plus linijkę podsumowania.
- **Odświeżanie co 15 s przerysowywało listę, nawet gdy nic się nie zmieniło.** Render porównuje wygenerowany HTML z poprzednim i przy braku różnic **nie dotyka DOM w ogóle**. Ręczne zmiany DOM (otwarcie pola „Twoje imię") unieważniają cache przez `invalidateHtml()`.
- Podpowiadane imię przeniesione z szablonu do `openEntry()` — wpieczone w HTML nie docierałoby do kafelków, których patch nie ruszył.

**Kolejka równoległa (zgłoszenie: „rezerwuję parę psów pod rząd i po drugim się zawiesza"):**
- **Rezerwacje ustawiały się w szereg** — kolejka puszczała **jeden** zapis naraz w całej aplikacji. Każde wywołanie Apps Script to realnie 1–3 s, więc trzeci klik potrafił czekać ~10 s zanim w ogóle wyruszył, a jeden zapis, który utknął, wstrzymywał wszystkie następne (i blokował auto-odświeżanie na cały ten czas). Teraz kolejka ma **tory per byt**: ten sam pies nadal obsługiwany po kolei (zero wyścigów), różne psy równolegle. Pies z zaginioną odpowiedzią nie blokuje już pozostałych — czeka sam na swoim torze na ponowienie.
- **Imię pamiętane w sesji** — pole „Twoje imię" przy kolejnym psie jest podpowiedziane (i zaznaczone, więc łatwo nadpisać). Wzięcie trzech psów to teraz trzy tapnięcia zamiast trzykrotnego wpisywania imienia na telefonie.
- **Ukryta diagnostyka** — 5 tapnięć w datę u góry odsłania panel z czasami przelotu ostatnich 30 wywołań. Jedyny sposób, żeby na telefonie odróżnić „wisi serwer" od „wisi przeglądarka".
- Enter w polu tekstowym nie wywala się już, gdy przycisk zniknął między renderami.

**Refaktor wydajnościowy:**
- **Zawieszanie po pierwszej akcji** — `[fn].apply(google.script.run, args)` wywoływało funkcję na gołym `google.script.run` zamiast na obiekcie zwróconym przez `withSuccessHandler` (podmiana `this`), przez co callbacki ginęły, licznik trwających zapisów nigdy nie spadał i auto-odświeżanie blokowało się na stałe. Teraz wywołanie idzie wprost na skonfigurowanym runnerze: `runner[fn](...args)`, a watchdog dodatkowo gwarantuje brak wiecznego wisienia.
- **Wolne akcje** — każda mutacja odczytywała po zapisie pełne trzy zakładki. Teraz zwraca tylko zmieniony wiersz, a UI i tak reaguje natychmiast (optymistycznie).
- **Dwa otwarte pola „Twoje imię" naraz** — otwarcie pola przy jednym psie zamyka pozostałe.
- Odświeżenie w tle nie nadpisuje już stanu, gdy w kolejce czekają zapisy (koniec z „cofaniem się" widoku).

**Refaktor porządkowy:**

- **Godzina „Sat Dec 30 1899…"** — Arkusz parsował tekst `17:21` na wartość czasu (epoka 1899) i tak wracał do interfejsu. Kolumny dat/godzin mają teraz format tekstowy `@`, a odczyt defensywnie konwertuje ewentualne obiekty `Date` (`cellTime_`/`cellDate_`).
- **Pusta Historia** — `endOfDay()` uruchamia się wyłącznie z wyzwalacza czasowego, którego trzeba było klikać ręcznie. `installTriggers()` zakłada go programowo, z jawną strefą Warsaw, i czyści duplikaty.
- Zapis do arkusza jest teraz wymuszany (`flush`) **przed** zwolnieniem blokady — druga osoba nie zobaczy stanu sprzed zapisu.
- Rezerwacja przegrana w wyścigu (ktoś kliknął pierwszy) pokazuje toast zamiast cichej porażki.
- Auto-odświeżanie pauzuje, gdy karta jest w tle (mniej zużytego limitu Apps Script), i odpala się od razu po powrocie do karty.
- Formatowanie dat historii o `T12:00` — koniec z ryzykiem przeskoku daty o dzień przy nietypowej strefie telefonu.
- Limity długości pól także w HTML (`maxlength`), spójne z backendem.

# G13 Spacery

Zapisy na spacery psów dla wolontariuszy schroniska (Grupa G13). Jeden link w przeglądarce, bez kont i instalacji. Arkusz Google to ukryta baza danych.

## Struktura

| Plik | Rola |
|---|---|
| `appsscript.json` | manifest projektu — strefa czasowa Europe/Warsaw, ustawienia web appki |
| `Config.gs` | nazwy zakładek, układ kolumn, limity, okno Historii — jedyne miejsce edycji przy zmianach struktury |
| `Utils.gs` | wspólne pomocnicze (blokada zapisu, konwersje dat/godzin, walidacje) |
| `Settings.gs` | Script Properties: PIN i godzina czyszczenia listy + przekładanie wyzwalacza |
| `Setup.gs` | `setup()`, `migrate()`, `installTriggers()`, formaty tekstowe kolumn |
| `WebApp.gs` | `doGet()`, `include()`, API odczytu (`getData`, `getHistory`, `checkPin`) |
| `Dogs.gs` | psy: odczyt + akcje wolontariuszy i prowadzącej |
| `Tasks.gs` | zadania na dziś: odczyt + akcje |
| `History.gs` | historia + nocny reset `endOfDay()` |
| `Index.html` | szkielet strony (składa Styles + Script) |
| `Styles.html` | style |
| `Script.html` | logika interfejsu |
| `tests/` | harness jsdom (`scenarios`…`scenarios8`) + harness backendu na atrapie arkusza (`backend.js`) |

Zakładki arkusza (tworzy je `setup()`):
- **Psy** — `id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer | notatka | spacery | kto1 | godzina1 | notatka_do`
- **Historia** — `data | pies | kto | godzina`
- **Zadania** — `id | tresc | data | status`

Konwencja: funkcje z sufiksem `_` są prywatne (niewywoływalne z przeglądarki); pozostałe to publiczne API dla `google.script.run`.

## Testy

```bash
npm install
```

```bash
npm test
```

Wymaga Node (sprawdzone na 24 LTS). `jsdom` to jedyna zależność i służy wyłącznie harnessom —
kod aplikacji mieszka w Apps Script i o npm nie wie. Pojedynczy zestaw: `node tests/backend.js`.

Dwa harnessy. Frontendowy ładuje prawdziwe `Index`+`Styles`+`Script` w jsdom, klika jak człowiek i pozwala sterować tym, kiedy (i czy w ogóle) odpowie „serwer". Backendowy (`backend-harness.js`) uruchamia prawdziwe pliki `.gs` na atrapie arkusza z zamrożonym zegarem — dzięki temu logikę nocnego resetu da się sprawdzić o dowolnej porze i dacie, bez czekania do 22:00.

## Uruchomienie od zera

1. Wklej wszystkie pliki do projektu Apps Script przypiętego do arkusza (nazwy plików HTML muszą być dokładnie `Index`, `Styles`, `Script`).
2. Ustaw PIN: *Ustawienia projektu → Właściwości skryptu → dodaj właściwość `pin`* o własnej wartości.
   Bez niej tryb edycji jest zamknięty (patrz niżej — PIN celowo nie istnieje w kodzie).
3. Uruchom ręcznie **`setup()`** (zakładki + formaty + przykładowe psy).
4. Uruchom ręcznie **`installTriggers()`** — bez tego Historia będzie pusta, a lista nie wyzeruje się o 22:00.
5. Wdróż: *Aplikacja internetowa*, „wykonaj jako: ja", „dostęp: wszyscy".

## Wdrożenie jedną komendą (clasp)

Kopiowanie zawartości plików do edytora Apps Script zastępuje [clasp](https://github.com/google/clasp) —
oficjalne CLI Google. Do repozytorium należą `.claspignore` (lista plików, które w ogóle jadą
na serwer) i skrypty npm; token logowania siedzi w katalogu domowym i nigdy w repo.

**Konfiguracja, raz na maszynę:**

1. Włącz Apps Script API na swoim koncie: <https://script.google.com/home/usersettings>.
2. Zaloguj się (otworzy przeglądarkę): `npx clasp login`.
3. Weź identyfikator skryptu z edytora Apps Script (*Ustawienia projektu → Identyfikator skryptu*)
   i zapisz go w pliku `.clasp.json` w katalogu projektu:
   ```json
   { "scriptId": "TUTAJ_IDENTYFIKATOR_SKRYPTU", "rootDir": "." }
   ```
   > **Nie używaj `clasp clone`.** Clone ściąga pliki **z serwera** i nadpisuje lokalne —
   > skasowałby zmiany, których jeszcze nie wysłałeś. `.clasp.json` piszemy ręcznie,
   > a ruch idzie tylko w jedną stronę: lokalnie → Apps Script.

   `.clasp.json` jest celowo w `.gitignore` — wskazuje konkretny projekt na konkretnym
   koncie, więc każda maszyna zakłada go sobie sama tym jednym krokiem.
4. Sprawdź identyfikator wdrożenia (ten sam, który jest w linku do aplikacji): `npm run deployments`.

**Potem, przy każdej zmianie:**

```bash
npm run deploy -- AKfycb...TWOJE_ID_WDROZENIA -d "co się zmieniło"
```

To jedno polecenie: uruchamia **wszystkie testy**, wysyła pliki i podbija wersję *istniejącego*
wdrożenia — link do aplikacji zostaje ten sam. Czerwony test przerywa całość, więc zepsuty kod
nie ma jak wyjechać do wolontariuszy.

Pomocnicze: `npm run files` (co dokładnie poleci na serwer — warto zerknąć po dodaniu plików),
`npm run push` (sama wysyłka, bez nowej wersji — zmiany widać wtedy tylko w edytorze, **nie** na linku),
`npm run deployments` (lista wdrożeń z numerami wersji — po wdrożeniu numer przy Twoim ID musi wzrosnąć).

Czego clasp **nie** robi: nie uruchamia `setup()`, `migrate()` ani `installTriggers()`.
Te odpalasz nadal ręcznie z edytora, i tylko wtedy, gdy zmieniła się struktura arkusza
albo godzina resetu.

**Uwaga:** `clasp deploy` bez `-i`/`redeploy` tworzy **nowe** wdrożenie z **nowym adresem** —
stary link wolontariuszy przestałby dostawać zmiany. Dlatego `npm run deploy` używa `redeploy`
z konkretnym identyfikatorem.

### Windows / PowerShell

`node` to plik `.exe` i działa od razu, ale `npm` i `npx` w PowerShellu są shimami `.ps1` —
przy domyślnej polityce `Restricted` odbijają się o „running scripts is disabled on this system".
Dwa wyjścia:

- bez zmian w systemie: wołaj `npm.cmd` / `npx.cmd` (shim `.ps1` zostaje ominięty),
- na stałe: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` — skrypty utworzone lokalnie
  ruszają, ściągnięte z sieci nadal wymagają podpisu; bez uprawnień administratora.

Terminal otwarty przed instalacją Node nie zna jeszcze nowego `PATH` — wystarczy nowe okno.

## Migracja istniejącego arkusza

Masz arkusz z danymi ze starszej wersji? Zamiast `setup()` uruchom raz **`migrate()`** — dołoży brakujące kolumny/zakładki i formaty tekstowe, danych nie kasuje. Potem `installTriggers()`.

## Architektura zapisu (wydajność)

Interfejs jest **optymistyczny**: kliknięcie zmienia widok natychmiast, a zapis leci w tle. Klient trzyma **kolejkę zapisów z torami**: każdy pies i każde zadanie ma własny tor, na którym zapisy idą po kolei, ale **różne psy jadą równolegle** (sufit: 4 naraz). Dzięki temu rezerwacja trzech psów pod rząd to jeden przelot, a nie trzy ustawione w szereg. Watchdog **12 s**, więc zaginiona odpowiedź nigdy nie zawiesza aplikacji — wymusza tylko dosynchronizowanie. Akcje wolontariuszy zwracają z serwera **tylko zmieniony wiersz** (`{dog}` / `{ok}`), nie pełny stan trzech zakładek; pełny stan dojeżdża z okresowym odświeżaniem (15 s) i po akcjach prowadzącej. Konflikt rezerwacji (ktoś kliknął pierwszy) jest wykrywany po odpowiedzi serwera i pokazuje toast + faktyczny stan.

**Samoleczenie (odporność na zaginione odpowiedzi):** `google.script.run` na telefonie potrafi nigdy nie oddzwonić (uśpiona karta, mrugnięcie sieci). Warstwa niezawodności: watchdog **12 s** na każdy zapis; nieudany/zaginiony zapis idempotentny (rezerwacja, spacer, zwolnienie, odhaczenie, edycja, usunięcie) jest **raz automatycznie ponawiany**; wykrywanie zawieszenia działa nie tylko z timera (co 3 s), ale też przy **każdym dotknięciu ekranu** i powrocie do karty — bo przeglądarki mobilne usypiają timery w tle. Po definitywnej porażce stan jest przywracany ratunkowym `getData`. Dodatkowo: `render()` i obsługa kliknięć są opakowane w try/catch z samonaprawą (zamrożony interfejs jest niemożliwy), a wyjątek w reconcile nie może zablokować kolejki (tor jest zwalniany przed jakąkolwiek logiką odpowiedzi). Całość pokryta testami jsdom: 38 scenariuszy (w tym dokładnie „wyprowadzony → Cofnij → Zarezerwuj” z gubioną odpowiedzią) + fuzz 20 przebiegów losowych akcji z losowo gubionymi/opóźnianymi odpowiedziami.

**Wygaszanie starych odpowiedzi**: każdy pies/zadanie ma licznik zapisów w drodze (`pendingKeys`). Odpowiedź serwera jest stosowana tylko wtedy, gdy dotyczy **ostatniej** operacji dla danego bytu — starsza odpowiedź (np. na „zarezerwuj”, gdy lokalnie już kliknięto „zwolnij”) jest ignorowana. Dzięki temu przy szybkich sekwencjach widok nigdy nie „przeskakuje” wstecz. Dopóki byt ma zapis w drodze, przy jego nazwie kręci się dyskretny wskaźnik „zapisuję…”; pełny stan z akcji prowadzącej również czeka z nadpisaniem, aż kolejka się opróżni.

## PIN trybu edycji

PIN **nie istnieje w kodzie**. Mieszka we właściwości skryptu `pin` — tam, gdzie godzina
czyszczenia (*Apps Script → Ustawienia projektu → Właściwości skryptu*). Zmiana nie wymaga
wdrożenia i nie zostawia śladu w repozytorium.

Nie ma wartości domyślnej i nie będzie: PIN wpisany do pliku trafia do historii gita przy
pierwszym commicie i przestaje być tajemnicą — usunięcie go późniejszym commitem niczego
nie cofa, bo stara wersja pliku zostaje w historii. Dopóki właściwość nie jest ustawiona,
`checkPin` zwraca `false`, akcje edycyjne rzucają błędem, a `setup()` wypisuje o tym
komunikat w logu. Wolontariusze nie odczuwają tego wcale — ich część aplikacji nie używa PIN-u.

Warto wiedzieć: `checkPin` to publiczny endpoint bez limitu prób, więc czterocyfrowy PIN
broni się głównie tym, że nikt nie zna adresu aplikacji. Dłuższa wartość kosztuje tyle samo.

## Historia — ostatnie 14 dni

Zakładka „Historia" dostaje z serwera **ostatnie `HISTORY_DAYS` dni** (domyślnie 14,
`Config.gs`). Arkusz trzyma komplet i nic z niego nie znika — to tylko granica tego,
co ma sens ładować na telefon: przy trzydziestu psach Historia rośnie o kilkanaście
tysięcy wierszy rocznie, a wcześniej całość szła do przeglądarki przy każdym wejściu
w zakładkę.

Serwer czyta najpierw samą kolumnę dat, idzie od dołu i liczy **różne dni** — dopiero
wyliczony kawałek pobiera w pełnej szerokości. Dni, a nie stała liczba wierszy, bo liczba
spacerów dziennie zależy od wielkości grupy: „ostatnie 400 wierszy" raz znaczyłoby miesiąc,
a raz trzy dni. Na dole listy widnieje informacja o zakresie, żeby starsze dni nie wyglądały
na skasowane. Licznik wpisów w Panelu pokazuje **komplet** z arkusza, nie widoczny wycinek.

## Godzina czyszczenia listy

Domyślnie 22:00 (`DEFAULT_RESET_HOUR` w `Config.gs`). Prowadząca zmienia ją bez ruszania kodu: **⚙️ + PIN → zakładka „Panel" → Ustawienia**. Wybór zapisuje się w Script Properties i od razu **przekłada wyzwalacz** `endOfDay` (`setResetHour()` w `Settings.gs`).

Dwie rzeczy warto wiedzieć:

- `atHour(h)` w Apps Script to **okno h:00–h:59**, nie punkt czasowy — Google sam wybiera moment w tej godzinie.
- Reset **przed 12:00** archiwizuje spacery pod datą **dnia poprzedniego** (`archiveDate_()` w `History.gs`). Bez tego reset o 3:00 czy 6:00 wrzucałby wieczorne spacery do Historii pod datą następnego dnia i pies wyglądałby na wyprowadzonego dzisiaj.

## Zakładka „Panel"

Trzecia zakładka obok „Dziś" i „Historii", widoczna **tylko w trybie edycji**. Zawiera ustawienia (godzina czyszczenia) oraz diagnostykę: stan wyzwalacza resetu, czas i strefę serwera, liczniki rekordów, a przede wszystkim **czasy przelotu ostatnich 30 wywołań**. To jedyny sposób, żeby na telefonie rozstrzygnąć, czy wisi Apps Script, czy przeglądarka.

Awaryjne wejście bez PIN-u: **5 tapnięć w datę** w nagłówku (pokazuje wtedy tylko log wywołań, bez danych serwera). Gest liczy `pointerdown`, nie `click` — na telefonie szybka seria tapnięć bywa zjadana przez rozpoznawanie gestów przeglądarki i licznik nigdy nie dochodził do pięciu.

## Kolejność psów na liście

Wolne na górze, zarezerwowane pod nimi, wyprowadzone na dole — w obrębie grupy zostaje
kolejność z arkusza.

Cała trudność jest w tym, **kiedy** przestawiać. Gdyby lista układała się w chwili kliknięcia,
pies uciekałby spod palca w środku akcji, a wolontariusz stoi wtedy z psem na smyczy i nie ma
jak dojść, co się właśnie stało. Dlatego kolejność jest zamrożona, dopóki cokolwiek się dzieje:
trwa zapis, otwarte jest pole z imieniem albo ekran był dotykany w ciągu ostatnich 4 sekund.
Kliknięty kafelek zmienia się **w miejscu**, a lista układa się dopiero wtedy, gdy ręce
znieruchomieją. Seria pięciu rezerwacji pod rząd idzie więc bez ani jednego skoku — łącznie
z odświeżeniem w tle, które trafi akurat w środek serii.

## Dwa spacery dla wszystkich jednym kliknięciem

Przy upałach schronisko dopuszcza drugi spacer, a decyzja bywa z godziny na godzinę —
przeklikiwanie trzydziestu psów z osobna odpada. W **Panelu** (tryb edycji) są dwa przyciski:
*Wszystkie po 2 spacery* i *Wszystkie po 1 spacerze*.

Przełącznik nie ogranicza się do przestawienia kolumny, bo w środku dnia część psów ma już
coś odbyte:

- **włączamy dwa spacery** — pies dziś wyprowadzony staje się psem po *pierwszym z dwóch*:
  wraca na listę wolnych, a odbyty spacer ląduje w `kto1`/`godzina1`, dokładnie tak, jak
  zapisałoby to zwykłe odhaczenie;
- **wracamy do jednego** — pies wolny po pierwszym z dwóch ma swoje z głowy, więc staje się
  wyprowadzony tym właśnie spacerem.

Nietykalne zostają dwie grupy: psy właśnie prowadzone (zmiana statusu pod ręką wolontariusza
byłaby wrogim gestem) oraz psy z obydwoma spacerami odbytymi — skasowanie `kto1` zabrałoby
Historii jeden ze spacerów. Wywołanie dwa razy z tą samą wartością nie zmienia niczego drugi
raz, więc zapis może być bezpiecznie ponawiany po zaginionej odpowiedzi.

## Notatki i dwa spacery

- **Notatka** (`notatka`): ustawiana w edycji psa, widoczna na kafelku (📌). Domyślnie znika przy najbliższym czyszczeniu — do jednorazowych zdarzeń typu „Zdjęcia o 12:00 w parku”.
- **Termin notatki** (`notatka_do`, opcjonalny): pole daty pod notatką. Puste = zachowanie jak dotąd. Ustawione = notatka przeżywa czyszczenia i znika dopiero po tym dniu — do rzeczy zaplanowanych z wyprzedzeniem („w środę wpisuję spacer zapoznawczy w niedzielę”). Na kafelku pojawia się wtedy odznaka „do niedzieli” / „do 20.08”. Data z przeszłości i data bez notatki są odrzucane po obu stronach (interfejs pokazuje komunikat, serwer normalizuje do pustej).
- **Dwa spacery dziennie** (`spacery` = 1/2): pierwszy odbyty spacer zapisuje się w `kto1`/`godzina1`, a pies wraca na „wolny” z odznaką `spacery 1/2` i informacją, kto odbył pierwszy; dopiero drugi spacer daje pełne „wyprowadzony” (`2/2`). Oba spacery trafiają osobno do Historii przy nocnym resecie. Pomyłkę cofa przycisk „Cofnij 1. spacer”. Liczba odbytych spacerów jest wyliczana z danych (kto1 + status), nie przechowywana — brak ryzyka rozjazdu.
- Tryb edycji nazywa się po prostu trybem edycji (wejście przez ⚙️ + PIN); footer odchudzony.

## Naprawione bugi (changelog)

**Pierwszy feedback z terenu:**
- **Godzina spaceru zniknęła z kafelka** psa wyprowadzonego. Nie niosła nic, czego
  wolontariusz potrzebuje na liście, a zagęszczała kafelek. W Historii, gdzie ma sens,
  zostaje.
- **Psy układają się według stanu** — wolne, zarezerwowane, wyprowadzone — ale nigdy
  w chwili kliknięcia (patrz wyżej: kolejność zamrożona na czas akcji).
- **Dwa spacery dla całej listy jednym kliknięciem** zamiast trzydziestu wejść w edycję psa.

**PIN w kodzie i Historia bez granicy:**
- **PIN leżał jako stała w `Config.gs`**, czyli w repozytorium na GitHubie — kto zaglądał
  do kodu, miał tryb edycji. Teraz jest właściwością skryptu, bez wartości domyślnej.
  Samo przeniesienie nie wystarczy: stara wartość zostaje w historii gita, więc liczy się
  ustawienie **nowej**.
- **Historia szła do przeglądarki w całości** przy każdym wejściu w zakładkę — rosnąca
  bez końca lista, którą telefon musiał pobrać i przerobić. Teraz jedzie ostatnie 14 dni,
  a serwer czyta tylko odpowiedni kawałek arkusza zamiast wszystkiego.

**Ponawiany zapis psuł pierwszy z dwóch spacerów:**
- Wolontariusz odhaczał 1. spacer psa 2-spacerowego, zapis dochodził do arkusza, ale odpowiedź
  ginęła po drodze (telefon w kieszeni, mrugnięcie sieci — scenariusz, pod który powstało całe
  samoleczenie). Watchdog ponawiał wtedy `markWalked`, a serwer widział już wypełnione `kto1`
  i szedł gałęzią „drugi spacer": pies robił się **wyprowadzony 2/2 po jednym spacerze**,
  z pustym „kto", a do Historii wpadał wpis bez osoby. Drugiego spaceru nikt już nie brał.
  Klient przekazuje teraz numer spaceru (`slot`), a serwer na powtórzonym wywołaniu oddaje
  stan i niczego nie zapisuje — `markWalked` jest idempotentne w obie strony.
- Bug siedział na styku warstw: harness frontendu odpowiada atrapą serwera, harness backendu
  nie zna kolejki ponowień, więc żaden osobno nie mógł go zobaczyć. Doszły testy po obu
  stronach (S39 oraz B7–B8), sprawdzone na starym kodzie — na nim są czerwone.

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

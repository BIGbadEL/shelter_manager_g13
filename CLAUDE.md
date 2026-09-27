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
| `Dogs.gs` | katalog psów + spacery (zakładka Spacery, przepisanie starego układu, jednorazowy import) + akcje na spacerach + kolory wolontariuszy |
| `Tasks.gs` | zadania |
| `History.gs` | minione dni do podglądu + `endOfDay()` (domyka dni sprzed bieżącego) |
| `Index.html` / `Styles.html` / `Script.html` | frontend, składany przez `<?!= include(...) ?>` |
| `tests/` | dwa harnessy + scenariusze (patrz niżej) |
| `scripts/warmup.js` | otwiera aplikację zaraz po `npm run deploy:*` (nie jedzie do Apps Script) |
| `SORTING.md` | **model spacerów, kafelków i kolejności listy** — czytaj przed każdą zmianą sortowania |

**Nazwy plików HTML w Apps Script muszą brzmieć dokładnie `Index`, `Styles`, `Script`** —
`include()` odwołuje się do nich po nazwie.

## Arkusz

- **Psy** — KATALOG, kim jest pies: `id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer | notatka | spacery | kto1 | godzina1 | notatka_do`.
  **`status`, `kto`, `godzina`, `kto1`, `godzina1` są martwe** od wprowadzenia dat — czyta je
  tylko jednorazowy `importDayState_()`. Nie pisz do nich i nie czytaj z nich stanu dnia.
  Zostają, bo cofnięcie wdrożenia do starej wersji znów by ich użyło.
- **Spacery** — stan KONKRETNEGO SPACERU psa danego dnia: `data | pies_id | spacer | status | kto | godzina | grupa`.
  Wiersz na trójkę (dzień, pies, numer spaceru), brak wiersza = spacer wolny i bez grupy.
  Pies na dwa spacery ma spacery 1 i 2 — każdy z własną rezerwacją, stanem i grupą. Tylko dni
  otwarte (bieżący + przyszłe, ewentualnie niezamknięte) — `endOfDay()` przenosi zamknięte do
  Historii (odbyty spacer = wpis), grupy znikają razem z nimi. Zakładka w starym układzie
  (wiersz na psa, drugi spacer w `kto1/godzina1`) przepisuje się sama przy pierwszym dostępie
  (`ensureWalksLayout_` → `migrateWalksLayout_`, raz — właściwość `walksLayout`), z formatem
  `@` na nowej kolumnie godziny PRZED zapisem (bug nr 3). Model opisuje `SORTING.md`.
  **Przepisanie jest w jedną stronę** — poprzednia wersja kodu czyta nowy układ jako śmieci
  (review PR #2: rezerwacje znikały, godzina w polu „kto"). Dlatego przed przepisaniem powstaje
  kopia `Spacery (stary układ)` (`backupWalksSheet_`; nieudana kopia nie blokuje aplikacji),
  a znacznik `walksLayout` to `2:<id zakładki>`: przywrócona po cofnięciu kopia ma inne id i przy
  ponownym wdrożeniu przepisze się od nowa (B45). Procedura cofnięcia: README.
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
- Akcje wolontariuszy zwracają **tylko zmieniony spacer** (`{slot, dog, volunteers}` — `dog`
  to stary kształt dla kart sprzed spacerów), nie pełny stan trzech zakładek. Akcje edycyjne
  mogą zwracać pełny stan.
- **`getData()`**: `dogs` (katalog + stan bieżącego dnia w starym kształcie `status/kto/kto1` —
  dla starych kart), `slots` (spacery dni otwartych), `volunteers` (kolory dnia). Starego pola
  `walks` już nie ma — karta z wersji z datami, ale sprzed spacerów, wraca wtedy do `dogs`.
  **`setGroup` niesie `walks` nadal** (`legacyWalks_`): applyGroups tamtej karty czyta tylko je
  i bez niego zerował u siebie grupy dnia do najbliższego odświeżenia (review PR #2, B47).
- Akcje edycyjne wymagają PIN-u przez `requirePin_(pin)`.
- **PIN nie istnieje w kodzie.** Siedzi we właściwości skryptu `pin` (`pin_()` w `Settings.gs`),
  bez wartości domyślnej: nieustawiony = tryb edycji zamknięty. Nigdy nie wpisuj PIN-u
  do pliku „na chwilę" — pierwszy commit czyni go publicznym na zawsze, a `git rm`
  tego nie cofa. Testy tego pilnują (B9 skanuje źródła).
- **Minione dni jadą do przeglądarki blokami** (`getHistoryDays`, po dwa tygodnie), nigdy
  w całości. Arkusz trzyma komplet. Liczniki w panelu mają pokazywać komplet (`histCount_()`).
- **Każda akcja dotyczy JEDNEGO SPACERU i niesie datę oraz numer spaceru** (ostatnie argumenty:
  `reserve(id, name, date, slot)`, `markWalked(id, name, slot, date)`, `setFree(id, date, seen, slot)`;
  `undoFirstWalk(id, date)` zostaje dla starych kart). Brak daty = bieżący dzień, brak numeru =
  „bieżący" spacer w sensie starych kart (rezerwacja: pierwszy wolny; spacer: pierwszy nieodbyty;
  zwolnienie: najdalszy zajęty), a `markWalked(…, 2)` u psa na jeden spacer to spacer 1 — tak
  wołają karty sprzed spacerów i mają działać (B44). Serwer (`actionDate_`) odrzuca dzień miniony,
  datę nieistniejącą (`isDate_` sprawdza kalendarz) i dalszą niż `MAX_DAYS_AHEAD`; numer spoza
  zakresu też. Spacer (i jego cofnięcie) tylko w bieżącym dniu.
- **`setFree` dostaje `seen` = {status, who}** — stan spaceru z ekranu w chwili kliknięcia — i
  zwalnia tylko ten stan. Jest w `RETRIABLE`, a bez `seen` powtórka po zaginionej odpowiedzi
  zwalniała rezerwację, którą ktoś zrobił w międzyczasie (bug nr 11). Brak `seen` = stara karta.
- **Grupa (spacer grupowy) jest na dzień, a jej członkiem jest SPACER** (`'pies:spacer'`, np.
  `'7:2'`): `setGroup(date, ids, gid, seen)` — `gid` 0 = nowa (kolejny numer dnia, od numeru
  zależy kolor), >0 = zmiana składu; mniej niż 2 spacery = rozwiązanie. Sam numer psa (stare
  karty) = jego pierwszy nieodbyty spacer. Jeden pies jest w grupie najwyżej jednym spacerem
  (to jedno wyjście). Numer grupy to zawsze dodatnia liczba całkowita (`posInt_` / `posInt`).
  `seen` = skład widziany przy otwarciu zaznaczania: zdejmujemy tylko spośród niego, a gdy pod
  `gid` stoi już inna grupa (numery wracają do obiegu), zmiana idzie jako nowa grupa (B36).
  Spacer przeniesiony z innej grupy znika z tamtej; grupa z jednym spacerem przestaje istnieć
  (także po `removeDog` i po zmniejszeniu liczby spacerów — `trimSlots_`, jeden odczyt zakładki,
  B48); spacer odbyty nie
  dołącza do nowej. **Nie jest w `RETRIABLE`** — nowa grupa bierze kolejny numer. Wspólny spacer
  to NIE osobny endpoint: klient woła zwykłe `markWalked` dla każdego zarezerwowanego spaceru.
  **Grupa to JEDEN wspólny spacer.** U psa dwuspacerowego 1/2 może iść rano z jedną grupą,
  a 2/2 po południu z inną — dawny wyjątek „po pierwszym spacerze pies wychodzi z grupy"
  zniknął razem z modelem „wiersz na psa". „Cofnij" wyprowadza spacer z grupy (`leaveGroup_`),
  **„Zwolnij" zostawia go w grupie** (decyzja właściciela; B30, S79).
  Akcje widzą cały dzień (`walkDay_` w `slotAction_`) i zostają idempotentne.
- **Kolor wolontariusza** przydziela serwer na dzień (`noteVolunteer_`, właściwość `vol:<data>`,
  JSON imię→numer): kolejna osoba dostaje pierwszy wolny kolor od koloru „z imienia", bez
  powtórek do `VOLUNTEER_COLORS` (10) osób, stały do końca dnia, ten sam na każdym telefonie.
  `endOfDay` zapomina dni zamknięte. Imię normalizowane (`volNorm_`: wielkość liter, ogonki).
  Przeglądarka liczy przydział tą samą funkcją od razu po rezerwacji (`volAssign`).
  **Kolor to kosmetyka na ścieżce rezerwacji i spaceru — żaden jego błąd nie może zatrzymać
  zapisu** (review PR #2): `noteVolunteer_` łapie wszystko, `volunteersOf_` przy awarii daje
  `null` i odpowiedź idzie bez `volunteers`. Sufity (`VOLUNTEER_MAX` osób na dzień — też
  `VOL_MAX` w Script.html, `VOLUNTEER_DAYS` dni naraz), bo właściwości mają limit 9 KB na
  wartość i 500 KB razem, a imiona z przydziału nie znikają do końca dnia — publiczne API
  pozwalało zapchać właściwości, a wtedy nie zapisałby się nawet znacznik układu Spacery (B46).
- **Zadanie ma dzień, od którego się pokazuje** (kolumna `data`): `addTask(text, pin, date)`,
  brak daty = bieżący dzień rezerwacyjny (nie kalendarzowy — zadanie dodane po resecie nie może
  być od razu „od wczoraj"). Na liście bieżącego dnia: zadania z dniem ≤ bieżący; na przyszłym:
  tylko zaplanowane dokładnie na niego, bez odhaczania; `setTaskDone` odrzuca zadanie z przyszłości.
- **Notatka „nigdy"** — `notatka_do = NOTE_FOREVER` (`'nigdy'`, ta sama stała w `Config.gs`
  i `Script.html`): nie znika przy żadnym czyszczeniu. Uwaga: jako napis „nigdy" sortuje się
  po każdej dacie, więc nawet bez jawnego warunku zachowanie byłoby to samo — jawny warunek
  zostaje dla czytelności, testy tego odróżnić nie mogą.
- **Notatka „bez terminu" ma w arkuszu termin = bieżący dzień rezerwacyjny** (`noteUntil_`).
  Pusty termin znikał przy KAŻDYM `endOfDay` — także tym o 20:30, zaraz po dodaniu notatki
  na jutrzejszą listę (B35). Klient pokazuje taki termin jak brak terminu (`noteDated`: bez
  odznaki, puste pole w edycji). Pusty `notatka_do` zostaje tylko w starych notatkach.
- **Godzina czyszczenia nie może cofnąć dnia rezerwacyjnego** — `setResetHour` odrzuca zmianę,
  po której `businessDate_()` byłby wcześniejszy (otwierałby dzień już zamknięty, B38).
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

- **Stan: katalog + spacery.** `state.dogs` to katalog (kim jest pies), `state.slots` to stan
  spacerów pod kluczem `${data}|${id}|${nr}` (`slotOf`, `slotsOf`, `slotCount`),
  `state.volunteers` — kolory dnia. `state.date` = dzień na ekranie, `state.bizDate` = bieżący
  dzień rezerwacyjny, `state.follow` = czy ekran idzie za bieżącym (po resecie przeskakuje sam —
  ale **nie** w chwili, gdy ktoś pisze imię: `busyEditing()`).
  Starsze kształty danych (`walks` na psa, albo sam stan w `dogs`) i odpowiedzi `{dog}` zamienia
  na spacery `legacySlots` (ta sama reguła co `legacySlots_` na serwerze) — na tym trzymają się
  starsze testy.
- **Lista dnia = kafelki ze spacerów** (`buildTiles` → `renderTile`): kafelek główny psa ze
  spacerami bez grupy (pies dwuspacerowy — pola 1/2 i 2/2, każde z własnymi przyciskami)
  i odłączony kafelek dla każdego spaceru w grupie. Pies może stać w dwóch miejscach naraz.
  Każdy przycisk niesie `data-id` i `data-slot`; pole imienia to `[data-entry=pies][data-slot=nr]`,
  a wyszukiwanie zawsze w obrębie klikniętego kafelka (ten sam pies bywa na liście dwa razy).
  **Całość — model, klucz sortowania, bloki grup, przykłady — opisuje `SORTING.md`.**
- **Tryb edycji to katalog, nie dzień** (`renderCatalog`): bez paska dat, bez rezerwacji
  i spacerów, psy w kolejności z arkusza, ustawienie „2 spacery dziennie" zamiast postępu,
  zadania wszystkie z dniem + formularz z datą. Lista dnia (`renderTile`) nie ma przycisków
  edycji. Wolontariusze nigdy nie widzą katalogu, prowadząca w edycji nigdy nie widzi dnia.
- **`busyEditing()` łapie wyłącznie pole wolontariusza `[data-entry]`**, fokus w polu, edycję
  psa i zaznaczanie grupy (`state.select`). Nigdy nie wracaj do ogólnego `.entry` — patrz bug nr 10.
- **Spacery grupowe.** Przytrzymanie kafelka (`LONG_PRESS_MS` = 550 ms od `pointerdown`,
  przesunięcie > 10 px albo puszczenie przerywa) włącza `state.select`; w tym trybie każde
  kliknięcie w liście tylko zaznacza (`togglePick`) — żadnej rezerwacji z puszczenia palca.
  Zaznacza się **spacer**, nie psa (`refFromTarget`): pole 1/2 / 2/2 pod palcem, a poza polem
  pierwszy nieodbyty spacer kafelka. Kafelek z jednym spacerem ma jedno kółko, kafelek główny
  z polami — kółko przy każdym polu (`pickSlotBits`). Stuknięcie 2/2 psa z zaznaczonym 1/2
  przenosi zaznaczenie (pies w grupie jednym spacerem, S92).
  **Kafelek w tym trybie to ten sam `renderTile`** (`pickBits`: klasa + kółko `position:absolute`,
  przyciski bledną, ale zostają). Osobny, krótszy kafelek skracał listę w chwili
  przytrzymania i pies uciekał spod palca z ekranu (S78). Jeśli przytrzymany pies wypada pod
  pasek na dole, `keepAboveBar` przesuwa listę dokładnie o tyle (S81).
  Przytrzymanie spaceru z grupy otwiera jej skład do zmiany / „Rozwiąż". Kolor grupy wynika
  z numeru (`GROUP_COLORS`), obok tła jest znacznik „👥 grupa" — w słońcu samo tło znika. Grupa
  trzyma się razem na liście jako blok (SORTING.md); po zatwierdzeniu lista układa się od razu
  (to cel akcji). **„Wyprowadzony ✓" w grupie jest aktywny, gdy żaden spacer z grupy nie jest
  WOLNY** i odhacza wszystkie zarezerwowane. Nie „wszystkie zarezerwowane" — w grupie bywa
  spacer już odbyty (dołożony do składu po wyjściu, stan z innego telefonu), a „Zwolnij" z grupy
  nie wyprowadza: dosłowna reguła zablokowałaby resztę bez wyjścia (S82). Cofnięcie cofa jeden
  spacer i wyprowadza go z grupy.
  `patchDog` psa przerysowuje wszystkie jego kafelki i kafelki towarzyszy z jego grup — od ich
  stanu zależy przycisk; po `leaveGroup` przerysowujemy dodatkowo dawnych towarzyszy.
  **Odpowiedź akcji nie nadpisuje grupy** (`applySlot`): skład zmieniają też akcje na INNYCH
  spacerach, a odpowiedź policzona przed nimi przywróciłaby rozwiązaną grupę. Grupy przychodzą
  z `setGroup` i `getData`; skutki własnych akcji klient liczy sam, tak jak serwer.
  Ta sama zasada dla odpowiedzi `setGroup`: każda lokalna zmiana grupy spaceru dostaje numer
  (`touchGroup`), a `applyGroups(date, res, since)` pomija spacery zmienione po wysłaniu tej
  odpowiedzi i rozwiązuje grupy, w których przez to został jeden spacer (S87).
- **Kolor wolontariusza** (`volChip`, `volColor`): kapsułka z konturem i kropką w kolorze osoby
  przy jej imieniu — imię zostaje tekstem. Paleta `VOL_COLORS` celowo z innej rodziny niż grupy
  (grupa = blade tło kafelka, wolontariusz = nasycony kontur) i bez zieleni/żółci/czerwieni
  trudności; jej długość = `VOLUNTEER_COLORS` w `Config.gs` (S95 pilnuje obu).
- **Akcja pamięta swój dzień.** `doReserve` & spółka biorą datę w chwili kliknięcia,
  wysyłają ją i zapisują odpowiedź pod NIĄ, nie pod `state.date` — wolontariusz mógł
  w międzyczasie przejść strzałką gdzie indziej (S56). Klik na dniu, który zamknął się pod
  palcami, dostaje `dayClosed()`: komunikat + przejście na bieżący dzień, nigdy ciszę (S58).
- **Kolejka zapisów z torami.** Tor = byt (`dog:1.2@2026-09-24` — spacer 2/2 psa 1 tego dnia,
  `task:3`, `_full`). Ten sam spacer obsługiwany po kolei, różne spacery i różne dni równolegle,
  sufit 4 naraz. Zapis, który utknął, blokuje wyłącznie swój tor. Akcja najpierw wkłada zapis
  do kolejki, potem przerysowuje kafelek — dzięki temu kafelek od razu ma kręciołek „zapisuję".
- **Dymek „Zapisuję…" / „Aktualizuję…"** (`updateBusy`, `#busy`): ciemny, u góry ekranu,
  kropki animuje CSS. „Zapisuję…" dopóki coś leci na serwer, „Aktualizuję…" tylko w oknie
  zapowiedzi (`reorderDueAt` > 0), nie przez całą ciszę przed nią — przy ciągłej pracy świeciłby
  bez przerwy (review PR #2, S99); `markTap` go gasi. Znika najwcześniej po `T.busyMin`.
  Zastąpił niewidoczny napis w nagłówku.
- **Osłona stuknięć** (`tapRefused`, bug nr 13): stuknięcie w akcję na spacerze nie liczy się,
  gdy lista przesunęła się albo kafelek zmienił pod palcem (w oknie `T.tapGuard` przed
  przyłożeniem palca albo między przyłożeniem a kliknięciem) — z komunikatem, a przy własnym
  podwójnym stuknięciu po cichu. Tylko prawdziwe stuknięcia (`e.detail > 0`). Zmiany kafelków
  i układu notują `noteTile`/`noteLayout` z przyczyną — dlatego `render(cause)` i
  `patchDog(id, cause)` ją dostają: `'self'` = własne stuknięcie w akcję na kafelku (cisza
  tylko dla tego kafelka), `'nav'` = własna nawigacja (strzałka, zakładki, zaznaczanie,
  „Grupa", „Anuluj" — osłona pomija), `'data'`/`'reorder'` = z zewnątrz i z zegara (komunikat).
  **Nowe `render` z własnej nawigacji → `'nav'`, nie `'self'`** — jako `'self'` osłona zjadała
  po cichu stuknięcie zaraz po strzałce (review PR #2, S98). Tabela: SORTING.md §8.
- **`pendingKeys`** liczy zapisy w drodze per byt. Odpowiedź serwera stosujemy tylko
  wtedy, gdy dotyczy **ostatniej** operacji dla tego bytu — inaczej szybkie sekwencje
  (rezerwuj → zwolnij) cofałyby się same.
- **Samoleczenie.** Watchdog 12 s, jedno automatyczne ponowienie dla operacji
  idempotentnych (`RETRIABLE`), `checkStuck()` co 3 s **oraz** przy każdym
  `pointerdown`/`touchstart` i powrocie do karty. `render()` i `handleAction()`
  w `try/catch` z samonaprawą. Tor zwalniany **przed** jakąkolwiek logiką odpowiedzi.
  Ratunkowe odświeżenie z `catch` w `render()` najwyżej raz na `RESCUE_GAP_MS` (15 s) —
  błąd powtarzalny przy każdym rysowaniu robił pętlę `getData` z każdego telefonu (bug nr 12).
- **Minione dni dociąga `renderPastDay`**, gdy ich nie ma w pamięci (`fetchPast` sama pilnuje
  dublowania) — po przełomie dnia `applyData` czyści pamięć, a ekran wisiał na „Wczytuję…" (S84).
- **Kolejność kafelków — `tileKey`, opis i przykłady w `SORTING.md`.** W skrócie: czekające
  na chętnego → obsadzone → odbyte; w każdej części najpierw psy dwuspacerowe, potem mniejszy
  dorobek dnia, potem arkusz. Grupa to blok w miejscu swojego najpilniejszego spaceru.
  **KIEDY** (`decideOrder`): kolejność (lista spacerów `'pies.nr'`) zmienia się wyłącznie, gdy
  nikt nie jest w trakcie (`canReorder()`: zero zapisów w drodze, nic otwartego do edycji,
  `T.quiet` = 4 s ciszy po ostatnim dotknięciu), i nie z zaskoczenia: najpierw dymek
  „Aktualizuję…" przez `T.announce`, potem ruch; dotknięcie odwołuje zapowiedź (`markTap`).
  Klik zmienia kafelek **w miejscu** (`patchDog`). W zamrożonej liście blok staje w miejscu
  swojego pierwszego spaceru (`layoutDay`) — spacer wychodzący z grupy nie skacze na koniec (S91).
  **Wyjątek: zmiana dnia** strzałką i zatwierdzenie grupy to nowa lista — od razu (`orderDate`, S60).
- **Oszczędne renderowanie.** Akcja na spacerze podmienia tylko kafelki psa (`patchDog()`)
  plus linijkę podsumowania (liczoną w spacerach). Gdy zmienił się sam układ (spacer wszedł do
  grupy albo z niej wyszedł), pełny render. Pełny render porównuje HTML z poprzednim i przy braku
  różnic nie dotyka DOM. Ręczna zmiana DOM (otwarcie pola „Twoje imię") unieważnia
  cache przez `invalidateHtml()`. **`patchDog` przenosi otwarte pole imienia przez
  przerysowanie** (`takeEntry`/`putEntry`: wartość, fokus, kursor) — idzie także wtedy, gdy ktoś
  pisze (konflikt rezerwacji), a przy dwóch polach na psa i kafelkach towarzyszy z grupy
  przerysowany kafelek to często nie ten, o który chodziło w odpowiedzi (review PR #2, S100).
  Pole wraca tylko, gdy jego spacer wciąż jest wolny.
  **`withSlotMemo`**: na czas jednego rysowania (`render`, `patchDog`) liczba spacerów psa
  danego dnia i jego ostatni spacer są liczone jednym przeglądem `state.slots`. Wcześniej
  `slotCount`/`lastWalkOf` przeglądały wszystkie spacery wszystkich dni przy każdym wywołaniu:
  z rezerwacjami na rok naprzód pełne rysowanie rosło w jsdom z ~22 do ~366 ms (S101 pilnuje
  i czasu, i tego, że HTML z indeksem = HTML liczony wprost). Poza rysowaniem — liczenie wprost,
  bo akcje zmieniają stan. **Nie zmieniaj `state.slots` w trakcie rysowania.**

## Testy — obowiązkowe przy każdej zmianie

```bash
npm test
```

Wymaga Node (sprawdzone na 24 LTS) i `npm install` w katalogu projektu — `jsdom` to jedyna
zależność, wyłącznie na potrzeby harnessów. Sam kod aplikacji nadal mieszka w Apps Script
i nic o npm nie wie. Pojedynczy zestaw: `node tests/scenarios3.js`.

Aktualnie **921 asercji, wszystkie zielone**. Nowa funkcja bez testu nie jest skończona.

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

Zestawy `scenarios12.js`–`scenarios14.js` są **asynchroniczne**: przytrzymanie kafelka mierzy
prawdziwy zegar (czeka ~650 ms), dokładnie jak na telefonie, a `scenarios14` czeka też na
ciszę, zapowiedź i osłonę stuknięć — ze skróconymi czasami (`buildApp({timing:{…}})`).

- `tests/harness.js` — ładuje prawdziwe `Index`+`Styles`+`Script` w jsdom, klika jak
  człowiek, pozwala sterować tym **kiedy i czy w ogóle** odpowie „serwer"
  (`respondNext`, `failNext`, gubienie odpowiedzi, `__force` na watchdog). `__tiles()` daje
  kafelki w kolejności (`m5` główny, `s5.1` odłączony), `opts.timing` skraca czasy listy.
  Klik przez `app.click` to klik „programowy" (bez osłony stuknięć); prawdziwe stuknięcie palcem
  = `pointerdown` + `MouseEvent('click', {detail:1})` (patrz `tap()` w `scenarios14.js`).
- `tests/backend-harness.js` — uruchamia prawdziwe pliki `.gs` na atrapie arkusza
  z **zamrożonym, ale przestawialnym zegarem** (`env.setNow(iso)`), więc przejście przez
  godzinę resetu da się sprawdzić w jednym scenariuszu. Wszystkie `.gs` sklejane w jeden
  skrypt, bo w Apps Script dzielą wspólny zakres globalny. **Każde `env.api.*` to osobne
  wykonanie** (jak `google.script.run`): pamięć wykonania (właściwości, sprawdzony układ
  zakładki) się zeruje; w środku jednego wykonania wołaj `env.ctx.__api.*`. `build()`
  w `backend.js` startuje domyślnie o 10:00 i podaje stan dnia w STARYM układzie (`walks`,
  wiersz na psa) — przepisuje się sam przy pierwszym dostępie, więc każdy taki test przechodzi
  też przez migrację; import ze starych kolumn Psy tylko z `legacy: true`. Arkusz zapisuje
  formaty (`sheet._formats`), żeby dało się sprawdzić tekstowe kolumny godzin.
- Testy node wymagają `process.exit()` — `setInterval` w aplikacji trzyma proces.

Zakres: S1–S8 podstawy, S9–S14 odporność + fuzz, S15–S18 notatki i dwa spacery (pola 1/2, 2/2),
S19–S24 kolejka równoległa, S25–S31 panel i wydajność, S32–S38 termin notatki,
S39 numer spaceru w `markWalked`, S40–S42 miniony dzień (podgląd), S43–S45 kolejność kafelków
i jej zamrożenie, S46 przełącznik dwóch spacerów, S47–S48 lista z terenu (psy dwuspacerowe),
S49–S52 pasek środowiska testowego, S53–S62 nawigacja datą, rezerwacje z wyprzedzeniem,
przeskok dnia po resecie, S63 symetria strzałek, S64 stan wpisany w stronę, S65 tryb edycji
jako katalog, S66–S67 zadania na konkretny dzień, S68 notatka „nigdy", S69–S70 przerysowanie
w trybie edycji (bug nr 10), S71–S77 spacery grupowe (przytrzymanie, kolor, sąsiedztwo,
wspólny spacer, cofanie jednego, zmiana i rozwiązanie, przyszły dzień), S78 zaznaczanie bez
zmiany układu, S79 „Zwolnij" zostawia w grupie, S80 pies w dwóch miejscach (1/2 w porannej
grupie, 2/2 z inną), S81 przytrzymany pies nie chowa się pod paskiem, S82 grupa ze spacerem
już odbytym, S83–S89 poprawki po review PR #1 (zły numer grupy i pętla ratunkowa, minione dni
po przełomie, notatka „bez terminu", widziany skład grupy, spóźniona odpowiedź `setGroup`, Enter
w trybie edycji, `setFree` z widzianym stanem), S90 reguły kolejności (SORTING.md), S91 spacer
wychodzący z grupy przy zamrożonej liście, S92 zaznaczanie konkretnego spaceru, S93 osłona
stuknięć, S94 dymek i zapowiedź przestawienia, S95 kolory wolontariuszy, S96 szybkie stuknięcia
w tego samego psa, S97 2/2 zarezerwowany przed 1/2, 1/2 w grupie,
B1–B6 notatki / archiwizacja / godzina resetu,
B7–B8 idempotencja `markWalked`, B9 PIN z właściwości, B10 Historia, B11–B12 `setAllWalks`,
B13–B14 pełny dzień psa 2-spacerowego i cofanie, B15 oznaczenie środowiska,
B16 dzień rezerwacyjny, B17 rezerwacje na daty, B18 przejście przez reset, B19 domykanie
zaległych dni, B20 podgląd minionych dni, B21 jednorazowy import, B22 usuwanie psa,
B23 zagnieżdżona blokada, B24–B25 zadania z datą, B26 notatka „nigdy", B27 `bootJson_`,
B28 `setGroup`, B29 dokładanie kolumny `grupa` do starej zakładki, B30 `setFree` a grupa, B31 spacery 1/2 i 2/2 grupują się osobno, B32 `setAllWalks` a grupy,
B33 przejście ze starego modelu w godzinie czyszczenia, B34 numer grupy całkowity, B35 notatka
„bez terminu", B36 widziany skład grupy, B37 `removeDog` a grupa, B38 godzina czyszczenia nie
cofa dnia, B39 daty akcji, B40 `setFree` z widzianym stanem, B41 układ Spacery sprawdzany raz
i jedno czytanie właściwości na `getData`, B42 przepisanie starego układu Spacery na spacery,
B43 kolory wolontariuszy, B44 akcje na spacerach i zgodność ze starymi kartami,
T1–T3 konfiguracja wdrożeń, T4 wdrożenie otwiera aplikację (`tests/tooling.js`).

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
    Dalszy ciąg (review): Enter z klawiatury telefonu zostawiał fokus w polu, a fokus w polu
    to też „ktoś pisze" — pole wysłane Enterem robi `blur()` (S88).
11. **`setFree` na liście `RETRIABLE` bez `seen`.** „Zwolnij" doszło, odpowiedź zginęła, w ciągu
    ~12 s psa zarezerwował ktoś inny — powtórka zwalniała JEGO rezerwację. Ten sam rodzaj błędu
    co nr 9; klient mówi teraz, jaki stan zwalnia (B40, S89).
12. **Wyjątek w `render()` → `refresh()` → wyjątek → …** Deterministyczny błąd rysowania (grupa
    1.5 z publicznego `setGroup` albo z arkusza) wpędzał każdy telefon w pętlę `getData`.
    Ratunkowe odświeżenie ma odstęp (`RESCUE_GAP_MS`), a dane z zewnątrz są normalizowane
    (`posInt_`) — S83, B34.
13. **„Kliknąłem w jednego psa, a zapisało się na innym"** (zgłoszenie z terenu). Lista
    przestawiała się z zegara — 4 s po ostatnim dotknięciu albo przy odświeżeniu co 15 s, gdy
    ktoś inny coś zmienił — także w chwili, gdy palec już leciał; podwójne stuknięcie trafiało
    w przycisk, który właśnie pojawił się w tym samym miejscu („OK" → „Zwolnij"). Teraz ruch
    listy jest zapowiadany dymkiem „Aktualizuję…" (`decideOrder`), a stuknięcie w zmienioną
    pod palcem listę albo kafelek nie liczy się (`tapRefused`, S93, S96).
    **Nie dokładaj ruchu listy bez zapowiedzi ani nowej akcji spoza `GUARDED` bez przemyślenia.**

## Pułapki Apps Script

- `atHour(h)` to **okno h:00–h:59**, nie punkt czasowy. Dlatego dzień na liście zmienia się
  z zegara (`businessDate_`) punktualnie o h:00, a `endOfDay` tylko domyka zamknięte dni,
  kiedy do niego dojdzie. Archiwizuje pod datą z wiersza Spacery — nie zgaduje jej z zegara.
- **Blokada Apps Script nie jest wielokrotnego wejścia.** `withLock_` liczy zagnieżdżenie
  (`lockDepth_`) i wewnątrz już wziętej blokady po prostu wykonuje funkcję. Bez tego
  `getData()` spod akcji edycyjnej, zakładające brakującą zakładkę, zwolniłoby blokadę
  zewnętrzną w połowie jej pracy (B23).
- **Jednorazowy import stanu dnia ze starych kolumn Psy dzieje się przy PIERWSZYM dostępie** —
  a dostępem jest też sam wyzwalacz `endOfDay`. Gdy po wdrożeniu nikt nie otworzył linku, import
  przychodził po przełomie dnia: dzisiejsze spacery lądowały na jutrzejszej liście zamiast
  w Historii (B33). Dlatego `deploy:*` na końcu otwiera aplikację (`scripts/warmup.js`, T4),
  a import w godzinie resetu datuje stan dniem, który się skończył. **Nie wdrażaj w samej
  godzinie resetu** — stan zmieszany ze starym czyszczeniem nie ma wtedy jednej dobrej daty.
- **Zmienne globalne żyją jedno wykonanie** (każde wywołanie z przeglądarki startuje od zera),
  więc flaga typu `walksLayoutOk_` niczego nie oszczędza między żądaniami — to, co ma przetrwać,
  idzie do Script Properties (`walksLayout`, B41). W drugą stronę działa to na naszą korzyść:
  właściwości czytamy RAZ na wykonanie (`props_()` w `Settings.gs`), bo każde `getProperty` to
  osobne wywołanie usługi z dziennym limitem, a `getData` leci co 15 s z każdego telefonu.
  Wyjątek: przydział koloru wolontariusza czyta świeżo pod blokadą (`volunteersOf_`).
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
`-P .clasp.test.json`, a komendy produkcyjne go nie mają; T4 — że każde wdrożenie na końcu
otwiera to samo wdrożenie, które właśnie wysłało. **Zmieniając skrypty w `package.json`,
nie omijaj tego testu.**

1. `npm run deploy:prod` — testy, wysyłka plików, nowa wersja **istniejącego**
   wdrożenia (link zostaje ten sam) i otwarcie aplikacji. Czerwony test przerywa wysyłkę.
   Komunikat „Otwórz link ręcznie TERAZ" znaczy: otwórz go przed godziną resetu.
2. **Właściwość skryptu `pin`** (Ustawienia projektu → Właściwości skryptu) — bez niej
   tryb edycji jest zamknięty. Ustawiana raz, poza kodem i poza repozytorium.
3. Przy zmianie struktury arkusza: uruchom `migrate()` z edytora (dokłada kolumny
   i formaty, danych nie rusza). Przy pustym projekcie: `setup()`. Wersja, która sama
   przepisuje układ zakładki (jak Spacery w PR #2), wymaga **przed** `deploy:prod` kopii
   całego arkusza — cofnięcie kodu nie cofa układu (README, „Cofnięcie wdrożenia").
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
- Linijka `1. spacer: Ania · 10:15` zniknęła razem ze starym modelem — pies dwuspacerowy ma
  pola 1/2 i 2/2, a odbyte pole pokazuje „✓ Ania" bez godziny (jak kafelek „wyprowadzony").
- **Przed wdrożeniem na produkcję** tej wersji: kopia całego arkusza (*Plik → Utwórz kopię*).
  Produkcja nie ma jeszcze zakładki Spacery, więc powstanie ona od razu w nowym układzie (import
  ze starych kolumn Psy, `warmup`). Projekt testowy przepisał się już przy wdrożeniu @8 — jeszcze
  bez kopii (kopia doszła po review PR #2), więc jego stary układ jest tylko w historii wersji arkusza.

## Jak ze mną pracować

- Nie dokładaj funkcji, o które nie prosiłem. Jeśli widzisz przy okazji realny błąd,
  powiedz o nim — decyzję o naprawie podejmę sam.
- Zanim napiszesz kod, sprawdź istniejące rozwiązanie w repo. Sporo rzeczy, które
  wyglądają na nadmiarowe, jest wynikiem konkretnego bugu z listy wyżej.
- Testy do każdej zmiany, uruchomione, zielone.
- Mów wprost, gdy coś jest złym pomysłem.

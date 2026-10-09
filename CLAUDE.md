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
| `Poll.gs` | WhatsApp (bramka Green API): ankieta tygodniowa (ustawienia, wyzwalacz `sendWeeklyPoll`, wysyłka, panel) i lista dnia do prowadzącej po nocnym czyszczeniu (1.3) |
| `Diag.gs` | dziennik spowolnień: wolne wywołania serwera z krokami (`diagServer_`), wpisy z telefonów (`reportDiag`), do Panelu (`diagLog_`) |
| `Index.html` / `Styles.html` / `Script.html` | frontend, składany przez `<?!= include(...) ?>` |
| `tests/` | dwa harnessy + scenariusze (patrz niżej) |
| `scripts/warmup.js` | otwiera aplikację zaraz po `npm run deploy:*` (nie jedzie do Apps Script) |
| `SORTING.md` | **model spacerów, kafelków i kolejności listy** — czytaj przed każdą zmianą sortowania |

**Nazwy plików HTML w Apps Script muszą brzmieć dokładnie `Index`, `Styles`, `Script`** —
`include()` odwołuje się do nich po nazwie.

## Arkusz

- **Psy** — KATALOG, kim jest pies: `id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer | notatka | spacery | kto1 | godzina1 | notatka_do | grupa_psa`.
  **`grupa_psa`** (1.3, kolumna O) — grupa wolontariuszy, do której należy pies; pusta = nasza (`HOME_TEAM`
  = „G13", ta sama stała w `Script.html`). Doszła później: zakładka bywa węższa — **czytaj najwyżej
  `dogWidth_(sh)` kolumn**; kolumnę dokłada pierwszy zapis psa innej grupy (`dogColumns_`, z nagłówkiem
  i formatem `@`), `migrate()` też. **Liczy się tylko pod nagłówkiem `grupa_psa`** (`hasTeamColumn_`):
  czyjaś własna kolumna O nie przenosi psów na listę innych grup i nie jest nadpisywana — zapis grupy
  daje wtedy wyraźny błąd PRZED innymi zapisami psa (`teamWritable_`, B66). Czyja jest kolumna, rozstrzyga
  `dogColumns_`: z innym nagłówkiem — czyjaś; **bez nagłówka, ale z wpisami pod nim — też czyjaś**
  (`teamCellsUsed_`, final review PR #6: przejęcie robiło z „kaganiec" w notatkach grupę psa); bez nagłówka
  i pusta (same spacje to pusto) — przejmujemy. Pisownia ujednolicana
  (`dogTeam_` = `teamClean` w przeglądarce: „g13" = nasza, „g 7" przy istniejącej „G7" = „G7").
  **`status`, `kto`, `godzina`, `kto1`, `godzina1` są martwe** od wprowadzenia dat — czyta je
  tylko jednorazowy `importDayState_()`. Nie pisz do nich i nie czytaj z nich stanu dnia.
  Zostają, bo cofnięcie wdrożenia do starej wersji znów by ich użyło.
  `identyfikator` (numer psa) i `boks` to **tekst `@`** — od 1.2 ustawiany przy każdym dodaniu
  i edycji PRZED wartością (`setTextFields_`, dlatego te pola nie jadą w `appendRow`) i przez
  `migrate()` na całych kolumnach; „1/26" czy „3-4" arkusz potrafi zamienić na datę, a numer idzie
  do Historii i władz schroniska (B55; boks — decyzja właściciela po review PR #5). Format nie
  przywraca tekstu: komórka, którą arkusz już zamienił na datę, zostaje datą — przed `migrate()`
  na produkcji przejrzeć numery w trybie edycji i takie wpisać ręcznie.
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
  ponownym wdrożeniu przepisze się od nowa (B45). Procedura cofnięcia: README — dwie rzeczy,
  które łatwo pominąć (review): **najpierw wdrożenie starej wersji, potem nazwy zakładek**
  (odwrotnie nowa wersja przy pierwszym odświeżeniu przepisze przywróconą kopię z powrotem),
  i **z kopii trzeba usunąć dni sprzed bieżącego** — nowa wersja je domknęła, a stara zapisałaby
  je do Historii drugi raz. Na produkcji bez zakładki Spacery to samo dotyczy starych kolumn
  Psy: po nocy na nowej wersji trzeba je wyczyścić.
- **Historia** — zamknięte dni: `data | pies | kto | godzina | grupa | identyfikator` (pies jako
  etykieta, nie id; `grupa` — numer spaceru grupowego dnia, puste = bez grupy; `identyfikator` —
  numer psa z katalogu w chwili czyszczenia, **tekst `@`**, bo „1/26" arkusz zrobiłby datą).
  **Numer psa w historii to wymóg** (od 1.1.1: zrzuty historii idą do władz schroniska) — ma
  przetrwać przemianowanie i usunięcie psa, dlatego zapisujemy go przy czyszczeniu, a nie
  doczytujemy. Wpisy sprzed tej kolumny dostają numer z katalogu po etykiecie, **tylko
  jednoznacznie** (`identsByLabel_`: dwa psy o tym imieniu = brak numeru, nie zgadywanie; B50).
  Obie kolumny doszły później: stare wpisy ich nie mają, a stara zakładka bywa węższa niż
  `HIST_WIDTH` — **czytaj najwyżej `histWidth_(sh)` kolumn** (getRange poza szerokość rzuca
  błędem), a brakujące dokłada `histColumns_` (nocne czyszczenie i `setup()`/`migrate()`, B49).
  Wersja sprzed tych kolumn czyta i pisze cztery — cofnięcie wdrożenia jej nie przeszkadza.
- **Zadania** — `id | tresc | data | status`

Statusy spaceru: `free` / `reserved` / `walked` / `team` (1.3 — spacer psa innej grupy bierze jego
własna grupa, `kto` = nazwa grupy; dla listy „załatwiony" jak odbyty — `slotDone_` / `isDone`, ale
**nie idzie do Historii ani maila**, tylko do `ostatni_spacer`). Trudności: `easy` / `med` / `hard`
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
- **`addDog(data, pin, token)`** — token = jedno stuknięcie „Dodaj" (1.2): ten sam token drugi raz
  niczego nie dodaje, tylko oddaje stan (`dogAdds_` / `noteDogAdd_`, ostatnie `DOG_ADDS_KEEP`,
  tokeny od litery — klucz z samych cyfr przestawiłby kolejność w JSON-ie). Brak tokenu = karta
  sprzed 1.2, dodanie jak dawniej. Błąd właściwości nie blokuje dodania psa (bug nr 15, B54).
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
- **Mail z listą spacerów dla schroniska — trzy ustawienia** we właściwościach: `mailTo`
  (`mailTo_()`, odbiorcy „a@b.pl, c@d.pl", brak = adres wpisuje się w poczcie), `mailSubject`
  (`mailSubject_()`, brak = `DEFAULT_MAIL_SUBJECT`), `mailTemplate` (`mailTemplate_()`, brak =
  `DEFAULT_MAIL_TEMPLATE`); wszystkie w `getData`. Odbiorca jest tam jawny dla każdego z linkiem —
  to adres schroniska, nie osoby. Prowadząca zmienia je w panelu jednym zapisem:
  `setMailSettings({to, subject, body}, pin)` (1.2, B53) — PIN; **najpierw sprawdza wszystko, potem
  zapisuje** (zły adres nie zostawi nowej treści przy starym odbiorcy); adresy tylko zwykłe
  (`mailAddresses_`: litery, cyfry, `._+-` — „?", „&", „#" w adresie rozbiłyby link mailto: albo
  dopisały ukrytego odbiorcę, a „%" poczta odkodowuje, „%41" to „A" — review PR #5), temat w jednej linii do `MAX_LEN.MAIL_SUBJECT`, treść jak dotąd
  (`mailBody_`: `[LISTA]` obowiązkowa, `MAX_LEN.MAIL`, końce linii ujednolicone); puste pola = bez
  odbiorcy / domyślne. Stare `setMailTemplate(text, pin)` zostaje dla kart z 1.1.2 (B52). Obie
  idempotentne, więc w `RETRIABLE` — a skoro kolejka ponawia raz każdy nieudany zapis, przeglądarka
  sprawdza te same reguły przed wysłaniem (`mailProblem`, `MAIL_MAX` / `MAIL_TO_MAX` /
  `MAIL_SUBJECT_MAX` = `MAX_LEN.*`), żeby komunikat był od razu, nie po dwóch przelotach (S110b).
  Pola w panelu (`#mailTo`, `#mailSubject`, `#mailTemplate`; adres jako `type="text"
  inputmode="email"` — `type="email"` zjada spacje i myli „niezapisane") trzymają szkic
  w `state.mailDraft` = `{to, subject, body}`, a `busyEditing()` łapie też fokus w TEXTAREA —
  inaczej odświeżenie co 15 s podmieniałoby pole pod palcami. Szkic przeżywa też wyjście z panelu,
  więc **inny niż zapisane jest oznaczony** (`mailDirty`: „Niezapisane zmiany" + „Przywróć
  zapisane", przełączane już w trakcie pisania przez `showMailDirty`) — bez tego wyglądał jak
  zapisany, a historia używała starych ustawień (decyzja właściciela, wersja (a), S110c).
- **Ankieta tygodniowa na WhatsAppie** (1.2, `Poll.gs`, B56–B59, S116–S119): konto bota (osobny
  numer — decyzja właściciela 2026-10-05, ryzyko blokady przyjęte) przez **nieoficjalną bramkę Green
  API** wysyła raz w tygodniu do grupy (np. „Grafik" w społeczności) ankietę „Grafik [TYDZIEŃ]"
  z dniami tygodnia — odwzorowanie ręcznych ankiet prowadzącego (`DEFAULT_POLL`). Oficjalne API
  Meta ankiet do zwykłych grup nie wysyła (grupy do 8 osób, tylko własne, bez ankiet — research
  2026-10-05). [TYDZIEŃ] = tydzień od `pollMonday_` (najbliższy poniedziałek, dziś włącznie)
  w formacie ręcznych ankiet (`pollWeekLabel_`: „05-11.10", „28.09-04.10").
  **Dostęp do bramki to sekret jak PIN**: właściwości `greenApiUrl`, `greenApiInstance`,
  `greenApiToken`, ustawiane ręcznie; nigdy w kodzie, w `getData`, w odpowiedzi ani w błędzie —
  token jest w adresie, więc `greenCall_` wycina go z każdego komunikatu (także błędu sieci
  z UrlFetchApp). Ustawienia (`poll`, JSON) z panelu: `setPollSettings(settings, pin)` (sprawdza
  `pollValid_`; przeglądarka te same reguły w `pollProblem`, limity `POLL_LIMITS` = `POLL_*_MAX`;
  RETRIABLE), lista grup `getPollChats(pin)`, „Wyślij teraz" `sendPollNow(pin)` (NIE RETRIABLE),
  stan w `getDiagnostics().poll` (`pollPanel_`, stan konta bota z bramki; awaria → `null`, panel żyje).
  Wyzwalacz co tydzień `onWeekDay` + `atHour` + `nearMinute(15)` = między h:00 a h:30
  (`installPollTrigger_`, też z `installTriggers()`). **`sendWeeklyPoll` musi być publiczna**
  (wyzwalacz nie woła funkcji z „_"), więc niczego nie przyjmuje i sama pilnuje terminu: wysyła
  tylko w oknie `POLL_WINDOW_H` godzin od ustawionej godziny (`pollDueDay_`, także przez północ).
  **Każda ankieta (grupa + tydzień) najwyżej raz** (`pollSent`, świeży odczyt pod blokadą), a wywołanie
  bramki idzie BEZ blokady (potrafi trwać do minuty, a rezerwacje czekają na blokadę 20 s): znacznik
  „w toku" pod blokadą → wysyłka → wynik pod blokadą (`sendPoll_`). Wynik zostaje w `pollLast`
  (panel), błąd leci dalej — wyzwalacz, który rzuca, Google zgłasza mailem właścicielowi. **Trzy
  rodzaje wyniku** (`pollMarkState_`, review PR #5, runda 2): wysłana; **nie wyszła** — bramka
  odmówiła (kod 4xx) albo brak zgody na `UrlFetchApp` (znacznik zdjęty, można ponowić); **nie
  wiadomo** — bramka nie odpowiedziała albo odpowiedziała kodem 5xx (pośrednik, za którym bramka mogła
  ankietę wysłać — runda 3; `err.unknown` z `greenCall_`) albo „w toku" starsze niż
  `POLL_PENDING_MIN`: ankieta MOGŁA dojść, a druga w grupie rozbiłaby głosy — znacznik zostaje,
  wyzwalacz nie ponawia, „Wyślij teraz" dopiero z `force === true` (prowadząca potwierdza, że
  sprawdziła w grupie); `force` niczego innego nie przełamuje. Panel: `now.status`/`now.at` (stan
  ankiety na najbliższy tydzień w zapisanej grupie). **Stan konta bota NIE idzie w `getDiagnostics`**
  (bramka potrafi odpowiadać do minuty, cały panel czekał) — osobno `getPollState(pin)` (błąd bramki
  to stan `error`, nie wyjątek), w przeglądarce `fetchPollState` po panelu, „sprawdzam…", po
  `T.pollState` bez odpowiedzi — „bramka długo nie odpowiada". „Wyślij teraz" bez odpowiedzi w czasie
  watchdoga (`fail(msg, lost)`) — „Wysyłka trwa dłużej", panel od razu i po `T.pollRecheck` jeszcze raz.
  Przypięcie ankiety zostaje ręczne. **Lista grup** (`getPollChats`): społeczność i jej ogłoszenia mają
  tę samą nazwę („G13, G13, Grafik" — zgłoszenie z 1.3) — powtórzone nazwy dostają dopisek z `getGroupData`
  (`chatNote_`: `isCommunity`, `isCommunityAnnounce` — tylko dla adminów społeczności; `allowParticipantsSendMessages`
  === false; liczba osób), a gdy dalej się powtarzają — numer „#1", „#2" (B68). Pytań bramki najwyżej `CHAT_NOTE_MAX`.
  Co faktycznie zwraca bramka dla społeczności — do sprawdzenia na teście („Pobierz grupy").
- **Lista dnia do prowadzącej** (1.3, `Poll.gs`, B69–B70, S139–S140; decyzje właściciela 2026-10-09): po nocnym
  czyszczeniu bot wysyła prowadzącej prywatną wiadomość (`sendMessage`, czat `…@c.us`) z listą każdego
  domkniętego dnia z NASZYMI spacerami — dokładnie treść „📋 Skopiuj treść" (`dayReportText_` = `mailText`,
  z `readHistoryDays_` jak `getHistoryDays`; S139 porównuje oba teksty). `endOfDay` zbiera dni, których wpisy
  właśnie trafiły do Historii (`closeWalks_(match, days)`), i **po zdjęciu blokady** woła
  `sendClosedDayReports_` — ono nigdy nie rzuca: czyszczenie jest już zrobione, błąd zostaje w panelu
  (`dayReportLast`). Dzień bez spacerów — nic; zaległe dni — każdy osobno, po kolei; każdy dzień najwyżej raz
  (`dayReportSent`, ten sam schemat co ankieta: „w toku" pod blokadą → bramka bez blokady → wynik pod blokadą,
  `pollMarkState_`). Ustawienia `dayReport` {enabled, chatId, chatName}: `setDayReportSettings(s, pin)` (RETRIABLE),
  kontakt z `getDayReportContacts(pin)` — tylko zapisani w kontaktach telefonu bota (`contactName`; bez tego
  lista miałaby każdego członka społeczności). „Wyślij listę" — `sendDayReportNow(pin, date, force)` dla
  ostatniego dnia z Historii (`lastHistDay_`); już wysłaną albo „nie wiadomo" — po potwierdzeniu (`force`;
  prywatna wiadomość drugi raz nikomu nie szkodzi). Nie w RETRIABLE. Panel: `getDiagnostics().dayReport`.
  **Limit planu Developer bramki: 3 czaty w miesiącu na instancję** (test i produkcja dzielą jedną darmową
  instancję) — „Grafik", prowadząca i grupa próbna to komplet; czwarty czat dostaje 466 (`greenCall_` mówi
  wprost o limicie; pewne „nie wyszło"). **Na teście wysyłanie po czyszczeniu wyłączone**, próba „Wyślij listę"
  do tej samej osoby co na produkcji (review PR #6). Wiadomość po nocnym czyszczeniu sprawdza się więc dopiero
  na produkcji, po pierwszym czyszczeniu na 1.3.
- **Dziennik spowolnień** (1.2, `Diag.gs`, B62–B64, S122–S128) — po zgłoszeniu 7–8.10.2026 „strona
  długo się ładowała, a potem wisiała": dziennik wykonań Google zna tylko łączny czas na serwerze
  (bez kroków, bez filtra po funkcji), a telefonu nie widzi wcale. **Serwer** (`diagServer_`, właściwość
  `diagServer`): wywołanie dłuższe niż `DIAG_SLOW_MS` z krokami — `doGet` (szablon, odczyty stanu
  startowego, strona; plus nieudany stan startowy, dawniej połykany po cichu w `bootJson_`), `getData`
  (`readState_(parts)`: ustawienia, psy, spacery, zadania, reszta; **pod blokadą nie** — tam mierzy
  `withLock_`), każde `withLock_` (blokada, praca, zapis; błąd blokady zawsze; nazwa akcji z ramki stosu —
  `diagCaller_`, w razie czego „?"). Liczy NASZ kod — czasu, zanim Google go uruchomi, nie widzi.
  **Telefon** (`reportDiag`, publiczne bez PIN-u — wpisy sprawdzane jak obce: `diagClean_`, znane pola,
  przycięte, ms ≤ 1 h, czas zdarzenia najwyżej dzień w przód — w przeszłość wolno, bo wpis potrafi czekać
  w telefonie bez zasięgu; właściwość `diagPhones`). Oba dzienniki: najwyżej `DIAG_KEEP` wpisów i `DIAG_BYTES`
  bajtów UTF-8 (limit 9 KB na właściwość), bez powtórek po `id`, świeży odczyt, **zapis bez blokady**
  (dziennik pisze się, gdy blokada bywa zakorkowana; zgubiony wpis to cała szkoda) i **żaden jego błąd
  nie zatrzymuje odczytu ani zapisu** (podwójny try/catch, B62). Na zwykłej pracy nic nie kosztuje.
  Panel: `getDiagnostics().diag`. Bez imion i treści.
- **Psy innych grup** (1.3, B65–B67, S130–S137) — pomagamy wyprowadzać psy innych grup; stoją w naszym
  katalogu z grupą (`team` w `getData`, kolumna `grupa_psa`). `addDog(data…)` i `updateDog(id, data…)`
  przyjmują `data.team`; **brak pola (karta sprzed 1.3) = grupa zostaje, jaka była** — inaczej stara karta
  przy poprawce imienia przenosiłaby psa na naszą listę. Ujednolicenie pisowni pod blokadą z katalogiem
  (`teamOfInput_`, bez poprawianego psa — jedyny pies grupy może zmienić jej pisownię). Listę grup do
  wyboru przeglądarka liczy z katalogu (`knownTeams`): grupa jest do wyboru, dopóki ma choć jednego psa
  (literówka znika razem z poprawką psa — bez osobnej listy do sprzątania).
  **`markTeam(id, date, slot)`** — „Bierze G7": tylko wolny spacer BEZ grupy (zaplanowany spacer grupowy
  jest nasz) i tylko pies innej grupy (inaczej błąd); dzień bieżący albo przyszły, jak rezerwacja;
  `kto` = grupa z katalogu, nie z przeglądarki. Powtórka niczego nie zmienia — w `RETRIABLE`. Cofnięcie —
  zwykłe `setFree` z widzianym stanem. Spacer `team` nigdy nie dołącza do spaceru grupowego (`setGroup`).
  `closeWalks_`: `team` → `ostatni_spacer` tak, Historia nie (decyzja właściciela: to nie nasz spacer).
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
  **Mało tekstu, spacer w jednym wierszu** (feedback z testów, S102): kafelek odłączony to jeden
  wiersz — imię psa, `1/2`, opiekun, przyciski (bez trudności, numeru, boksu, notatki — są na
  kafelku pełnym); kafelek główny nie ma linijki o spacerach w grupach; nie ma znacznika
  „👥 grupa" ani dopisku „na stałe" przy notatce „nigdy". Wiersz spaceru (`slotParts`) trzyma
  przyciski razem (`.acts`), a napis przycisku spaceru to `WALK_LABEL` = „Wrócił ✓" — krótki,
  bo z „Wyprowadzony ✓" (129 px) pola 1/2, 2/2 zajmowały po dwie linijki na telefonach
  360–393 px. **Dokładając cokolwiek do wiersza spaceru, sprawdź w przeglądarce 360 px.**
- **Dwie listy dnia** (1.3, decyzja właściciela): nasza u góry bez zmian, pod nią „Psy innych grup"
  (`.others`, `ul.others-list`), **każda sortowana osobno, jakby drugiej nie było** (`sortedRefs` →
  `sortedSide` na każdą; także opiekun, kryterium 5). Nasze psy — nawet wszystkie odbyte — zawsze nad
  ich psami. Granica obowiązuje też w zamrożonej kolejności (`effectiveOrder` dzieli `order` na dwie):
  pies przeniesiony do innej grupy przechodzi od razu, nowy pies staje na końcu SWOJEJ listy (S132).
  Spacer grupowy z psami z obu list to dwa bloki tego samego koloru (`blockOf` z dopiskiem listy) —
  „Wrócił ✓" dalej odhacza całą grupę (S131). Podsumowanie (`countLine(other)`) liczy każdą listę osobno.
  Na liście innych grup pełny kafelek ma **plakietkę „grupa G7" w linijce z numerem** (`teamPill`,
  wersja D z czterech makiet — linijka imienia zostaje jak na naszej, długie imię z „zarezerwowany"
  i trudnością się nie rozjeżdża); kafelek odłączony jej nie ma. Wolny spacer bez grupy ma obok
  „Zarezerwuj" przycisk **„Bierze G7"** (`doTeam`, w `GUARDED`), po nim „✓ G7" + „Cofnij"; kafelek
  schodzi na dół jak odbyty (`isDone` w `tileKey`, `ownerOf`, odznace „bez spaceru").
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
  z numeru (`GROUP_COLORS`: `bg` = tło, `ink` = pasek). Znacznik „👥 grupa" przy tle usunięty
  na prośbę właściciela (zbędny) — był po to, że w pełnym słońcu blade tło potrafi zniknąć.
  Z terenu wróciło „grupę słabo widać", więc od 1.1.1 kafelek w grupie (klasa `grouped`, `--gc`
  w `tileStyle`) ma z prawej **pasek w kolorze `ink` z napisem GRUPA od dołu** (decyzja
  właściciela, wersja B z czterech — S106). Pasek leży w prawym marginesie kafelka (18 px
  zamiast 14), a lewy margines oddaje te 4 px (10 zamiast 14): **na treść zostaje tyle miejsca
  co bez grupy**. Pierwsza wersja zabierała 4 px i kafelki odłączone na granicy łamały się do
  dwóch linijek częściej niż na 1.1 (review PR #3, pomiar w Chromium 360–412 px); pasek dołożony
  do szerokości — już przy 412 px kafelek za kafelkiem. Kółko zaznaczania ma `z-index` nad
  paskiem, pasek ma `pointer-events:none`. Grupa
  trzyma się razem na liście jako blok (SORTING.md); po zatwierdzeniu lista układa się od razu
  (to cel akcji). **„Wrócił ✓" w grupie jest aktywny, gdy żaden spacer z grupy nie jest
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
  (grupa = blade tło kafelka i pasek na krawędzi, wolontariusz = kontur wokół imienia; od 1.1.1
  obie są nasycone, więc rozróżnia je już kształt i miejsce, nie nasycenie) i bez zieleni/żółci/czerwieni
  trudności; jej długość = `VOLUNTEER_COLORS` w `Config.gs` (S95 pilnuje obu).
- **Akcja pamięta swój dzień.** `doReserve` & spółka biorą datę w chwili kliknięcia,
  wysyłają ją i zapisują odpowiedź pod NIĄ, nie pod `state.date` — wolontariusz mógł
  w międzyczasie przejść strzałką gdzie indziej (S56). Klik na dniu, który zamknął się pod
  palcami, dostaje `dayClosed()`: komunikat + przejście na bieżący dzień, nigdy ciszę (S58).
- **Kolejka zapisów z torami.** Tor = byt (`dog:1.2@2026-09-24` — spacer 2/2 psa 1 tego dnia,
  `task:3`, `_full`). Ten sam spacer obsługiwany po kolei, różne spacery i różne dni równolegle,
  sufit 4 naraz. Zapis, który utknął, blokuje wyłącznie swój tor. Akcja najpierw wkłada zapis
  do kolejki, potem przerysowuje kafelek — dzięki temu kafelek od razu ma kręciołek „zapisuję".
- **Dymek „Zapisuję…" / „Aktualizuję…"** (`updateBusy`, `#busy`): ciemny, na dole ekranu (tam,
  gdzie toast; toast staje nad nim dzięki `body.busy-on`, przy zaznaczaniu oba nad paskiem),
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
- **`writeSeq`** liczy zapisy wpuszczone do kolejki (`enqueue`). `refresh()` zapamiętuje go przy
  wysłaniu i odpowiedź sprzed zapisu pomija (pyta od nowa) — bug nr 14. `enqueue(fn, args,
  {key, reconcile, fail})`: `fail(msg, lost)` woła się, gdy zapis ostatecznie się nie udał (po
  powtórce); `lost` — odpowiedź nie przyszła (watchdog, zerwane połączenie), więc serwer MÓGŁ zapis
  wykonać — w odróżnieniu od odmowy serwera z komunikatem.
- **Szkice formularzy trybu edycji** — „Dodaj psa" i „Nowe zadanie" (z dniem) trzymają wartości
  w `state.form` (`formVal`, `FORM_FIELDS`, zapis na `input`/`change`), jak mail w `mailDraft`:
  przerysowanie katalogu, gdy palec akurat nie jest w polu, wymieniało formularz na pusty.
  Pies w drodze na serwer stoi na końcu katalogu jako „dodaję…" (`state.adding`, bez przycisków —
  nie ma jeszcze numeru) do pierwszego pełnego stanu po odpowiedzi (`applyData` zdejmuje `done`),
  więc nie mruga, gdy `applyFull_` odkłada stan. Kolejne stuknięcie w pusty formularz, gdy pies
  jest w drodze, nic nie robi — fokus w polu wstrzymałby przerysowanie (busyEditing).
  **Prowadząca zwykle wpisuje już następnego psa**, więc `safeRender` przy fokusie w polu
  formularza katalogu podmienia samą listę z licznikiem (`patchCatalog`, `ul[data-catalog]`) —
  dodany pies wskakuje od razu, pole i palec zostają. Zapis, który przepadł, oddaje dane do
  formularza tylko wtedy, gdy jest pusty i zaraz się przerysuje (`dogFormEmpty` i nie
  `busyEditing`); inaczej pies zostaje w katalogu jako **„nie dodano"** (`failed`), a stuknięcie
  (`reAddDog`) oddaje dane do pustego formularza z tym samym tokenem. Wcześniej taki pies
  przepadał bez śladu, z komunikatem bez imienia (review PR #5, S112f, S112g).
- **Dziennik spowolnień — strona telefonu** („DZIENNIK SPOWOLNIEŃ" w `Script.html`): `diagNote(kind, …)`
  zapisuje `call` (zapis z kolejki albo odczyt wolniejszy niż `T.diagSlow` lub nieudany — `diagCall`
  w `settle`, `refresh`, `fetchPast`), `call` „bez odpowiedzi" (odczyt w `readsInFlight` dłużej niż
  `T.diagNoReply`, raz), `start` (od `served` z `doGet` do startu skryptu — sieć, opakowanie Google, ramka;
  zegar zły o godzinę i więcej = bez wpisu), `freeze` (zegar `diagTick` co `T.diagBeat` spóźnił się
  o `T.diagFreeze`, a strona była widoczna) i `error` (błąd skryptu, wywrotka `render`, wyjątek w akcji;
  ten sam komunikat raz na minutę). Kolejka do 20 wpisów w `localStorage` (`g13diag`; nie ma go — działa
  w pamięci), znak telefonu `g13dev` (losowy, nie mówi czyj), opis z `uaLabel`. `sendDiag` co `T.diagSend`,
  **tylko gdy nie leci żaden zapis**, jeden naraz, po 10. **Odświeżanie co `T.refresh` nie wysyła odczytu,
  gdy poprzedni jest w drodze krócej niż `T.readStale`** (`readWaiting`, runda 3, S129) — przy zastoju Google
  każdy telefon dokładał odczyt co 15 s, a wykonania wszystkich liczą się do jednego konta z limitem
  równoczesnych; starszy odczyt to zgubiony (bug nr 8), na niego nie czekamy. **`T.readStale` = 20 s** (1.3,
  było 60): dziennik wykonań produkcji 2–9.10 — zastój Google dotyka pojedynczego wykonania (67 s, a równoległe
  po 1,5 s), więc drugi odczyt prawie zawsze przechodzi. **Powrót do karty** (`visibilitychange`) odświeża
  tylko wtedy, gdy nic nie wisi (`readWaiting`) i ostatni odczyt poszedł dawniej niż `T.wake` (S138) — 8.10
  karta na komputerze dostawała „widoczna" co 6 s i wysłała 100 odczytów w 10 minut, także przy wiszącym
  36 s; to była jedyna droga omijająca `readWaiting`. **Każde `confirm` idzie przez `ask()`** —
  okienko zatrzymuje skrypt, a bez `diagAwake()` każde dłuższe zastanowienie byłoby „zamrożeniem";
  karta w tle tak samo (`visibilitychange`, `pageshow`).
- **„Co nowego"** (1.3.1, S141–S142, T6; decyzje właściciela: wersja A z czterech makiet + jednorazowy pasek).
  Numer wersji przy „Spacery" to przycisk (`#verBtn`, „v1.3.1 · Co nowego?") — na górze strony nic nie
  dochodzi. Otwiera listę zmian na cały ekran (`#whatsNew`, `openWhatsNew` rysuje ją z `WHATS_NEW`; nad
  paskiem zaznaczania, pod dymkiem i komunikatem; `body.wn-open` — strona pod spodem się nie przewija).
  Leży poza `#view`, więc odświeżanie i przerysowanie listy jej nie dotykają. Pasek „✨ Nowa wersja…"
  (`#wnBanner`) pod nagłówkiem, raz na telefon: `g13seen` w localStorage = najnowsza widziana wersja,
  zapisywana przy „Zobacz", ✕ i otwarciu listy przyciskiem. **Bez pamięci przeglądarki paska nie ma**
  (`storageOk`) — nie zapamiętałby schowania i wisiałby przy każdym otwarciu. Całość w `try/catch`: dodatek
  nie może zatrzymać startu listy.
- **Samoleczenie.** Watchdog 12 s, jedno automatyczne ponowienie dla operacji
  idempotentnych (`RETRIABLE`), `checkStuck()` co 3 s **oraz** przy każdym
  `pointerdown`/`touchstart` i powrocie do karty. `render()` i `handleAction()`
  w `try/catch` z samonaprawą. Tor zwalniany **przed** jakąkolwiek logiką odpowiedzi.
  Ratunkowe odświeżenie z `catch` w `render()` najwyżej raz na `RESCUE_GAP_MS` (15 s) —
  błąd powtarzalny przy każdym rysowaniu robił pętlę `getData` z każdego telefonu (bug nr 12).
- **Minione dni dociąga `renderPastDay`**, gdy ich nie ma w pamięci (`fetchPast` sama pilnuje
  dublowania) — po przełomie dnia `applyData` czyści pamięć, a ekran wisiał na „Wczytuję…" (S84).
  **Kolejność minionego dnia: wolontariusz, potem godzina** (decyzje właściciela, 1.1.1, S105):
  spacery jednej osoby razem, osoby alfabetycznie po `volNorm`, bez osoby na końcu; w obrębie
  osoby po godzinie (`minutesOf` — jako czas, napisowo „11:00" < „9:00"). Pierwsza wersja
  miała jedną regułę i u jednej osoby czytało się „Luna 17:00, Nero 10:00" (review PR #3).
  To nie jest `tileKey` — SORTING.md dotyczy listy dnia otwartego.
  **Grupy w minionym dniu** (decyzja właściciela: wersja A + podsumowanie z D z czterech makiet,
  S107): wpis ze spaceru grupowego ma tło i pasek koloru grupy (`.hist-item.hg`, `--gbg`/`--gc`
  z `groupColor`) — kolejności nie zmienia; pod listą „Spacery grupowe" (`.hist-gsum`): grupa
  w linijce, po godzinie, psy jednej osoby razem. Grupa = numer z **co najmniej dwoma** odbytymi
  spacerami tego dnia — gdy reszta grupy nie wyszła, pies szedł sam. Numer grupy przychodzi
  z `getHistoryDays` (`group`) — z Historii albo ze Spacery dla dni jeszcze niezamkniętych.
  **Przy każdym psie jego numer** (`histNr`: „Draco nr 552/26 — Grzesiek", z `ident`; S108) —
  wymóg, zrzuty idą do władz schroniska. Brak numeru = brak „nr", pies bez imienia („#2077")
  nie dostaje numeru drugi raz. Nie usuwaj go przy porządkowaniu widoku.
  **E-mail z listą dla schroniska** (1.1.2 kopiowanie, 1.2 wysyłka; S109–S111): schronisko chce
  tylko listę psów z numerami i datą. Nad listą minionego dnia **„✉️ Wyślij e-mail z listą psów"**
  (1.2, S111) — link `mailto:` (`mailHref`, RFC 6068): adresy z panelu po przecinku (serwer
  przepuszcza tylko zwykłe, więc „@" zostaje czytelne dla każdej poczty), temat z `[DATA]`
  i treść zakodowane `encodeURIComponent`, końce linii w treści CRLF; `target="_top"`, bo
  aplikacja siedzi w ramce Apps Script (dokumentacja HtmlService radzi `_top` dla linków).
  Telefon otwiera aplikację pocztową z gotowym mailem; którą — zależy od telefonu (Android pyta,
  gdy nie ma domyślnej; iPhone bierze domyślną). Kliknięcia nie przechwytujemy (`sendMail` →
  zwykły link). Bez tematu z serwera (1.1.2) — bez tego przycisku. Pod nim
  **„📋 Skopiuj treść"** (`copyMail`) — zapas, gdy telefon poczty nie otworzy (np. przeglądarka
  WhatsAppa); tej samej wysokości, ale z ramką zamiast wypełnienia (decyzja właściciela po review
  PR #5 — tam, gdzie poczta się nie otwiera, to jedyna droga, a 27 px trudno trafić): kopiuje
  treść z panelu (`state.mailTemplate` z `getData`) z podstawionym `[DATA]` (dd.mm.rrrr) i `[LISTA]`
  (`mailList`: CSV `data,pies,numer`, **pies raz na dzień** — dwa spacery to jeden pies, po imieniu,
  pola z przecinkiem w cudzysłowie; pies bez imienia — pusta kolumna „pies", numer raz, jak
  w widoku; decyzja właściciela po review PR #4). Kopia najpierw `execCommand('copy')` na ukrytym polu
  (`copyByCommand` — działa w iframie Apps Script i musi pójść w samym stuknięciu, iOS), potem
  `navigator.clipboard` (w iframie bywa zablokowany), a gdy nic nie zadziała — mail w polu
  `.mailbox` do ręcznego skopiowania i komunikat, **nigdy cisza**. Bez treści z serwera (starsza
  wersja) — bez przycisków. W trybie edycji ich nie widać, bo tam nie ma dni (katalog).
- **Kolejność kafelków — `tileKey`, opis i przykłady w `SORTING.md`.** W skrócie: czekające
  na chętnego → obsadzone → odbyte; w każdej części najpierw psy dwuspacerowe, potem mniejszy
  dorobek dnia, potem — od 1.1.1 — **psy jednego opiekuna razem** (kryterium 5, `ownerOf` +
  `rankKeys`, S104; także w części odbytej — opiekun odbytego kafelka to ten, kto go wyprowadził),
  potem arkusz. Grupa to blok w miejscu swojego najpilniejszego spaceru.
  **Opiekun ma najniższy priorytet z reguł** (decyzja właściciela) — to pozycja w kluczu, nie
  blok: pierwsza wersja (blok jak grupa) przenosiła psy przez granice reguł 3–4.
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

Aktualnie **1665 asercji, wszystkie zielone** — w każdej strefie czasowej maszyny (`tests/harness.js`
ustawia `TZ=Europe/Warsaw`; bez tego S127 był czerwony w UTC, a z nim `deploy:*` — review PR #5, runda 3).
Nowa funkcja bez testu nie jest skończona.

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

Zestawy `scenarios12.js`–`scenarios15.js` są **asynchroniczne**: przytrzymanie kafelka mierzy
prawdziwy zegar (czeka ~650 ms), dokładnie jak na telefonie, a `scenarios14` czeka też na
ciszę, zapowiedź i osłonę stuknięć — ze skróconymi czasami (`buildApp({timing:{…}})`);
`scenarios15` czeka na zegar komunikatu (~3 s). `scenarios16`–`17` też są asynchroniczne; `17` (dziennik
spowolnień) skraca `T.diag*` i blokuje skrypt pętlą, żeby odegrać zamrożoną stronę. `scenarios18` (psy innych
grup) jest synchroniczny i porównuje `teamClean` z prawdziwym `dogTeam_` z backend-harnessu (S136). `scenarios19`
(„Co nowego") też — pamięć telefonu przez `opts.url`/`opts.storage`.

**`respondNext` odpowiada na PIERWSZE oczekujące wywołanie**, nie na to, o którym myślisz. Gdy
w kolejce stoi kilka (odświeżenie + akcja), celuj po nazwie (`respondTo` w `scenarios13`/`15`).
S8 przez lata miał sprawdzać spóźniony `getData` po rezerwacji, a odpowiadał w odwrotnej kolejności
i niczego nie sprawdzał — wyścig, który miał łapać, był w kodzie (przegląd 1.2, S113).

- `tests/harness.js` — ładuje prawdziwe `Index`+`Styles`+`Script` w jsdom, klika jak
  człowiek, pozwala sterować tym **kiedy i czy w ogóle** odpowie „serwer"
  (`respondNext`, `failNext`, gubienie odpowiedzi, `__force` na watchdog). `__tiles()` daje
  kafelki w kolejności (`m5` główny, `s5.1` odłączony), `opts.timing` skraca czasy listy.
  Klik przez `app.click` to klik „programowy" (bez osłony stuknięć); prawdziwe stuknięcie palcem
  = `pointerdown` + `MouseEvent('click', {detail:1})` (patrz `tap()` w `scenarios14.js`).
  **`reportDiag` (dziennik spowolnień) harness obsługuje sam** — trafia do `app.diagReports`, NIE do
  `pending`, inaczej `respondNext` starszych testów odpowiadałby jemu; `opts.diagManual` — jak każde
  inne wywołanie. `opts.served` (chwila oddania strony), `opts.url` (localStorage działa tylko pod
  prawdziwym adresem, nie na about:blank), `opts.storage` (localStorage przed startem), `__diag()` —
  kolejka dziennika. `let`/`const` skryptu nie są widoczne z `window.eval` (osobny zakres eval) —
  do stanu przez wystawione `__…`.
- `tests/backend-harness.js` — uruchamia prawdziwe pliki `.gs` na atrapie arkusza
  z **zamrożonym, ale przestawialnym zegarem** (`env.setNow(iso)`), więc przejście przez
  godzinę resetu da się sprawdzić w jednym scenariuszu. Wszystkie `.gs` sklejane w jeden
  skrypt, bo w Apps Script dzielą wspólny zakres globalny. **Każde `env.api.*` to osobne
  wykonanie** (jak `google.script.run`): pamięć wykonania (właściwości, sprawdzony układ
  zakładki) się zeruje; w środku jednego wykonania wołaj `env.ctx.__api.*`. `build()`
  w `backend.js` startuje domyślnie o 10:00 i podaje stan dnia w STARYM układzie (`walks`,
  wiersz na psa) — przepisuje się sam przy pierwszym dostępie, więc każdy taki test przechodzi
  też przez migrację; import ze starych kolumn Psy tylko z `legacy: true`. Arkusz zapisuje
  formaty (`sheet._formats`), żeby dało się sprawdzić tekstowe kolumny godzin, i liczy odczyty
  (`sheet._reads`). Zakładka ma id (`getSheetId`, kopia z `insertSheet(n, {template})` — inne)
  i zmienia nazwę (`setName`) — tak test odgrywa cofnięcie wdrożenia (B45). `env.failProps(f)`
  psuje usługę właściwości dla wybranych kluczy (B46). Zakładka opisana z `strictWidth: true`
  rzuca błędem na zakres poza swoją szerokością, jak Apps Script (B49) — domyślnie atrapa
  dokłada kolumny sama, więc taki błąd bez tej flagi jest niewidoczny. Tak samo `maxRows: N` —
  stała liczba wierszy, zapis niżej rzuca błędem, rośnie tylko przez `insertRowsAfter`; każde
  `setNumberFormat` z zakresem wierszy trafia do `sheet._formatRanges` (B51). `env.http` to
  `UrlFetchApp` na niby: `http.calls` (adres, opcje) i `http.handler(url, opts)` → `{code, body}`
  albo wyjątek; bez handlera 500. Wyzwalacze zapisują `_weekDay`, `_everyWeeks`, `_nearMinute`, `_tz` (B57).
  **`env.cost`** — koszt usług w ms przy zamrożonym zegarze: `read[zakładka]` (każde `getValues`),
  `waitLock` (`lockFail` — blokada rzuca), `flush`, `template`, `evaluate`; `env.now()`, `env.html.evaluated`
  (szablony z `doGet`: `boot`, `served`). Uwaga: pusta zakładka nie woła `getValues` — koszt jej odczytu
  się nie liczy (B62–B64).
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
w tego samego psa, S97 2/2 zarezerwowany przed 1/2, 1/2 w grupie, S98–S101 poprawki po review
PR #2 (stuknięcie zaraz po własnej nawigacji, „Aktualizuję…" tylko w zapowiedzi, imię w 2/2
przeżywa konflikt na 1/2, koszt rysowania z rezerwacjami naprzód), S102 feedback z testów
(kafelek odłączony w jednym wierszu, bez linijki „w grupie", „👥 grupa" i „na stałe", przyciski
spaceru razem, krótki `WALK_LABEL`, dymek na dole), S103 zaznaczanie nie blednie imienia psa
na kafelku odłączonym (style dokładane do jsdom ręcznie, widoczność liczona po regułach),
S104 opiekun (psy jednej osoby obok siebie tylko przy remisie reguł 1–4, z 40 losowymi dniami — 1.1.1),
S105 miniony dzień po wolontariuszu, potem po godzinie (1.1.1), S106 pasek grupy po prawej (kolor `ink`, napis GRUPA,
na treść tyle miejsca co bez grupy, kółko zaznaczania nad paskiem — 1.1.1), S107 grupy w minionym
dniu (kolor wpisu, „Spacery grupowe", grupa z jednym spacerem to spacer pojedynczy), S108 numer psa
w minionym dniu, S109 e-mail z listą psów (CSV, pies raz, schowek: execCommand → clipboard → pole
do ręcznego skopiowania — 1.1.2), S110 ustawienia maila w panelu (odbiorca, temat, treść; szkic,
fokus, zapis jednym przyciskiem z PIN-em — 1.2), S110b ustawienia sprawdzane w przeglądarce przed
wysłaniem (adres, temat, `[LISTA]`, limity równe serwerowym), S110c niezapisane ustawienia oznaczone
i do przywrócenia, S111 „Wyślij e-mail" jako link mailto: (odbiorcy, temat z datą, treść CRLF,
kodowanie, `target=_top`, zapasowe „Skopiuj" — 1.2), S112–S112e „Dodaj" psa (kilka stuknięć = jeden
pies, „dodaję…", powtórka z tym samym tokenem, dane wracają po nieudanym zapisie, szkice formularzy
trybu edycji), S112f–S112g „Dodaj", gdy prowadząca wpisuje już następnego psa („nie dodano"
w katalogu, lista podmieniana bez formularzy — review PR #5), S113 spóźniony odczyt nie cofa zapisu, S114 PIN i panel bez połączenia, S115 komunikat
za komunikatem (przegląd 1.2), S116–S119 ankieta tygodniowa w panelu (domyślne ustawienia, „Pobierz
grupy", zapis, te same reguły co serwer, szkic przeżywa przerysowanie, „Wyślij teraz" z potwierdzeniem),
S120 stan konta bota osobnym pytaniem (panel nie czeka, „sprawdzam…", bramka nie odpowiada), S121 „nie wiadomo,
czy wyszła" (sprawdź w grupie, wysłać mimo to — `force`; „trwa dłużej" po watchdogu i ponowne sprawdzenie) —
review PR #5, runda 2, S122–S128 dziennik spowolnień — telefon (wolne i nieudane wywołania, odczyt bez
odpowiedzi, strona stała — ale nie karta w tle ani okienko pytania, dojście strony, błędy skryptu, pamięć
między otwarciami, wysyłka tylko w ciszy, Panel, opis telefonu z userAgent, kontrakt telefon → serwer),
S129 odświeżanie nie dokłada odczytów, gdy poprzedni wisi (do `T.readStale`) — runda 3,
S130–S137 psy innych grup (1.3: dwie listy sortowane osobno, spacer grupowy z obu list, zamrożona lista a zmiana
grupy, grupa w „Dodaj psa" i edycji, plakietka, te same reguły co serwer, „Bierze G7"), S138 powrót do karty nie
dokłada odczytu tuż po poprzednim ani przy wiszącym (1.3), S139 lista dnia do prowadzącej = „Skopiuj treść"
(serwer i przeglądarka), S140 panel listy dnia (kontakty, szkic, zapis, „Wyślij listę" z potwierdzeniem),
S141 „Co nowego?" (lista zmian od najnowszej, „W panelu admina", odświeżenie jej nie zamyka — 1.3.1), S142 pasek
„Nowa wersja" (raz na telefon, „Zobacz" / ✕, bez pamięci przeglądarki — bez paska),
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
B43 kolory wolontariuszy, B44 akcje na spacerach i zgodność ze starymi kartami, B45 kopia starego
układu Spacery i cofnięcie wdrożenia, B46 kolor wolontariusza nie blokuje zapisu (awaria, sufity),
B47 `setGroup` dla kart z PR #1 (`walks`), B48 `trimSlots_` jednym odczytem, B49 grupa w Historii
(zapis przy czyszczeniu, odczyt, wąska stara zakładka — `strictWidth` w atrapie, `migrate()`),
B50 numer psa w Historii (zapis jako tekst, stare wpisy z katalogu tylko jednoznacznie, przemianowanie),
B51 pełna Historia dostaje wiersze (z formatem tekstowym), nic nie znika — 1.1.2,
B52 treść maila z listą (domyślna, PIN, `[LISTA]` obowiązkowa, limit, powrót do domyślnej),
B53 ustawienia maila `setMailSettings` (adresy, temat, treść; nic połowicznie; stare `setMailTemplate`),
B54 `addDog` z tokenem (powtórka nie dokłada psa, sufit pamięci, świeży odczyt, awaria właściwości),
B55 numer psa i boks w Psy jako tekst (format przed wartością, `migrate()`),
B56 tydzień ankiety (`pollMonday_`, `pollWeekLabel_`), B57 ustawienia ankiety i wyzwalacz (PIN, reguły,
`installTriggers()`, token nigdy do przeglądarki), B58 wysyłka (termin i okno, raz na grupę i tydzień,
przez północ, błąd bez tokenu, „w toku", świeży odczyt), B59 grupy bota (`getPollChats`),
B60 zgoda na bramkę (`authorizeWhatsApp` + `requireScopes`, komunikat przy braku zgody — `env.consent` w atrapie),
B61 nieznany wynik wysyłki (bramka przyjęła, odpowiedź zginęła: „nie wiadomo", bez drugiej ankiety; `force`;
pewne „nie wyszło" przy braku zgody),
B62 dziennik spowolnień — serwer (kroki `doGet`/`getData`/`withLock_`, błąd blokady, nieudany stan startowy,
nazwa akcji, awaria właściwości nic nie psuje), B63 sufity dziennika i `reportDiag`, B64 dziennik w Panelu,
B65 grupa psa (zakładka bez kolumny, dokładanie kolumny, pisownia, karta sprzed 1.3, nocne czyszczenie i `migrate()`
na wąskiej zakładce), B66 cudza kolumna O (z innym nagłówkiem albo z wpisami bez nagłówka; nocne czyszczenie
jej nie zapisuje), B67 `markTeam` („Bierze G7": tylko wolny bez grupy, idempotentny,
z wyprzedzeniem, nie do grupy spacerowej, nie do Historii, ale `ostatni_spacer`), B68 lista grup bota bez
dwóch takich samych pozycji, B69 lista dnia do prowadzącej (kontakty, ustawienia, wysyłka po czyszczeniu raz na
dzień, treść, zaległe dni, ręcznie), B70 bramka zawodzi (czyszczenie i tak, „nie wiadomo" / „nie wyszła", drugi dzień mimo to),
T1–T3 konfiguracja wdrożeń, T4 wdrożenie otwiera aplikację, T5 numer wersji przy „Spacery" (`Index.html`, od 1.3)
= `version` w `package.json` — podnosząc wersję, zmień oba (`tests/tooling.js`), T6 „Co nowego" (`WHATS_NEW`:
pierwszy wpis = ta wersja, najnowsza na górze, każda starsza z datą — 1.3.1).

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
14. **Spóźniony odczyt cofał świeży zapis** (przegląd 1.2). `refresh()` sprawdzał tylko, czy zapis
    jest W DRODZE w chwili odpowiedzi — a odświeżenie co 15 s wysłane tuż przed stuknięciem wracało
    już po zapisie, z odczytem sprzed niego: rezerwacja „odskakiwała" do wolnej do następnego
    odświeżenia, usunięty pies wracał. Teraz `writeSeq` (licznik zapisów wpuszczonych do kolejki):
    odczyt sprzed zapisu jest pomijany i idzie nowy (S113, S8). **Każdy nowy odczyt pełnego stanu
    poza `refresh()` musi tak samo pilnować `writeSeq`.**
15. **Kilka stuknięć w „Dodaj" = kilka takich samych psów** (zgłoszenie z panelu). `addDog` nie był
    idempotentny, a dane stały w formularzu do odpowiedzi serwera. Teraz formularz pustoszeje od
    razu, pies stoi w katalogu jako „dodaję…" (`state.adding`), a każde „Dodaj" niesie token
    (`addDogToken`): serwer pamięta ostatnie `DOG_ADDS_KEEP` (właściwość `dogAdds`, świeży odczyt pod
    blokadą) i powtórki psa nie dokłada — dzięki temu `addDog` jest w `RETRIABLE` (S112, B54).
    Nieudany zapis oddaje dane do pustego formularza z tym samym tokenem, dopóki treść się nie zmieni,
    a gdy w formularzu jest już następny pies — zostawia w katalogu „nie dodano" (review PR #5).
    **Żaden nieudany zapis nie może zniknąć bez śladu** — ślad musi zostać na ekranie, nie tylko w komunikacie.

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
  **To samo w dół: poza `getMaxRows()`** (nowa zakładka ma 1000 wierszy i sama nie rośnie od
  `setValues`). Historia dopisywała pod ostatni wpis i w dniu zapełnienia nocne czyszczenie
  stawałoby — dni przestałyby się zamykać. Od 1.1.2 `histRoom_` dokłada brakujące wiersze
  z formatem `@` (B51); **historii nie kasujemy** (decyzja właściciela — idzie do władz
  schroniska). `appendRow` (Psy, Zadania) rośnie sam. Zakładka Spacery dopisuje nowe spacery
  tak samo pod ostatni wiersz (`walkDay_().save`) — czyszczona co noc (na teście dopiero od
  2026-10-05, wcześniej bez wyzwalacza rosła bez końca).
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

**Wersje** (decyzja właściciela, zasada od 2026-10-08; wcześniejsze numery zostają, jak były): numer `1.X.Y`.
- **X — duże zmiany**: 1.1 → 1.2.
- **Y — drobne poprawki i błędy w tym, czego dotyczyło ostatnie X**: 1.2 → 1.2.1 → 1.2.2.
- **Informacja dla wolontariuszy — wtedy, gdy trzeba**, niezależnie od numeru. Wersja jej nie
  wyznacza (dawniej: X = ogłaszane, np. z filmikiem; Y = bez ogłaszania).
- Wersja jest w `package.json` (`version`, zapis semver: 1.1 = `1.1.0`) i w tabeli „Wersje"
  w README. Wydane: **1.0** = wdrożenie @16 = `0cc01e0`, **1.1** = @17 = `ee58018` (2026-09-28),
  **1.1.1** = @18 = `985dc1a` (merge `31721b5`, 2026-10-01), **1.1.2** = @19 = `e0df6c8`
  (merge `7546154`, 2026-10-03), **1.2** = @20 = `0ae939a` (merge `7cbd870`, 2026-10-08),
  **1.3** = @21 = `c68a141` (merge `6f38943`, 2026-10-09).
- **„Co nowego" (od 1.3.1) — każda wersja dopisuje wpis na górze `WHATS_NEW` w `Script.html`**, w gałęzi
  wydania, z datą wdrożenia przed `deploy:prod` (pusta data = niewydana, T6). Pisane dla wolontariuszy
  (decyzja właściciela): krótko, po ludzku, co widać na ekranie — „poprawa sortowania", nie jego reguły;
  zmiany w trybie edycji osobno w `admin` („W panelu admina" — nazwa od właściciela, było „prowadzącej"); poprawki techniczne zbiorczo albo wcale.

**Gałęzie i wydania — `main` = produkcja** (decyzja właściciela, od 2026-09-28):
- `main` zawsze odpowiada temu, co stoi na produkcji. Nic nie trafia na produkcję spoza `main`
  i nic nie trafia na `main` bez wdrożenia.
- Nowe rzeczy zbiera **gałąź wydania `release/<wersja>`** (np. `release/1.1.1`), odgałęziona od
  `main`; jej pierwszy commit podnosi `version` w `package.json`. Zmiany trafiają do niej (wprost
  albo z gałęzi `feature/…`); z niej idzie `npm run deploy:test` i sprawdzenie na telefonie.
- **Wydanie = PR `release/…` → `main`. Merge i od razu `npm run deploy:prod`** z aktualnego
  `main` (`git checkout main && git pull`). Merge bez wdrożenia albo wdrożenie z innej gałęzi
  rozjeżdża produkcję z `main`. Poza godziną czyszczenia (produkcja: 18:00, od 2026-10-03).
- Po wdrożeniu: wiersz w tabeli „Wersje" (README) i wpis w „Stan i rzeczy otwarte" (numer @N,
  commit, poprzednia wersja do cofnięcia), potem nowa gałąź wydania od `main`.
- **Gałęzie `release/…` zostają po wydaniu** — każda wskazuje to, co poszło na produkcję
  (`release/1.0` = @16, `release/1.1` = @17). Nic na nie nie commitujemy. Gałęzie `feature/…`
  po scaleniu kasujemy — historię trzyma `main`.
- Pilna poprawka produkcji: gałąź od `main` → PR do `main` → merge + `deploy:prod`, potem `main`
  wmergowany do bieżącej gałęzi wydania.
- Zmiana, która nie dotyka plików jadących do Apps Script (`npm run files`: README, CLAUDE.md,
  testy, `scripts/`), niczego na produkcji nie zmienia — wdrożenie byłoby puste.
- Push i wdrożenie nadal wyłącznie na wyraźne polecenie właściciela.

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
autoryzacji** przy pierwszym uruchomieniu. **1.2 dokłada uprawnienie połączenia z zewnętrzną
usługą** (`UrlFetchApp` w `Poll.gs`, bramka WhatsAppa): zaraz po `deploy:test` i po `deploy:prod`
uruchom z edytora **`authorizeWhatsApp()`** i zatwierdź zgodę. **Od 2025 edytor pyta tylko
o uprawnienia, których wykonanie faktycznie użyje** (granularna zgoda): `installTriggers()` ani
`sendWeeklyPoll()` z wyłączoną ankietą o tę zgodę NIE pytały (sprawdzone na teście 2026-10-05) —
dlatego osobna funkcja z `ScriptApp.requireScopes`. Bez zgody strona i `getData` działają normalnie;
zgody wymaga dopiero wywołanie bramki — panel mówi wtedy, co uruchomić (`GREEN_CONSENT`), a ankieta
nie wychodzi (wyzwalacz rzuca błędem — mail od Google). **Każde przyszłe nowe uprawnienie** —
ta sama pułapka: zgodę daje tylko funkcja, która go naprawdę użyje (albo `requireScopes`).

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
- **Do sprawdzenia na telefonie (1.1.2):** czy „Skopiuj e-mail z listą psów" kopiuje w prawdziwym
  iframie Apps Script (Android i iPhone). W jsdom i w Chromium na zwykłej stronie działa; gdy
  w iframie schowek będzie zablokowany, pojawi się pole do ręcznego skopiowania.
- **Do sprawdzenia na telefonie (1.2):** czy „✉️ Wyślij e-mail" otwiera pocztę z odbiorcą, tematem
  i treścią z prawdziwego iframu Apps Script — Android (Gmail i inna poczta), iPhone, przeglądarka
  WhatsAppa — i czy polskie znaki oraz łamania linii w treści dochodzą w całości. Link `mailto:`
  ze strony z ramką testy sprawdzają tylko co do kształtu; to, czy telefon go przepuści, widać
  dopiero na nim. Gdy nie przepuści — zostaje „Skopiuj treść". Do tego (review PR #5): na
  **największym prawdziwym dniu** czy w mailu jest cała lista (link to ~45 znaków na psa, 60 psów
  ≈ 2600 — część aplikacji przycina długie linki), i w WhatsAppie/Messengerze, gdy poczta się NIE
  otworzy — czy `target="_top"` nie zostawia strony błędu zamiast aplikacji (a jeśli tak — czy
  „wstecz" do niej wraca).
- **Ankieta tygodniowa (1.2) — do uruchomienia przez właściciela** (README, „Ankieta tygodniowa na
  WhatsAppie"): konto bota (osobny numer z WhatsApp Business — jest) w społeczności i w grupie
  „Grafik", instancja Green API połączona kodem QR, trzy właściwości skryptu (osobno test i produkcja),
  `authorizeWhatsApp()` z edytora po wdrożeniu (nowe uprawnienie), w panelu grupa / dzień / godzina /
  „wysyłaj co tydzień". Tokenów nie przekazuje się w czacie — tylko we właściwościach skryptu.
  **Sprawdzone na teście z prawdziwą bramką** (październik 2026): „Wyślij teraz" i wysyłka z wyzwalacza.
  Pierwsza próba wyzwalacza „nic nie wysłała", bo ankieta na ten tydzień poszła już ręcznie tego dnia
  (znacznik `pollSent` — tak ma być); po usunięciu znacznika poszła sama.
- **„Strona długo się ładowała i wisiała" (7–8.10.2026, dwie osoby z iPhone'ami w schronisku, dane
  komórkowe).** Dziennik wykonań produkcji z tygodnia (1.10–8.10, 1607 wywołań, przeczytany przez Claude
  in Chrome): mediana 1,7 s, 99% do ~4,5 s, ale pojedyncze przestoje Google bez związku z ruchem ani
  z przerwą w używaniu — `doGet` 37 s i 44 s (7.10 21:31, zgłoszenie z tej minuty), 12,7 s (8.10 11:00), `getData` 35 s,
  189 s i 360 s (limit czasu, 2.10), zapis 9–10 s. Zimny start odrzucony (po przerwach 60+ min max 4,4 s;
  test po wielu godzinach — 2,8 s). Dziennik Google nie mówi, który krok trwał, i nie widzi telefonu —
  stąd dziennik spowolnień (1.2). Kodem tego nie usuniemy; po następnym zgłoszeniu: Panel → „Dziennik
  spowolnień". **Do sprawdzenia po wdrożeniu na test:** czy wpis serwera ma nazwę akcji (`diagCaller_`
  czyta stos Apps Script — format ramek zgadnięty z V8; „?" = nie dało się odczytać, wpis i tak jest).
- **Dziennik spowolnień, pierwsze prawdziwe wpisy (produkcja, 8.10.2026 wieczorem; dziennik wykonań 2–9.10,
  1798 wywołań, przeczytany przez Claude in Chrome):** `getData` 67,5 s (18:35) i 36,5 s (18:47), w obu cały
  czas w kroku „psy" — pierwszy dostęp do arkusza. **W tych samych sekundach inne `getData` szły po 1,5 s**
  (to zastój pojedynczego wykonania po stronie Google, nie przeciążenie arkusza). Tydzień: 1253 `getData`,
  połowa do 1,7 s, 99% do 4,4 s, 5 ponad 8 s; `doGet` 251, 4 ponad 8 s. Wpis telefonu „155 s" (18:17–18:19)
  nie ma odpowiednika na serwerze — odczyt doszedł do Google dopiero po ~150 s (sieć/przeglądarka, komputer
  właściciela). Seria 100 `getData` co 6 s (18:45–18:55, ten sam komputer) — powrót do karty bez `readWaiting`,
  co przełączało widoczność karty, nie wiadomo. W 1.3: `T.readStale` 20 s, powrót do karty z bramką (S138).
  Otwarcie strony bez listy w środku (żeby utknięcie `doGet` nie trzymało strony) — rozważone, odrzucone przez
  właściciela: każde otwarcie byłoby o ~1,5 s dłuższe, a utknięcie zdarza się rzadko.
- **Wersja 1.3.1 w przygotowaniu** (gałąź `release/1.3.1`): „Co nowego?" przy nazwie aplikacji i pasek „Nowa
  wersja". Bez zmian w arkuszu i na serwerze (tylko `Index`/`Styles`/`Script`). **Przed `deploy:prod`: data
  wdrożenia w pierwszym wpisie `WHATS_NEW`.** Na 320 px kapsułka schodzi pod „Spacery" (nic nie wystaje).
- **Produkcja: wersja 1.3 (PR #6, `c68a141`, merge `6f38943`) od 2026-10-09, 15:21 — wdrożenie @21**
  (test: @30, ten sam `main`, 15:19). Psy innych grup — dwie listy, grupa psa w panelu, „Bierze G7"; `T.readStale`
  20 s i bramka powrotu do karty; lista dnia do prowadzącej na WhatsAppie; lista grup bota bez dwóch „G13" (README,
  changelog 1.3). Na polecenie właściciela test i produkcja jednym ciągiem z `main`, bez sprawdzenia @30 na
  telefonie (poprzednie @29 = wszystko poza poprawką kolumny O bez nagłówka). Arkusz: kolumna `grupa_psa` dokłada
  się sama przy pierwszym psie innej grupy, `migrate()` niepotrzebne; nowych uprawnień i wyzwalaczy brak.
  **Kolumna O w Psy produkcji miała być przed wdrożeniem cała pusta** (nagłówek i komórki — sprawdza właściciel;
  Claude jej nie oglądał). Czyjaś kolumna tam — z nagłówkiem albo z samymi wpisami — nie przeniesie psów i nie
  zostanie nadpisana, ale grupa psa się nie zapisze (panel: „Kolumna 15 (O) … zajęta"). Nocne czyszczenie kolumny O
  nie dotyka (`closeDogs_` kończy na `notatka_do`; do review pisało do 15 i zamieniało formuły w stałe).
  **Po wdrożeniu do sprawdzenia:** na telefonie „v1.3", „Bierze G7" → „✓ G7" → „Cofnij", „Pobierz grupy" (jakie
  dopiski dostają oba „G13" — bramka podaje szczegóły społeczności tylko administratorom), „Pobierz kontakty",
  „Wyślij listę z …"; po pierwszym czyszczeniu (18:xx) Wykonania — czy `endOfDay` przeszedł — i, gdy lista dnia
  włączona, czy doszła (na teście wysyłanie po czyszczeniu wyłączone, wyżej). Lista dnia na produkcji potrzebuje
  tego samego co ankieta: właściwości `greenApi*` i `authorizeWhatsApp()` w edytorze produkcji. **Limit bramki
  w październiku 2026 wyczerpany** (9.10: grupa próbna, „Grafik", właściciel) — prowadząca do 1.11 dostałaby 466;
  do tego czasu kontakt listy dnia = właściciel albo lista wyłączona. Wiadomość do wolontariuszy (wydanie X):
  lista „Psy innych grup", „Bierze G7" / „Cofnij".
  Poprzednia to 1.2 = @20 = `0ae939a` (gałąź `release/1.2`) — do niej się cofa zwykłym `deploy:prod` z tej gałęzi;
  kolumny `grupa_psa` 1.2 nie czyta, wiersze `team` w Spacery pokaże jako odbyte „✓ G7", listy dnia przestaną iść.
- **Decyzje właściciela z review PR #6 — nie zmieniać bez pytania:** „Bierze G7" zostaje jednym stuknięciem,
  tej samej wielkości co „Zarezerwuj", bez pytania (pomyłkę naprawia „Cofnij"). Przegląd zauważył też: nazwa
  grupy przy limicie 20 znaków łamie przyciski na 360 px na dwie linijki (nic nie wystaje); `lastHistDay_`
  czyta całą kolumnę dat Historii przy każdym otwarciu Panelu — do zmierzenia, gdy Historia urośnie.
- **Decyzje właściciela z review PR #5 — nie zmieniać bez pytania:** `checkPin` **bez limitu prób**
  (limit pozwoliłby każdemu z linkiem zablokować prowadzącą; ochrona to dłuższy PIN we właściwości
  `pin`); numer psa (`id`) może wrócić do obiegu po usunięciu psa o najwyższym numerze (`nextId_`) —
  wąski przypadek, `removeDog` zamyka spacery usuniętego psa, zostaje.
- **Do sprawdzenia na iPhonie:** po konflikcie rezerwacji pole imienia wraca z wpisanym tekstem
  (`putEntry`), ale fokus przychodzi z odpowiedzi serwera, nie ze stuknięcia — iOS raczej nie
  otworzy wtedy klawiatury sam. Tekst zostaje, wystarczy stuknąć w pole. W jsdom tego nie widać.
- Linijka `1. spacer: Ania · 10:15` zniknęła razem ze starym modelem — pies dwuspacerowy ma
  pola 1/2 i 2/2, a odbyte pole pokazuje „✓ Ania" bez godziny (jak kafelek „wyprowadzony").
- Wersja 1.2 (PR #5, `0ae939a`, merge `7cbd870`) od 2026-10-08, 17:12 — wdrożenie @20.
  Zarządzanie aplikacją: ustawienia maila w panelu, ankieta tygodniowa na WhatsAppie, dziennik
  spowolnień, przegląd kodu (README, changelog 1.2). Arkusz bez nowych kolumn; nowe właściwości powstają
  przy pierwszym zapisie. PR #5 na GitHubie ma stan „Closed", nie „Merged" — GitHub długo pokazywał w nim
  stary commit, więc merge poszedł lokalnie (`7cbd870`, ta sama treść co `release/1.2`), a PR zamknął się
  sam po pushu `main`. **Po wdrożeniu, do zrobienia przez właściciela:** `authorizeWhatsApp()` w edytorze
  produkcji (dopiero gdy ankieta ma działać na produkcji — strona i reszta działają bez tego), po 18:00
  rzut oka w Wykonania, czy `endOfDay` przeszedł na 1.2; ankieta na produkcji — właściwości `greenApi*`,
  informacja dla grupy, że nowe konto to automat przez zewnętrzną usługę, wyłączenie w konsoli Green API
  powiadomień o wiadomościach przychodzących, najpierw grupa próbna i „Wyślij teraz", potem „Grafik".
  Poprzednia to 1.1.2 = @19 = `e0df6c8` (gałąź `release/1.1.2`) — do niej się cofa zwykłym `deploy:prod`
  z tej gałęzi; wyzwalacz `sendWeeklyPoll` (jeśli założony) usunąć ręcznie, otwarte karty przeładować.
- Wersja 1.1.2 (PR #4, `e0df6c8`, merge `7546154`) od 2026-10-03, 17:58 — wdrożenie
  @19. Pełna Historia dostaje wiersze, e-mail z listą psów dla schroniska (przycisk w minionym
  dniu, treść w panelu). Arkusz bez nowych kolumn; właściwość `mailTemplate` powstaje dopiero przy
  zapisie z panelu. **Czyszczenie na produkcji jest od 2026-10-03 o 18:00** (ustawione w panelu,
  wcześniej 19:00) — okno bez wdrożeń to teraz 18:00–18:59. Poprzednia to 1.1.1 = @18 = `985dc1a`
  (gałąź `release/1.1.1`) — do niej się cofa zwykłym `deploy:prod` z tej gałęzi; `mailTemplate`
  zostaje wtedy nieużywana, a Historia działa jak dotąd, do zapełnienia zakładki.
  Do sprawdzenia na telefonie po wydaniu: kopiowanie maila w prawdziwym iframie (Android, iPhone,
  przeglądarka WhatsAppa) — po „Skopiowano" naprawdę wkleić w poczcie.
- Wersja 1.1.1 (PR #3, `985dc1a`, merge `31721b5`) od 2026-10-01, 22:50 — wdrożenie
  @18. Weszła pilnie przez numer psa w historii (zrzuty dla władz schroniska od 2.10). Pierwsze
  nocne czyszczenie na 1.1.1 (2.10, 19:00) dokłada do Historii kolumny `grupa` i `identyfikator`;
  dni do 1.10 włącznie mają numer psa tylko z katalogu po imieniu (jednoznacznym). Poprzednia
  to 1.1 = @17 = `ee58018` (gałąź `release/1.1`) — do niej się cofa zwykłym `deploy:prod` z tej
  gałęzi; dodatkowych kolumn Historii nie czyta i nie psuje.
- Wersja 1.1 (PR #2, `ee58018`) od 2026-09-28, 20:41 — wdrożenie @17. Poprzednia
  to 1.0 = @16 = `0cc01e0` (sprzed dat, gałąź `release/1.0`) — do niej się cofa, według README
  („Projekt bez wersji z datami").
  Zakładka Spacery powstała przy wdrożeniu (import ze starych kolumn Psy — po czyszczeniu o 19:00
  pustych). Czyszczenie na produkcji było wtedy o 19:00 (od 2026-10-03 — 18:00). Przed wdrożeniem
  zrobiona próba generalna: kod @16 i nowy na jednym arkuszu (dzień, noc, cofnięcie, ponowne
  wdrożenie) oraz stara karta @16 z nowym serwerem — wszystko zielone.
- **Projekt testowy ma wyzwalacz `endOfDay` od 2026-10-05** — założył go `installTriggers()`
  uruchomione z edytora testu przy konfiguracji ankiety; właściciel zdecydował, że zostaje (review
  PR #5, runda 2). Wcześniej go nie było (wyzwalacze nie kopiują się z projektem): nic nie trafiało
  do Historii, a Spacery puchło — pierwsze czyszczenie (5.10, godzina resetu testu) domyka wszystkie
  zaległe dni naraz; sprawdzić w Wykonaniach i w Historii testu. Stary układ Spacery testu przepisał
  się przy @8 jeszcze bez kopii — jest tylko w historii wersji arkusza.

## Jak ze mną pracować

- Nie dokładaj funkcji, o które nie prosiłem. Jeśli widzisz przy okazji realny błąd,
  powiedz o nim — decyzję o naprawie podejmę sam.
- Zanim napiszesz kod, sprawdź istniejące rozwiązanie w repo. Sporo rzeczy, które
  wyglądają na nadmiarowe, jest wynikiem konkretnego bugu z listy wyżej.
- Testy do każdej zmiany, uruchomione, zielone.
- Mów wprost, gdy coś jest złym pomysłem.

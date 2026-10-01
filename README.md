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
| `WebApp.gs` | `doGet()`, `include()`, API odczytu (`getData`, `getHistoryDays`, `getHistory`, `checkPin`) |
| `Dogs.gs` | katalog psów + dzień psa (zakładka Spacery) + akcje wolontariuszy i prowadzącej |
| `Tasks.gs` | zadania na dziś: odczyt + akcje |
| `History.gs` | minione dni do podglądu + nocne czyszczenie `endOfDay()` (domyka dni sprzed bieżącego) |
| `Index.html` | szkielet strony (składa Styles + Script) |
| `Styles.html` | style |
| `Script.html` | logika interfejsu |
| `tests/` | harness jsdom (`scenarios`…`scenarios14`) + harness backendu na atrapie arkusza z przestawialnym zegarem (`backend.js`) + konfiguracja wdrożeń (`tooling.js`) |
| `SORTING.md` | model spacerów i kafelków, reguły kolejności listy z przykładami — czytaj przed zmianą sortowania |

Zakładki arkusza (tworzy je `setup()`):
- **Psy** — katalog: `id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer | notatka | spacery | kto1 | godzina1 | notatka_do`.
  Kolumny `status`, `kto`, `godzina`, `kto1`, `godzina1` to pozostałość po modelu jednego dnia — od wprowadzenia dat są nieużywane (patrz niżej).
- **Spacery** — stan pojedynczego spaceru: `data | pies_id | spacer | status | kto | godzina | grupa`. Wiersz na (dzień, pies, numer spaceru); brak wiersza = ten spacer jest wolny. Pies na dwa spacery ma dwa niezależne spacery 1/2 i 2/2 — każdy z własną rezerwacją, osobą i grupą. Trzyma tylko dni otwarte. Zakładkę w starym układzie (wiersz na psa, drugi spacer w `kto1`/`godzina1`) aplikacja przepisuje sama przy pierwszym dostępie.
- **Historia** — zamknięte dni: `data | pies | kto | godzina`
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
4. Sprawdź, czy wszystko się zgadza: `npm run deployments` musi pokazać wdrożenie
   z identyfikatorem wpisanym w `deploy:prod` w `package.json` (ten sam ciąg, co w linku do aplikacji).

**Gałąź `main` = produkcja.** Nowe rzeczy zbiera gałąź wydania `release/<wersja>` odgałęziona
od `main`; z niej idzie wdrożenie na test. Wydanie to PR `release/…` → `main`, a **merge oznacza
od razu wdrożenie na produkcję** z aktualnego `main` — tak, żeby na produkcji stało zawsze
dokładnie to, co na `main`. Gałęzie `release/…` zostają po wydaniu jako ślad tego, co poszło
na produkcję.

### Wersje

Numer `1.X.Y`: **X** rośnie przy wydaniu z poważnymi nowymi funkcjami, o którym wolontariusze
dostają wiadomość; **Y** — przy drobnych zmianach w tle. Wersja jest też w `package.json`.

| wersja | co | gałąź | wdrożenie |
|---|---|---|---|
| 1.0 | zapisy na dziś, Historia, dwa spacery, notatki z terminem, PIN poza kodem, środowisko testowe | `release/1.0` (`0cc01e0`) | @16 |
| 1.1 | daty i rezerwacje z wyprzedzeniem, spacery 1/2 i 2/2, spacery grupowe, kolory wolontariuszy, osłona stuknięć, dymek zapisu | `release/1.1` (`ee58018`) = `main` | @17, 2026-09-28 |
| 1.1.1 | w przygotowaniu: zarezerwowane psy jednej osoby obok siebie na liście | `release/1.1.1` | — |

**Potem, przy każdej zmianie** — najpierw na test (niżej: *Środowisko testowe*), potem:

```bash
npm run deploy:prod
```

To jedno polecenie: uruchamia **wszystkie testy**, wysyła pliki, podbija wersję *istniejącego*
wdrożenia — link do aplikacji zostaje ten sam — i na koniec **sam otwiera aplikację**
(`scripts/warmup.js`), tak jakby ktoś kliknął link. Czerwony test przerywa całość, więc zepsuty
kod nie ma jak wyjechać do wolontariuszy. Jeśli otwarcie się nie uda, polecenie kończy się
komunikatem „Otwórz link ręcznie TERAZ" — zrób to przed godziną czyszczenia (dlaczego: niżej,
*Przejście ze starego modelu*). Wersja, która zmienia układ arkusza, wymaga wcześniej kopii
arkusza — patrz *Cofnięcie wdrożenia*.

Identyfikatory obu wdrożeń są wpisane na stałe w `package.json` — to świadoma decyzja:
nie ma argumentu, który dałoby się pomylić. Nie są tajemnicą, produkcyjny jest po prostu
częścią linku, który dostają wolontariusze. Celowo **nie ma** gołego `npm run deploy` —
każde wdrożenie musi nazwać swoje środowisko, a `tests/tooling.js` pilnuje, żeby komendy
testowe nie miały jak dotknąć produkcji i odwrotnie.

Pomocnicze: `npm run files` (co dokładnie poleci na serwer — warto zerknąć po dodaniu plików),
`npm run push` (sama wysyłka, bez nowej wersji — zmiany widać wtedy tylko w edytorze, **nie** na linku),
`npm run deployments` (lista wdrożeń z numerami wersji — po wdrożeniu numer przy Twoim ID musi wzrosnąć).

Czego clasp **nie** robi: nie uruchamia `setup()`, `migrate()` ani `installTriggers()`.
Te odpalasz nadal ręcznie z edytora, i tylko wtedy, gdy zmieniła się struktura arkusza
albo godzina resetu.

**Uwaga:** `clasp deploy` bez `-i`/`redeploy` tworzy **nowe** wdrożenie z **nowym adresem** —
stary link wolontariuszy przestałby dostawać zmiany. Dlatego `deploy:prod` i `deploy:test`
używają `redeploy` z konkretnym identyfikatorem.

### Windows / PowerShell

`node` to plik `.exe` i działa od razu, ale `npm` i `npx` w PowerShellu są shimami `.ps1` —
przy domyślnej polityce `Restricted` odbijają się o „running scripts is disabled on this system".
Dwa wyjścia:

- bez zmian w systemie: wołaj `npm.cmd` / `npx.cmd` (shim `.ps1` zostaje ominięty),
- na stałe: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` — skrypty utworzone lokalnie
  ruszają, ściągnięte z sieci nadal wymagają podpisu; bez uprawnień administratora.

Terminal otwarty przed instalacją Node nie zna jeszcze nowego `PATH` — wystarczy nowe okno.

## Środowisko testowe

Dwa osobne projekty Apps Script, każdy z własnym arkuszem, własnym linkiem i własnym PIN-em.
Kod jest jeden — w tym repozytorium — i jedzie do obu tą samą drogą. Cokolwiek zrobisz
w teście (rezerwacje, spacery, dodawanie i kasowanie psów), nie dotyka listy, z której
w tej chwili korzystają wolontariusze.

### Jak poznasz, gdzie jesteś

Aplikacja, która **nie jest** produkcją, dokleja u góry pasiasty pasek „Środowisko testowe".
Decyduje o tym właściwość skryptu `env`: pasek gaśnie **wyłącznie** przy wartości `prod`.

Kierunek jest celowo odwrotny do odruchu. Projekt testowy powstaje przez skopiowanie
produkcyjnego i nie ma własnych właściwości — gdyby to test musiał się oznaczać,
zapomnienie dałoby środowisko testowe wyglądające jak produkcja, a wtedy ktoś kasuje psa
„na teście", który testem nie jest. Przy tym kierunku zapomnienie daje pasek ostrzegawczy
na produkcji: widać natychmiast i nikomu to nie szkodzi.

> **Zanim wdrożysz tę zmianę na produkcję**, dodaj tam właściwość `env` = `prod`.
> Inaczej wolontariusze zobaczą na prawdziwej liście pasek „środowisko testowe".

### Założenie środowiska testowego (raz)

1. Google Drive → arkusz produkcyjny → **Utwórz kopię**, nazwij np. „G13 Spacery — TEST".
   Kopia zabiera ze sobą skrypt (dostaje własny identyfikator) razem z danymi, więc
   testujesz na realistycznej liście psów.
2. W kopii: **Rozszerzenia → Apps Script** → *Ustawienia projektu* → skopiuj
   **Identyfikator skryptu** i zapisz w `.clasp.test.json` w katalogu projektu
   (plik jest w `.gitignore`, tak samo jak produkcyjny):
   ```json
   { "scriptId": "IDENTYFIKATOR_SKRYPTU_TESTOWEGO", "rootDir": "." }
   ```
3. Tamże → **Właściwości skryptu**:
   - dodaj `pin` (może, a nawet powinien być inny niż produkcyjny),
   - **sprawdź, czy nie ma właściwości `env`** — jeśli przeniosła się wraz z kopią, usuń ją.
     To ona decyduje o pasku, więc nie zakładaj, zobacz.
4. **Wdróż → Nowe wdrożenie → Aplikacja internetowa**, „wykonaj jako: ja", „dostęp: wszyscy".
   Powstały link to Twój adres testowy; identyfikator wdrożenia pokaże też
   `npm run deployments:test`.
5. **Nie uruchamiaj `installTriggers()` w projekcie testowym.** Inaczej testowa lista
   wyzeruje się wieczorem w środku testów. Nocny reset sprawdzasz, uruchamiając `endOfDay()`
   ręcznie z edytora — jego logika jest zresztą pokryta testami backendu przy zamrożonym zegarze.

Kopia arkusza **nie zabiera** wyzwalaczy ani wdrożeń. Co do właściwości skryptu — nie zgaduj,
zajrzyj (punkt 3).

### Codzienna praca

```bash
npm run deploy:test
```

Testy, wysyłka plików, nowa wersja wdrożenia testowego. Klikasz w link testowy na telefonie
i sprawdzasz na żywo, na prawdziwym urządzeniu i prawdziwym zasięgu.

```bash
npm run deploy:prod
```

To samo na produkcji, dopiero gdy test wypadł dobrze. Oba wdrożenia są wersjonowane
osobno, więc produkcja nie zmienia się ani o krok, dopóki sam jej nie ruszysz.

Na nowej maszynie wystarczy odtworzyć dwa pliki projektu (`.clasp.json`, `.clasp.test.json` —
oba poza repo) i zalogować clasp; identyfikatory wdrożeń są już w `package.json`.

Pomocnicze dla testu: `npm run files:test` (co poleci na serwer), `npm run push:test`
(sama wysyłka, bez nowej wersji), `npm run deployments:test` (lista wdrożeń z numerami wersji).

## Migracja istniejącego arkusza

Masz arkusz z danymi ze starszej wersji? Zamiast `setup()` uruchom raz **`migrate()`** — dołoży brakujące kolumny/zakładki i formaty tekstowe, danych nie kasuje. Potem `installTriggers()`.

## Architektura zapisu (wydajność)

Interfejs jest **optymistyczny**: kliknięcie zmienia widok natychmiast, a zapis leci w tle. Klient trzyma **kolejkę zapisów z torami**: każdy pies i każde zadanie ma własny tor, na którym zapisy idą po kolei, ale **różne psy jadą równolegle** (sufit: 4 naraz). Dzięki temu rezerwacja trzech psów pod rząd to jeden przelot, a nie trzy ustawione w szereg. Watchdog **12 s**, więc zaginiona odpowiedź nigdy nie zawiesza aplikacji — wymusza tylko dosynchronizowanie. Akcje wolontariuszy zwracają z serwera **tylko zmieniony wiersz** (`{dog}` / `{ok}`), nie pełny stan trzech zakładek; pełny stan dojeżdża z okresowym odświeżaniem (15 s) i po akcjach prowadzącej. Konflikt rezerwacji (ktoś kliknął pierwszy) jest wykrywany po odpowiedzi serwera i pokazuje toast + faktyczny stan.

**Samoleczenie (odporność na zaginione odpowiedzi):** `google.script.run` na telefonie potrafi nigdy nie oddzwonić (uśpiona karta, mrugnięcie sieci). Warstwa niezawodności: watchdog **12 s** na każdy zapis; nieudany/zaginiony zapis idempotentny (rezerwacja, spacer, zwolnienie, odhaczenie, edycja, usunięcie) jest **raz automatycznie ponawiany**; wykrywanie zawieszenia działa nie tylko z timera (co 3 s), ale też przy **każdym dotknięciu ekranu** i powrocie do karty — bo przeglądarki mobilne usypiają timery w tle. Po definitywnej porażce stan jest przywracany ratunkowym `getData`. Dodatkowo: `render()` i obsługa kliknięć są opakowane w try/catch z samonaprawą (zamrożony interfejs jest niemożliwy), a wyjątek w reconcile nie może zablokować kolejki (tor jest zwalniany przed jakąkolwiek logiką odpowiedzi). Całość pokryta testami jsdom: 38 scenariuszy (w tym dokładnie „wyprowadzony → Cofnij → Zarezerwuj” z gubioną odpowiedzią) + fuzz 20 przebiegów losowych akcji z losowo gubionymi/opóźnianymi odpowiedziami.

**Wygaszanie starych odpowiedzi**: każdy pies/zadanie ma licznik zapisów w drodze (`pendingKeys`). Odpowiedź serwera jest stosowana tylko wtedy, gdy dotyczy **ostatniej** operacji dla danego bytu — starsza odpowiedź (np. na „zarezerwuj”, gdy lokalnie już kliknięto „zwolnij”) jest ignorowana. Dzięki temu przy szybkich sekwencjach widok nigdy nie „przeskakuje” wstecz. Dopóki byt ma zapis w drodze, przy jego nazwie kręci się dyskretny wskaźnik; pełny stan z akcji prowadzącej również czeka z nadpisaniem, aż kolejka się opróżni.

**Dymek „Zapisuję…" / „Aktualizuję…"** — pływający na dole ekranu (tam, gdzie komunikaty; komunikat, który przyjdzie w tym czasie, staje nad dymkiem), z animowanymi kropkami. „Zapisuję…" świeci, dopóki jakikolwiek zapis jest w drodze (dawny szary napis „zapisuje…" w nagłówku był w słońcu niewidoczny). „Aktualizuję…" zapowiada, że lista zaraz się przestawi — pojawia się na chwilę (0,8 s) PRZED ruchem, a każde dotknięcie ekranu ruch odwołuje i gasi dymek — przy ciągłej pracy „Aktualizuję…" więc się nie pokazuje, dopiero gdy ręce znieruchomieją. Dymek trzyma się co najmniej 0,6 s, żeby nie mrugał.

**Osłona stuknięć** — zgłoszenie z terenu: „kliknąłem w jednego psa, a zapisało się na innym". Przyczyna nie była w wolnym zapisie, tylko w liście, która przestawiała się z zegara (4 s ciszy, odświeżenie co 15 s) akurat wtedy, gdy palec już leciał, oraz w podwójnym stuknięciu trafiającym w przycisk, który właśnie pojawił się w tym samym miejscu. Teraz stuknięcie w rezerwację / „OK" / spacer / zwolnienie nie liczy się, jeśli lista przestawiła się pod palcem (w trakcie stuknięcia albo do 0,5 s przed nim) albo w tym czasie zmienił się stuknięty kafelek (ktoś inny, z innego telefonu) — wtedy wolontariusz dostaje komunikat i stuka jeszcze raz. Własne podwójne stuknięcie jest ignorowane po cichu. Szczegóły: `SORTING.md`, rozdział 8.

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

## Dni: ← data →

Zamiast zakładek „Dziś" i „Historia" jest pasek `← 24 września 2026 →`. Strzałki prowadzą
swobodnie w obie strony, a dotknięcie daty wraca do bieżącego dnia.

- **Bieżący dzień** — jak dotąd: rezerwacje, spacery, zadania.
- **Dni przyszłe** — rezerwacje z wyprzedzeniem, dowolnie daleko. Tylko rezerwacja
  i zwolnienie; spacer odhacza się w dniu spaceru. Wszystkie dni otwarte przychodzą z serwera
  jednym pobraniem, więc strzałka w przód nie czeka na sieć.
- **Dni minione** — tylko podgląd tego, co faktycznie się odbyło (zastępuje zakładkę Historia).
  Przychodzą blokami po dwa tygodnie, więc kolejne dni wstecz są już w pamięci.

**Dzień rezerwacyjny zaczyna się o godzinie czyszczenia, nie o północy.** Przy resecie
o 20:00: do 19:59 bieżący dzień to dziś, od 20:00 — jutro. Dzięki temu przed czyszczeniem
można jeszcze rezerwować na dzień, który trwa, a po nim aplikacja od razu pracuje na
następnym. Kto patrzył na bieżący dzień, zostaje przeniesiony sam; kto przeglądał sobotę,
zostaje na sobocie.

Przy resecie **porannym** ta sama reguła byłaby błędna — reset o 6:00 kazałby przez cały dzień
rezerwować na jutro. Granicą jest więc południe: reset przed 12:00 zamyka dzień **poprzedni**
(przed resetem — wczoraj, po nim — dziś). `businessDate_()` w `Settings.gs`.

**Notatki na właściwych dniach:** notatka bez terminu widnieje tylko na bieżącym dniu
(„zdjęcia o 12:00" nie dotyczy soboty), notatka z terminem — na każdym dniu do terminu włącznie,
notatka „nigdy nie znika" — na każdym dniu. W arkuszu notatka „bez terminu" ma termin równy
dniowi rezerwacyjnemu, w którym ją zapisano: dodana o 20:10, gdy lista pracuje już na jutrze,
dożyje jutra, a nie zniknie przy czyszczeniu o 20:30. Na ekranie dalej wygląda na „bez terminu"
(bez odznaki, puste pole daty w edycji).

**Zadania na właściwych dniach:** na bieżącym dniu widać zadania, których dzień już nadszedł
(nieodhaczone przechodzą dalej z odznaką „od N dni"); na przyszłym — tylko zaplanowane dokładnie
na niego, do podejrzenia, bo odhacza się je w ich dniu; na minionym — żadnych.

**Dzień zamknął się pod palcami:** ktoś wpisuje imię o 19:59, a „OK" stuka o 20:00. Zamiast
cichego braku reakcji dostaje komunikat „Ten dzień jest już zamknięty" i przejście na nowy dzień.
Serwer odrzuca każdą zmianę na dniu minionym, więc nie ma też sposobu, żeby coś po cichu
trafiło pod złą datę.

## Jak to leży w arkuszu

Zakładka **Psy** to katalog — kim jest pies. Stan konkretnego dnia żyje w zakładce
**Spacery**: jeden wiersz na spacer (dzień, pies, numer spaceru). Rezerwacja na sobotę to po
prostu wiersz z sobotnią datą; rezerwacja popołudniowego spaceru psa dwuspacerowego — wiersz
ze `spacer = 2`.

**Przepisanie starego układu Spacery dzieje się samo** (wersja z wierszem na psa i drugim
spacerem w `kto1`/`godzina1`): przy pierwszym dostępie wiersz z odbytym pierwszym spacerem
rozpada się na spacer 1/2 (odbyty, z tą samą osobą i godziną) i 2/2 (stan bieżący), a grupa
zostaje przy spacerze, który trwa. Kolumny dostają format tekstowy przed zapisem. Pilnuje tego
właściwość skryptu `walksLayout` — sprawdzenie arkusza odbywa się raz, a nie przy każdym żądaniu.
Tuż przed przepisaniem aplikacja kopiuje zakładkę do **`Spacery (stary układ)`**.

**Nocne czyszczenie niczego nie zeruje** — kolejny dzień ma własne, puste wiersze, a zmiana
dnia na liście dzieje się punktualnie sama. Czyszczenie tylko **domyka** dni sprzed bieżącego:
ich odbyte spacery idą do Historii pod datą zapisaną w wierszu (koniec zgadywania, który dzień
się właśnie skończył), wiersze znikają ze Spacery, notatki bez terminu wygasają, odhaczone
zadania też. Jest bezpieczne o każdej porze i dowolną liczbę razy: dzień, który trwa, zostaje
nietknięty (także jego notatki), a zaległe dni (wyzwalacz nie zadziałał) domykają się przy
najbliższym uruchomieniu, w kolejności dat. Wyjątek: notatki zapisane bez terminu jeszcze przed
tą wersją (pusty `notatka_do`) znikają przy każdym uruchomieniu, jak dawniej.

**Przejście ze starego modelu dzieje się samo.** Przy pierwszym dostępie po wdrożeniu aplikacja
zakłada zakładkę Spacery i przenosi do niej dzisiejszy stan ze starych kolumn Psy — raz
(pilnuje tego właściwość skryptu `walksImported`, więc skasowana kiedyś zakładka nie wskrzesi
tygodniowego stanu). Starych kolumn nie czyścimy: gdyby trzeba było cofnąć wdrożenie, poprzednia
wersja znów z nich skorzysta.

Stan dostaje datę dnia, który trwa w chwili tego pierwszego dostępu — dlatego ważne jest,
**kiedy** on nastąpi. Dostępem jest każde otwarcie linku, ale też sam nocny wyzwalacz: gdyby po
wdrożeniu nikt nie otworzył aplikacji, pierwszy dostęp przyszedłby dopiero przy czyszczeniu, po
przełomie dnia. Dlatego:
- `npm run deploy:prod` otwiera aplikację sam, zaraz po wdrożeniu — przejście dzieje się wtedy;
- jeśli mimo to pierwszy dostęp wypadnie w godzinie czyszczenia, stan trafia pod dzień, który
  właśnie się skończył (spacery idą do Historii, lista jutra zostaje czysta);
- **nie wdrażaj w samej godzinie czyszczenia** (np. 20:00–20:59) — stan zmieszany ze starym
  czyszczeniem nie ma wtedy jednej dobrej daty.

Karty otwarte jeszcze przed wdrożeniem działają dalej: akcja bez daty trafia na bieżący dzień,
akcja bez numeru spaceru — w spacer, który właśnie trwa (rezerwacja: pierwszy wolny; spacer:
pierwszy nieodbyty; zwolnienie: ostatni obsadzony), a `getData` i odpowiedzi akcji wciąż niosą
stan psa w starym kształcie (`status`/`kto`/`kto1`).

### Cofnięcie wdrożenia

Przepisanie zakładki Spacery działa w jedną stronę. Poprzednia wersja kodu nowego układu nie
przeczyta: statusy i godziny wypadają jej w innych kolumnach, rezerwacje znikają, a w polu „kto"
pojawiają się liczby.

**Przed `npm run deploy:prod` zrób kopię całego arkusza** (*Plik → Utwórz kopię*) — niezależnie
od kopii, którą robi aplikacja.

Kroki cofnięcia rób **w podanej kolejności, jeden zaraz po drugim** i nie w godzinie czyszczenia.
Wdrożenie poprzedniej wersji: w Apps Script *Wdróż → Zarządzaj wdrożeniami → edycja → wersja*,
albo `git checkout` poprzedniego commita i `npm run deploy:*`.

**Projekt, który miał już wersję z datami** (aplikacja zrobiła kopię `Spacery (stary układ)`):

1. **Najpierw wdroż poprzednią wersję kodu, dopiero potem ruszaj zakładki.** Odwrotnie nowa wersja
   przy pierwszym odświeżeniu z dowolnego telefonu zobaczy pod nazwą `Spacery` zakładkę o innym id
   i od razu przepisze ją z powrotem na nowy układ (z kolejną kopią) — cofnięcie anuluje się po
   cichu. Między krokiem 1 a 2 stara wersja widzi nowy układ jako śmieci, dlatego krok 2 od razu.
2. W arkuszu zmień nazwę zakładki `Spacery` na np. `Spacery (nowy układ)`, a `Spacery (stary układ)`
   na `Spacery`.
3. **Z przywróconej `Spacery` usuń wiersze z datą wcześniejszą niż bieżący dzień listy.** Kopia
   powstała w dniu wdrożenia, a ten dzień (i kolejne) domknęła już nowa wersja — są w Historii.
   Stara wersja domknęłaby je drugi raz i w Historii byłyby podwójne wpisy. Wiersze dnia bieżącego
   i przyszłych zostają.

Co wolontariusze zapisali na nowej wersji, zostaje tylko w odłożonej zakładce `Spacery (nowy
układ)` — w razie potrzeby trzeba to przepisać ręcznie. Ponowne wdrożenie nowej wersji przepisze
przywróconą zakładkę od nowa, znów z kopią: znacznik `walksLayout` pamięta id zakładki (`2:<id>`),
więc podmiana zakładki nie przejdzie niezauważona i nowa wersja nie przeczyta starego układu jak nowego.

**Projekt bez wersji z datami** (produkcja przed pierwszym wdrożeniem dat — nie ma zakładki Spacery):
nowa wersja zakłada zakładkę od razu w nowym układzie, kopii nie ma czego robić. Poprzednia wersja
czyta stan dnia ze starych kolumn Psy (`status`, `kto`, `godzina`, `kto1`, `godzina1`), których nowa
nie rusza — zostaje w nich stan z chwili wdrożenia.

1. Wdroż poprzednią wersję kodu.
2. **Jeśli od wdrożenia minęła choć jedna noc, wyczyść w Psy te pięć kolumn.** Dzień wdrożenia
   domknęła już nowa wersja i jest w Historii; stara pokazałaby te psy jako wyprowadzone, a przy
   najbliższym czyszczeniu zapisałaby ich spacery do Historii drugi raz — pod datą tamtej nocy.
   Cofając tego samego dnia, zostaw je: to wtedy wciąż stan bieżącego dnia (bez zmian zrobionych
   na nowej wersji — te są tylko w zakładce Spacery, której stara wersja nie czyta).
3. **Ponowne wdrożenie nowej wersji po takim cofnięciu:** najpierw zmień nazwę zakładki `Spacery`
   (np. na `Spacery (odłożona)`) i usuń właściwość skryptu `walksImported`. Nowa wersja założy
   wtedy świeżą zakładkę i przejmie stan dnia ze starych kolumn Psy jak za pierwszym razem. Bez
   tego zostanie przy swojej zakładce sprzed cofnięcia, a to, co wolontariusze zapisali na starej
   wersji od cofnięcia, nie przejdzie. Też poza godziną czyszczenia.

## Godzina czyszczenia listy

Domyślnie 22:00 (`DEFAULT_RESET_HOUR` w `Config.gs`). Prowadząca zmienia ją bez ruszania kodu: **⚙️ + PIN → zakładka „Panel" → Ustawienia**. Wybór zapisuje się w Script Properties i od razu **przekłada wyzwalacz** `endOfDay` (`setResetHour()` w `Settings.gs`).

Trzy rzeczy warto wiedzieć:

- Godzina czyszczenia to **granica dnia rezerwacyjnego** (patrz wyżej) — zmienia dzień na liście punktualnie.
- `atHour(h)` w Apps Script to **okno h:00–h:59**, nie punkt czasowy — domknięcie dnia i przeniesienie do Historii dzieje się gdzieś w tej godzinie.
- Ustawienie godziny, która **dziś już minęła**, od razu przełącza listę na kolejny dzień.
- Zmiana, która **cofnęłaby** dzień na liście, jest odrzucana — np. z 20:00 na 8:00 o 21:00
  lista wróciłaby z jutra na dziś, dzień już zamknięty i przeniesiony do Historii. Tę samą zmianę
  wystarczy zrobić po nowej godzinie (tu: jutro po 8:00); Panel to podpowiada.

## Spacery grupowe

**Przytrzymaj kafelek psa** (ok. pół sekundy) — włącza się zaznaczanie. Przytrzymany pies jest
zaznaczony od razu; stukając w kolejne kafelki dobierasz resztę. Przycisk **Grupa** na dole jest
wyszarzony, dopóki nie zaznaczysz przynajmniej jednego towarzysza. Po zatwierdzeniu psy dostają
wspólny, delikatny kolor (każda kolejna grupa tego dnia — inny) i stają na liście obok siebie
(bez napisu „grupa" — kolor i blok wystarczą). Kafelki w trakcie zaznaczania wyglądają tak jak zwykle — dochodzi tylko
kółko w rogu, a przyciski bledną — więc lista nie skacze i przytrzymany pies zostaje pod palcem.

- **„Wrócił ✓" na dowolnym psie z grupy odhacza wszystkich zarezerwowanych.** Przycisk jest
  aktywny, gdy nikt z grupy nie jest wolny — każdy pies ma opiekuna; do tego czasu kafelek mówi,
  na czyją rezerwację grupa czeka. Reguła brzmi „nikt nie jest wolny", a nie „wszyscy
  zarezerwowani": w grupie bywa pies już wyprowadzony (np. dołożony do składu po spacerze),
  a dosłowna reguła zablokowałaby wtedy resztę bez wyjścia.
- **Grupa to jeden wspólny spacer — i składa się ze spacerów, nie z psów.** „Zwolnij" zostawia
  spacer w grupie — grupa znów czeka na jego rezerwację. „Cofnij" po spacerze wyprowadza ten
  spacer z grupy (tylko jego — reszta zostaje wyprowadzona). Grupa, w której został jeden spacer,
  przestaje być grupą.
- **Pies na dwa spacery: 1/2 i 2/2 grupują się osobno.** Poranny spacer z psem A i popołudniowy
  z psem C to dwie różne grupy — nic nie sugeruje, że A szedł z C. Jeden pies jest w grupie
  najwyżej raz. Gdy tylko jeden spacer psa jest w grupie, pies pojawia się **w dwóch miejscach**:
  mały kafelek „Burek 1/2" stoi przy swojej grupie, a główny kafelek z wolnym 2/2 zostaje wysoko
  na liście, bo ten spacer wciąż czeka na chętnego (rysunek: `SORTING.md`, rozdział 6).
- **Który spacer trafia do grupy?** Ten, który przytrzymasz: na kafelku psa dwuspacerowego pola
  1/2 i 2/2 są osobne i każde ma własne kółko zaznaczenia. Przytrzymanie w innym miejscu kafelka
  (nazwa, notatka) bierze pierwszy nieodbyty spacer z tego kafelka.
- **Przytrzymanie spaceru, który już jest w grupie**, otwiera jej skład: można dołożyć lub zdjąć
  spacery, albo nacisnąć „Rozwiąż". Spacer przeniesiony do nowej grupy znika ze starej. Spacer
  odbyty nie dołącza do nowej grupy.
- Grupę można zaplanować też na przyszły dzień. Na minionym dniu i w trybie edycji przytrzymanie
  nic nie robi. W trakcie zaznaczania lista stoi w miejscu — także gdy w tle minie godzina resetu.

Grupa zapisuje się w arkuszu (kolumna `grupa` w zakładce Spacery), więc każdy telefon widzi ją
tak samo, w tym samym kolorze.

## Tryb edycji

⚙️ + PIN. Tryb edycji służy do zarządzania, nie do pracy na konkretnym dniu — dlatego
**nie ma w nim wyboru daty ani rezerwacji**. Zakładka „Lista" pokazuje:

- **Zadania** — wszystkie, po kolei według dnia; zaplanowane opisane „na sobotę 26.09".
  Nowe zadanie dostaje dzień, od którego ma się pokazać (domyślnie bieżący) — do tego dnia
  wolontariusze go nie widzą.
- **Katalog psów** — w stałej kolejności z arkusza, z ustawieniem „2 spacery dziennie" zamiast
  postępu dnia, z edycją i usuwaniem, oraz dodawanie psa.

## Zakładka „Panel"

Zakładka widoczna **tylko w trybie edycji**, obok „Listy". Zawiera ustawienia (godzina czyszczenia) oraz diagnostykę: stan wyzwalacza resetu, czas i strefę serwera, liczniki rekordów, a przede wszystkim **czasy przelotu ostatnich 30 wywołań**. To jedyny sposób, żeby na telefonie rozstrzygnąć, czy wisi Apps Script, czy przeglądarka.

Awaryjne wejście bez PIN-u: **5 tapnięć w datę** w nagłówku (pokazuje wtedy tylko log wywołań, bez danych serwera). Gest liczy `pointerdown`, nie `click` — na telefonie szybka seria tapnięć bywa zjadana przez rozpoznawanie gestów przeglądarki i licznik nigdy nie dochodził do pięciu.

## Kolejność psów na liście

Pełny opis z przykładami: **`SORTING.md`**. W skrócie kafelki porównuje się po kolei:

1. **wszystko odbyte** — na sam dół;
2. **czy jakiś spacer czeka na chętnego** (jest wolny) — nad obsadzonymi, bo to jest praca
   do rozdania;
3. **psy dwuspacerowe wyżej** — mają przed sobą więcej i muszą zacząć wcześniej;
4. **liczba spacerów odbytych dziś** — mniej = wyżej (pies po 1/2 pod psami bez spaceru);
5. **opiekun** (od 1.1.1) — psy, które reguły 1–4 stawiają na równi, a ma je ta sama osoba,
   stoją obok siebie. Tylko jako rozstrzygnięcie remisu: nigdy nie przenosi psa ponad
   wcześniejsze reguły (pies tej osoby na dwa spacery zostaje wśród dwuspacerowych);
6. **kolejność z arkusza**, a przy kafelkach tego samego psa — numer spaceru.

Grupa to jeden blok: stoi tam, gdzie stanąłby jej najpilniejszy spacer. Dla psów
jednospacerowych wychodzi z tego dokładnie to samo co dawniej: wolne, zarezerwowane,
wyprowadzone. Nową regułę dopisuje się w jednym miejscu (`tileKey` w `Script.html`).

Cała trudność jest w tym, **kiedy** przestawiać. Gdyby lista układała się w chwili kliknięcia,
pies uciekałby spod palca w środku akcji, a wolontariusz stoi wtedy z psem na smyczy i nie ma
jak dojść, co się właśnie stało. Dlatego kolejność jest zamrożona, dopóki cokolwiek się dzieje:
trwa zapis, otwarte jest pole z imieniem albo ekran był dotykany w ciągu ostatnich 4 sekund.
Kliknięty kafelek zmienia się **w miejscu**, a lista układa się dopiero wtedy, gdy ręce
znieruchomieją. Seria pięciu rezerwacji pod rząd idzie więc bez ani jednego skoku — łącznie
z odświeżeniem w tle, które trafi akurat w środek serii. Kiedy lista wreszcie się przestawia,
najpierw na chwilę (0,8 s) pojawia się dymek „Aktualizuję…" — dotknięcie ekranu w tym czasie
odwołuje ruch i odlicza ciszę od nowa.

## Dwa spacery dla wszystkich jednym kliknięciem

Przy upałach schronisko dopuszcza drugi spacer, a decyzja bywa z godziny na godzinę —
przeklikiwanie trzydziestu psów z osobna odpada. W **Panelu** (tryb edycji) są dwa przyciski:
*Wszystkie po 2 spacery* i *Wszystkie po 1 spacerze*.

Przy spacerach zapisanych osobno przełącznik zmienia tylko liczbę w katalogu — stan dnia
dopasowuje się sam:

- **włączamy dwa spacery** — spacer odbyty rano to 1/2, a pies dostaje wolne pole 2/2;
- **wracamy do jednego** — pies z odbytym 1/2 ma swoje z głowy i jest wyprowadzony.

Spacer ponad nową liczbę, który ktoś już zarezerwował albo odbył, zostaje na kafelku — cudzej
rezerwacji nie kasujemy po cichu, a odbyty spacer ma trafić do Historii. Wolny spacer ponad
liczbę wychodzi tylko ze swojej grupy. Wywołanie dwa razy z tą samą wartością nie zmienia
niczego drugi raz, więc zapis może być bezpiecznie ponawiany po zaginionej odpowiedzi.

## Notatki i dwa spacery

- **Notatka** (`notatka`): ustawiana w edycji psa, widoczna na kafelku (📌). Domyślnie znika przy czyszczeniu kończącym dzień, na którym ją zapisano — do jednorazowych zdarzeń typu „Zdjęcia o 12:00 w parku”.
- **Termin notatki** (`notatka_do`, opcjonalny): pole daty pod notatką. Puste = zachowanie jak dotąd. Ustawione = notatka przeżywa czyszczenia i znika dopiero po tym dniu — do rzeczy zaplanowanych z wyprzedzeniem („w środę wpisuję spacer zapoznawczy w niedzielę”). Na kafelku pojawia się wtedy odznaka „do niedzieli” / „do 20.08”. Data z przeszłości i data bez notatki są odrzucane po obu stronach (interfejs pokazuje komunikat, serwer normalizuje do pustej).
- **„Nigdy nie znika”** — pole obok terminu. Notatka zostaje, dopóki ktoś jej ręcznie nie skasuje (w arkuszu `notatka_do = nigdy`). Na kafelku nic nie dopisujemy — po prostu jest. Do rzeczy stałych, typu „tylko w kagańcu”.
- **Dwa spacery dziennie** (`spacery` = 1/2): kafelek psa ma dwa osobne pola, **1/2** i **2/2**, każde z własnym „Zarezerwuj", „Wrócił ✓", „Zwolnij"/„Cofnij" i osobą — w jednym wierszu na zwykłym telefonie (dlatego przycisk mówi krótko „Wrócił ✓", a nie „Wyprowadzony ✓"). Można zarezerwować popołudniowy 2/2, zanim ktokolwiek weźmie poranny 1/2. Odbyte pole pokazuje „✓ imię" (bez godziny). Oba spacery trafiają osobno do Historii przy nocnym resecie. Model zna dowolną liczbę spacerów, ale interfejs i serwer pozwalają na 1 albo 2.
- **Kolor wolontariusza**: przy imieniu jest kolorowa obwódka z kropką — ta sama osoba ma tego samego dnia ten sam kolor na każdym psie, więc od razu widać, kto ile ma na głowie. Imię zostaje w całości, kolor go nie zastępuje. Kolory przydziela serwer na dzień (10 barw, żadna nie jest kolorem grupy ani trudności; barwa wynika z imienia, a gdy jest już zajęta — następna wolna), telefon przewiduje ten sam przydział od razu po rezerwacji. Przy więcej niż 10 osobach kolory zaczynają się powtarzać — imię dalej rozstrzyga. Kolor jest dodatkiem: jeśli jego zapis się nie uda (limit właściwości skryptu, awaria usługi), rezerwacja i spacer i tak się zapisują. Przydział ma sufity — 60 osób na dzień i 31 dni naraz — bo właściwości skryptu mają limity rozmiaru; ponad sufit osoba dostaje kolor „z imienia".
- Tryb edycji nazywa się po prostu trybem edycji (wejście przez ⚙️ + PIN). Opisu na dole strony
  już nie ma — nikt go nie czytał.

## Naprawione bugi (changelog)

### 1.1.1 — w przygotowaniu

- Zarezerwowane psy jednej osoby nie stały obok siebie (zgłoszenie z produkcji: Draco i Bysiu
  u Grzesia, a między nimi trzy inne psy). Sortowanie nie znało opiekuna — teraz to kryterium
  po regułach 1–4, a przed kolejnością z arkusza: psy jednej osoby stoją razem tam, gdzie
  wcześniejsze reguły nic nie rozstrzygają, i nigdy ich nie przeskakują.

### 1.1 — wdrożone 2026-09-28 (@17)

**Feedback z testów spacerów 1/2, 2/2:**
- Spacer psa dwuspacerowego zajmował dwie linijki („Zwolnij" spadało pod spód). Przyciski trzymają
  się razem, a przycisk spaceru mówi krótko „Wrócił ✓" (73 px zamiast 129 px) — od 360 px jeden
  spacer to jedna linijka przy typowych imionach.
- Spacer w grupie (kafelek odłączony) to teraz jeden wiersz: imię psa, 1/2, opiekun, przyciski.
  Na węższych telefonach przyciski schodzą razem do drugiego — zamiast dawnych czterech linijek.
- Kafelek główny nie powtarza, gdzie jest spacer psa w grupie („1/2 👥 grupa Grzesiek").
- Bez napisu „👥 grupa" i bez dopisku „na stałe" przy notatce, która nigdy nie znika.
- Dymek „Zapisuję…/Aktualizuję…" na dole ekranu, obok komunikatów.

**Po review PR #2:**
- Przepisanie zakładki Spacery na nowy układ nie miało drogi powrotu — poprzednia wersja kodu
  czyta nowy układ jako śmieci. Teraz przed przepisaniem powstaje kopia `Spacery (stary układ)`,
  znacznik układu pamięta id zakładki, a README opisuje cofnięcie (*Cofnięcie wdrożenia*).
- Nieudany zapis koloru wolontariusza (limit właściwości skryptu) blokował rezerwację i spacer.
  Kolor nie blokuje już niczego, a przydział ma sufity — publiczne API pozwalało go rozdmuchać.
- Stuknięcie zaraz po strzałce dnia, „Grupa" albo „Anuluj" ginęło po cichu w osłonie stuknięć.
- „Aktualizuję…" świeciło przez całe 4 s ciszy przed przestawieniem listy, przy ciągłej pracy
  bez przerwy. Teraz tylko przez chwilę tuż przed ruchem.
- Konflikt rezerwacji 1/2 kasował imię wpisywane właśnie w 2/2 tego samego psa (i u towarzysza
  z grupy).
- Karty otwarte na poprzedniej wersji gubiły grupy po własnym „Grupa" (do odświeżenia).
- Rysowanie listy zwalniało z każdą rezerwacją naprzód (rok rezerwacji: kilkanaście razy wolniej);
  zapis psa w katalogu czytał zakładkę Spacery raz na każdy otwarty dzień.

**Spacery zamiast psów, nowe sortowanie, osłona stuknięć:**
- **„Kliknąłem w jednego psa, a zapisało się na innym"** — lista przestawiała się z zegara
  w chwili, gdy palec już leciał, a podwójne stuknięcie trafiało w przycisk, który właśnie
  pojawił się w tym samym miejscu. Ruch listy jest teraz zapowiadany („Aktualizuję…"),
  a stuknięcie w listę albo kafelek zmieniony pod palcem się nie liczy.
- „Zapisuje…" w nagłówku było w słońcu niewidoczne — zastąpił je pływający dymek.
- Pies na dwa spacery miał jeden stan na cały dzień, więc nie dało się zarezerwować spaceru
  popołudniowego przed porannym, a pies z porannej grupy „ciągnął" ją na drugi spacer. Teraz
  1/2 i 2/2 to osobne spacery (osobne wiersze w Spacery), każdy z własną rezerwacją i grupą;
  pies bywa w dwóch miejscach listy naraz.
- Sortowanie przepisane na reguły z jednego miejsca (`SORTING.md`); psy dwuspacerowe wyżej.
- Kolor wolontariusza przy imieniu.
- `getData` czyta właściwości skryptu raz, a nie kilka razy na żądanie.

**Po review PR #1:**
- Przejście ze starego modelu mogło zgubić dzisiejsze spacery, gdy pierwszym dostępem po
  wdrożeniu był nocny wyzwalacz. Wdrożenie otwiera teraz aplikację samo, a przejście w godzinie
  czyszczenia datuje stan dniem, który się skończył.
- Numer grupy 1.5 (z publicznego `setGroup` albo wpisany ręcznie) wywracał listę na każdym
  telefonie i wpędzał ją w pętlę `getData`. Numer musi być dodatnią liczbą całkowitą, a ratunkowe
  odświeżenie po błędzie rysowania idzie najwyżej raz na 15 s.
- Podgląd minionego dnia zostawał na „Wczytuję…" po przełomie dnia.
- Notatka bez terminu dodana po przełomie dnia znikała przy czyszczeniu tego samego wieczoru.
- Równoległa zmiana składu grupy gubiła psy dołożone przez kogoś innego, a nieaktualny numer
  grupy potrafił rozbić cudzą, nową grupę. Odpowiedź `setGroup` przywracała też grupę, którą
  chwilę później rozwiązał spacer.
- Usunięcie psa zostawiało grupę z jednym psem.
- Zadanie albo pies dodany Enterem z klawiatury telefonu nie pojawiał się (fokus w polu).
- Zmiana godziny czyszczenia z wieczornej na poranną potrafiła otworzyć zamknięty dzień.
- Daty w rodzaju 2026-13-45 albo 9999-01-01 przechodziły.
- „Zwolnij" ponowione po zaginionej odpowiedzi zwalniało rezerwację, którą w międzyczasie
  zrobił ktoś inny.

**Grupy — poprawki z testu:**
- Przytrzymanie kafelka przerysowywało listę krótszymi kafelkami do zaznaczania — wszystko nad
  palcem się kurczyło i przytrzymany pies uciekał z ekranu. Teraz to te same kafelki z kółkiem
  w rogu, układ nie zmienia się ani o piksel; pies, który wpadłby pod pasek na dole, jest
  wysuwany dokładnie o tyle, ile trzeba.
- Cofnięty spacer zostawiał psa w grupie z jej kolorem. Teraz pies z niej wychodzi, a grupa
  z jednym psem przestaje istnieć. „Zwolnij" zostawia psa w grupie, jak dotąd.
- Pies na dwa spacery ciągnął swoją grupę na drugi spacer: dobranie mu towarzysza wyglądało,
  jakby z tym towarzyszem szły psy z porannej grupy. Teraz po pierwszym spacerze z grupy wychodzi.
- Usunięty opis na dole strony.

**Spacery grupowe:** przytrzymanie kafelka, zaznaczanie, wspólny kolor i miejsce na liście,
jedno „Wyprowadzony ✓" dla całej grupy, cofanie pojedynczo, zmiana składu i rozwiązanie grupy.

**Drugi feedback z terenu:**
- **Tryb edycji nigdy się nie przerysowywał** (błąd na produkcji). Pole nowego zadania udawało
  „ktoś właśnie wpisuje imię", więc po „Dodaj psa" czy „Dodaj zadanie" odpowiedź serwera nie
  pojawiała się na ekranie, dopóki prowadząca nie wyszła z trybu edycji. Stare odświeżanie co 15 s
  też w tym trybie stało.
- **Strzałki niesymetryczne** — znaki ← → każdy telefon brał ze swojego fontu. Teraz rysunek SVG,
  prawa strzałka to dokładne lustro lewej.
- **Wolniejszy start** — po załadowaniu strony telefon musiał jeszcze raz zapytać serwer o dane.
  Stan startowy jest teraz wpisany w samą stronę (`bootJson_`), więc lista rysuje się od razu.
- Tryb edycji bez dat i rezerwacji; zadania na konkretny dzień; notatka „nigdy nie znika".

**Daty zamiast „Dziś" i „Historii":**
- Arkusz znał tylko jeden dzień — stan psa siedział wprost w jego wierszu i był zerowany co noc,
  więc nie było gdzie zapisać rezerwacji na sobotę. Stan dnia przeniesiony do osobnej zakładki
  Spacery (wiersz na dzień i psa), nawigacja `← data →`, rezerwacje z wyprzedzeniem, miniony
  dzień jako podgląd.
- Dzień rezerwacyjny liczony od godziny czyszczenia. Reguła „po resecie — jutro" działa tylko
  przy resecie wieczornym; przy porannym granicą jest południe, jak wcześniej przy archiwizacji.
- Nocne czyszczenie archiwizuje każdy spacer pod datą z jego wiersza. Ręczne uruchomienie
  `endOfDay()` w środku dnia nie kasuje już bieżącej listy — dawniej zerowało wszystko.
- `withLock_` znosi zagnieżdżenie. Akcja edycyjna wołająca `getData()` spod blokady mogłaby
  inaczej zwolnić blokadę zewnętrzną w połowie pracy.

### 1.0 — wdrożenie @16 (`0cc01e0`) i wcześniejsze

**Pierwszy feedback z terenu:**
- **Godzina spaceru zniknęła z kafelka** psa wyprowadzonego. Nie niosła nic, czego
  wolontariusz potrzebuje na liście, a zagęszczała kafelek. W Historii, gdzie ma sens,
  zostaje.
- **Psy układają się według stanu** — wolne, zarezerwowane, wyprowadzone — ale nigdy
  w chwili kliknięcia (patrz wyżej: kolejność zamrożona na czas akcji).
- **Sortowanie po samym statusie mieszało szyki przy dwóch spacerach.** Pies po pierwszym
  z dwóch wraca na „wolny", więc lądował na samej górze, nad psami, które nie wyszły
  jeszcze ani razu — a bywało, że i nad zarezerwowanymi, które dopiero czekały na spacer.
  Pierwszym kryterium jest teraz liczba odbytych spacerów, status dopiero drugim.
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

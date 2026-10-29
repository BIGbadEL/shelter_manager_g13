# Pomocnik Grafiku (1.5 — faza testów)

Bot czyta z grupy **„Grafik"** ankietę tygodniową — **jedyne źródło prawdy o tym, kto przychodzi** (decyzja właściciela
27.10.2026: „tam, gdzie ktoś jest zaznaczony, tam ma być"; treści wiadomości z czatu bot nie analizuje, bierze z nich tylko
nazwę nadawcy) — i składa z tego, razem z danymi aplikacji, krótkie wiadomości dla prowadzących.

**Dokąd pisze** (decyzja właściciela 28.10.2026 — „wersja produkcyjna nie musi być produkcyjna"): na **teście** każda
wiadomość idzie wyłącznie prywatnie, do kontaktu z ustawień (właściciel). Na **produkcji** każda funkcja z własną wiadomością
ma tryb: **w teście** — prywatnie do kontaktu z ustawień (testowanie na danych produkcji; „prawie zawsze będę wybierał siebie"),
**gotowa** — do „Grafiku", do wszystkich. Odpowiedzi na pytania, karty kontaktu, ostrzeżenia i podgląd z panelu — zawsze
tylko do kontaktu. Kod tego pilnuje: kontakt musi być prywatnym czatem (`…@c.us`) — adres grupy jako kontakt odrzuca zapis
ustawień, odczyt i każda wysyłka (B74); do „Grafiku" idzie wyłącznie funkcja „gotowa", wyłącznie na produkcji i wyłącznie do
grupy z ustawień (`helperDest_`, B85). **Pracuje zawsze jeden pomocnik, a pierwszeństwo ma produkcja** (niżej, „Produkcja
i test"). Funkcje, które się nie sprawdzą, wyłącza się pojedynczo w panelu — „lepiej więcej niż mniej" (decyzja właściciela
24.10.2026).

Kod: `Helper.gs` (wejście sygnału — `doPost` w `WebApp.gs`). Panel: sekcje „Pomocnik Grafiku — produkcja" i „— test"
(działa sekcja tego środowiska, druga jest wyszarzona) i „Członkowie". Testy: B74–B90 (`tests/helper.js`), S145–S147b
(`tests/scenarios21.js`), T8 (`tests/tooling.js`).

## Skąd ten pomysł — co się dzieje w „Grafiku"

Próbka czatu (eksport 16.03–24.10.2026, ~1200 wiadomości) — powtarzające się sytuacje:

| sytuacja w czacie | jak często | co robi pomocnik |
|---|---|---|
| „Kto dołączy jutro?", „W czwartek potrzebne jeszcze 2 osoby", „3 osoby/dzień są potrzebne" — prowadząca liczy głosy ręcznie | prawie codziennie | **skład na jutro** wieczorem, **dziś** rano, gdy mało osób |
| „W czwartek były 3 osoby, ktoś się wypisał?", „chyba mi się odkliknęło", „Nie widać Cię w grafiku" | co tydzień | **„wypisali się"** w składzie dnia (wieczorem i rano) — bez osobnych wiadomości o każdej zmianie (niżej) |
| „Czy ktoś z niedzieli może się przepisać na sobotę?" | co tydzień | **przegląd tygodnia** z najsłabszymi dniami i podpowiedzią „z X na Y" |
| „Będę 10–12", „na 2 psy", „do 12:30", „nie dam rady jutro", „wypisuję się z piątku" | codziennie | **nic** — o obecności mówi tylko ankieta (27.10, decyzja właściciela; do 27.10: cytaty i „🔀 pisze, że…") |
| „Dopisałam się", a głosu nie ma; nowa osoba „nie mam dostępu do grafiku" | kilka razy w miesiącu | **nowa osoba w grupie** (skład grupy z bramki, przypomnienie, że nie widzi starszej ankiety); rozjazdu czatu i ankiety — nie (liczy się ankieta) |
| „Nie ma mnie 13–17 sierpnia", „W poniższych terminach będę nieobecny: …" | kilka razy w miesiącu | **nic** — kogo nie będzie, ten nie zaznacza dnia w ankiecie (do 27.10: „🚫 nieobecności", „nieobecni") |
| „potrzebny fioletowy wolo", „świeżak nie może być sam", „tylko fiolet może opiekować się kandydatem" | kilka razy w miesiącu | **klasy członków** (fioletowy / pomarańczowy / kandydat) z listy w panelu, ostrzeżenie w składzie dnia |
| „Kto przyjdzie do Evera?", psy dla wyznaczonych osób | co tydzień | **psy „tylko wyznaczone osoby"** w składzie dnia: kto z nimi ostatnio chodził (Historia) |
| ankieta z pomylonymi datami („Grafik 05-11.11" zamiast 10; tydzień wcześniej niż trzeba) | 2× w próbce | **nowa ankieta** — sprawdzenie, czy daty pasują do najbliższego tygodnia, przypomnienie o przypięciu |
| upały → ankiety „rano / wieczór" | lato | **pogoda** w składzie dnia (Open-Meteo, bez klucza) |

## Funkcje (każda z osobnym włącznikiem w panelu)

Na produkcji funkcje 1–6 mają zamiast włącznika tryb: **wyłączona / w teście → do kontaktu / gotowa → do Grafiku**
(`ready`, `HELPER_READY`). Wyłączona funkcja po ponownym włączeniu wraca jako „w teście", nie prosto do grupy. Zapis, po którym
któraś funkcja zaczyna pisać do „Grafiku", najpierw pyta (do kogo i co pójdzie). Do „Grafiku" idzie **dokładnie ten sam tekst**,
który widać w podglądzie: imiona z kontaktów telefonu bota i z pola „Imiona", klasy 🟣 🟠 🌱, „wypisali się", „#17" przy osobie
bez imienia (numer osoby, nie numer telefonu). Pogoda i „codziennie" to części składu dnia, a pytania (8) idą zawsze do
pytającego — te mają zwykły włącznik.

1. **Skład na jutro** (`evening`) — codziennie o godzinie „wieczorem" (domyślnie 20): kto jest w ankiecie na
   jutro, ⚠️ gdy mniej niż „minimum osób" (domyślnie 3), wypisani z ankiety od wczoraj, klasy przy imionach (🟣 🟠 🌱)
   i ostrzeżenia, psy (ile naszych, ile spacerów, kto czeka najdłużej, psy dla
   wyznaczonych osób), pogoda. W niedzielę na górze: czy jest ankieta na nowy tydzień.
   `eveningAlways` — wysyłaj codziennie (na czas testów); wyłączone = tylko, gdy jest problem.
2. **Dziś rano** (`morning`) — o godzinie „rano" (domyślnie 7) skład na dziś, **tylko gdy jest problem**
   (mniej niż minimum, brak fioletowego, kandydat bez fioletowego, brak ankiety).
3. **Przegląd tygodnia** (`week`) — w wybrane dni (domyślnie niedziela i środa) o godzinie „wieczorem":
   7 najbliższych dni — liczba osób, ⚠️ słabe dni, dni bez ankiety, podpowiedź „ktoś z niedzieli (6) na
   sobotę (2)?".
4. **Nowa ankieta** (`newPoll`) — gdy w „Grafiku" pojawi się ankieta (bota albo czyjaś): pytanie, dni, czy
   daty pasują do najbliższego tygodnia, przypomnienie o przypięciu.
5. **Nowe osoby i odejścia** (`members`) — raz dziennie (wieczorem) skład grupy z bramki (`getGroupData`)
   porównany z poprzednim. Nowa osoba nie widzi ankiety wysłanej przed jej dołączeniem (WhatsApp nie
   pokazuje historii) — pomocnik o tym przypomina.
6. **Miniony tydzień** (`lastWeek`) — w poniedziałek rano: dzień po dniu ilu było w ankiecie, ilu wyszło
   z psami (Historia aplikacji) i ile spacerów; psy z najmniejszą liczbą spacerów.
7. **Pogoda** (`weather`) — linijka w składzie dnia: temperatura i deszcz (Open-Meteo, okolice schroniska),
   ⚠️ upał od 28°C.
8. **Pytania w prywatnym czacie** (`commands`) — właściciel pisze do bota: `jutro`, `dziś`, `pojutrze`,
   dzień tygodnia (`sobota`), data (`31.10`), `tydzień`, `nieaktywni`, `ludzie`, `stan`,
   `pomoc`, **`kto 17`** (też `#17`, `17`) — karta kontaktu osoby #17; **udostępniony botowi kontakt** (jeden albo kilka
   naraz) — odpowiedź, kto to na liście: „📇 Gośka = #3 („Gosia") · 🟣 fioletowy", „nie znam tej osoby", „spoza listy
   członków". Bot odpowiada przy najbliższym przebiegu (do 10 min). Inne czaty — nic.

**Członkowie i ich klasy** (od 26.10, zamiast pól „fioletowi" / „nowi"; B83, S146). Panel → „Członkowie": „Pobierz
członków" bierze skład wybranej grupy z bramki (`getGroupData`) — „Grafik" albo **grupę ogłoszeń społeczności, czyli całą
społeczność** (bot jest jej członkiem; skład samej społeczności-rodzica bramka może podawać niepełny) — z imionami
z kontaktów telefonu bota (`getContacts`: nazwa kontaktu, inaczej nazwa z WhatsAppa — po dodaniu nowych kontaktów
„Pobierz członków" jeszcze raz), z nazw nadawców w „Grafiku" i z pola „Imiona". Przy każdej osobie **numer osoby w nawiasie:
„Ania Kowalska (#17)"**, bez imienia — sam „#17". Stuknięcie w **fioletowy / pomarańczowy / kandydat** zapisuje klasę od razu
(`setHelperRole(nr, role, pin)`, RETRIABLE), drugie zdejmuje; filtr „bez klasy" pokazuje, kogo jeszcze nie przypisano. Klasa
i numer zostają przy osobie także po ponownym pobraniu.

**Numer osoby zamiast numeru telefonu** (27.10, decyzja właściciela; B84, S146): numery telefonów **nie opuszczają serwera** —
nie ma ich w panelu ani w tekście wiadomości (podgląd w panelu to ten sam tekst). 26.10 panel pokazywał je przez dzień (test
@45) — cofnięte: „nie czuję się bezpiecznie trzymając dane wrażliwe tylko za PIN-em". Numer osoby nadaje serwer po kolei przy
pierwszym spotkaniu (lista członków, głos, wiadomość) i pamięta (`helperIds`, `helperNrsAdd_`); **nie powstaje z numeru
telefonu** — dawny klucz panelu (`helperKey_`, skrót FNV z numeru) dało się odwrócić przeszukaniem polskich komórek
w ok. 100 s. Numery nie wracają do obiegu, sufit `HELPER_LIMITS.IDS` (najpierw wypadają osoby, których pomocnik już nie zna).
Ten sam człowiek pod drugim adresem (`@lid` z ankiety, `newChatId` z kontaktów bota) ma ten sam numer (`helperSame_`).
**Do telefonu prowadzi karta kontaktu**: „📲" przy osobie w panelu (`sendHelperContact`) albo „kto 17" w czacie — bot wysyła
kartę (`sendContact`) do prywatnego czatu właściciela; numer idzie tylko serwer → bramka → WhatsApp właściciela. Karta ma
nazwę „Gosia #17" (bez imienia — „Grafik #17"); stuknięcie otwiera osobę na WhatsAppie, z nazwą z kontaktów właściciela.
Konto bez numeru (`@lid` bez kontaktu bota) — bez karty, bot to mówi. Osobny sufit `HELPER_CARD_MAX` na dzień. W „Imiona":
**„#17 = Ania"** (albo jak dotąd „…123 = Ania" — końcówka numeru). W składzie
dnia: 🟣 🟠 🌱 przy imionach, **„brak fioletowego"** (tylko gdy ktokolwiek jest fioletowy) i **„kandydat bez fioletowego"**
(z czatu: „tylko fiolet może opiekować się kandydatem", „świeżak nie może być sam") — oba to też powód porannego alarmu;
przegląd tygodnia — „bez 🟣" / „kandydat bez 🟣". Pomarańczowy na razie tylko oznaczenie.

**Usunięte: „zmiany w ankiecie"** (osobna wiadomość o każdym dopisaniu i wypisaniu, po kwadransie ciszy) — 26.10.2026,
decyzja właściciela po pierwszym dniu testu: męczące, a cały sens bota to, żeby takich powiadomień nie dostawać;
wystarczą podsumowania wieczorem i rano (wypisania z ankiety są w nich jako „wypisali się"). B79 pilnuje, że w ciągu dnia
nic nie idzie. Nie przywracać bez decyzji właściciela.

**Usunięte: wszystko, co bot wyczytywał z treści czatu** — 27.10.2026, dwie decyzje właściciela tego samego dnia. Najpierw
cytaty „💬 Z czatu" w składzie: wiadomość ma docelowo iść do „Grafiku", więc to byłoby wklejanie tego samego w to samo (do tego
oznaczenia osób w cytatach — „@48502539220" — to pełne numery telefonów). Potem reszta: **„jedynym i świętym źródłem prawdy jest
ankieta — tam, gdzie ktoś jest zaznaczony, tam ma być"** — znikły „🔀 pisze, że będzie, a nie ma w ankiecie" / „…nie da rady,
a dalej w ankiecie", „🚫 zapowiedziana nieobecność" (dzień i przegląd tygodnia) i pytanie „nieobecni"; pomocnik nie rozpoznaje
już w czacie dni, rodzaju wiadomości ani nieobecności (heurystyka myliła się — 27.10 „Chociaż nie wpadnę w środę i czwartek"
wzięła za „będzie") i nie trzyma treści wiadomości. Z czatu zostaje nazwa nadawcy. Testy: B77 (wiadomości z czatu nic nie
zmieniają), B78, B79, B82. **Nie przywracać bez decyzji właściciela.**

## Jak bot widzi „Grafik" — bramka Green API

- **Kolejka powiadomień** (`receiveNotification` → `deleteNotification`), czytana co `HELPER_TICK_MIN`
  (10) minut z wyzwalacza `helperTick`, najwyżej `HELPER_MAX_EVENTS` naraz. Webhook na Apps Script odrzucony:
  `doPost` jest publiczny i nie czyta nagłówków (token w adresie), a każda wiadomość z każdej grupy bota
  byłaby wykonaniem na koncie wolontariuszy.
- **Wymagane ustawienia instancji** (konsola Green API — robi właściciel; panel „Sprawdź bramkę" pokazuje,
  czego brakuje — `getSettings`, tylko odczyt): powiadomienia o wiadomościach przychodzących
  (`incomingWebhook`), o ankietach (`pollMessageWebhook`), o wiadomościach wysłanych z API i z telefonu
  (`outgoingAPIMessageWebhook`, `outgoingMessageWebhook` — bez nich nie ma powiadomień o ankietach) i **pusty
  adres webhooka** (inaczej `receiveNotification` daje 400).
- **Głosy** (`pollUpdateMessage`): dokumentacja mówi, że powiadomienie dotyczy jednej osoby, ale czy nie niesie pełnego
  stanu ankiety, nie sprawdziliśmy (niżej, „Do sprawdzenia", punkt 3). Pomocnik bierze z niego to, co pewne przy obu
  (review PR #8, nr 5; decyzja właściciela 28.10 — poprawka od razu, nie po sprawdzeniu): nikt w odpowiedziach = nadawca
  wycofał wszystko; dwie osoby i więcej = pełny stan ankiety; **jedna osoba** = sam nadawca — ten sam adres albo jego drugi
  adres (`@lid` zamiast `@c.us`; pomocnik zapamiętuje to powiązanie, `alias`), a gdy to nie może być on — pełny stan
  (nadawca wycofał wszystko, został jeden głos kogoś innego; pozostałym głosy zdjęte). **Drugi adres nadawcy** to tylko
  adres innego rodzaju (`@lid` ↔ `@c.us`), którego nikt inny już nie ma (powiązanie, lista członków), i tylko wtedy, gdy
  nadawca nie ma jeszcze głosu w tej ankiecie — pod żadnym ze swoich znanych adresów (`helperSelf_`). Dawniej każda jedna
  osoba inna niż nadawca stawała się jego drugim adresem: przy pełnym stanie wycofanie głosu „sklejało" dwie osoby (imię,
  klasa, numer osoby — także w wiadomości do „Grafiku"), a głos wycofującego zostawał (B76).
- **Daty ankiety** z pytania („Grafik 26.10-01.11", „Niedziela 16.08", „Nowy grafik 01-05.07") i odpowiedzi
  (dzień tygodnia, „27.07", „rano/wieczór"); bez dat w pytaniu — tydzień od najbliższego poniedziałku.
  Odpowiedź z dopiskiem („Niedziela - AW", „Warszawski dzień zwierząt") liczy się osobno, nie do składu dnia;
  „Nie mogę" — nigdzie. **„Daty nie pasują"** tylko wtedy, gdy zakres skończył się przed dniem wysłania ankiety albo
  zaczyna się po spodziewanym tygodniu (albo jest daleko od dnia wysłania — pomyłka w pytaniu); ankieta w środku tygodnia
  na bieżący weekend („26.06 - 28.06" w czwartek) jest w porządku (review PR #8, nr 4; B76).
- **Ankieta poznana najpierw z głosu** (pierwszy głos przyszedł przed samą ankietą — np. sprzed włączenia powiadomień)
  ma dni liczone od dnia głosu; gdy przyjdzie sama ankieta (kolejka albo historia czatu), dni i daty liczą się od nowa
  od dnia jej wysłania (numery odpowiedzi w głosach zostają ważne). **Poznana tylko z głosu i bez dat w pytaniu nie ma
  dni wcale** (`nodays`), dopóki nie przyjdzie sama: dni od dnia głosu byłyby zgadywaniem — spóźniony głos w dawnej
  „Weekend bez AW" przejmował dni bieżącej ankiety, a skład soboty pokazywał osoby z dawnej ankiety (review PR #8, nr 8;
  decyzja właściciela 28.10 — wariant „bez dni"). Ponad limit ankiet (`HELPER_LIMITS.POLLS`) wypadają najpierw takie,
  potem najstarsze — bieżąca zostaje (B88).
- **Bez tych powiadomień pomocnik jest ślepy** — tak było na teście 24–25.10.2026: wszystkie cztery wyłączone, kolejka
  pusta, a pomocnik pisał „W Grafiku nie ma jeszcze ankiety", choć ankieta wyszła o 10:13 i ludzie głosowali od rana.
  Dlatego sprawdza ustawienia bramki (`getSettings`) przy każdym przebiegu, dopóki czegoś brakuje (potem co
  `HELPER_GATE_H` godzin), i wtedy **zamiast składów wysyła raz dziennie ostrzeżenie** z listą wyłączonych (B81). Panel
  pokazuje to samo.
- **Bramka nie oddaje bieżącego wyniku ankiety** (`getMessage` daje ankietę bez głosów) — głosy są tylko jako zdarzenia
  osób, w kolejce i w historii czatu (`getChatHistory`), i tylko te, które przyszły przy włączonych powiadomieniach.
  Pomocnik **czyta historię czatu** zaraz po włączeniu powiadomień, po przerwie (niżej, „Produkcja i test"), przy
  „Sprawdź teraz" i przed wiadomością o swojej porze, gdy na dzień, o którym ona mówi, nie zna ankiety albo zna ją
  częściowo (najwyżej co `HELPER_HISTORY_GAP_H` h): rano — dziś, wieczorem — jutro, w dni przeglądu tygodnia — 7 dni.
  Dawniej zawsze 8 najbliższych dni, a ankiety na następny tydzień do niedzieli nie ma — historia szła co rano i co
  wieczór także przy pełnej ankiecie (review PR #8, nr 12; B90).
  Ankietę wysłaną przez bota historia ma zawsze (wiadomość z API). **Ankieta sprzed włączenia powiadomień jest niepełna**:
  „co najmniej N os.", „≥" w przeglądzie i od kiedy pomocnik zna głosy; pełny obraz — od następnej ankiety (B81, B82).
  Głos to stan osoby z czasem (`vt`): starszy niż już znany nic nie zmienia, więc historia i kolejka mogą podawać te same
  głosy w dowolnej kolejności.
- **Kolejka jest jedna na instancję**, a test i produkcja dzielą jedną instancję — dlatego pracuje zawsze jeden pomocnik
  (niżej, „Produkcja i test").
- **Limit planu Developer** dotyczy też odbierania: „powiadomienia tylko z 3 czatów w miesiącu". W październiku
  komplet to grupa próbna, „Grafik" i właściciel. Czat spoza tej trójki (np. ogłoszenia społeczności) dostaje
  `quotaExceeded` — pomocnik go pomija. **Od 1.11 trzy pierwsze czaty, które się odezwą, zajmą limit** — jeśli
  bot jest w innych grupach, warto go z nich wypisać albo przejść na plan płatny.

## Produkcja i test — pracuje jeden (28.10.2026)

Właściciel chciał testować bota na danych produkcji, a nowe funkcje dalej najpierw na teście — dwie wersje aplikacji przy
pracującym bocie. Test i produkcja dzielą jedną instancję bramki, a kolejka powiadomień jest jedna: dwa pomocniki zjadałyby
sobie powiadomienia (każdy znałby połowę głosów), a właściciel dostawałby każdy skład dwa razy. Pierwszy pomysł — oba pracują,
test czyta tylko historię czatu — właściciel odrzucił: **ma pracować jeden**. Rozwiązanie:

- **Pierwszeństwo ma produkcja.** Włączony pomocnik produkcji przy każdym przebiegu (co 10 min) i przy zapisie ustawień
  wysyła aplikacji testowej sygnał **„pracuję do …"** (`helperLeaseSend_` → POST do wdrożenia testowego `HELPER_TEST_APP` →
  `doPost` → `helperLeaseIn_`), ważny `HELPER_LEASE_MIN` (30) minut; wyłączony — sygnał **„koniec"**.
- **Pomocnik testu z ważnym sygnałem czeka**: przebieg z wyzwalacza nic nie robi (kolejki nie czyta, nic nie wysyła),
  „Sprawdź teraz" odmawia z powodem. Panel testu: „Czeka — pracuje pomocnik produkcji (sygnał 18:40, ważny do 19:10)".
- **Przełącznikiem jest „włączony" w panelu produkcji**: wyłączony — w ciągu 10 min pracuje pomocnik testu (o ile tam
  włączony), włączony — test ustępuje od najbliższego przebiegu. Bez sygnału (produkcja bez pomocnika — wersja sprzed 1.5 —
  albo bez przebiegów dłużej niż 30 min, np. bez wyzwalacza) test pracuje.
- **Sygnał jest podpisany tokenem bramki** (HMAC-SHA256 — `Utilities`, jak klucz kontaktu): wspólny token = wspólna
  instancja = wspólna kolejka. Bez tokenu podpisu nikt nie podrobi (wejście `doPost` jest publiczne jak cała aplikacja),
  a środowiska z osobnymi instancjami nawzajem się nie wstrzymują. W sygnale nie ma tokenu, tylko podpis. Sygnał starszy niż
  15 min, z terminem dalej niż 30 min naprzód albo starszy od już zapisanego (spóźniony „pracuję" po „koniec") — odrzucony.
  Produkcja sygnału nie przyjmuje (na nikogo nie czeka), test go nie wysyła.
- **Po przerwie pomocnik doczytuje historię czatu** (ostatni przebieg dawniej niż `HELPER_STALE_MIN` — czekał albo był
  wyłączony): to, co przyszło w międzyczasie, zdjął z kolejki drugi. Głos to stan osoby z czasem, więc historia uzupełnia
  ankietę bez szkody.
- **Panel produkcji** pokazuje, czy sygnał doszedł („doszedł ✓" albo „nie doszedł — …: bot testowy może pracować
  równocześnie"), **panel testu** — czy czeka. Sekcja drugiego środowiska jest wyszarzona: jej ustawienia są w drugiej aplikacji.
- **Stan jest osobny w każdej aplikacji**: lista członków, klasy (🟣 🟠 🌱), numery osób (#17 na teście to inna osoba niż #17
  na produkcji), ankiety i głosy. Pomocnik produkcji zaczyna od zera — członków trzeba pobrać i sklasyfikować w jego panelu.
- W Wykonaniach testu sygnał to wywołania `doPost` (co 10 min, gdy na produkcji pomocnik włączony) — osobno od `doGet`
  i `getData`, które mierzy test wydania.

## Dane i prywatność

Wszystko we właściwościach skryptu (limit 9 KB na wartość — każda ma sufit `HELPER_BYTES`): ankiety (najwyżej
`HELPER_POLLS_KEEP`), osoby (numer → nazwa z WhatsAppa, najwyżej `HELPER_PEOPLE_MAX`), wypisania z ankiety na
najbliższe dni, znaczniki wysłanych raportów, dziennik pomocnika do panelu, numery osób (`helperIds`). **Treści wiadomości
z czatu pomocnik nie trzyma** (od 27.10; pierwszy zapis stanu po wdrożeniu zdejmuje dawne notatki i nieobecności). **Numery telefonów nie opuszczają serwera** (decyzja
właściciela 27.10): nie idą do `getData`, do panelu (PIN) ani do tekstu wiadomości — panel i wiadomości pokazują nazwy
i numery osób „#17"; numer telefonu wychodzi tylko w karcie kontaktu na WhatsAppa właściciela. **Wybór kontaktu w panelu**
(lista dnia i pomocnik — `getDayReportContacts`) też bez numeru (27.10, decyzja właściciela): pozycja to nazwa, a wartość — klucz
kontaktu (`contactKey_`, HMAC z sekretem projektu); zapisany odbiorca w panelu to klucz i nazwa, adres zostaje na serwerze.
Tekst błędów bramki, który idzie do panelu, ma numery zamaskowane (`noPhones_`; daty — także z godziną — zostają).
**Nazwa z WhatsAppa bywa numerem telefonu** („+48 600 111 222" jako nazwa profilu) — `helperShort_` maskuje numery w każdej
nazwie (nadawca, lista członków, udostępniony kontakt), a sam numer to brak nazwy: osoba jest wtedy „#17"; nazwy zapisane
wcześniej — maskowane przy odczycie (review PR #8, nr 10; B89). **Szczegóły błędów nie idą do wiadomości** (skład „gotowy" czyta
cały „Grafik"): gdy arkusz psów nie odpowiada, w składzie jest „🐕 nie udało się odczytać psów", a tekst Google (z identyfikatorem
arkusza) — w dzienniku pomocnika (review PR #8, nr 6).
Tokeny bramki — jak dotąd tylko we właściwościach (`greenCall_` wycina je z błędów); sygnał produkcji dla testu ma podpis
zrobiony tokenem, nie token. **Wiadomość funkcji „gotowej" czyta cała grupa** — imiona w niej to nazwy z kontaktów telefonu bota
i z pola „Imiona", więc nazwy kontaktów powinny nadawać się do „Grafiku" (bez prywatnych dopisków).

## Bezpieczniki

- Wiadomość do kontaktu prywatnego z ustawień (B74); do „Grafiku" tylko funkcja „gotowa", tylko na produkcji, tylko do
  grupy z ustawień (`helperDest_` sprawdza to przy każdej wysyłce, B85). Najwyżej `HELPER_SEND_MAX` na przebieg
  i `HELPER_DAY_MAX` na dzień (wspólnie, z odpowiedziami na pytania). Karta kontaktu — tylko do kontaktu, osobno najwyżej
  `HELPER_CARD_MAX` na dzień. **Wiadomość zatrzymana sufitem albo odrzucona przez bramkę nie dostaje znacznika „wysłana"**
  i idzie w następnym przebiegu (nowa ankieta wraca do kolejki); „nowe osoby" zmieniają punkt odniesienia składu grupy
  dopiero po wysłaniu — dawniej taka wiadomość przepadała na cały dzień, a zmiana składu na zawsze (review PR #8, nr 2–3; B87).
  Nieznany wynik (bramka nie odpowiedziała — mogła wysłać) — znacznik jest, jak dotąd.
- Pracuje jeden pomocnik naraz — sygnał produkcji, podpisany tokenem bramki (B86, wyżej).
- Numery osób nadają dwa miejsca (przebieg i „Pobierz członków"), więc zawsze pod blokadą skryptu ze świeżym odczytem
  (`helperNrsAdd_`); przebieg bierze ją na chwilę i tylko wtedy, gdy ktoś nowy nie ma numeru (bez flush i pamięci podręcznej).
- Jeden przebieg naraz (`helperBusy`, `HELPER_BUSY_MS`) — wyzwalacz i „Sprawdź teraz" się nie dublują.
- `helperTick` jest publiczne (wyzwalacz), więc nic nie przyjmuje: przebieg wywołany z zewnątrz robi to samo
  co wyzwalacz, a raporty mają znaczniki „wysłany" — nie da się nim zasypać właściciela wiadomościami. Rusza najwcześniej
  `HELPER_TICK_GAP_MIN` (5) minut po końcu poprzedniego przebiegu (decyzja właściciela 28.10): wołane w pętli robiłoby
  przebieg co kilka sekund i zjadało dzienne limity konta (połączenia z bramką, zapisy właściwości), od których zależą
  ankieta i lista dnia (review PR #8, nr 7; B90). „Sprawdź teraz" (PIN) progu nie ma.
- Błąd bramki nie wychodzi z wyzwalacza (inaczej mail od Google co 10 minut) — zostaje w dzienniku pomocnika
  w panelu.
- Pomocnik nie pisze do arkusza i nie bierze blokady aplikacji na czas wywołań bramki.

## Do sprawdzenia na teście (pierwsze dni)

1. Czy po włączeniu powiadomień w konsoli przychodzą głosy na ankietę wysłaną z produkcji (`outgoingAPIMessageReceived`
   z ankietą, potem `pollUpdateMessage`) — „stan" w prywatnym czacie albo dziennik pomocnika w panelu.
2. W jakim formacie przychodzą numery głosujących (`@c.us` czy `@lid`) i czy nazwy osób się zgadzają.
3. Czy pełna lista głosujących w powiadomieniu to cały stan ankiety, czy jedna osoba. Kod od 28.10 radzi sobie z oboma
   (wyżej, „Głosy"); odpowiedź mówi, czy reguła „drugiego adresu" nie jest za ostrożna albo za śmiała.
4. Które wiadomości są pomocne, a które to szum — wyłączyć w panelu.
5. Numer osoby i karta (27.10, @46): „Pobierz członków" — czy wszyscy mają numer i 📲 (brak 📲 = grupa podała konto `@lid`
   bez kontaktu w telefonie bota); 📲 i „kto 17" — czy karta dochodzi z nazwą „Imię #17" i otwiera właściwą osobę;
   udostępniony botowi kontakt — czy odpowiedź przychodzi (`contactMessage` z `waid=` w vCard — tak mówi dokumentacja).
6. Jeden aktywny (28.10) — dopiero gdy pomocnik jest na produkcji (wydanie 1.5): po włączeniu w panelu produkcji — „Sygnał dla
   bota testowego … doszedł ✓" (POST z Apps Script do wdrożenia testowego: przekierowanie Google i `doPost` są do sprawdzenia
   na żywo), w panelu testu „Czeka — pracuje pomocnik produkcji", w Wykonaniach testu `doPost` co 10 min; wyłączenie na
   produkcji — test pisze (z 🧪) w ciągu 10 min. Funkcja „gotowa" — pierwsza wiadomość w „Grafiku" z produkcji.

## Poza zakresem (na później)

Przypinanie ankiety przez bota, wybieg i rezerwacje wybiegu, odpowiadanie wolontariuszom (pytania zadaje tylko kontakt
z ustawień). Wysyłanie do „Grafiku" weszło 28.10 jako tryb „gotowa" (wyżej).

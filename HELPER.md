# Pomocnik Grafiku (1.5 — faza testów)

Bot czyta grupę **„Grafik"** (ankieta tygodniowa + to, co ludzie piszą) i składa z tego, razem z danymi
aplikacji, krótkie wiadomości dla prowadzących. **Na czas testów każda wiadomość idzie wyłącznie prywatnie
do właściciela** (kontakt wybrany w panelu) — nigdy do grupy. Kod tego pilnuje: adres odbiorcy musi być
prywatnym czatem (`…@c.us`), adres grupy (`…@g.us`) jest odrzucany przy zapisie ustawień i drugi raz przy
każdej wysyłce (B74). Funkcje, które się nie sprawdzą, wyłącza się pojedynczo w panelu — „lepiej więcej niż
mniej" (decyzja właściciela 24.10.2026).

Kod: `Helper.gs`. Panel: „Pomocnik Grafiku (test)". Testy: B74–B82 (`tests/helper.js`), S145–S145d (`tests/scenarios21.js`).

## Skąd ten pomysł — co się dzieje w „Grafiku"

Próbka czatu (eksport 16.03–24.10.2026, ~1200 wiadomości) — powtarzające się sytuacje:

| sytuacja w czacie | jak często | co robi pomocnik |
|---|---|---|
| „Kto dołączy jutro?", „W czwartek potrzebne jeszcze 2 osoby", „3 osoby/dzień są potrzebne" — prowadząca liczy głosy ręcznie | prawie codziennie | **skład na jutro** wieczorem, **dziś** rano, gdy mało osób |
| „W czwartek były 3 osoby, ktoś się wypisał?", „chyba mi się odkliknęło", „Nie widać Cię w grafiku" | co tydzień | **„wypisali się"** w składzie dnia (wieczorem i rano) — bez osobnych wiadomości o każdej zmianie (niżej) |
| „Czy ktoś z niedzieli może się przepisać na sobotę?" | co tydzień | **przegląd tygodnia** z najsłabszymi dniami i podpowiedzią „z X na Y" |
| „Będę 10–12", „na 2 psy", „do 12:30", „nie dam rady jutro", „wypisuję się z piątku" | codziennie | **bez cytowania** (27.10 — decyzja właściciela: wiadomość ma docelowo iść do „Grafiku", więc cytat to ten sam tekst w tym samym czacie); z takich wiadomości bierze się **rozjazd czatu i ankiety** (niżej) |
| „Dopisałam się", a głosu nie ma; „wypisuję się", a głos dalej jest; nowa osoba „nie mam dostępu do grafiku" | kilka razy w miesiącu | **rozjazd czatu i ankiety** w składzie dnia, **nowa osoba w grupie** |
| „Nie ma mnie 13–17 sierpnia", „W poniższych terminach będę nieobecny: …" | kilka razy w miesiącu | **zapowiedziane nieobecności** w przeglądzie tygodnia i w dniu |
| „potrzebny fioletowy wolo", „świeżak nie może być sam", „tylko fiolet może opiekować się kandydatem" | kilka razy w miesiącu | **klasy członków** (fioletowy / pomarańczowy / kandydat) z listy w panelu, ostrzeżenie w składzie dnia |
| „Kto przyjdzie do Evera?", psy dla wyznaczonych osób | co tydzień | **psy „tylko wyznaczone osoby"** w składzie dnia: kto z nimi ostatnio chodził (Historia) |
| ankieta z pomylonymi datami („Grafik 05-11.11" zamiast 10; tydzień wcześniej niż trzeba) | 2× w próbce | **nowa ankieta** — sprawdzenie, czy daty pasują do najbliższego tygodnia, przypomnienie o przypięciu |
| upały → ankiety „rano / wieczór" | lato | **pogoda** w składzie dnia (Open-Meteo, bez klucza) |

## Funkcje (każda z osobnym włącznikiem w panelu)

1. **Skład na jutro** (`evening`) — codziennie o godzinie „wieczorem" (domyślnie 20): kto jest w ankiecie na
   jutro, ⚠️ gdy mniej niż „minimum osób" (domyślnie 3), wypisani od wczoraj, rozjazd czatu i ankiety (🔀),
   nieobecności (🚫), klasy przy imionach (🟣 🟠 🌱) i ostrzeżenia, psy (ile naszych, ile spacerów, kto czeka najdłużej, psy dla
   wyznaczonych osób), pogoda. W niedzielę na górze: czy jest ankieta na nowy tydzień.
   `eveningAlways` — wysyłaj codziennie (na czas testów); wyłączone = tylko, gdy jest problem.
2. **Dziś rano** (`morning`) — o godzinie „rano" (domyślnie 7) skład na dziś, **tylko gdy jest problem**
   (mniej niż minimum, brak fioletowego, kandydat bez fioletowego, brak ankiety).
3. **Przegląd tygodnia** (`week`) — w wybrane dni (domyślnie niedziela i środa) o godzinie „wieczorem":
   7 najbliższych dni — liczba osób, ⚠️ słabe dni, dni bez ankiety, podpowiedź „ktoś z niedzieli (6) na
   sobotę (2)?", nieobecności.
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
   dzień tygodnia (`sobota`), data (`31.10`), `tydzień`, `nieobecni`, `nieaktywni`, `ludzie`, `stan`,
   `pomoc`, **`kto 17`** (też `#17`, `17`) — karta kontaktu osoby #17; **udostępniony botowi kontakt** (jeden albo kilka
   naraz) — odpowiedź, kto to na liście: „📇 Gośka = #3 („Gosia") · 🟣 fioletowy", „nie znam tej osoby", „spoza listy
   członków". Bot odpowiada przy najbliższym przebiegu (do 10 min). Inne czaty — nic.

**Członkowie i ich klasy** (od 26.10, zamiast pól „fioletowi" / „nowi"; B83, S146). Panel → „Członkowie": „Pobierz
członków" bierze skład wybranej grupy z bramki (`getGroupData`) — „Grafik" albo **grupę ogłoszeń społeczności, czyli całą
społeczność** (bot jest jej członkiem; skład samej społeczności-rodzica bramka może podawać niepełny) — z imionami
z kontaktów telefonu bota (`getContacts`: nazwa kontaktu, inaczej nazwa z WhatsAppa — po dodaniu nowych kontaktów
„Pobierz członków" jeszcze raz), z wiadomości z „Grafiku" i z pola „Imiona". Przy każdej osobie **numer osoby w nawiasie:
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
wystarczą podsumowania wieczorem i rano (wypisania są w nich jako „wypisali się", z czatu — 🔀 i 🚫).

**Usunięte: „Z czatu"** (cytaty wiadomości o danym dniu w składzie) — 27.10.2026, decyzja właściciela: wiadomość ma docelowo iść
do „Grafiku", więc cytowanie czatu byłoby wklejaniem tego samego w to samo. Zostaje to, czego w czacie wprost nie ma: **🔀** (pisze,
że będzie, a nie ma w ankiecie / pisze, że nie da rady, a dalej jest) i **🚫** (zapowiedziana nieobecność). Notatki z czatu nie
trzymają już treści (tylko kto, kiedy, o których dniach, jaki rodzaj); treść zostaje tylko przy nieobecności — dla „nieobecni",
gdzie oznaczenia osób („@48600111222") idą jako imię albo numer osoby (`helperMentions_`). Skutek: **pomyłka rodzaju wiadomości
(`helperKind_`) ukrywa teraz informację** — wcześniej cytat i tak był w składzie. Przykład z 27.10: „Chociaż nie wpadnę w środę
i czwartek" rozpoznane jako „będzie" (brak „nie wpadnę" w regułach), więc 🔀 nie powie, że osoba z ankiety nie przyjdzie.
B79 pilnuje, że w ciągu dnia nic nie idzie. Nie przywracać bez decyzji właściciela.

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
- **Głosy** (`pollUpdateMessage`): dokumentacja mówi, że powiadomienie dotyczy jednej osoby. Pomocnik bierze
  z niego to, co pewne: jedna osoba w odpowiedziach = jej aktualne wybory; nikt = ta osoba wycofała wszystko;
  dwie i więcej = pełny stan ankiety. Numer głosującego bywa w innym formacie niż numer nadawcy (`@lid`
  zamiast `@c.us`) — pomocnik zapamiętuje to powiązanie (`alias`).
- **Daty ankiety** z pytania („Grafik 26.10-01.11", „Niedziela 16.08", „Nowy grafik 01-05.07") i odpowiedzi
  (dzień tygodnia, „27.07", „rano/wieczór"); bez dat w pytaniu — tydzień od najbliższego poniedziałku.
  Odpowiedź z dopiskiem („Niedziela - AW", „Warszawski dzień zwierząt") liczy się osobno, nie do składu dnia;
  „Nie mogę" — nigdzie.
- **Bez tych powiadomień pomocnik jest ślepy** — tak było na teście 24–25.10.2026: wszystkie cztery wyłączone, kolejka
  pusta, a pomocnik pisał „W Grafiku nie ma jeszcze ankiety", choć ankieta wyszła o 10:13 i ludzie głosowali od rana.
  Dlatego sprawdza ustawienia bramki (`getSettings`) przy każdym przebiegu, dopóki czegoś brakuje (potem co
  `HELPER_GATE_H` godzin), i wtedy **zamiast składów wysyła raz dziennie ostrzeżenie** z listą wyłączonych (B81). Panel
  pokazuje to samo.
- **Bramka nie oddaje bieżącego wyniku ankiety** (`getMessage` daje ankietę bez głosów) — głosy są tylko jako zdarzenia
  osób, w kolejce i w historii czatu (`getChatHistory`), i tylko te, które przyszły przy włączonych powiadomieniach.
  Pomocnik **czyta historię czatu** zaraz po włączeniu powiadomień, przy „Sprawdź teraz" i przed wiadomością o swojej
  porze, gdy na któryś z najbliższych dni nie zna ankiety albo zna ją częściowo (najwyżej co `HELPER_HISTORY_GAP_H` h).
  Ankietę wysłaną przez bota historia ma zawsze (wiadomość z API). **Ankieta sprzed włączenia powiadomień jest niepełna**:
  „co najmniej N os.", „≥" w przeglądzie i od kiedy pomocnik zna głosy; pełny obraz — od następnej ankiety (B81, B82).
  Głos to stan osoby z czasem (`vt`): starszy niż już znany nic nie zmienia, więc historia i kolejka mogą podawać te same
  głosy w dowolnej kolejności.
- **Kolejka jest jedna na instancję**, a test i produkcja dzielą jedną instancję: **pomocnik może być włączony
  tylko w jednym środowisku** (dwa czytające zjadałyby sobie powiadomienia). Na czas testów — na teście;
  wersja produkcyjna nic z kolejki nie czyta.
- **Limit planu Developer** dotyczy też odbierania: „powiadomienia tylko z 3 czatów w miesiącu". W październiku
  komplet to grupa próbna, „Grafik" i właściciel. Czat spoza tej trójki (np. ogłoszenia społeczności) dostaje
  `quotaExceeded` — pomocnik go pomija. **Od 1.11 trzy pierwsze czaty, które się odezwą, zajmą limit** — jeśli
  bot jest w innych grupach, warto go z nich wypisać albo przejść na plan płatny.

## Dane i prywatność

Wszystko we właściwościach skryptu (limit 9 KB na wartość — każda ma sufit `HELPER_BYTES`): ankiety (najwyżej
`HELPER_POLLS_KEEP`), osoby (numer → nazwa z WhatsAppa, najwyżej `HELPER_PEOPLE_MAX`), notatki z czatu na
najbliższe dni (najwyżej `HELPER_NOTES_MAX`, po minionym dniu znikają), nieobecności, znaczniki wysłanych
raportów, dziennik pomocnika do panelu, numery osób (`helperIds`). **Numery telefonów nie opuszczają serwera** (decyzja
właściciela 27.10): nie idą do `getData`, do panelu (PIN) ani do tekstu wiadomości — panel i wiadomości pokazują nazwy
i numery osób „#17"; numer telefonu wychodzi tylko w karcie kontaktu na WhatsAppa właściciela. **Wybór kontaktu w panelu**
(lista dnia i pomocnik — `getDayReportContacts`) też bez numeru (27.10, decyzja właściciela): pozycja to nazwa, a wartość — klucz
kontaktu (`contactKey_`, HMAC z sekretem projektu); zapisany odbiorca w panelu to klucz i nazwa, adres zostaje na serwerze.
Tekst błędów bramki, który idzie do panelu, ma numery zamaskowane (`noPhones_`).
Tokeny bramki — jak dotąd tylko we właściwościach (`greenCall_` wycina je z błędów).

## Bezpieczniki

- Wiadomość tylko do kontaktu prywatnego z ustawień (B74), najwyżej `HELPER_SEND_MAX` na przebieg
  i `HELPER_DAY_MAX` na dzień. Karta kontaktu — też tylko tam, osobno najwyżej `HELPER_CARD_MAX` na dzień.
- Numery osób nadają dwa miejsca (przebieg i „Pobierz członków"), więc zawsze pod blokadą skryptu ze świeżym odczytem
  (`helperNrsAdd_`); przebieg bierze ją na chwilę i tylko wtedy, gdy ktoś nowy nie ma numeru (bez flush i pamięci podręcznej).
- Jeden przebieg naraz (`helperBusy`, `HELPER_BUSY_MS`) — wyzwalacz i „Sprawdź teraz" się nie dublują.
- `helperTick` jest publiczne (wyzwalacz), więc nic nie przyjmuje: przebieg wywołany z zewnątrz robi to samo
  co wyzwalacz, a raporty mają znaczniki „wysłany" — nie da się nim zasypać właściciela wiadomościami.
- Błąd bramki nie wychodzi z wyzwalacza (inaczej mail od Google co 10 minut) — zostaje w dzienniku pomocnika
  w panelu.
- Pomocnik nie pisze do arkusza i nie bierze blokady aplikacji na czas wywołań bramki.

## Do sprawdzenia na teście (pierwsze dni)

1. Czy po włączeniu powiadomień w konsoli przychodzą głosy na ankietę wysłaną z produkcji (`outgoingAPIMessageReceived`
   z ankietą, potem `pollUpdateMessage`) — „stan" w prywatnym czacie albo dziennik pomocnika w panelu.
2. W jakim formacie przychodzą numery głosujących (`@c.us` czy `@lid`) i czy nazwy osób się zgadzają.
3. Czy pełna lista głosujących w powiadomieniu to cały stan ankiety, czy jedna osoba.
4. Które wiadomości są pomocne, a które to szum — wyłączyć w panelu.
5. Numer osoby i karta (27.10, @46): „Pobierz członków" — czy wszyscy mają numer i 📲 (brak 📲 = grupa podała konto `@lid`
   bez kontaktu w telefonie bota); 📲 i „kto 17" — czy karta dochodzi z nazwą „Imię #17" i otwiera właściwą osobę;
   udostępniony botowi kontakt — czy odpowiedź przychodzi (`contactMessage` z `waid=` w vCard — tak mówi dokumentacja).

## Poza zakresem (na później)

Wysyłanie do „Grafiku" (alerty dla wszystkich, zamiast prywatnie), przypinanie ankiety przez bota, wybieg
i rezerwacje wybiegu, odpowiadanie wolontariuszom.

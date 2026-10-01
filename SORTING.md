# Sortowanie i układ listy dnia

Ten dokument opisuje, **z czego** powstaje lista psów na ekranie wolontariusza,
**w jakiej kolejności** i **kiedy** ta kolejność się zmienia. Ma wystarczyć, żeby zmienić
sortowanie bez ponownego odkrywania całej logiki. Kod: `Script.html`, sekcja
„KOLEJNOŚĆ I UKŁAD LISTY" (`buildTiles`, `tileKey`, `sortedRefs`, `decideOrder`,
`layoutDay`), oraz `Dogs.gs` (model spacerów na serwerze).

---

## 1. Co było wcześniej i dlaczego to przebudowaliśmy

Stan dnia był zapisany **na psa**: jeden wiersz na (dzień, pies). Pole `status/kto`
opisywało „bieżący" spacer, a `kto1/godzina1` — pierwszy z dwóch, już odbyty.
Sortowanie liczyło klucz na psa: `[odbyte spacery, status, kolejność z arkusza]`,
a grupy przyklejały się do psa. Z tego wynikały konflikty, których nie dało się
załatać kolejnym wyjątkiem:

| problem | skąd |
|---|---|
| nie da się zarezerwować spaceru 2/2, zanim ktoś wyjdzie z psem rano | jest tylko jedno pole „kto" na psa i dzień |
| pies po pierwszym spacerze spadał pod wszystkie zarezerwowane | pierwszym kryterium był dorobek, a nie to, czy ktoś jest potrzebny |
| grupa „ciągnęła się" na drugi spacer (towarzysz popołudnia wyglądał jak towarzysz poranka) | grupa należała do psa, nie do spaceru; łatano to wyrzucaniem psa z grupy po 1. spacerze |
| pies nie mógł stać w dwóch miejscach listy | kolejność była listą id psów |
| lista przestawiała się z zegara, także tuż przed stuknięciem | 4 s ciszy albo odświeżenie co 15 s — bez zapowiedzi |

## 2. Model danych

### Spacer — jednostka wszystkiego

**Spacer** to trójka *(dzień, pies, numer)*. Ma własny stan:

| pole | znaczenie |
|---|---|
| `status` | `free` (czeka na chętnego) · `reserved` (ktoś się zapisał) · `walked` (odbyty) |
| `who`, `time` | kto zarezerwował / wyprowadził, o której (godzina tylko po spacerze) |
| `group` | numer grupy tego dnia, 0 = spacer bez grupy |

- Arkusz: zakładka **Spacery**, wiersz na spacer: `data | pies_id | spacer | status | kto | godzina | grupa`.
  Brak wiersza = spacer wolny i bez grupy.
- Przeglądarka: `state.slots['data|pies|nr']`; `slotOf(date, id, n)`, `slotsOf(date, dog)`.
- **Ile spacerów ma pies** (`slotCount` / `slotCount_`): tyle, ile `spacery` w katalogu
  (dziś 1 albo 2), **albo więcej**, jeśli dalszy spacer ma już stan — np. prowadząca zmieniła
  psa z 2 na 1 spacer, a na popołudnie ktoś był zapisany. Rezerwacji nie chowamy.
- Model nie ma górnej granicy liczby spacerów. Ograniczenie do 1–2 siedzi wyłącznie
  w katalogu (`validWalks_`, pole „spacery" w edycji psa) i w interfejsie ustawień.

### Grupa

Grupa = spacery **jednego dnia** z tym samym numerem, wychodzące razem. Członkiem grupy
jest **spacer** (`'pies:spacer'`), nie pies. Zasady (serwer: `setGroup`, `leaveGroup_`;
przeglądarka: `commitGroup`, `leaveGroup`):

- jeden pies jest w grupie najwyżej **jednym** spacerem (to jedno wyjście),
- grupa ma co najmniej dwa spacery — gdy zostaje jeden, przestaje być grupą,
- „Zwolnij" zostawia spacer w grupie (grupa czeka na nową rezerwację),
- „Cofnij" (spacer odbyty → wolny) wyprowadza spacer z grupy,
- spacer odbyty nie dołącza do nowej grupy.

### Kafelek

Z spacerów powstają **kafelki** (`buildTiles`):

| kafelek | co zawiera | id |
|---|---|---|
| **główny** psa | wszystkie spacery psa **bez grupy** (1 albo więcej pól) | `m<pies>` |
| **w grupie** | dokładnie jeden spacer z grupą | `s<pies>.<nr>` |

- Kafelek główny istnieje, gdy pies ma choć jeden spacer bez grupy.
- **Pełny** kafelek (`full`) niesie wszystko o psie: trudność, numer i boks, odznakę „bez
  spaceru od…", notatkę. Pełny jest kafelek główny, a gdy go nie ma (wszystkie spacery
  w grupach) — grupowy z najniższym numerem spaceru. Kafelek główny **nie** mówi, gdzie są
  spacery psa w grupach (dawna linijka „1/2 👥 grupa Ola" — zbędna, feedback z testów).
- Pozostałe kafelki grupowe są **odłączone** (`detached`): sama esencja w jednym wierszu —
  imię psa, numer spaceru („1/2"), opiekun i przyciski tego spaceru. Reszta jest na kafelku
  pełnym. Za wąsko na jeden wiersz (poniżej ~412 px przy typowych imionach) — przyciski
  schodzą razem do drugiego.
- Znacznika „👥 grupa" nie ma nigdzie: grupę niesie kolor tła, pasek „GRUPA" z prawej
  w mocnym odcieniu tego koloru (od 1.1.1, klasa `grouped`) i to, że jej kafelki stoją razem
  jednym blokiem.

### Blok

**Blok** to jednostka, która ma miejsce na liście: kafelek główny (sam) albo **cała grupa**
(wszystkie jej kafelki obok siebie).

## 3. Klucz kafelka — reguły i priorytety

Kafelki porównujemy kluczem (krotka; mniejsza = wyżej) — `tileKey` liczy kryteria 1–4, 6, 7,
a `rankKeys` wstawia kryterium 5, bo ono jedno zależy od innych kafelków dnia. Kryteria po kolei:

| # | kryterium | wartość | dlaczego |
|---|---|---|---|
| 1 | czy w kafelku zostało coś do zrobienia | 0 = tak, 1 = wszystko odbyte | odbyte nie potrzebują uwagi — na dół |
| 2 | czy któryś spacer kafelka **czeka na chętnego** | 0 = jest wolny spacer, 1 = wszystko obsadzone | góra listy to to, co trzeba jeszcze obsadzić |
| 3 | ile spacerów dziennie potrzebuje pies | −2 przed −1 | **psy dwuspacerowe mają pierwszeństwo** |
| 4 | ile spacerów pies ma dziś już odbytych (cały pies) | mniej = wyżej | pies bez spaceru przed psem po jednym |
| 5 | **opiekun** (od 1.1.1) | najwcześniejsze miejsce w arkuszu wśród psów tej osoby z tymi samymi 1–4 | psy jednej osoby obok siebie — ale tylko tam, gdzie 1–4 nic nie rozstrzygają |
| 6 | kolejność z arkusza Psy | rosnąco | stała, przewidywalna kolejność remisów |
| 7 | numer spaceru w kafelku | rosnąco | determinizm (np. poranna grupa przed popołudniem) |

Wynik w skrócie: **czekające na chętnego → obsadzone → odbyte**, w każdej części
**najpierw psy dwuspacerowe**, potem ci z mniejszym dorobkiem, potem psy jednej osoby razem,
potem arkusz.

**Kryterium 5 — opiekun** (`ownerOf`, `rankKeys`; zgłoszenie z produkcji 1.1: Draco i Bysiu
u Grzesia, a między nimi trzy inne psy). Opiekun kafelka to jedna osoba, która ma wszystkie
jego zarezerwowane spacery, a na kafelku całym odbytym — która je odbyła (zgłoszenie z testu:
odbyte Barwik i Finito Ali rozdzielone Freją Oli); imię porównujemy jak przy kolorach
(`volNorm`: „Grzesiek" = „grzesiek "). Bez opiekuna: kafelek w grupie (stoi przy grupie),
bez nikogo, z dwiema osobami. **Wszystkie wcześniejsze reguły są ważniejsze** (decyzja właściciela):
opiekun nigdy nie przenosi psa przez granicę reguł 1–4 — pies Grzesia na dwa spacery zostaje
wśród dwuspacerowych, pies z wolnym 2/2 u góry. Pierwsza wersja robiła z psów opiekuna blok
(jak grupa) i podciągała je do najwyżej stojącego — łamała tym reguły 3 i 4. S104 pilnuje
tego przykładem i 40 losowymi dniami (reguły 1–4 nigdy się nie cofają wzdłuż listy, psy jednej
osoby przy tych samych 1–4 zawsze obok siebie).

Kafelek główny psa dwuspacerowego, w którym 1/2 jest zarezerwowany, a 2/2 wolny, trafia
do części „czeka na chętnego" — popołudnie wciąż jest do obsadzenia.

## 4. Bloki i grupy

- Klucz bloku = klucz **najpilniejszego** kafelka bloku (minimum). Grupa stoi więc tam,
  gdzie stanąłby jej najpilniejszy spacer — i „podciąga" resztę składu do siebie.
- W środku grupy kafelki idą po własnym kluczu.
- Psy jednego opiekuna **nie są blokiem** — to kryterium 5 klucza (p. 3), więc nie mogą
  przeskoczyć wcześniejszych reguł tak, jak grupa podciąga swój skład.
- Kolejność spacerów do wyświetlenia (`sortedRefs`): bloki po kluczu → w bloku kafelki po
  kluczu → w kafelku spacery rosnąco. To lista odnośników `'pies.nr'`.

## 5. Psy dwuspacerowe

- W kafelku głównym każdy spacer to **osobne pole** (`.slot`) z numerem `1/2`, `2/2`
  i własnymi przyciskami: „Zarezerwuj", „Wrócił ✓", „Zwolnij", „Cofnij" — **w jednym
  wierszu** na zwykłym telefonie (od 360 px przy typowych imionach). Stąd krótki napis
  `WALK_LABEL` („Wyprowadzony ✓" to 129 px, „Wrócił ✓" 73 px) i przyciski trzymane razem
  (`.acts`): za wąsko — schodzą pod spód razem, a nie samo „Zwolnij".
- Każdy spacer rezerwuje się osobno — **popołudnie można zarezerwować, zanim ktoś wyjdzie
  z psem rano**. Spacer 2/2 można też odhaczyć przed 1/2 (dzień bywa różny).
- Każda akcja jedzie do serwera z numerem spaceru (ostatni argument) — to też czyni
  ponawiane zapisy idempotentnymi (bug nr 9).
- Włączenie drugiego spaceru całej liście nic nie przestawia: odbyty rano spacer to 1/2,
  a 2/2 pojawia się wolny. Powrót do jednego spaceru wyprowadza wolne 2/2 z zaplanowanych
  grup; zarezerwowane albo odbyte 2/2 zostają widoczne.

## 6. Pies w dwóch miejscach

Gdy jeden spacer psa jest w grupie, a inny nie (albo spacery są w różnych grupach),
**z modelu** wynikają dwa kafelki — nie ma na to osobnego wyjątku w interfejsie:

```
┌ Bari            2/2 ───────────┐   ← kafelek główny: 2/2 czeka na chętnego → wysoko
│ [Zarezerwuj]                   │
└────────────────────────────────┘
      …
┌ Bari 1/2  ● Ola  [Wrócił ✓] Zwolnij ┐  ← odłączony 1/2 w bloku grupy (tło w kolorze grupy)
└─────────────────────────────────────┘
┌ Azor  …  (tło w kolorze grupy)      ┐
└─────────────────────────────────────┘
```

Zaznaczanie do grupy (przytrzymanie, potem stuknięcia) działa na **spacerach**:

- w kafelku z jednym spacerem kółko jest na kafelku,
- w kafelku głównym z polami 1/2, 2/2 **każde pole ma własne kółko** — przytrzymanie albo
  stuknięcie pola zaznacza dokładnie ten spacer (`refFromTarget`); poza polem — pierwszy
  jeszcze nieodbyty spacer kafelka,
- stuknięcie 2/2 psa, którego 1/2 jest już zaznaczony, **przenosi** zaznaczenie
  (pies idzie w grupie jednym spacerem); przytrzymanego spaceru nie da się przenieść.

## 7. Kiedy lista się przestawia

Samo „jak posortować" to połowa. Druga połowa to **kiedy**: pies nie może uciec spod palca.

1. **Zamrożenie.** Obowiązująca kolejność (`order`, lista `'pies.nr'`) zmienia się tylko,
   gdy `canReorder()`: zero zapisów w drodze, nikt nie wpisuje imienia ani nie edytuje,
   nie trwa zaznaczanie, a od ostatniego dotknięcia ekranu minęło `T.quiet` (4 s).
2. **Zapowiedź.** Gdy wolno, lista nie rusza od razu: najpierw przez `T.announce` (0,8 s)
   wisi dymek „Aktualizuję…", dopiero potem kafelki się przesuwają. Dotknięcie ekranu
   w tym czasie odwołuje zapowiedź (`markTap`) — po ciszy będzie zapowiedziana od nowa.
3. **Od razu** (bez ciszy i zapowiedzi): zmiana dnia strzałką, zatwierdzenie grupy,
   pierwsze narysowanie listy — to cała nowa lista, którą ktoś właśnie sam zamówił.
4. **Układ w zamrożonej kolejności** (`layoutDay`): idziemy po `order` i każdy blok stawiamy
   w miejscu jego **pierwszego** spaceru. Spacer, który wyszedł z grupy („Cofnij"), pokazuje
   się więc tam, gdzie był, a nie na końcu. Spacery nowe (nowy pies) dochodzą na koniec.
5. **Kliknięcie zmienia kafelek w miejscu** (`patchDog`). Pełny render tylko wtedy, gdy
   zmienił się sam układ (spacer wszedł do grupy albo z niej wyszedł).

Dymek: „Zapisuję…" dopóki cokolwiek leci na serwer, „Aktualizuję…" tylko w oknie zapowiedzi
(`reorderDueAt`, p. 2) — gdy ruch jest już przesądzony. Nie przez całą ciszę przed nim: przy
ciągłej pracy dymek świeciłby bez przerwy (review PR #2, S99). Dotknięcie, które odwołuje
zapowiedź, gasi go od razu. Znika najwcześniej po `T.busyMin`.

## 8. Osłona stuknięć

Zgłoszenie z terenu: „kliknąłem w jednego psa, a zapisało się na innym". Poza zapowiedzią
ruchu (p. 7) przeglądarka **odrzuca stuknięcie** w akcję na spacerze (`tapRefused`), gdy:

- lista przesunęła się między przyłożeniem palca a kliknięciem albo w ciągu `T.tapGuard`
  (0,5 s) przed przyłożeniem — z komunikatem „Lista się przesunęła…",
- kafelek pod palcem zmienił się w tym samym oknie: cudzą ręką (odświeżenie) — z komunikatem,
  własnym poprzednim stuknięciem — po cichu (to podwójne stuknięcie: „OK" → „Zwolnij").

Dotyczy tylko prawdziwych stuknięć (`e.detail > 0`); Enter z klawiatury idzie zawsze.

Każda zmiana listy i kafelka jest notowana z przyczyną (`noteLayout`, `noteTile`):

| przyczyna | skąd | osłona |
|---|---|---|
| `'data'`, `'reorder'` | odpowiedź serwera, odświeżenie, przestawienie z zegara | odrzuca z komunikatem |
| `'self'` | własne stuknięcie w akcję na kafelku | ruch listy — nie; ten kafelek — po cichu (podwójne stuknięcie) |
| `'nav'` | strzałka dnia, zakładki, zaznaczanie, „Grupa", „Anuluj" | nie blokuje |

`'nav'` jest osobno, bo jako `'self'` osłona zjadała **po cichu** stuknięcie zaraz po
strzałce (review PR #2: po 0 i 300 ms „Zarezerwuj" nie robiło nic, bez słowa — S98).
Kto sam zmienił listę, patrzy na nową.

## 9. Przykłady

Oznaczenia: `W` wolny, `R` zarezerwowany, `✓` odbyty.

### A. Mieszana lista (test S90)

| pies | spacery | klucz | miejsce |
|---|---|---|---|
| Bari (2) | W, W | 0,0,−2,0 | 1 |
| Ela (2) | R, W | 0,0,−2,0 | 2 — popołudnie wolne, więc „czeka" |
| Cezar (2) | ✓, W | 0,0,−2,1 | 3 — ma już jeden spacer |
| Azor (1) | W | 0,0,−1,0 | 4 — jednospacerowy pod dwuspacerowymi |
| Fado (2) | ✓, R | 0,1,−2,1 | 5 — wszystko obsadzone |
| Dino (1) | R | 0,1,−1,0 | 6 |
| Hera (2) | ✓, ✓ | 1,1,−2,2 | 7 |
| Gapa (1) | ✓ | 1,1,−1,1 | 8 |

### B. Grupa podciąga skład (S90)

Dino R (arkusz 1), Bari W (2), Cezar W w grupie z Azorem R (3, 4).
Bez grupy: Bari, Cezar, Dino, Azor. Z grupą blok ma klucz Cezara (wolny), więc:
**Bari, [Cezar, Azor], Dino** — zarezerwowany Azor stoi przy swojej grupie, nad Dinem.

### C. Pies w dwóch miejscach (S80, S97)

Azor R i Bari 1/2 R w grupie; Bari 2/2 wolny; Cezar W.
Kafelki: `m2` (Bari 2/2 — czeka, dwuspacerowy), `m3` (Cezar), grupa `[s2.1, s1.1]`.
Lista: **Bari 2/2, Cezar, [Bari 1/2, Azor]**. „Wrócił ✓" w grupie odhacza Azora
i Bariego 1/2 — 2/2 zostaje nietknięty. Rezerwacja 2/2 idzie z numerem spaceru 2.

### D. „Cofnij" w grupie przy zamrożonej liście (S91)

Bari 1/2 ✓ w grupie z Cezarem ✓, Bari 2/2 W, Dino W. Lista: `m1` (2/2), `m3`, `[s1.1, s2.1]`.
„Cofnij" na Barim 1/2: spacer wychodzi z grupy i dołącza do kafelka głównego (pola 1/2 i 2/2),
Cezar zostaje sam, więc grupa znika. W zamrożonej liście **nic nie skacze**: Cezar stoi
tam, gdzie stał jego spacer w grupie. Po ciszy i zapowiedzi lista się układa.

### E. Lista zgłoszona z terenu (S47)

Same psy dwuspacerowe. Kolejność: Barwik, Freja, Lego, Marvel (nic nie odbyte, wszystko
wolne), Bibi, Ever (1/2 zarezerwowany, ale 2/2 wolny — też „czekają"), Finito (1/2 odbyty,
2/2 wolny), Witkacy (1/2 odbyty, 2/2 zarezerwowany — obsadzony), Siena (komplet).

## 10. Jak zmieniać sortowanie

1. **Kolejność kryteriów** to wyłącznie `tileKey` w `Script.html` (plus `rankKeys`, który
   wstawia kryterium 5 — opiekuna). Dopisanie kryterium = dopisanie pozycji w krotce
   w odpowiednim miejscu (i opisu w tabeli w p. 3). Kryterium, które ma działać „tylko gdy
   wcześniejsze nic nie rozstrzygają", to pozycja w krotce — **nie blok**: blok przenosi
   kafelki przez granice wcześniejszych reguł (tak było z pierwszą wersją opiekuna).
2. **Nie ruszaj** bez potrzeby: bloku grupy (klucz = minimum), układania w miejscu
   pierwszego spaceru (`layoutDay`) ani zamrożenia/zapowiedzi (`decideOrder`) — to one
   pilnują, że nic nie ucieka spod palca.
3. Testy, które opisują kolejność i trzeba je zaktualizować świadomie: **S90** (reguły),
   **S104** (opiekun — kryterium 5, z losowymi dniami),
   **S47** (lista z terenu), S43–S45 (zamrożenie), S80, S91, S97 (pies w dwóch miejscach,
   stabilność układu), S93–S94 (osłona i zapowiedź). Każdy nowy wyjątek = nowy scenariusz.
4. **Trzeci spacer:** model i sortowanie są gotowe (numery spacerów, `slotCount`).
   Potrzebne byłoby: dopuszczenie 3 w `validWalks_` i w edycji psa, sprawdzenie układu pól
   w kafelku na wąskim ekranie. Reguła 3 (−spacery dziennie) sama da takim psom pierwszeństwo.

## 11. Przypadki brzegowe i ograniczenia

- Pies ze wszystkimi spacerami w grupach nie ma kafelka głównego — pełny jest wtedy jego
  kafelek grupowy o najniższym numerze (nawet jeśli to spacer już odbyty).
- Grupa z samymi odbytymi spacerami stoi na dole jako blok; „Cofnij" jednego z nich
  wyprowadza go z grupy.
- Kolor wolontariusza zależy od przydziału dnia na serwerze; zanim przyjdzie odpowiedź,
  telefon liczy go tą samą funkcją — przy dwóch telefonach zapisujących **nowe** osoby
  w tej samej sekundzie kolor jednej z nich może się raz zmienić po odświeżeniu.
- Osłona stuknięć odrzuca stuknięcie do 0,5 s po zmianie — szybkie, zamierzone „Zarezerwuj,
  OK, Wyprowadzony" w pół sekundy wymaga powtórzenia ostatniego stuknięcia.

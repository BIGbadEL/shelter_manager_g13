/**
 * G13 Spacery — PSY I ICH DNI.
 *
 * Dwie rzeczy, trzymane osobno:
 *  - zakładka Psy — KATALOG: kim jest pies (imię, boks, trudność, notatka,
 *    ile spacerów dziennie). Nie wie nic o żadnym konkretnym dniu.
 *  - zakładka Spacery — co się z psem dzieje KONKRETNEGO DNIA: jeden wiersz
 *    na parę (data, pies). Brak wiersza = pies tego dnia wolny.
 *
 * Dzięki temu rezerwacja na sobotę to po prostu wiersz z sobotnią datą,
 * a nocne czyszczenie niczego nie zeruje — kolejny dzień ma własne, puste
 * wiersze. Dawniej stan dnia siedział wprost w wierszu psa i arkusz znał
 * tylko jeden dzień naraz.
 *
 * Wydajność: akcje wolontariuszy zwracają TYLKO zmienionego psa ({dog}),
 * nie cały stan — interfejs jest optymistyczny i dosynchronizowuje się
 * z okresowego odświeżania. Rzadkie akcje edycyjne zwracają pełny stan.
 */

/* ---------- KATALOG ---------- */

/** Surowy wiersz zakładki Psy -> pies z katalogu (kim jest, bez stanu dnia). */
function mapDogRow_(r) {
  return {
    id:        Number(r[DOG.ID - 1]),
    name:      String(r[DOG.NAME - 1] || ''),
    ident:     String(r[DOG.IDENT - 1] || ''),
    box:       String(r[DOG.BOX - 1] || ''),
    dif:       String(r[DOG.DIF - 1]) || 'easy',
    lastWalk:  cellDate_(r[DOG.LAST_WALK - 1]),
    note:      String(r[DOG.NOTE - 1] || ''),
    walks:     Number(r[DOG.WALKS - 1]) === 2 ? 2 : 1,
    noteUntil: cellDate_(r[DOG.NOTE_UNTIL - 1]),
  };
}

function readDogCatalog_() {
  const sh = ss_().getSheetByName(SHEETS.DOGS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, DOG_WIDTH).getValues()
    .filter(r => r[DOG.ID - 1] !== '' && r[DOG.ID - 1] !== null)
    .map(mapDogRow_);
}

/** Wiersz psa po numerze wiersza — jeden odczyt zakresu. */
function readDogRow_(sh, row) {
  return sh.getRange(row, 1, 1, DOG_WIDTH).getValues()[0];
}

/** Jeden pies z katalogu albo null. */
function catalogDog_(id) {
  const sh = ss_().getSheetByName(SHEETS.DOGS);
  const row = rowById_(sh, id);
  return row < 0 ? null : mapDogRow_(readDogRow_(sh, row));
}

/* ---------- DZIEŃ PSA (zakładka Spacery) ---------- */

function emptyWalk_(date, id) {
  return { date: date, dogId: Number(id), status: STATUS.FREE, who: '', time: '', who1: '', time1: '' };
}

function mapWalkRow_(r) {
  return {
    date:   cellDate_(r[WALK.DATE - 1]),
    dogId:  Number(r[WALK.DOG - 1]),
    status: String(r[WALK.STATUS - 1] || '') || STATUS.FREE,
    who:    String(r[WALK.WHO - 1] || ''),
    time:   cellTime_(r[WALK.TIME - 1]),
    who1:   String(r[WALK.WHO1 - 1] || ''),
    time1:  cellTime_(r[WALK.TIME1 - 1]),
  };
}

function walkToRow_(w) {
  return [w.date, w.dogId, w.status, w.who, w.time, w.who1, w.time1];
}

/** Czy wiersz niesie cokolwiek poza „wolny" — pusty znaczy dokładnie to samo, co brak wiersza. */
function hasWalkState_(w) {
  return w.status === STATUS.RESERVED || w.status === STATUS.WALKED || w.who1 !== '';
}

/** Pies z katalogu połączony z tym, co się z nim dzieje danego dnia. */
function withWalk_(dog, w) {
  const s = w || emptyWalk_('', dog.id);
  return Object.assign({}, dog, {
    status: s.status, who: s.who, time: s.time, who1: s.who1, time1: s.time1,
  });
}

/** Zakładka Spacery, gdy blokada jest już wzięta. Brakującą zakłada na miejscu. */
function walksSheetLocked_() {
  return ss_().getSheetByName(SHEETS.WALKS) || createWalksSheet_();
}

/**
 * Zakładka Spacery z dowolnego miejsca. Zakładanie idzie pod blokadą, bo kilka
 * telefonów tuż po wdrożeniu pyta naraz, a drugie insertSheet z tą samą nazwą
 * rzuciłoby błędem. withLock_ znosi zagnieżdżenie, więc można to wołać także
 * spod akcji, która blokadę już trzyma.
 */
function walksSheet_() {
  return ss_().getSheetByName(SHEETS.WALKS) || withLock_(walksSheetLocked_);
}

function createWalksSheet_() {
  const sh = ss_().insertSheet(SHEETS.WALKS);
  sh.getRange(1, 1, 1, WALK_WIDTH).setValues([WALK_HEADERS]);
  sh.setFrozenRows(1);
  [WALK.DATE, WALK.TIME, WALK.TIME1]
    .forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'));   // bug z datą 1899
  importDayState_(sh);
  return sh;
}

/**
 * JEDNORAZOWE przeniesienie stanu dnia ze starych kolumn Psy do zakładki Spacery.
 *
 * Dzieje się samo, przy pierwszym dostępie po wdrożeniu wersji z datami —
 * żadnego ręcznego kroku do zapomnienia i żadnego okna, w którym aplikacja
 * pokazywałaby wszystkie psy jako wolne. Stan trafia pod bieżący dzień
 * rezerwacyjny; stąd zalecenie, żeby nie wdrażać w godzinie czyszczenia
 * (patrz README): wtedy stan sprzed czyszczenia dostałby już jutrzejszą datę.
 *
 * Właściwość skryptu pilnuje, że to się dzieje RAZ. Bez niej ktoś, kto kiedyś
 * skasuje zakładkę Spacery, wskrzesiłby tygodniowy stan z Psy jako dzisiejszy.
 * Starych kolumn nie czyścimy — przydadzą się, gdyby trzeba było cofnąć wdrożenie.
 */
function importDayState_(sh) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_WALKS_IMPORTED)) return;

  const date = businessDate_();
  const dogs = ss_().getSheetByName(SHEETS.DOGS);
  const last = dogs ? dogs.getLastRow() : 0;
  const rows = [];
  if (last >= 2) {
    dogs.getRange(2, 1, last - 1, DOG_WIDTH).getValues().forEach(r => {
      if (r[DOG.ID - 1] === '' || r[DOG.ID - 1] === null) return;
      const w = {
        date:   date,
        dogId:  Number(r[DOG.ID - 1]),
        status: String(r[DOG.STATUS - 1] || '') || STATUS.FREE,
        who:    String(r[DOG.WHO - 1] || ''),
        time:   cellTime_(r[DOG.TIME - 1]),
        who1:   String(r[DOG.WHO1 - 1] || ''),
        time1:  cellTime_(r[DOG.TIME1 - 1]),
      };
      if (hasWalkState_(w)) rows.push(walkToRow_(w));
    });
  }
  if (rows.length) sh.getRange(2, 1, rows.length, WALK_WIDTH).setValues(rows);
  props.setProperty(PROP_WALKS_IMPORTED, date);
}

/** Wszystkie wiersze zakładki Spacery (dni otwarte + ewentualnie jeszcze niezamknięte). */
function readWalks_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues()
    .map(mapWalkRow_)
    .filter(w => isDate_(w.date) && w.dogId > 0);
}

/** Numer wiersza pary (data, pies) w zakładce Spacery albo -1. */
function walkRow_(sh, date, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const keys = sh.getRange(2, 1, last - 1, 2).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (cellDate_(keys[i][0]) === date && Number(keys[i][1]) === Number(id)) return i + 2;
  }
  return -1;
}

/**
 * Psy z katalogu ze stanem BIEŻĄCEGO dnia rezerwacyjnego — dokładnie ten kształt,
 * który znają karty otwarte jeszcze przed wprowadzeniem dat.
 */
function readDogs_() {
  const date = businessDate_();
  const state = {};
  readWalks_(walksSheet_()).forEach(w => { if (w.date === date) state[w.dogId] = w; });
  return readDogCatalog_().map(d => withWalk_(d, state[d.id]));
}

/* ---------- AKCJE WOLONTARIUSZY (zwracają {dog}) ---------- */

/**
 * Data akcji. Brak daty = bieżący dzień rezerwacyjny: tak wołają karty otwarte
 * jeszcze przed wprowadzeniem dat, i mają dalej działać.
 *
 * Miniony dzień jest tylko do podglądu. Zmiana dnia wypada punktualnie o godzinie
 * czyszczenia, więc klik z ekranu otwartego minutę wcześniej dostaje tu jasny
 * komunikat, a telefon po odświeżeniu przechodzi na nowy dzień.
 */
function actionDate_(date) {
  const current = businessDate_();
  const d = (date == null || date === '') ? current : String(date);
  if (!isDate_(d)) throw new Error('Nieprawidłowa data');
  if (d < current) throw new Error('Ten dzień jest już zamknięty — można go tylko przeglądać');
  return { date: d, current: d === current };
}

/**
 * Wspólny szkielet akcji na psie danego dnia: pod blokadą czyta pies + wiersz
 * dnia, `change` modyfikuje wiersz i mówi, czy jest co zapisać. Zwraca psa
 * w stanie z tego dnia — interfejs porównuje go ze swoim optymistycznym.
 */
function dogAction_(id, date, change) {
  return withLock_(() => {
    const dog = catalogDog_(id);
    if (!dog) return { dog: null };
    const sh = walksSheetLocked_();
    const row = walkRow_(sh, date, id);
    const w = row > 0 ? mapWalkRow_(sh.getRange(row, 1, 1, WALK_WIDTH).getValues()[0])
                      : emptyWalk_(date, id);
    if (change(w, dog)) {
      sh.getRange(row > 0 ? row : sh.getLastRow() + 1, 1, 1, WALK_WIDTH).setValues([walkToRow_(w)]);
    }
    return { dog: Object.assign(withWalk_(dog, w), { date: date }) };
  });
}

/**
 * Rezerwuje psa na dany dzień — tylko jeśli tego dnia wciąż wolny (kto pierwszy,
 * ten lepszy). Działa na bieżący dzień i dowolny przyszły.
 */
function reserve(id, name, date) {
  const a = actionDate_(date);
  return dogAction_(id, a.date, w => {
    if (w.status !== STATUS.FREE) return false;
    w.status = STATUS.RESERVED;
    w.who = clean_(name);
    w.time = '';
    return true;
  });
}

/**
 * Oznacza spacer jako odbyty; bez podanego imienia zachowuje rezerwującego.
 * Tylko na bieżący dzień — w przyszłości nie ma czego odhaczać.
 *
 * Pies na 2 spacery dziennie: pierwszy spacer zapisuje się w kto1/godzina1,
 * a pies wraca na "wolny" (do wzięcia drugi raz). Dopiero drugi spacer
 * przechodzi w pełny status "wyprowadzony".
 *
 * `slot` mówi, KTÓRY spacer odhaczamy: 1 = pierwszy z dwóch, 2 = ostatni
 * (jedyny albo drugi). Klient wie to w chwili kliknięcia i musi to powiedzieć,
 * bo to jedyne, co czyni ten zapis idempotentnym — a jest on automatycznie
 * ponawiany po zaginionej odpowiedzi (na telefonie to codzienność).
 * Bez slotu ponowienie pierwszego spaceru trafiało w gałąź "drugi spacer"
 * (kto1 było już wypełnione) i robiło z psa wyprowadzonego 2/2 z pustym "kto",
 * a do Historii wpadał wpis bez osoby. Brak slotu = stare zachowanie, dla
 * karty otwartej jeszcze przed tym wdrożeniem.
 */
function markWalked(id, name, slot, date) {
  const a = actionDate_(date);
  if (!a.current) throw new Error('Spacer odhaczysz dopiero w dniu spaceru');
  return dogAction_(id, a.date, (w, dog) => {
    const firstDone = w.who1 !== '';
    const first = dog.walks === 2 && (slot == null ? !firstDone : Number(slot) === 1);

    if (first) {
      if (firstDone) return false;          // powtórka zapisu, który już przeszedł — nic nie ruszamy
      w.who1 = clean_(name) || w.who;
      w.time1 = now_();
      w.status = STATUS.FREE;
      w.who = '';
      w.time = '';
      return true;
    }

    if (w.status === STATUS.WALKED) return false;   // jw. — nie przestawiamy godziny ani imienia
    w.status = STATUS.WALKED;
    w.who = clean_(name) || w.who;
    w.time = now_();
    return true;
  });
}

/** Cofa omyłkowo odhaczony PIERWSZY z dwóch spacerów (tylko bieżący dzień). */
function undoFirstWalk(id, date) {
  const a = actionDate_(date);
  if (!a.current) throw new Error('Spacer odhaczysz dopiero w dniu spaceru');
  return dogAction_(id, a.date, w => {
    if (!w.who1) return false;
    w.who1 = '';
    w.time1 = '';
    return true;
  });
}

/** Cofa psa do stanu "wolny" danego dnia (zwolnienie rezerwacji albo cofnięcie spaceru). */
function setFree(id, date) {
  const a = actionDate_(date);
  return dogAction_(id, a.date, w => {
    if (w.status === STATUS.FREE && !w.who && !w.time) return false;
    w.status = STATUS.FREE;
    w.who = '';
    w.time = '';
    return true;
  });
}

/* ---------- AKCJE EDYCYJNE — chronione PIN-em (zwracają pełny stan) ---------- */

/**
 * Termin ważności notatki: 'yyyy-MM-dd', NOTE_FOREVER albo ''.
 * Pusto oznacza zachowanie domyślne: notatka znika przy najbliższym czyszczeniu.
 * NOTE_FOREVER — nie znika nigdy, dopóki ktoś jej nie skasuje.
 * Data z przeszłości albo termin bez notatki nie ma sensu — normalizujemy do pustej,
 * żeby w arkuszu nie zostawały terminy, których nikt już nie zobaczy.
 */
function noteUntil_(v, note) {
  const s = clean_(v, 10);
  if (!note || !s) return '';
  if (s === NOTE_FOREVER) return s;
  if (!isDate_(s)) return '';
  return s < today_() ? '' : s;
}

/** Wymusza: pies musi mieć imię LUB identyfikator (nowy pies bywa bez imienia). */
function dogFields_(data) {
  const name  = clean_(data && data.name,  MAX_LEN.NAME);
  const ident = clean_(data && data.ident, MAX_LEN.IDENT);
  const box   = clean_(data && data.box,   MAX_LEN.BOX);
  const note  = clean_(data && data.note,  MAX_LEN.NOTE);
  const walks = Number(data && data.walks) === 2 ? 2 : 1;
  if (!name && !ident) throw new Error('Podaj imię lub nr identyfikacyjny');
  return { name, ident, box, dif: validDif_(data && data.dif), note, walks,
           noteUntil: noteUntil_(data && data.noteUntil, note) };
}

/** data = { name, ident, box, dif } — wszystko opcjonalne poza regułą wyżej. */
function addDog(data, pin) {
  requirePin_(pin);
  const d = dogFields_(data);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    sh.appendRow([nextId_(sh), d.name, d.ident, d.box, d.dif, STATUS.FREE, '', '', '',
                  d.note, d.walks, '', '', d.noteUntil]);
    return getData();
  });
}

/** Edycja psa: nadanie/zmiana imienia, identyfikatora, boksu, trudności. */
function updateDog(id, data, pin) {
  requirePin_(pin);
  const d = dogFields_(data);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      sh.getRange(row, DOG.NAME, 1, 4).setValues([[d.name, d.ident, d.box, d.dif]]);
      sh.getRange(row, DOG.NOTE, 1, 2).setValues([[d.note, d.walks]]);
      sh.getRange(row, DOG.NOTE_UNTIL).setValue(d.noteUntil);   // kolumna niesąsiadująca z notatką
    }
    return getData();
  });
}

/** Dozwolona liczba spacerów dziennie. Śmieci odrzucamy, zamiast po cichu naprawiać. */
function validWalks_(walks) {
  const w = Number(walks);
  if (w !== 1 && w !== 2) throw new Error('Liczba spacerów musi wynosić 1 albo 2');
  return w;
}

/**
 * Przestawia CAŁĄ listę na 1 albo 2 spacery dziennie — ustawienie psa na stałe,
 * obowiązujące we wszystkie kolejne dni, dopóki ktoś go nie cofnie.
 * Schronisko dopuszcza drugi spacer przy upałach, decyzja bywa z godziny na
 * godzinę, a przeklikiwanie trzydziestu psów z osobna odpada.
 *
 * Sama kolumna to za mało, bo w środku BIEŻĄCEGO dnia część psów ma już coś
 * odbyte:
 *  - włączamy 2 spacery: pies „wyprowadzony" (miał jeden spacer) staje się psem
 *    po PIERWSZYM z dwóch — wraca na „wolny", a odbyty spacer ląduje w kto1/godzina1,
 *    dokładnie tak, jak zapisałby to markWalked;
 *  - wracamy do 1 spaceru: pies „wolny" po pierwszym z dwóch ma swoje z głowy,
 *    więc staje się „wyprowadzony" tym właśnie spacerem.
 * Dni przyszłe mają same rezerwacje, więc nie ma w nich czego przestawiać.
 *
 * Czego NIE ruszamy: psów zarezerwowanych (ktoś je właśnie prowadzi — zmiana
 * statusu pod ręką wolontariusza byłaby wrogim gestem) oraz psa, który ma już
 * oba spacery odbyte (skasowanie kto1 zabrałoby Historii jeden z nich).
 *
 * Wywołanie dwa razy z tą samą wartością nie zmienia niczego drugi raz —
 * dlatego zapis może być bezpiecznie ponawiany po zaginionej odpowiedzi.
 */
function setAllWalks(walks, pin) {
  requirePin_(pin);
  const n = validWalks_(walks);
  return withLock_(() => {
    const dogs = ss_().getSheetByName(SHEETS.DOGS);
    const lastDog = dogs.getLastRow();
    if (lastDog >= 2) {
      const col = dogs.getRange(2, DOG.WALKS, lastDog - 1, 1).getValues()
        .map(() => [n]);
      dogs.getRange(2, DOG.WALKS, lastDog - 1, 1).setValues(col);
    }

    const date = businessDate_();
    const sh = walksSheetLocked_();
    const last = sh.getLastRow();
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues();
      rows.forEach((r, i) => {
        const w = mapWalkRow_(r);
        if (w.date !== date) return;
        if (n === 2 && w.status === STATUS.WALKED && !w.who1) {
          w.who1 = w.who; w.time1 = w.time;
          w.status = STATUS.FREE; w.who = ''; w.time = '';
        } else if (n === 1 && w.status === STATUS.FREE && w.who1) {
          w.who = w.who1; w.time = w.time1;
          w.status = STATUS.WALKED; w.who1 = ''; w.time1 = '';
        } else {
          return;
        }
        rows[i] = walkToRow_(w);
      });
      sh.getRange(2, 1, rows.length, WALK_WIDTH).setValues(rows);
    }
    return getData();
  });
}

/**
 * Usuwa psa z katalogu. Spacery, które już się odbyły (a dzień nie jest jeszcze
 * zamknięty), najpierw trafiają do Historii — tu, póki jeszcze znamy imię.
 * Pies adoptowany po południu miał rano spacer, i ten spacer ma zostać
 * w Historii pod imieniem, a nie jako „Pies 17". Przyszłe rezerwacje przepadają.
 */
function removeDog(id, pin) {
  requirePin_(pin);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      closeWalks_(w => w.dogId === Number(id));
      sh.deleteRow(row);
    }
    return getData();
  });
}

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
  return { date: date, dogId: Number(id), status: STATUS.FREE, who: '', time: '', who1: '', time1: '',
           group: 0 };
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
    group:  Number(r[WALK.GROUP - 1]) || 0,
  };
}

function walkToRow_(w) {
  return [w.date, w.dogId, w.status, w.who, w.time, w.who1, w.time1, w.group || ''];
}

/**
 * Czy wiersz niesie cokolwiek poza „wolny bez grupy" — pusty znaczy dokładnie to samo,
 * co brak wiersza. Wolny pies w grupie to już stan: zaplanowany spacer grupowy.
 */
function hasWalkState_(w) {
  return w.status === STATUS.RESERVED || w.status === STATUS.WALKED || w.who1 !== '' || w.group > 0;
}

/** Pies z katalogu połączony z tym, co się z nim dzieje danego dnia. */
function withWalk_(dog, w) {
  const s = w || emptyWalk_('', dog.id);
  return Object.assign({}, dog, {
    status: s.status, who: s.who, time: s.time, who1: s.who1, time1: s.time1, group: s.group || 0,
  });
}

/** Czy zakładka Spacery ma już kolumnę `grupa` — sprawdzamy raz na wywołanie. */
let walkColsOk_ = false;

/**
 * Zakładka Spacery założona przed wprowadzeniem grup ma o kolumnę mniej, a getRange
 * poza szerokością arkusza rzuca błędem (pułapka z CLAUDE.md). Dokładamy ją sami,
 * przy pierwszym dostępie — tak jak samą zakładkę — zamiast liczyć, że ktoś
 * pamięta o migrate(). Dokładanie pod blokadą, z ponownym sprawdzeniem.
 */
function ensureWalkColumns_(sh) {
  if (walkColsOk_) return sh;
  const header = WALK_HEADERS[WALK.GROUP - 1];
  const fine = () => sh.getMaxColumns() >= WALK_WIDTH
                  && String(sh.getRange(1, WALK.GROUP).getValue()) === header;
  if (!fine()) {
    withLock_(() => {
      if (sh.getMaxColumns() < WALK_WIDTH) sh.insertColumnsAfter(sh.getMaxColumns(), WALK_WIDTH - sh.getMaxColumns());
      if (String(sh.getRange(1, WALK.GROUP).getValue()) !== header) sh.getRange(1, WALK.GROUP).setValue(header);
    });
  }
  walkColsOk_ = true;
  return sh;
}

/** Zakładka Spacery, gdy blokada jest już wzięta. Brakującą zakłada na miejscu. */
function walksSheetLocked_() {
  return ensureWalkColumns_(ss_().getSheetByName(SHEETS.WALKS) || createWalksSheet_());
}

/**
 * Zakładka Spacery z dowolnego miejsca. Zakładanie idzie pod blokadą, bo kilka
 * telefonów tuż po wdrożeniu pyta naraz, a drugie insertSheet z tą samą nazwą
 * rzuciłoby błędem. withLock_ znosi zagnieżdżenie, więc można to wołać także
 * spod akcji, która blokadę już trzyma.
 */
function walksSheet_() {
  const sh = ss_().getSheetByName(SHEETS.WALKS);
  return sh ? ensureWalkColumns_(sh) : withLock_(walksSheetLocked_);
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

/**
 * Jeden dzień zakładki Spacery do zmiany pod blokadą: odczyt raz, zapis tylko
 * zmienionych wierszy. Akcja na psie widzi cały dzień, bo może ruszyć też jego grupę.
 */
function walkDay_(sh, date) {
  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues() : [];
  const day = {};                                    // pies -> indeks jego wiersza tego dnia
  rows.forEach((r, i) => { const w = mapWalkRow_(r); if (w.date === date) day[w.dogId] = i; });
  const changed = {};
  const walk = id => day[id] === undefined ? emptyWalk_(date, id) : mapWalkRow_(rows[day[id]]);
  return {
    walk: walk,
    ids: () => Object.keys(day).map(Number),
    inGroup: g => Object.keys(day).map(Number).filter(id => walk(id).group === g),
    put: w => {
      if (day[w.dogId] === undefined) { rows.push(walkToRow_(w)); day[w.dogId] = rows.length - 1; }
      else rows[day[w.dogId]] = walkToRow_(w);
      changed[day[w.dogId]] = true;
    },
    save: () => Object.keys(changed).forEach(k =>
      sh.getRange(Number(k) + 2, 1, 1, WALK_WIDTH).setValues([rows[Number(k)]])),
  };
}

/**
 * Pies wychodzi ze swojej grupy; grupa, w której został jeden pies, przestaje być grupą.
 *
 * Grupa to JEDEN wspólny spacer. Wychodzi z niej pies, którego spacer cofnięto,
 * i pies na dwa spacery po pierwszym z nich — drugi spacer planuje się osobno.
 * Gdyby został, nowy towarzysz drugiego spaceru trafiałby do grupy, z którą pies
 * szedł rano, i wyglądałoby, jakby tamte psy szły razem z nowym.
 * „Zwolnij" psa NIE wyprowadza z grupy: grupa czeka wtedy na nową rezerwację.
 */
function leaveGroup_(d, w) {
  const g = w.group;
  if (!g) return;
  w.group = 0;
  d.put(w);
  const left = d.inGroup(g);
  if (left.length === 1) {
    const lone = d.walk(left[0]);
    lone.group = 0;
    d.put(lone);
  }
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
 * Wspólny szkielet akcji na psie danego dnia: pod blokadą czyta pies + dzień,
 * `change(w, dog, d)` modyfikuje wiersz psa (i przez `d` ewentualnie jego grupę)
 * i mówi, czy jest co zapisać. Zwraca psa w stanie z tego dnia — interfejs
 * porównuje go ze swoim optymistycznym.
 */
function dogAction_(id, date, change) {
  return withLock_(() => {
    const dog = catalogDog_(id);
    if (!dog) return { dog: null };
    const d = walkDay_(walksSheetLocked_(), date);
    const w = d.walk(Number(id));
    if (change(w, dog, d)) {
      d.put(w);
      d.save();
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
  return dogAction_(id, a.date, (w, dog, d) => {
    const firstDone = w.who1 !== '';
    const first = dog.walks === 2 && (slot == null ? !firstDone : Number(slot) === 1);

    if (first) {
      if (firstDone) return false;          // powtórka zapisu, który już przeszedł — nic nie ruszamy
      w.who1 = clean_(name) || w.who;
      w.time1 = now_();
      w.status = STATUS.FREE;
      w.who = '';
      w.time = '';
      leaveGroup_(d, w);                    // drugi spacer to osobny spacer — i osobna grupa
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

/**
 * Cofa psa do stanu "wolny" danego dnia: „Zwolnij" (rezerwacja) albo „Cofnij" (spacer).
 *
 * Zwolniony pies ZOSTAJE w grupie — grupa czeka na nową rezerwację, jak przy
 * planowaniu. Cofnięty spacer wyprowadza psa z grupy (leaveGroup_): tamten
 * wspólny spacer już się odbył, a on w nim — jak się okazało — nie był.
 * Powtórka po zaginionej odpowiedzi trafia na psa już wolnego i niczego nie rusza.
 */
function setFree(id, date) {
  const a = actionDate_(date);
  return dogAction_(id, a.date, (w, dog, d) => {
    if (w.status === STATUS.FREE && !w.who && !w.time) return false;   // nic do zwalniania
    const undo = w.status === STATUS.WALKED;
    w.status = STATUS.FREE;
    w.who = '';
    w.time = '';
    if (undo) leaveGroup_(d, w);
    return true;
  });
}

/**
 * GRUPA — psy wyprowadzane razem danego dnia (spacer grupowy). Ustawia każdy
 * wolontariusz, bez PIN-u; na bieżący dzień i na przyszłe, nigdy na miniony.
 *
 * `ids` to skład grupy PO zmianie, `gid` — 0 dla nowej grupy albo numer grupy,
 * którą zmieniamy. Mniej niż dwa psy = grupa się rozwiązuje. Nowa grupa dostaje
 * kolejny numer tego dnia; od numeru zależy kolor w interfejsie, więc każda
 * następna grupa jest w innym kolorze — i w tym samym na wszystkich telefonach.
 *
 * Pies przeniesiony z innej grupy znika z tamtej, a grupa, w której został jeden
 * pies, przestaje być grupą. Pies po spacerze nie dołącza do nowej grupy — nie ma
 * już czego planować razem — ale ze swojej nie wypada.
 *
 * NIE jest na liście RETRIABLE: nowa grupa bierze kolejny numer, więc powtórka po
 * zaginionej odpowiedzi przepisałaby tę samą grupę pod nowy numer (i nowy kolor).
 * Po zaginięciu interfejs po prostu dosynchronizowuje się z getData.
 *
 * Zwraca {walks, group}: wszystkie wiersze tego dnia (także te z wyczyszczoną grupą)
 * i numer grupy, która powstała albo została (0 = rozwiązana).
 */
function setGroup(date, ids, gid) {
  const a = actionDate_(date);
  const want = [];
  (Array.isArray(ids) ? ids : []).forEach(x => {
    const n = Number(x);
    if (n > 0 && want.indexOf(n) < 0) want.push(n);
  });
  const g = Number(gid) > 0 ? Number(gid) : 0;

  return withLock_(() => {
    const known = {};
    readDogCatalog_().forEach(d => { known[d.id] = true; });
    const sh = walksSheetLocked_();
    const last = sh.getLastRow();
    const rows = last >= 2 ? sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues() : [];

    const day = {};          // pies -> indeks jego wiersza tego dnia w `rows`
    let maxGroup = 0;
    rows.forEach((r, i) => {
      const w = mapWalkRow_(r);
      if (w.date !== a.date) return;
      day[w.dogId] = i;
      if (w.group > maxGroup) maxGroup = w.group;
    });
    const walkOf = id => day[id] === undefined ? emptyWalk_(a.date, id) : mapWalkRow_(rows[day[id]]);
    const put = (id, group) => {
      const w = walkOf(id);
      if (w.group === group) return;
      w.group = group;
      if (day[id] === undefined) { rows.push(walkToRow_(w)); day[id] = rows.length - 1; }
      else rows[day[id]] = walkToRow_(w);
    };
    const inGroup = group => Object.keys(day).map(Number).filter(id => walkOf(id).group === group);

    const members = want.filter(id => known[id]
      && (walkOf(id).status !== STATUS.WALKED || (g && walkOf(id).group === g)));
    const target = members.length >= 2 ? (g || maxGroup + 1) : 0;

    if (g) inGroup(g).forEach(id => { if (members.indexOf(id) < 0) put(id, 0); });   // wypadli ze składu
    const robbed = {};
    members.forEach(id => {
      const old = walkOf(id).group;
      if (old && old !== target) robbed[old] = true;
      put(id, target);
    });
    Object.keys(robbed).forEach(old => {                 // grupa, z której zabraliśmy psy
      const left = inGroup(Number(old));
      if (left.length === 1) put(left[0], 0);
    });

    if (rows.length) sh.getRange(2, 1, rows.length, WALK_WIDTH).setValues(rows);
    return { walks: Object.keys(day).map(id => mapWalkRow_(rows[day[id]])), group: target };
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

    // przestawiony pies wychodzi ze swojej grupy (leaveGroup_): odbyty spacer staje się
    // pierwszym z dwóch, a drugi to osobny spacer; w drugą stronę — pies zaplanowany
    // w grupie na drugi spacer ma już swoje z głowy i z tą grupą nie idzie
    const d = walkDay_(walksSheetLocked_(), businessDate_());
    d.ids().forEach(id => {
      const w = d.walk(id);
      if (n === 2 && w.status === STATUS.WALKED && !w.who1) {
        w.who1 = w.who; w.time1 = w.time;
        w.status = STATUS.FREE; w.who = ''; w.time = '';
      } else if (n === 1 && w.status === STATUS.FREE && w.who1) {
        w.who = w.who1; w.time = w.time1;
        w.status = STATUS.WALKED; w.who1 = ''; w.time1 = '';
      } else {
        return;
      }
      d.put(w);
      leaveGroup_(d, w);
    });
    d.save();
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

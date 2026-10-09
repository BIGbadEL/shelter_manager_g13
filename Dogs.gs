/**
 * G13 Spacery — PSY, ICH SPACERY I WOLONTARIUSZE.
 *
 * Trzy rzeczy, trzymane osobno:
 *  - zakładka Psy — KATALOG: kim jest pies (imię, boks, trudność, notatka,
 *    ile spacerów dziennie). Nie wie nic o żadnym konkretnym dniu.
 *  - zakładka Spacery — co się dzieje z KONKRETNYM SPACEREM psa danego dnia:
 *    wiersz na trójkę (data, pies, numer spaceru). Pies na dwa spacery ma dwa
 *    niezależne spacery — każdy z własną rezerwacją, stanem i grupą. Dzięki
 *    temu popołudniowy spacer da się zarezerwować, zanim ktoś wyjdzie z psem
 *    rano, a spacer 1/2 może iść w jednej grupie, a 2/2 w innej.
 *  - kolory wolontariuszy — przydzielane na dzień, trzymane we właściwościach.
 *
 * Wydajność: akcje wolontariuszy zwracają TYLKO zmieniony spacer ({slot}, a dla
 * kart sprzed spacerów także {dog}), nie cały stan — interfejs jest optymistyczny
 * i dosynchronizowuje się z okresowego odświeżania. Akcje edycyjne zwracają pełny stan.
 */

/* ---------- KATALOG ---------- */

/**
 * Surowy wiersz zakładki Psy -> pies z katalogu (kim jest, bez stanu dnia).
 * `teamCol` — czy zakładka ma kolumnę grupy psa (hasTeamColumn_); bez niej każdy pies jest nasz.
 */
function mapDogRow_(r, teamCol) {
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
    team:      teamCol ? dogTeam_(r[DOG.TEAM - 1]) : '',
  };
}

/** Katalog z nagłówkiem w tym samym odczycie — po nim poznajemy, czy kolumna grupy psa jest nasza. */
function readDogCatalog_() {
  const sh = ss_().getSheetByName(SHEETS.DOGS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(1, 1, last, dogWidth_(sh)).getValues();
  const teamCol = hasTeamColumn_(rows[0]);
  return rows.slice(1)
    .filter(r => r[DOG.ID - 1] !== '' && r[DOG.ID - 1] !== null)
    .map(r => mapDogRow_(r, teamCol));
}

/** Wiersz psa po numerze wiersza — jeden odczyt zakresu. */
function readDogRow_(sh, row) {
  return sh.getRange(row, 1, 1, dogWidth_(sh)).getValues()[0];
}

/**
 * Ile kolumn Psy wolno czytać: najwyżej tyle, ile zakładka ma. Kolumna grupy psa doszła w 1.3,
 * a getRange poza szerokość zakładki rzuca błędem — bez tego wdrożenie przed migrate() kładłoby
 * całą aplikację (to samo co z Historią, histWidth_).
 */
function dogWidth_(sh) { return Math.min(DOG_WIDTH, sh.getMaxColumns()); }

/**
 * Czy kolumna grupy psa to nasza kolumna — po nagłówku `grupa_psa`. Kolumna o tym numerze bez
 * tego nagłówka (pusta albo czyjaś własna, dopisana w arkuszu ręcznie) nie przenosi psów na listę
 * innych grup: każdy pies jest wtedy nasz.
 */
function hasTeamColumn_(header) {
  return !!header && String(header[DOG.TEAM - 1] == null ? '' : header[DOG.TEAM - 1]).trim() === DOG_HEADERS[DOG.TEAM - 1];
}

/**
 * Kolumna grupy psa — dokłada brakującą (kolumna, nagłówek, format tekstowy, zanim coś do niej
 * trafi). Zwraca false, gdy w jej miejscu stoi już czyjaś kolumna — z innym nagłówkiem albo bez
 * nagłówka, ale z wpisami pod nim (review PR #6: „kaganiec" przy Lunie robił z niej psa grupy
 * „kaganiec") — tej nie nadpisujemy. Tylko pod blokadą albo z edytora.
 */
function dogColumns_(sh) {
  const missing = DOG_WIDTH - sh.getMaxColumns();
  if (missing > 0) sh.insertColumnsAfter(sh.getMaxColumns(), missing);
  const head = teamHead_(sh);
  if (head === DOG_HEADERS[DOG.TEAM - 1]) return true;
  if (head || teamCellsUsed_(sh)) return false;
  sh.getRange(1, DOG.TEAM).setValue(DOG_HEADERS[DOG.TEAM - 1]);
  sh.getRange(1, DOG.TEAM, sh.getMaxRows(), 1).setNumberFormat('@');
  return true;
}

/** Nagłówek kolumny grupy psa ('' — pusty albo zakładka węższa). */
function teamHead_(sh) {
  if (sh.getMaxColumns() < DOG.TEAM) return '';
  const v = sh.getRange(1, DOG.TEAM).getValue();
  return String(v == null ? '' : v).trim();
}

/** Czy pod nagłówkiem kolumny grupy psa coś stoi (same spacje się nie liczą). */
function teamCellsUsed_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return false;
  return sh.getRange(2, DOG.TEAM, last - 1, 1).getValues()
    .some(r => String(r[0] == null ? '' : r[0]).trim() !== '');
}

/** Grupa psa do porównań: „G7", „g 7" i „ g7 " to ta sama grupa. */
function teamKey_(t) { return String(t == null ? '' : t).replace(/\s+/g, '').toLowerCase(); }

/**
 * Grupa psa z arkusza albo z panelu: bez znaków sterujących, spacje ujednolicone, najwyżej
 * MAX_LEN.TEAM znaków. Nasza grupa (HOME_TEAM w dowolnej pisowni) i puste = ''. `known` — grupy
 * psów z katalogu: ta sama grupa wpisana inaczej („g7" przy istniejącej „G7") dostaje pisownię
 * już używaną — inaczej z jednej grupy robiłyby się dwie. Ta sama reguła w Script.html (teamClean).
 */
function dogTeam_(v, known) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ')
    .trim().slice(0, MAX_LEN.TEAM).trim();
  const k = teamKey_(s);
  if (!k || k === teamKey_(HOME_TEAM)) return '';
  const same = (known || []).filter(t => teamKey_(t) === k)[0];
  return same || s;
}

/**
 * Czy da się zapisać grupę psa (pod blokadą, PRZED jakimkolwiek innym zapisem psa — żeby błąd nie
 * zostawił psa zapisanego w połowie). Inna grupa niż nasza: dokłada kolumnę, a gdy w jej miejscu
 * stoi czyjaś inna — wyraźny błąd, nie cisza. Nasza grupa: zapis tylko tam, gdzie kolumna już jest
 * nasza (przy zakładce bez niej każdy pies i tak jest nasz). Zwraca: pisać czy nie.
 */
function teamWritable_(sh, team) {
  if (!team) return teamHead_(sh) === DOG_HEADERS[DOG.TEAM - 1];
  if (dogColumns_(sh)) return true;
  throw new Error('Kolumna ' + DOG.TEAM + ' (O) w zakładce Psy jest zajęta przez inne dane — grupy psa nie zapisano. ' +
                  'Przesuń tamtą kolumnę w arkuszu w inne miejsce.');
}

/**
 * Grupy psów z katalogu (pisownia, jaka jest w arkuszu) — do ujednolicenia nowo wpisanej (dogTeam_).
 * Bez psa `exceptId`: poprawiany pies, jedyny w swojej grupie, może zmienić jej pisownię.
 */
function knownTeams_(exceptId) {
  return readDogCatalog_().filter(d => d.team && d.id !== Number(exceptId)).map(d => d.team);
}

/** Jeden pies z katalogu albo null. */
function catalogDog_(id) {
  const sh = ss_().getSheetByName(SHEETS.DOGS);
  const row = rowById_(sh, id);
  return row < 0 ? null : mapDogRow_(readDogRow_(sh, row));
}

/* ---------- SPACERY (zakładka Spacery) ---------- */

/** Wolny spacer bez grupy — tak wygląda każdy spacer, który nie ma wiersza. */
function emptySlot_(date, id, n) {
  return { date: date, dogId: Number(id), slot: posInt_(n) || 1,
           status: STATUS.FREE, who: '', time: '', group: 0 };
}

function mapSlotRow_(r) {
  return {
    date:   cellDate_(r[WALK.DATE - 1]),
    dogId:  Number(r[WALK.DOG - 1]),
    slot:   posInt_(r[WALK.SLOT - 1]) || 1,
    status: String(r[WALK.STATUS - 1] || '') || STATUS.FREE,
    who:    String(r[WALK.WHO - 1] || ''),
    time:   cellTime_(r[WALK.TIME - 1]),
    group:  posInt_(r[WALK.GROUP - 1]),
  };
}

function slotToRow_(s) {
  return [s.date, s.dogId, s.slot, s.status, s.who, s.time, s.group || ''];
}

/**
 * Czy spacer niesie cokolwiek poza „wolny bez grupy" — pusty znaczy dokładnie to samo,
 * co brak wiersza. Wolny spacer w grupie to już stan: zaplanowany spacer grupowy.
 */
function hasSlotState_(s) {
  return s.status === STATUS.RESERVED || s.status === STATUS.WALKED || s.status === STATUS.TEAM || s.group > 0;
}

/** Spacer załatwiony: odbyty przez nas albo wzięty przez grupę psa (STATUS.TEAM). Do grupy już nie dołącza. */
function slotDone_(s) { return s.status === STATUS.WALKED || s.status === STATUS.TEAM; }

/**
 * Ile spacerów ma pies danego dnia: tyle, ile wymaga katalog — albo więcej, gdy dalszy
 * spacer ma już stan (prowadząca zmieniła 2 → 1, a na popołudnie ktoś był zapisany:
 * tej rezerwacji nie chowamy). Interfejs pokazuje dziś najwyżej dwa pola; sam model
 * nie zakłada żadnej górnej granicy.
 */
function slotCount_(dog, slots) {
  let n = dog && dog.walks === 2 ? 2 : 1;
  (slots || []).forEach(s => { if (hasSlotState_(s) && s.slot > n) n = s.slot; });
  return n;
}

/** Spacer numer `n` z listy spacerów psa (albo wolny, gdy nie ma wiersza). */
function slotIn_(slots, n, date, id) {
  return (slots || []).filter(s => s.slot === n)[0] || emptySlot_(date || '', id || 0, n);
}

/** Pierwszy spacer (1…count) spełniający warunek, albo 0. */
function firstSlot_(slots, count, pred) {
  for (let n = 1; n <= count; n++) if (pred(slotIn_(slots, n))) return n;
  return 0;
}

/**
 * Stary zapis dnia (wiersz na psa: bieżący spacer w status/kto, pierwszy z dwóch
 * odbyty w kto1/godzina1) -> spacery. Używany przy przenoszeniu starych danych:
 * kolumn Psy przy pierwszym wdrożeniu dat i zakładki Spacery w starym układzie.
 */
function legacySlots_(w) {
  const cur = { status: w.status || STATUS.FREE, who: w.who || '', time: w.time || '', group: posInt_(w.group) };
  if (!w.who1) return [Object.assign({ slot: 1 }, cur)];
  return [{ slot: 1, status: STATUS.WALKED, who: w.who1, time: w.time1 || '', group: 0 },
          Object.assign({ slot: 2 }, cur)];
}

/**
 * Stan psa w STARYM kształcie (status/kto/kto1…) dla kart otwartych przed wprowadzeniem
 * spacerów — getData wpisuje go w `dogs`, akcje dodają go jako `{dog}`. Odbyty pierwszy
 * z dwóch spacerów to kto1, a „bieżący" jest wtedy drugi; inaczej bieżący jest pierwszy.
 */
function legacyView_(dog, slots) {
  const s1 = slotIn_(slots, 1);
  const done1 = slotCount_(dog, slots) >= 2 && s1.status === STATUS.WALKED;
  const cur = done1 ? slotIn_(slots, 2) : s1;
  return Object.assign({}, dog, {
    status: cur.status, who: cur.who, time: cur.time,
    who1: done1 ? s1.who : '', time1: done1 ? s1.time : '',
    group: cur.group || 0,
  });
}

/**
 * Dzień w STARYM kształcie zakładki Spacery (wiersz na psa) — dla kart otwartych na wersji
 * z datami, ale sprzed spacerów. Ich applyGroups czyta z odpowiedzi setGroup wyłącznie
 * `walks`; bez niego zerowały u siebie wszystkie grupy dnia do najbliższego odświeżenia
 * (review PR #2). Grupa psa = grupa jego „bieżącego" spaceru, jak w legacyView_.
 */
function legacyWalks_(dogs, slots, date) {
  const byDog = {};
  slots.forEach(s => (byDog[s.dogId] = byDog[s.dogId] || []).push(s));
  return Object.keys(byDog).filter(id => dogs[id]).map(id => {
    const v = legacyView_(dogs[id], byDog[id]);
    return { date: date, dogId: Number(id), status: v.status, who: v.who, time: v.time,
             who1: v.who1, time1: v.time1, group: v.group };
  });
}

/** Czy układ zakładki Spacery sprawdzony w tym wykonaniu. */
let walksLayoutOk_ = false;

/**
 * Zakładka Spacery w starym układzie (wiersz na psa, drugi spacer w kto1/godzina1)
 * przepisuje się sama na układ ze spacerami — przy pierwszym dostępie, pod blokadą,
 * raz (pilnuje tego właściwość walksLayout; zmienne globalne żyją jedno wykonanie).
 * Dotyczy projektu, który miał już wersję z datami; świeża zakładka powstaje od razu
 * w nowym układzie.
 *
 * Znacznik to '2:<id zakładki>', a nie samo „sprawdzone". Cofnięcie wdrożenia to
 * przywrócenie kopii starego układu pod nazwą Spacery (README) — ta kopia ma inne id,
 * więc przy ponownym wdrożeniu znów zostanie sprawdzona i przepisana. Z samym
 * „sprawdzone" nowa wersja czytałaby stary układ jak nowy i nikt by tego nie zauważył,
 * dopóki nie zabrakłoby czyichś rezerwacji.
 */
function ensureWalksLayout_(sh) {
  if (walksLayoutOk_) return sh;
  const mark = walksLayoutMark_(sh);
  if (prop_(PROP_WALKS_LAYOUT) === mark) { walksLayoutOk_ = true; return sh; }
  withLock_(() => {
    if (String(sh.getRange(1, WALK.SLOT).getValue()) !== WALK_HEADERS[WALK.SLOT - 1]) migrateWalksLayout_(sh);
    setProp_(PROP_WALKS_LAYOUT, mark);
  });
  walksLayoutOk_ = true;
  return sh;
}

function walksLayoutMark_(sh) { return '2:' + sh.getSheetId(); }

/**
 * Kopia zakładki w starym układzie, zanim zostanie przepisana — jedyna droga powrotu:
 * poprzednia wersja kodu nowego układu nie przeczyta (statusy i godziny wypadają jej
 * w innych kolumnach). Nazwa zajęta (druga migracja po cofnięciu) = kolejny numer.
 * Kopia, która się nie uda, nie zatrzymuje przepisania: bez niego aplikacja nie
 * działałaby nikomu, a przed wdrożeniem na produkcję i tak robimy kopię całego arkusza.
 */
function backupWalksSheet_(sh) {
  try {
    const ss = ss_();
    let name = WALKS_BACKUP;
    for (let i = 2; ss.getSheetByName(name); i++) name = WALKS_BACKUP + ' ' + i;
    ss.insertSheet(name, { template: sh });
  } catch (e) {
    console.error('Kopia zakładki Spacery przed przepisaniem nie powstała: ' + e);
  }
}

/**
 * Przepisanie starego układu. Wiersz z odbytym pierwszym z dwóch spacerów staje się
 * dwoma wierszami (1 — wyprowadzony, 2 — bieżący). Najpierw kopia starego układu
 * (backupWalksSheet_). Format tekstowy idzie PRZED zapisem: godzina ląduje teraz
 * w innej kolumnie, a bez formatu '@' arkusz zrobiłby z „17:21" datę z 1899 roku (bug nr 3).
 */
function migrateWalksLayout_(sh) {
  backupWalksSheet_(sh);
  const width = Math.max(WALK_WIDTH, Math.min(sh.getMaxColumns(), WALK_V1.GROUP));
  const last = sh.getLastRow();
  const old = last >= 2 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  const rows = [];
  old.forEach(r => {
    const w = {
      date: cellDate_(r[WALK_V1.DATE - 1]), dogId: Number(r[WALK_V1.DOG - 1]),
      status: String(r[WALK_V1.STATUS - 1] || '') || STATUS.FREE, who: String(r[WALK_V1.WHO - 1] || ''),
      time: cellTime_(r[WALK_V1.TIME - 1]), who1: String(r[WALK_V1.WHO1 - 1] || ''),
      time1: cellTime_(r[WALK_V1.TIME1 - 1]), group: posInt_(r[WALK_V1.GROUP - 1]),
    };
    if (!isDate_(w.date) || !(w.dogId > 0)) return;
    legacySlots_(w).forEach(s => {
      const slot = Object.assign({ date: w.date, dogId: w.dogId }, s);
      if (!hasSlotState_(slot)) return;
      rows.push(slotToRow_(slot));
      noteVolunteer_(slot.date, slot.who);
    });
  });
  textFormatWalks_(sh);
  const pad = r => r.concat(Array(width - r.length).fill(''));
  const block = [pad(WALK_HEADERS.slice())].concat(rows.map(pad));
  const blanks = Math.max(0, old.length - rows.length);
  for (let i = 0; i < blanks; i++) block.push(Array(width).fill(''));
  sh.getRange(1, 1, block.length, width).setValues(block);
}

/** Kolumny dat i godzin jako tekst ('@') — bez tego „17:21" wraca jako data z 1899. */
function textFormatWalks_(sh) {
  [WALK.DATE, WALK.TIME].forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'));
}

/** Zakładka Spacery, gdy blokada jest już wzięta. Brakującą zakłada na miejscu. */
function walksSheetLocked_() {
  return ensureWalksLayout_(ss_().getSheetByName(SHEETS.WALKS) || createWalksSheet_());
}

/**
 * Zakładka Spacery z dowolnego miejsca. Zakładanie idzie pod blokadą, bo kilka
 * telefonów tuż po wdrożeniu pyta naraz, a drugie insertSheet z tą samą nazwą
 * rzuciłoby błędem. withLock_ znosi zagnieżdżenie, więc można to wołać także
 * spod akcji, która blokadę już trzyma.
 */
function walksSheet_() {
  const sh = ss_().getSheetByName(SHEETS.WALKS);
  return sh ? ensureWalksLayout_(sh) : withLock_(walksSheetLocked_);
}

function createWalksSheet_() {
  const sh = ss_().insertSheet(SHEETS.WALKS);
  sh.getRange(1, 1, 1, WALK_WIDTH).setValues([WALK_HEADERS]);
  sh.setFrozenRows(1);
  textFormatWalks_(sh);
  importDayState_(sh);
  setProp_(PROP_WALKS_LAYOUT, walksLayoutMark_(sh));
  walksLayoutOk_ = true;
  return sh;
}

/**
 * JEDNORAZOWE przeniesienie stanu dnia ze starych kolumn Psy do zakładki Spacery.
 *
 * Dzieje się samo, przy pierwszym dostępie po wdrożeniu wersji z datami —
 * żadnego ręcznego kroku do zapomnienia i żadnego okna, w którym aplikacja
 * pokazywałaby wszystkie psy jako wolne. `npm run deploy:*` otwiera aplikację
 * zaraz po wdrożeniu, więc tym dostępem jest zwykle samo wdrożenie.
 *
 * Stan należy do dnia, który trwał w chwili wdrożenia. Jeśli pierwszy dostęp
 * przychodzi dopiero w godzinie czyszczenia — najczęściej sam wyzwalacz endOfDay,
 * gdy po wdrożeniu nikt nie otworzył linku — dzień zdążył się już przełamać,
 * a stan jest z dnia, który właśnie się skończył. Z datą bieżącego dnia spacery
 * nie trafiłyby do Historii, a psy stałyby „wyprowadzone" na jutrzejszej liście.
 * Wdrożenia w samej godzinie czyszczenia to nie ratuje (patrz README).
 *
 * Właściwość skryptu pilnuje, że to się dzieje RAZ. Bez niej ktoś, kto kiedyś
 * skasuje zakładkę Spacery, wskrzesiłby tygodniowy stan z Psy jako dzisiejszy.
 * Starych kolumn nie czyścimy — przydadzą się, gdyby trzeba było cofnąć wdrożenie.
 */
function importDayState_(sh) {
  if (prop_(PROP_WALKS_IMPORTED)) return;

  const hour = Number(Utilities.formatDate(new Date(), tz_(), 'H'));
  const date = hour === resetHour_() ? addDays_(businessDate_(), -1) : businessDate_();
  const dogs = ss_().getSheetByName(SHEETS.DOGS);
  const last = dogs ? dogs.getLastRow() : 0;
  const rows = [];
  if (last >= 2) {
    dogs.getRange(2, 1, last - 1, dogWidth_(dogs)).getValues().forEach(r => {
      if (r[DOG.ID - 1] === '' || r[DOG.ID - 1] === null) return;
      const w = {
        status: String(r[DOG.STATUS - 1] || '') || STATUS.FREE,
        who:    String(r[DOG.WHO - 1] || ''),
        time:   cellTime_(r[DOG.TIME - 1]),
        who1:   String(r[DOG.WHO1 - 1] || ''),
        time1:  cellTime_(r[DOG.TIME1 - 1]),
      };
      legacySlots_(w).forEach(s => {
        const slot = Object.assign({ date: date, dogId: Number(r[DOG.ID - 1]) }, s);
        if (!hasSlotState_(slot)) return;
        rows.push(slotToRow_(slot));
        noteVolunteer_(date, slot.who);
      });
    });
  }
  if (rows.length) sh.getRange(2, 1, rows.length, WALK_WIDTH).setValues(rows);
  setProp_(PROP_WALKS_IMPORTED, date);
}

/** Wszystkie spacery zakładki Spacery (dni otwarte + ewentualnie jeszcze niezamknięte). */
function readSlots_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues()
    .map(mapSlotRow_)
    .filter(s => isDate_(s.date) && s.dogId > 0);
}

/**
 * Jeden dzień zakładki Spacery do zmiany pod blokadą: odczyt raz, zapis tylko
 * zmienionych wierszy. Akcja na spacerze widzi cały dzień, bo może ruszyć też grupę.
 */
function walkDay_(sh, date) {
  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues() : [];
  const at = {};                                    // 'pies:spacer' -> indeks wiersza tego dnia
  rows.forEach((r, i) => {
    const s = mapSlotRow_(r);
    if (s.date === date && s.dogId > 0) at[s.dogId + ':' + s.slot] = i;
  });
  const changed = {};
  const slot = (id, n) => {
    const i = at[Number(id) + ':' + n];
    return i === undefined ? emptySlot_(date, id, n) : mapSlotRow_(rows[i]);
  };
  const all = () => Object.keys(at).map(k => mapSlotRow_(rows[at[k]]));
  return {
    slot: slot,
    all: all,
    slotsOf: id => all().filter(s => s.dogId === Number(id)),
    inGroup: g => all().filter(s => s.group === g),
    put: s => {
      const k = s.dogId + ':' + s.slot;
      if (at[k] === undefined) { rows.push(slotToRow_(s)); at[k] = rows.length - 1; }
      else rows[at[k]] = slotToRow_(s);
      changed[at[k]] = true;
    },
    save: () => Object.keys(changed).forEach(k =>
      sh.getRange(Number(k) + 2, 1, 1, WALK_WIDTH).setValues([rows[Number(k)]])),
  };
}

/**
 * Spacer wychodzi ze swojej grupy; grupa, w której został jeden spacer, przestaje być grupą.
 *
 * Grupa to JEDEN wspólny spacer kilku psów. Wychodzi z niej spacer, który cofnięto
 * („Cofnij" — tamten wspólny spacer już się odbył, a ten pies w nim nie był).
 * „Zwolnij" spaceru z grupy NIE wyprowadza: grupa czeka wtedy na nową rezerwację.
 */
function leaveGroup_(d, s) {
  const g = s.group;
  if (!g) return;
  s.group = 0;
  d.put(s);
  const left = d.inGroup(g);
  if (left.length === 1) {
    left[0].group = 0;
    d.put(left[0]);
  }
}

/**
 * Psy z katalogu ze stanem BIEŻĄCEGO dnia rezerwacyjnego w starym kształcie —
 * dokładnie to, co znają karty otwarte przed wprowadzeniem dat i spacerów.
 */
function readDogs_() {
  const date = businessDate_();
  const byDog = {};
  readSlots_(walksSheet_()).forEach(s => { if (s.date === date) (byDog[s.dogId] = byDog[s.dogId] || []).push(s); });
  return readDogCatalog_().map(d => legacyView_(d, byDog[d.id]));
}

/* ---------- WOLONTARIUSZE — kolor na dzień ---------- */

/**
 * Imię do porównań: „Ania", „ania " i „Ánia" to ta sama osoba. Kolor przypisujemy
 * osobie, a nie napisowi — inaczej literówka w wielkości liter dawałaby drugi kolor.
 */
function volNorm_(name) {
  return String(name == null ? '' : name).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ');
}

/** FNV-1a — ten sam w przeglądarce (Script.html), żeby telefon mógł przewidzieć przydział. */
function volHash_(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/**
 * Przydział koloru na dzień: od koloru „z imienia" do pierwszego wolnego — bez powtórek,
 * dopóki starczy palety; potem kolor z imienia (powtórka, ale imię i tak jest napisane).
 * Raz przydzielony zostaje do końca dnia, więc nowy wolontariusz nie przestawia innym
 * kolorów, a wszystkie telefony widzą to samo. Pełny przydział (`max` osób) nie przyjmuje
 * nikogo więcej — kolor z imienia, bez wpisu. Ta sama funkcja żyje w Script.html.
 */
function volAssign_(map, norm, n, max) {
  if (Object.prototype.hasOwnProperty.call(map, norm)) return map[norm];
  if (Object.keys(map).length >= max) return volHash_(norm) % n;
  const used = {};
  Object.keys(map).forEach(k => { used[map[k]] = true; });
  const start = volHash_(norm) % n;
  for (let k = 0; k < n; k++) {
    const c = (start + k) % n;
    if (!used[c]) { map[norm] = c; return c; }
  }
  map[norm] = start;
  return start;
}

/**
 * Kolory wolontariuszy dnia — świeży odczyt (pod blokadą, przed przydziałem).
 * null = nie udało się odczytać: bez kolorów, ale akcja, która o nie pyta, przechodzi.
 */
function volunteersOf_(date) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(PROP_VOL_PREFIX + date);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return null;
  }
}

/**
 * Przydziela kolor wolontariuszowi dnia, jeśli jeszcze go nie ma. Tylko pod blokadą.
 * Kolor to kosmetyka, a woła się go z samego środka rezerwacji i spaceru: żaden jego
 * błąd (limit właściwości, awaria usługi) nie może zatrzymać zapisu — review PR #2.
 * Sufity: VOLUNTEER_MAX osób na dzień, VOLUNTEER_DAYS dni z przydziałem naraz.
 */
function noteVolunteer_(date, name) {
  try {
    const norm = volNorm_(name);
    if (!norm) return;
    const map = volunteersOf_(date);
    if (!map || Object.prototype.hasOwnProperty.call(map, norm)) return;
    const key = PROP_VOL_PREFIX + date;
    if (!Object.keys(map).length
        && Object.keys(props_()).filter(k => k.indexOf(PROP_VOL_PREFIX) === 0 && k !== key).length >= VOLUNTEER_DAYS) return;
    volAssign_(map, norm, VOLUNTEER_COLORS, VOLUNTEER_MAX);
    if (!Object.prototype.hasOwnProperty.call(map, norm)) return;   // przydział pełny
    setProp_(key, JSON.stringify(map));
  } catch (e) {
    console.warn('Kolor wolontariusza nie zapisany (' + date + '): ' + e);
  }
}

/** Kolory wolontariuszy dni otwartych (od `from`) — do getData, z pamięci wykonania. */
function volunteersOpen_(from) {
  const out = {};
  const p = props_();
  Object.keys(p).forEach(k => {
    if (k.indexOf(PROP_VOL_PREFIX) !== 0) return;
    const date = k.slice(PROP_VOL_PREFIX.length);
    if (date < from) return;
    try { out[date] = JSON.parse(p[k]); } catch (e) { /* zepsuty wpis — bez kolorów, imiona zostają */ }
  });
  return out;
}

/** Nocne czyszczenie: kolory dni zamkniętych nie są już nikomu potrzebne. */
function forgetVolunteers_(before) {
  Object.keys(props_()).forEach(k => {
    if (k.indexOf(PROP_VOL_PREFIX) === 0 && k.slice(PROP_VOL_PREFIX.length) < before) delProp_(k);
  });
}

/* ---------- AKCJE WOLONTARIUSZY (zwracają {slot}) ---------- */

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
  if (d > addDays_(current, MAX_DAYS_AHEAD)) throw new Error('Tak daleko do przodu nie planujemy — najwyżej rok');
  return { date: d, current: d === current };
}

/**
 * Który spacer: podany (1…ile ma pies tego dnia) — albo, gdy brak, `fallback(count)`:
 * tak wołają karty sprzed spacerów, które nie wiedzą o numerach.
 */
function pickSlot_(dog, slots, slot, fallback) {
  const count = slotCount_(dog, slots);
  if (slot == null || slot === '') return fallback(count);
  const n = posInt_(slot);
  if (!n || n > count) throw new Error('Nie ma takiego spaceru');
  return n;
}

/**
 * Wspólny szkielet akcji na spacerze: pod blokadą czyta psa i jego dzień,
 * `choose(dog, slots)` wybiera numer spaceru (0 = nic do zrobienia), `change(s, dog, d)`
 * zmienia spacer (i przez `d` ewentualnie grupę) i mówi, czy jest co zapisać.
 */
function slotAction_(id, date, choose, change) {
  return withLock_(() => {
    const dog = catalogDog_(id);
    if (!dog) return { slot: null, dog: null };
    const d = walkDay_(walksSheetLocked_(), date);
    const n = choose(dog, d.slotsOf(id));
    const s = d.slot(id, n || 1);
    if (n && change(s, dog, d)) {
      d.put(s);
      d.save();
    }
    const out = {
      slot: Object.assign({}, s),
      dog: Object.assign(legacyView_(dog, d.slotsOf(id)), { date: date }),   // karty sprzed spacerów
    };
    const vol = volunteersOf_(date);                 // brak odczytu = bez pola: telefon zostaje przy swoich
    if (vol) out.volunteers = { [date]: vol };
    return out;
  });
}

/**
 * Rezerwuje spacer psa na dany dzień — tylko jeśli ten spacer wciąż wolny (kto
 * pierwszy, ten lepszy). Działa na bieżący dzień i dowolny przyszły. Każdy spacer
 * psa na dwa spacery rezerwuje się osobno — popołudniowy także wtedy, gdy rano
 * jeszcze nikt z psem nie wyszedł. Brak numeru = pierwszy wolny spacer.
 */
function reserve(id, name, date, slot) {
  const a = actionDate_(date);
  const who = clean_(name);
  return slotAction_(id, a.date,
    (dog, slots) => pickSlot_(dog, slots, slot, count => firstSlot_(slots, count, s => s.status === STATUS.FREE) || 1),
    s => {
      if (s.status !== STATUS.FREE) return false;
      s.status = STATUS.RESERVED;
      s.who = who;
      s.time = '';
      noteVolunteer_(a.date, who);
      return true;
    });
}

/**
 * Oznacza spacer jako odbyty; bez podanego imienia zachowuje rezerwującego.
 * Tylko na bieżący dzień — w przyszłości nie ma czego odhaczać.
 *
 * `slot` mówi, KTÓRY spacer odhaczamy. Klient wie to w chwili kliknięcia i musi to
 * powiedzieć, bo to czyni zapis idempotentnym — a jest on automatycznie ponawiany
 * po zaginionej odpowiedzi (bug nr 9). Powtórka na spacerze już odbytym niczego nie
 * rusza. Karty sprzed spacerów wysyłały 2 jako „ostatni (jedyny albo drugi)" — u psa
 * na jeden spacer to spacer 1. Brak numeru = pierwszy jeszcze nieodbyty.
 */
function markWalked(id, name, slot, date) {
  const a = actionDate_(date);
  if (!a.current) throw new Error('Spacer odhaczysz dopiero w dniu spaceru');
  return slotAction_(id, a.date,
    (dog, slots) => (Number(slot) === 2 && slotCount_(dog, slots) === 1) ? 1
      : pickSlot_(dog, slots, slot, count => firstSlot_(slots, count, s => s.status !== STATUS.WALKED)),
    s => {
      if (s.status === STATUS.WALKED) return false;
      s.status = STATUS.WALKED;
      s.who = clean_(name) || s.who;
      s.time = now_();
      noteVolunteer_(a.date, s.who);
      return true;
    });
}

/**
 * „Bierze G7" (1.3): spacer psa innej grupy bierze jego własna grupa — psa nie musimy wyprowadzać.
 * Na liście innych grup schodzi na dół jak odbyty. Ten spacer nie jest nasz: nie trafia do Historii
 * ani do maila dla schroniska (decyzja właściciela; closeWalks_), liczy się tylko jako spacer psa
 * (ostatni_spacer — bez fałszywego „bez spaceru od…").
 * Tylko wolny spacer bez grupy (zaplanowany spacer grupowy jest nasz) i tylko pies innej grupy.
 * Dzień bieżący albo przyszły, jak rezerwacja — „bierze" to też zapowiedź. `kto` = grupa psa
 * z katalogu, nie z przeglądarki. Powtórka na spacerze już wziętym niczego nie rusza, więc zapis
 * jest w RETRIABLE. Cofnięcie to zwykłe setFree (z widzianym stanem).
 */
function markTeam(id, date, slot) {
  const a = actionDate_(date);
  return slotAction_(id, a.date,
    (dog, slots) => pickSlot_(dog, slots, slot, count => firstSlot_(slots, count, s => s.status === STATUS.FREE && !s.group)),
    s => {
      if (s.status !== STATUS.FREE || s.group) return false;          // już wzięty, zajęty albo w naszej grupie
      const dog = readDogCatalog_().filter(x => x.id === Number(id))[0];
      if (!dog || !dog.team) throw new Error('To pies naszej grupy — jego spacer wyprowadzamy my');
      s.status = STATUS.TEAM;
      s.who = dog.team;
      s.time = '';
      return true;
    });
}

/** Karty sprzed spacerów: cofnięcie odbytego PIERWSZEGO z dwóch spacerów (bieżący dzień). */
function undoFirstWalk(id, date) {
  const a = actionDate_(date);
  if (!a.current) throw new Error('Spacer odhaczysz dopiero w dniu spaceru');
  return slotAction_(id, a.date, () => 1, (s, dog, d) => {
    if (s.status !== STATUS.WALKED) return false;
    s.status = STATUS.FREE;
    s.who = '';
    s.time = '';
    leaveGroup_(d, s);
    return true;
  });
}

/**
 * Cofa spacer do stanu „wolny": „Zwolnij" (rezerwacja) albo „Cofnij" (spacer).
 *
 * Zwolniony spacer ZOSTAJE w grupie — grupa czeka na nową rezerwację, jak przy
 * planowaniu. Cofnięty wychodzi z grupy (leaveGroup_): tamten wspólny spacer już
 * się odbył, a ten pies w nim — jak się okazało — nie był.
 *
 * `seen` = {status, who} — spacer tak, jak wyglądał na ekranie w chwili kliknięcia.
 * setFree jest ponawiany po zaginionej odpowiedzi (RETRIABLE), a zanim powtórka
 * dojdzie (~12 s), ktoś inny mógł spacer zarezerwować: bez `seen` powtórka zwalniała
 * CUDZĄ rezerwację (bug nr 11). Brak `seen` = karta sprzed tej zmiany. Brak numeru
 * spaceru = karta sprzed spacerów: zwalniamy „bieżący" — najdalszy, który nie jest wolny.
 */
function setFree(id, date, seen, slot) {
  const a = actionDate_(date);
  const sees = s => !seen || (s.status === String(seen.status) && s.who === clean_(seen.who));
  return slotAction_(id, a.date,
    (dog, slots) => pickSlot_(dog, slots, slot, count => {
      for (let n = count; n >= 1; n--) {
        const s = slotIn_(slots, n);
        if (s.status !== STATUS.FREE && sees(s)) return n;
      }
      return 0;
    }),
    (s, dog, d) => {
      if (s.status === STATUS.FREE && !s.who && !s.time) return false;   // nic do zwalniania
      if (!sees(s)) return false;                                        // to już nie ten stan
      const undo = s.status === STATUS.WALKED;
      s.status = STATUS.FREE;
      s.who = '';
      s.time = '';
      if (undo) leaveGroup_(d, s);
      return true;
    });
}

/**
 * GRUPA — spacery wychodzące razem danego dnia (spacer grupowy). Ustawia każdy
 * wolontariusz, bez PIN-u; na bieżący dzień i na przyszłe, nigdy na miniony.
 *
 * Członkiem grupy jest SPACER psa, nie pies: `ids` to skład PO zmianie jako
 * 'pies:spacer' (np. '7:2' — drugi spacer psa 7). Sam numer psa (karty sprzed
 * spacerów) = jego pierwszy jeszcze nieodbyty spacer. Jeden pies jest w grupie
 * najwyżej jednym spacerem — to jeden wspólny wyjście, pies nie idzie na nie dwa razy.
 * `gid` — 0 dla nowej grupy albo numer grupy, którą zmieniamy. Mniej niż dwa spacery
 * = grupa się rozwiązuje. Nowa grupa dostaje kolejny numer tego dnia; od numeru zależy
 * kolor w interfejsie — każda następna grupa w innym, na wszystkich telefonach tym samym.
 *
 * Spacer przeniesiony z innej grupy znika z tamtej, a grupa, w której został jeden
 * spacer, przestaje być grupą. Spacer już odbyty nie dołącza do nowej grupy.
 *
 * `seen` — skład grupy `gid` taki, jaki zmieniający widział na ekranie. Zaznaczanie
 * wstrzymuje odświeżanie, więc w tym czasie ktoś inny mógł grupę zmienić:
 *  - zdejmujemy tylko spacery, które zmieniający WIDZIAŁ i odznaczył,
 *  - gdy pod `gid` stoi już zupełnie inna grupa (numery wracają do obiegu), zmiana
 *    idzie jako nowa grupa, a cudza zostaje nietknięta.
 * Brak `seen` = karta sprzed tej zmiany: zdejmujemy wszystkich spoza `ids`.
 *
 * NIE jest na liście RETRIABLE: nowa grupa bierze kolejny numer, więc powtórka po
 * zaginionej odpowiedzi przepisałaby tę samą grupę pod nowy numer (i nowy kolor).
 *
 * Zwraca {slots, walks, group}: spacery tego dnia (także te z wyczyszczoną grupą), ten sam
 * dzień w starym kształcie dla kart sprzed spacerów (legacyWalks_) i numer grupy, która
 * powstała albo została (0 = rozwiązana).
 */
function setGroup(date, ids, gid, seen) {
  const a = actionDate_(date);
  let g = posInt_(gid);
  if (!g && Number(gid)) throw new Error('Nieprawidłowy numer grupy');   // 1.5, -2 — nie zgadujemy

  return withLock_(() => {
    const dogs = {};
    readDogCatalog_().forEach(x => { dogs[x.id] = x; });
    const d = walkDay_(walksSheetLocked_(), a.date);
    const count = id => slotCount_(dogs[id], d.slotsOf(id));
    const current = id => {
      for (let n = 1; n <= count(id); n++) if (!slotDone_(d.slot(id, n))) return n;
      return 1;
    };
    const refs = list => {
      const byDog = {};
      (Array.isArray(list) ? list : []).forEach(x => {
        const m = String(x).match(/^(\d+)(?::(\d+))?$/);
        if (!m || !dogs[Number(m[1])]) return;
        const id = Number(m[1]);
        const n = m[2] ? posInt_(m[2]) : current(id);
        if (n && n <= count(id)) byDog[id] = n;            // jeden spacer psa — ostatni wygrywa
      });
      return Object.keys(byDog).map(id => Number(id) + ':' + byDog[id]);
    };
    const want = refs(ids);
    const saw = Array.isArray(seen) ? refs(seen) : null;
    const ref = s => s.dogId + ':' + s.slot;
    const at = r => { const p = r.split(':'); return d.slot(Number(p[0]), Number(p[1])); };
    const inG = x => d.inGroup(x).map(ref);

    // pod tym numerem stoi dziś już inna grupa (ktoś rozwiązał naszą i założył nową) — nie ruszamy jej
    if (g && saw && inG(g).length && !inG(g).some(r => saw.indexOf(r) >= 0)) g = 0;

    // spacer wzięty przez grupę psa (STATUS.TEAM) nie jest nasz — do spaceru grupowego nie dołącza nigdy
    const members = want.filter(r => at(r).status !== STATUS.TEAM && (at(r).status !== STATUS.WALKED || (g && at(r).group === g)));
    let maxGroup = 0;
    d.all().forEach(s => { if (s.group > maxGroup) maxGroup = s.group; });
    const target = members.length >= 2 ? (g || maxGroup + 1) : 0;
    const put = (s, grp) => { if (s.group === grp) return; s.group = grp; d.put(s); };

    if (g) d.inGroup(g).forEach(s => {                    // wypadli ze składu — tylko ci, których zmieniający widział
      if (members.indexOf(ref(s)) < 0 && (!saw || saw.indexOf(ref(s)) >= 0)) put(s, 0);
    });
    const touched = {};
    if (g) touched[g] = true;
    members.forEach(r => {
      const s = at(r);
      // drugi spacer tego samego psa w tej grupie? Grupa to jedno wyjście — zostaje ten wybrany
      d.slotsOf(s.dogId).forEach(o => { if (o.slot !== s.slot && target && o.group === target) put(o, 0); });
      if (s.group && s.group !== target) touched[s.group] = true;
      put(s, target);
    });
    Object.keys(touched).forEach(x => {                  // grupa, z której zabraliśmy spacery, i sama zmieniana
      const left = d.inGroup(Number(x));
      if (left.length === 1) put(left[0], 0);
    });

    d.save();
    const all = d.all();
    return { slots: all, walks: legacyWalks_(dogs, all, a.date), group: target };
  });
}

/* ---------- AKCJE EDYCYJNE — chronione PIN-em (zwracają pełny stan) ---------- */

/**
 * Termin ważności notatki: 'yyyy-MM-dd', NOTE_FOREVER albo '' (brak notatki).
 * NOTE_FOREVER — nie znika nigdy, dopóki ktoś jej nie skasuje.
 *
 * Notatka „bez terminu" dostaje w arkuszu termin = bieżący dzień rezerwacyjny:
 * żyje do końca dnia, na którym ją widać. Samo „znika przy najbliższym czyszczeniu"
 * nie wystarczało — notatka dodana o 20:10, gdy lista pracuje już na jutrze, znikała
 * przy czyszczeniu o 20:30, zanim jej dzień się zaczął, a każde dodatkowe uruchomienie
 * endOfDay kasowało dzisiejsze notatki. Z datą czyszczenie jest idempotentne.
 * Termin wcześniejszy niż bieżący dzień też oznacza „do końca dnia" — inaczej notatka
 * zapisałaby się, ale nie pokazała nigdzie. Termin bez notatki nie ma sensu.
 */
function noteUntil_(v, note) {
  const s = clean_(v, 10);
  if (!note) return '';
  if (s === NOTE_FOREVER) return s;
  const current = businessDate_();
  return isDate_(s) && s > current ? s : current;
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

/**
 * Ostatnie dodania psów z panelu: {token: id}. Kilka stuknięć w „Dodaj" albo powtórka po
 * zaginionej odpowiedzi (addDog jest w RETRIABLE) dawały kilka takich samych psów — z tym samym
 * tokenem pies powstaje raz. Świeży odczyt pod blokadą (jak kolory wolontariuszy): pamięć wykonania
 * mogła wczytać właściwości, zanim poprzednie dodanie skończyło się w innym wykonaniu.
 * null = nie udało się odczytać: pies się doda, tylko bez tej ochrony.
 */
function dogAdds_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(PROP_DOG_ADDS);
    const m = raw ? JSON.parse(raw) : {};
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) {
    return null;
  }
}

/** Zapamiętuje dodanie (najwyżej DOG_ADDS_KEEP ostatnich). Błąd właściwości nie może zatrzymać dodania psa. */
function noteDogAdd_(adds, token, id) {
  try {
    adds[token] = id;
    const keys = Object.keys(adds);                 // kolejność dopisywania — tokeny zaczynają się literą
    keys.slice(0, Math.max(0, keys.length - DOG_ADDS_KEEP)).forEach(k => { delete adds[k]; });
    setProp_(PROP_DOG_ADDS, JSON.stringify(adds));
  } catch (e) {
    console.warn('Token dodania psa nie zapisany: ' + e);
  }
}

/**
 * Numer psa i boks jako tekst ('@') — zrzuty historii i mail idą do władz schroniska, a „1/26"
 * (czy boks „1/2", „3-4") wpisane w komórkę bez formatu arkusz potrafi zamienić na datę (jak
 * godzinę, bug nr 3). Format idzie PRZED wartością, dlatego te pola nie jadą w appendRow razem
 * z resztą wiersza. Dwie sąsiednie kolumny (IDENT, BOX) — jeden zakres.
 */
function setTextFields_(sh, row, ident, box) {
  sh.getRange(row, DOG.IDENT, 1, 2).setNumberFormat('@').setValues([[ident, box]]);
}

/**
 * Grupa psa z panelu, pod blokadą: ujednolicona (dogTeam_), a inna niż nasza — w pisowni już
 * używanej w katalogu. Katalog czytamy tylko wtedy, gdy jest z czym porównywać.
 */
function teamOfInput_(v, exceptId) {
  const team = dogTeam_(v);
  return team ? dogTeam_(team, knownTeams_(exceptId)) : '';
}

/**
 * data = { name, ident, box, dif, team } — wszystko opcjonalne poza regułą wyżej. `team` — grupa
 * psa (1.3); brak (karty sprzed 1.3) albo nasza = pies naszej grupy.
 * `token` — jedno stuknięcie „Dodaj" w panelu (1.2): ten sam token drugi raz niczego nie dodaje,
 * tylko oddaje stan (patrz dogAdds_). Brak tokenu (karty sprzed 1.2) = dodanie jak dawniej.
 */
function addDog(data, pin, token) {
  requirePin_(pin);
  const d = dogFields_(data);
  const t = /^[A-Za-z][A-Za-z0-9_-]{7,63}$/.test(String(token == null ? '' : token)) ? String(token) : '';
  return withLock_(() => {
    const adds = t ? dogAdds_() : null;
    if (adds && Object.prototype.hasOwnProperty.call(adds, t)) return getData();   // ten pies już jest
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const team = teamOfInput_(data && data.team);
    const writeTeam = teamWritable_(sh, team);      // przed dodaniem: zajęta kolumna nie zostawi psa bez grupy
    const id = nextId_(sh);
    sh.appendRow([id, d.name, '', '', d.dif, STATUS.FREE, '', '', '',
                  d.note, d.walks, '', '', d.noteUntil]);
    const row = sh.getLastRow();
    setTextFields_(sh, row, d.ident, d.box);
    if (writeTeam && team) sh.getRange(row, DOG.TEAM).setValue(team);
    if (adds) noteDogAdd_(adds, t, id);
    return getData();
  });
}

/**
 * Edycja psa: nadanie/zmiana imienia, identyfikatora, boksu, trudności, liczby spacerów, grupy.
 * Bez `team` w danych (karta sprzed 1.3) grupa zostaje, jaka była — inaczej otwarta stara karta
 * przy każdej poprawce imienia przenosiłaby psa innej grupy na naszą listę.
 */
function updateDog(id, data, pin) {
  requirePin_(pin);
  const d = dogFields_(data);
  const setTeam = !!data && data.team != null;
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      const team = setTeam ? teamOfInput_(data.team, id) : '';
      const writeTeam = setTeam && teamWritable_(sh, team);   // przed resztą: błąd nie zostawi psa zapisanego w połowie
      sh.getRange(row, DOG.IDENT, 1, 2).setNumberFormat('@');        // numer i boks jako tekst, przed wartością
      sh.getRange(row, DOG.NAME, 1, 4).setValues([[d.name, d.ident, d.box, d.dif]]);
      sh.getRange(row, DOG.NOTE, 1, 2).setValues([[d.note, d.walks]]);
      sh.getRange(row, DOG.NOTE_UNTIL).setValue(d.noteUntil);   // kolumna niesąsiadująca z notatką
      if (writeTeam) sh.getRange(row, DOG.TEAM).setValue(team);
      trimSlots_(Number(id));
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
 * Po zmniejszeniu liczby spacerów psa: spacer ponad nową liczbę, który jest wolny,
 * wychodzi ze swojej zaplanowanej grupy — tego spaceru już nie ma. Spacer ponad
 * liczbę, który ktoś zarezerwował albo odbył, zostaje (i dalej jest widoczny):
 * cudzej rezerwacji nie kasujemy po cichu, a odbyty spacer ma trafić do Historii.
 * Tylko dni otwarte. Pod blokadą.
 *
 * Najpierw jeden odczyt zakładki i wybór dni, w których jest co zmienić; dopiero te dni
 * czytamy do zmiany (walkDay_). Dawniej każdy otwarty dzień osobno — przy każdym zapisie
 * psa w katalogu i pod blokadą, a rezerwacje sięgają roku naprzód (review PR #2).
 */
function trimSlots_(onlyId) {
  const dogs = {};
  readDogCatalog_().forEach(x => { dogs[x.id] = x; });
  const sh = walksSheetLocked_();
  const current = businessDate_();
  const extra = s => {
    const dog = dogs[s.dogId];
    return dog && (!onlyId || s.dogId === onlyId) && s.slot > dog.walks && s.status === STATUS.FREE && s.group;
  };
  const dates = {};
  readSlots_(sh).forEach(s => { if (s.date >= current && extra(s)) dates[s.date] = true; });
  Object.keys(dates).forEach(date => {
    const d = walkDay_(sh, date);
    d.all().forEach(s => { if (extra(s)) leaveGroup_(d, d.slot(s.dogId, s.slot)); });
    d.save();
  });
}

/**
 * Przestawia CAŁĄ listę na 1 albo 2 spacery dziennie — ustawienie psa na stałe,
 * obowiązujące we wszystkie kolejne dni, dopóki ktoś go nie cofnie.
 * Schronisko dopuszcza drugi spacer przy upałach, decyzja bywa z godziny na
 * godzinę, a przeklikiwanie trzydziestu psów z osobna odpada.
 *
 * Przy spacerach jako osobnych wierszach nic nie trzeba przestawiać: włączenie
 * 2 spacerów dokłada psu wolny spacer 2/2 (odbyty rano spacer to jego 1/2), a powrót
 * do 1 zostawia odbyte i zarezerwowane spacery na miejscu (trimSlots_).
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
    trimSlots_(0);
    return getData();
  });
}

/**
 * Usuwa psa z katalogu. Spacery, które już się odbyły (a dzień nie jest jeszcze
 * zamknięty), najpierw trafiają do Historii — tu, póki jeszcze znamy imię.
 * Pies adoptowany po południu miał rano spacer, i ten spacer ma zostać
 * w Historii pod imieniem, a nie jako „Pies 17". Przyszłe rezerwacje przepadają.
 * Grupa, w której po nim został jeden spacer, przestaje być grupą — jak wszędzie.
 */
function removeDog(id, pin) {
  requirePin_(pin);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      const walks = walksSheetLocked_();
      const groups = readSlots_(walks).filter(s => s.dogId === Number(id) && s.group);
      closeWalks_(s => s.dogId === Number(id));
      sh.deleteRow(row);
      groups.forEach(s => {
        const d = walkDay_(walks, s.date);
        const left = d.inGroup(s.group);
        if (left.length !== 1) return;
        left[0].group = 0;
        d.put(left[0]);
        d.save();
      });
    }
    return getData();
  });
}

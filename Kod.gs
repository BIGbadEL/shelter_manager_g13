/**
 * G13 Spacery — silnik aplikacji (backend).
 * Arkusz Google jest ukrytą bazą danych; ludzie widzą tylko interfejs (Index.html).
 *
 * ZAKŁADKI (tworzy setup()):
 *   Psy      — id | imie | identyfikator | boks | trudnosc | status | kto | godzina | ostatni_spacer
 *   Historia — data | pies | kto | godzina
 *   Zadania  — id | tresc | data | status
 *
 * >>> USTAW TO PRZED WDROŻENIEM <<<
 * PIN trybu prowadzącej (dodawanie/edycja/usuwanie psów i zadań).
 */
const PIN = '1234';   // <--- ZMIEŃ na własny PIN

const SHEET_DOGS  = 'Psy';
const SHEET_HIST  = 'Historia';
const SHEET_TASKS = 'Zadania';

/**
 * Układ kolumn w jednym miejscu — jeśli kiedyś dojdzie nowa kolumna,
 * dopisz ją TYLKO tutaj (na końcu) i w setup()/migrate().
 * Wartości = numer kolumny w arkuszu (1 = A).
 */
const DOG = { ID: 1, NAME: 2, IDENT: 3, BOX: 4, DIF: 5, STATUS: 6, WHO: 7, TIME: 8, LAST_WALK: 9 };
const DOG_HEADERS  = ['id', 'imie', 'identyfikator', 'boks', 'trudnosc', 'status', 'kto', 'godzina', 'ostatni_spacer'];
const DOG_WIDTH    = DOG_HEADERS.length;

const TASK = { ID: 1, TEXT: 2, DATE: 3, STATUS: 4 };
const TASK_HEADERS = ['id', 'tresc', 'data', 'status'];
const TASK_WIDTH   = TASK_HEADERS.length;

const HIST_HEADERS = ['data', 'pies', 'kto', 'godzina'];

const DIFFICULTIES = ['easy', 'med', 'hard'];

/* ---------- POMOCNICZE ---------- */

function ss_()    { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_()    { return Session.getScriptTimeZone() || 'Europe/Warsaw'; }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function now_()   { return Utilities.formatDate(new Date(), tz_(), 'H:mm'); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);                 // czekaj max 20 s, żeby zapisy się nie gryzły
  try { return fn(); } finally { lock.releaseLock(); }
}

function requirePin_(pin) {
  if (String(pin) !== String(PIN)) throw new Error('Zły PIN');
}

/** Zwraca numer wiersza o danym id (kolumna A) albo -1. */
function rowById_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(id)) return i + 2;
  }
  return -1;
}

/** Najwyższe id w kolumnie A + 1. */
function nextId_(sh) {
  const last = sh.getLastRow();
  let maxId = 0;
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues()
      .forEach(r => { if (Number(r[0]) > maxId) maxId = Number(r[0]); });
  }
  return maxId + 1;
}

/** Data z komórki (Date lub tekst) -> 'yyyy-MM-dd' albo ''. */
function cellDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v || '');
}

function clean_(v, maxLen) { return String(v == null ? '' : v).trim().slice(0, maxLen || 40); }

function validDif_(d) { return DIFFICULTIES.indexOf(d) >= 0 ? d : 'easy'; }

/** Nazwa psa do Historii: imię, a gdy go brak — identyfikator, a gdy i tego brak — "Pies <id>". */
function dogLabel_(name, ident, id) {
  return name || (ident ? '#' + ident : 'Pies ' + id);
}

/* ---------- PIERWSZE URUCHOMIENIE ---------- */

/**
 * Uruchom RAZ ręcznie (przycisk ▶ obok setup) po wklejeniu kodu.
 * Zakłada zakładki Psy, Historia i Zadania oraz kilka przykładowych psów.
 */
function setup() {
  const s = ss_();

  const dogs = s.getSheetByName(SHEET_DOGS) || s.insertSheet(SHEET_DOGS);
  if (dogs.getLastRow() === 0) {
    dogs.getRange(1, 1, 1, DOG_WIDTH).setValues([DOG_HEADERS]);
    dogs.getRange(2, 1, 3, DOG_WIDTH).setValues([
      [1, 'Borys',  '',     'K-3', 'easy', 'free', '', '', ''],
      [2, 'Luna',   '1024', '',    'easy', 'free', '', '', ''],
      [3, '',       '2077', 'K-9', 'hard', 'free', '', '', ''],  // nowy pies: jeszcze bez imienia
    ]);
    dogs.setFrozenRows(1);
  }

  const hist = s.getSheetByName(SHEET_HIST) || s.insertSheet(SHEET_HIST);
  if (hist.getLastRow() === 0) {
    hist.getRange(1, 1, 1, HIST_HEADERS.length).setValues([HIST_HEADERS]);
    hist.setFrozenRows(1);
  }

  const tasks = s.getSheetByName(SHEET_TASKS) || s.insertSheet(SHEET_TASKS);
  if (tasks.getLastRow() === 0) {
    tasks.getRange(1, 1, 1, TASK_WIDTH).setValues([TASK_HEADERS]);
    tasks.setFrozenRows(1);
  }
}

/**
 * Uruchom RAZ ręcznie TYLKO jeśli masz już arkusz w starym układzie
 * (6 kolumn: id|imie|trudnosc|status|kto|godzina). Dokłada nowe kolumny
 * bez utraty danych i tworzy zakładkę Zadania.
 */
function migrate() {
  const s = ss_();
  const dogs = s.getSheetByName(SHEET_DOGS);
  if (dogs && String(dogs.getRange(1, 3).getValue()) === 'trudnosc') {
    dogs.insertColumnsAfter(2, 2);   // miejsce na identyfikator i boks
    dogs.getRange(1, DOG.IDENT).setValue('identyfikator');
    dogs.getRange(1, DOG.BOX).setValue('boks');
    dogs.getRange(1, DOG.LAST_WALK).setValue('ostatni_spacer');
  }
  setup();   // dołoży brakującą zakładkę Zadania (istniejących nie ruszy)
}

/* ---------- SERWOWANIE STRONY ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Grupa G13 — spacery')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- ODCZYT ---------- */

function readDogs_() {
  const sh = ss_().getSheetByName(SHEET_DOGS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, DOG_WIDTH).getValues()
    .filter(r => r[DOG.ID - 1] !== '' && r[DOG.ID - 1] !== null)
    .map(r => ({
      id:       Number(r[DOG.ID - 1]),
      name:     String(r[DOG.NAME - 1] || ''),
      ident:    String(r[DOG.IDENT - 1] || ''),
      box:      String(r[DOG.BOX - 1] || ''),
      dif:      String(r[DOG.DIF - 1]) || 'easy',
      status:   String(r[DOG.STATUS - 1]) || 'free',
      who:      String(r[DOG.WHO - 1] || ''),
      time:     String(r[DOG.TIME - 1] || ''),
      lastWalk: cellDate_(r[DOG.LAST_WALK - 1]),
    }));
}

function readTasks_() {
  const sh = ss_().getSheetByName(SHEET_TASKS);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, TASK_WIDTH).getValues()
    .filter(r => r[TASK.ID - 1] !== '' && r[TASK.ID - 1] !== null)
    .map(r => ({
      id:   Number(r[TASK.ID - 1]),
      text: String(r[TASK.TEXT - 1] || ''),
      date: cellDate_(r[TASK.DATE - 1]),
      done: String(r[TASK.STATUS - 1]) === 'done',
    }));
}

/** Jedno wywołanie = cały stan dnia. `today` z serwera, żeby odznaki "od wczoraj" liczyły się w polskiej strefie. */
function getData() {
  return { dogs: readDogs_(), tasks: readTasks_(), today: today_() };
}

function getHistory() {
  const sh = ss_().getSheetByName(SHEET_HIST);
  const last = sh.getLastRow();
  if (last < 2) return { history: [] };
  const rows = sh.getRange(2, 1, last - 1, HIST_HEADERS.length).getValues()
    .filter(r => r[0] !== '' && r[0] !== null)
    .map(r => ({
      date: cellDate_(r[0]),
      name: String(r[1]),
      who:  String(r[2] || ''),
      time: String(r[3] || ''),
    }));
  return { history: rows.reverse() };   // najnowsze na górze
}

/* ---------- AKCJE WOLONTARIUSZY: PSY ---------- */

function reserve(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return getData();
    const cur = String(sh.getRange(row, DOG.STATUS).getValue());
    if (cur === 'free' || cur === '') {          // rezerwuj tylko wolnego
      sh.getRange(row, DOG.STATUS, 1, 3).setValues([['reserved', clean_(name), '']]);
    }
    return getData();
  });
}

function markWalked(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return getData();
    const existing = String(sh.getRange(row, DOG.WHO).getValue() || '');
    const who = clean_(name) || existing;
    sh.getRange(row, DOG.STATUS, 1, 3).setValues([['walked', who, now_()]]);
    return getData();
  });
}

function setFree(id) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return getData();
    sh.getRange(row, DOG.STATUS, 1, 3).setValues([['free', '', '']]);
    return getData();
  });
}

/* ---------- AKCJE WOLONTARIUSZY: ZADANIA ---------- */

function setTaskDone(id, done) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_TASKS);
    const row = rowById_(sh, id);
    if (row > 0) sh.getRange(row, TASK.STATUS).setValue(done ? 'done' : 'open');
    return getData();
  });
}

/* ---------- AKCJE PROWADZĄCEJ (chronione PIN-em) ---------- */

function checkPin(pin) { return String(pin) === String(PIN); }

/**
 * data = { name, ident, box, dif } — wszystko opcjonalne poza tym,
 * że pies musi mieć imię LUB identyfikator (nowy pies bywa bez imienia).
 */
function addDog(data, pin) {
  requirePin_(pin);
  const name  = clean_(data && data.name);
  const ident = clean_(data && data.ident, 20);
  const box   = clean_(data && data.box, 20);
  if (!name && !ident) throw new Error('Podaj imię lub nr identyfikacyjny');
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    sh.appendRow([nextId_(sh), name, ident, box, validDif_(data && data.dif), 'free', '', '', '']);
    return getData();
  });
}

/** Edycja psa: zmiana imienia (np. nadanie imienia nowemu), boksu, identyfikatora, trudności. */
function updateDog(id, data, pin) {
  requirePin_(pin);
  const name  = clean_(data && data.name);
  const ident = clean_(data && data.ident, 20);
  const box   = clean_(data && data.box, 20);
  if (!name && !ident) throw new Error('Podaj imię lub nr identyfikacyjny');
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      sh.getRange(row, DOG.NAME, 1, 4).setValues([[name, ident, box, validDif_(data && data.dif)]]);
    }
    return getData();
  });
}

function removeDog(id, pin) {
  requirePin_(pin);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row > 0) sh.deleteRow(row);
    return getData();
  });
}

function addTask(text, pin) {
  requirePin_(pin);
  const t = clean_(text, 120);
  if (!t) throw new Error('Puste zadanie');
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_TASKS);
    sh.appendRow([nextId_(sh), t, today_(), 'open']);
    return getData();
  });
}

function removeTask(id, pin) {
  requirePin_(pin);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_TASKS);
    const row = rowById_(sh, id);
    if (row > 0) sh.deleteRow(row);
    return getData();
  });
}

/* ---------- RESET O 22:00 (wyzwalacz czasowy) ---------- */

/**
 * Podłącz jako wyzwalacz czasowy (dzienny, 22:00–23:00). Robi trzy rzeczy:
 *  1. wyprowadzone psy -> Historia + zapis daty w ostatni_spacer,
 *  2. wszystkie psy z powrotem na "free",
 *  3. Zadania: usuwa TYLKO odhaczone; nieodhaczone zostają (interfejs
 *     pokaże przy nich "od wczoraj" / "od N dni").
 */
function endOfDay() {
  withLock_(() => {
    const s = ss_();
    const today = today_();

    // --- psy ---
    const sh = s.getSheetByName(SHEET_DOGS);
    const last = sh.getLastRow();
    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, DOG_WIDTH).getValues();
      const toHist = [];

      vals.forEach((r, i) => {
        if (String(r[DOG.STATUS - 1]) === 'walked') {
          const label = dogLabel_(String(r[DOG.NAME - 1] || ''), String(r[DOG.IDENT - 1] || ''), r[DOG.ID - 1]);
          toHist.push([today, label, r[DOG.WHO - 1], r[DOG.TIME - 1]]);
          r[DOG.LAST_WALK - 1] = today;                     // zapamiętaj datę ostatniego spaceru
        }
        r[DOG.STATUS - 1] = 'free';                         // wszyscy wracają na "wolny"
        r[DOG.WHO - 1] = '';
        r[DOG.TIME - 1] = '';
      });

      if (toHist.length) {
        const hist = s.getSheetByName(SHEET_HIST);
        hist.getRange(hist.getLastRow() + 1, 1, toHist.length, HIST_HEADERS.length).setValues(toHist);
      }
      sh.getRange(2, 1, vals.length, DOG_WIDTH).setValues(vals);
    }

    // --- zadania: znikają tylko zrobione ---
    const tasks = s.getSheetByName(SHEET_TASKS);
    if (tasks) {
      const tl = tasks.getLastRow();
      if (tl >= 2) {
        const st = tasks.getRange(2, TASK.STATUS, tl - 1, 1).getValues();
        for (let i = st.length - 1; i >= 0; i--) {          // od dołu, żeby numery wierszy się nie przesuwały
          if (String(st[i][0]) === 'done') tasks.deleteRow(i + 2);
        }
      }
    }
  });
}

/**
 * G13 Spacery — silnik aplikacji (backend).
 * Arkusz Google jest ukrytą bazą danych; ludzie widzą tylko interfejs (Index.html).
 *
 * >>> USTAW TO PRZED WDROŻENIEM <<<
 * Wpisz swój PIN dla trybu prowadzącej (dodawanie/usuwanie psów).
 * Znasz go tylko Ty i dwie wyznaczone osoby.
 */
const PIN = '1234';   // <--- ZMIEŃ na własny PIN

const SHEET_DOGS = 'Psy';
const SHEET_HIST = 'Historia';

/* ---------- POMOCNICZE ---------- */

function ss_()  { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_()  { return Session.getScriptTimeZone() || 'Europe/Warsaw'; }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);                 // czekaj max 20 s, żeby zapisy się nie gryzły
  try { return fn(); } finally { lock.releaseLock(); }
}

function rowById_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(id)) return i + 2;
  }
  return -1;
}

/* ---------- PIERWSZE URUCHOMIENIE ---------- */

/**
 * Uruchom RAZ ręcznie (przycisk ▶ obok setup) po wklejeniu kodu.
 * Zakłada zakładki Psy i Historia oraz kilka przykładowych psów.
 */
function setup() {
  const s = ss_();

  let dogs = s.getSheetByName(SHEET_DOGS) || s.insertSheet(SHEET_DOGS);
  if (dogs.getLastRow() === 0) {
    dogs.getRange(1, 1, 1, 6)
        .setValues([['id', 'imie', 'trudnosc', 'status', 'kto', 'godzina']]);
    dogs.getRange(2, 1, 3, 6).setValues([
      [1, 'Borys',  'easy', 'free', '', ''],
      [2, 'Luna',   'easy', 'free', '', ''],
      [3, 'Reksio', 'hard', 'free', '', ''],
    ]);
    dogs.setFrozenRows(1);
  }

  let hist = s.getSheetByName(SHEET_HIST) || s.insertSheet(SHEET_HIST);
  if (hist.getLastRow() === 0) {
    hist.getRange(1, 1, 1, 4).setValues([['data', 'pies', 'kto', 'godzina']]);
    hist.setFrozenRows(1);
  }
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
  const vals = sh.getRange(2, 1, last - 1, 6).getValues();
  return vals
    .filter(r => r[0] !== '' && r[0] !== null)
    .map(r => ({
      id:     Number(r[0]),
      name:   String(r[1]),
      dif:    String(r[2]) || 'easy',
      status: String(r[3]) || 'free',
      who:    String(r[4] || ''),
      time:   String(r[5] || ''),
    }));
}

function getData() { return { dogs: readDogs_() }; }

function getHistory() {
  const sh = ss_().getSheetByName(SHEET_HIST);
  const last = sh.getLastRow();
  if (last < 2) return { history: [] };
  const vals = sh.getRange(2, 1, last - 1, 4).getValues();
  const rows = vals
    .filter(r => r[0] !== '' && r[0] !== null)
    .map(r => ({
      date: (r[0] instanceof Date)
              ? Utilities.formatDate(r[0], tz_(), 'yyyy-MM-dd')
              : String(r[0]),
      name: String(r[1]),
      who:  String(r[2] || ''),
      time: String(r[3] || ''),
    }));
  return { history: rows.reverse() };   // najnowsze na górze
}

/* ---------- AKCJE WOLONTARIUSZY ---------- */

function reserve(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return getData();
    const cur = String(sh.getRange(row, 4).getValue());
    if (cur === 'free' || cur === '') {          // rezerwuj tylko wolnego
      sh.getRange(row, 4, 1, 3)
        .setValues([['reserved', String(name).slice(0, 40), '']]);
    }
    return getData();
  });
}

function markWalked(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return getData();
    const existing = String(sh.getRange(row, 5).getValue() || '');
    const who = (name && String(name).trim()) ? String(name).slice(0, 40) : existing;
    const t = Utilities.formatDate(new Date(), tz_(), 'H:mm');
    sh.getRange(row, 4, 1, 3).setValues([['walked', who, t]]);
    return getData();
  });
}

function setFree(id) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return getData();
    sh.getRange(row, 4, 1, 3).setValues([['free', '', '']]);
    return getData();
  });
}

/* ---------- AKCJE PROWADZĄCEJ (chronione PIN-em) ---------- */

function checkPin(pin) { return String(pin) === String(PIN); }

function addDog(name, dif, pin) {
  if (String(pin) !== String(PIN)) throw new Error('Zły PIN');
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const last = sh.getLastRow();
    let maxId = 0;
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, 1).getValues()
        .forEach(r => { if (Number(r[0]) > maxId) maxId = Number(r[0]); });
    }
    const d = ['easy', 'med', 'hard'].indexOf(dif) >= 0 ? dif : 'easy';
    sh.appendRow([maxId + 1, String(name).slice(0, 40), d, 'free', '', '']);
    return getData();
  });
}

function removeDog(id, pin) {
  if (String(pin) !== String(PIN)) throw new Error('Zły PIN');
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEET_DOGS);
    const row = rowById_(sh, id);
    if (row > 0) sh.deleteRow(row);
    return getData();
  });
}

/* ---------- RESET O 22:00 (wyzwalacz czasowy) ---------- */

/**
 * Podłącz jako wyzwalacz czasowy (dzienny, 22:00–23:00).
 * Zrzuca dzisiejsze spacery do Historii i czyści listę na następny dzień.
 */
function endOfDay() {
  withLock_(() => {
    const s = ss_();
    const sh = s.getSheetByName(SHEET_DOGS);
    const hist = s.getSheetByName(SHEET_HIST);
    const last = sh.getLastRow();
    if (last < 2) return;

    const vals = sh.getRange(2, 1, last - 1, 6).getValues();
    const today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');

    const toHist = [];
    vals.forEach(r => {
      if (String(r[3]) === 'walked') toHist.push([today, r[1], r[4], r[5]]);
    });
    if (toHist.length) {
      hist.getRange(hist.getLastRow() + 1, 1, toHist.length, 4).setValues(toHist);
    }

    // wszystkie psy z powrotem na "free"
    const reset = vals.map(() => ['free', '', '']);
    sh.getRange(2, 4, vals.length, 3).setValues(reset);
  });
}

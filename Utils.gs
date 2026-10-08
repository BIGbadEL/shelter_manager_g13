/**
 * G13 Spacery — FUNKCJE POMOCNICZE.
 * Wspólne narzędzia dla całego backendu. Sufiks "_" = funkcja prywatna,
 * niewywoływalna z przeglądarki przez google.script.run.
 */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function tz_() { return Session.getScriptTimeZone() || TIMEZONE; }

/** Dzisiejsza data 'yyyy-MM-dd' w strefie aplikacji. */
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

/** Aktualna godzina 'H:mm' w strefie aplikacji. */
function now_() { return Utilities.formatDate(new Date(), tz_(), 'H:mm'); }

/**
 * Czy to prawdziwa data 'yyyy-MM-dd'. Sam wzorzec przepuściłby '2026-13-45' —
 * taki wiersz dostawałby każdy telefon, a nocne czyszczenie nigdy by go nie domknęło.
 */
function isDate_(s) {
  const t = String(s == null ? '' : s);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && addDays_(t, 0) === t;
}

/**
 * Dodatnia liczba całkowita albo 0 — numer grupy z arkusza albo z przeglądarki.
 * Grupa 1.5 (ręcznie w arkuszu albo z publicznego setGroup) wywracała rysowanie
 * listy na każdym telefonie: kolor grupy to indeks w tablicy.
 */
function posInt_(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Data 'yyyy-MM-dd' przesunięta o n dni.
 * Czysta arytmetyka na kalendarzu (UTC), bez zegara i bez stref — dodawanie
 * 24 godzin do znacznika czasu potrafi przy zmianie czasu z zimowego na letni
 * przeskoczyć o dwa dni albo nie przeskoczyć wcale.
 */
function addDays_(iso, n) {
  const p = String(iso).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  const pad = x => String(x).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

/** Głębokość zagnieżdżenia withLock_ w bieżącym wywołaniu (każde wywołanie z przeglądarki startuje od zera). */
let lockDepth_ = 0;

/**
 * Wykonuje fn pod globalną blokadą (równoległe zapisy się nie gryzą)
 * i wymusza zapis do arkusza PRZED zwolnieniem blokady.
 *
 * Bezpieczne na zagnieżdżenie: blokada Apps Script nie jest wielokrotnego
 * wejścia, a zwolnienie jej w środku (np. getData() spod akcji edycyjnej,
 * które musi założyć brakującą zakładkę) puściłoby blokadę zewnętrzną
 * w połowie jej pracy. Zagnieżdżone wywołanie po prostu działa pod tą,
 * którą już trzymamy.
 *
 * Zapis wolniejszy niż DIAG_SLOW_MS i każdy błąd blokady trafiają do dziennika spowolnień
 * (Diag.gs) z rozbiciem: `blokada` — czekanie na inne zapisy, `praca` — nasz kod pod blokadą,
 * `zapis` — flush do arkusza i zwolnienie. Mierzymy zawsze (to tylko zegar), piszemy rzadko.
 */
function withLock_(fn) {
  if (lockDepth_ > 0) return fn();
  const t0 = Date.now();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);   // czekaj max 20 s
  } catch (e) {
    diagServer_(diagCaller_(), Date.now() - t0, { blokada: Date.now() - t0 }, e);
    throw e;
  }
  const t1 = Date.now();
  let t2 = t1, err = null;
  lockDepth_++;
  try {
    return fn();
  } catch (e) {
    err = e;
    throw e;
  } finally {
    lockDepth_--;
    t2 = Date.now();
    SpreadsheetApp.flush();
    lock.releaseLock();
    const ms = Date.now() - t0;
    if (ms >= DIAG_SLOW_MS) diagServer_(diagCaller_(), ms, { blokada: t1 - t0, praca: t2 - t1, zapis: Date.now() - t2 }, err);
  }
}

/**
 * Rzuca błędem (widocznym w interfejsie jako toast), gdy PIN się nie zgadza.
 * Brak ustawionego PIN-u to nie jest "PIN pusty przechodzi" — to zamknięte
 * drzwi plus komunikat, co zrobić, żeby je otworzyć.
 */
function requirePin_(pin) {
  const real = pin_();
  if (!real) throw new Error('PIN nie jest ustawiony — dodaj właściwość skryptu „pin”');
  if (String(pin) !== real) throw new Error('Zły PIN');
}

/** Numer wiersza o danym id (kolumna A) albo -1. */
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

/**
 * Wartość komórki z datą -> 'yyyy-MM-dd'.
 * Arkusz potrafi samowolnie zamienić tekst na Date, więc obsługujemy oba przypadki.
 */
function cellDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v || '');
}

/**
 * Wartość komórki z godziną -> 'H:mm'.
 * Naprawia bug "Sat Dec 30 1899...": tekst "17:21" bywał parsowany przez
 * arkusz na Date z epoką 1899 i tak wracał do interfejsu.
 */
function cellTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'H:mm');
  return String(v || '');
}

/** Przycina tekst i ogranicza długość. */
function clean_(v, maxLen) {
  return String(v == null ? '' : v).trim().slice(0, maxLen || MAX_LEN.NAME);
}

/** Waliduje trudność; nieznana wartość -> 'easy'. */
function validDif_(d) { return DIFFICULTIES.indexOf(d) >= 0 ? d : 'easy'; }

/** Nazwa psa do wyświetlenia/Historii: imię, a bez imienia — identyfikator lub "Pies <id>". */
function dogLabel_(name, ident, id) {
  return name || (ident ? '#' + ident : 'Pies ' + id);
}

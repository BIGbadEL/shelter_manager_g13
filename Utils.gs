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
 * Wykonuje fn pod globalną blokadą (równoległe zapisy się nie gryzą)
 * i wymusza zapis do arkusza PRZED zwolnieniem blokady.
 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);   // czekaj max 20 s
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
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

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
 * Praca pod bieżącą blokadą nie zmieniała katalogu psów (zakładki Psy) — ustawia ją akcja na spacerach
 * (slotAction_, setGroup). Domyślnie NIE: każdy inny zapis unieważnia też katalog w pamięci podręcznej,
 * więc nowy zapis, o którym nikt nie pomyślał, jest bezpieczny z urzędu.
 */
let lockKeepsDogs_ = false;

/**
 * Kolory wolontariuszy odczytane pod bieżącą blokadą: data -> mapa (volunteersOf_). Rezerwacja czytała
 * je dwa razy — przed przydziałem i do odpowiedzi. withLock_ zeruje na wejściu i wyjściu: następna
 * blokada czyta świeżo, bo w międzyczasie kolor mógł przydzielić inny telefon.
 */
let volLock_ = null;

/* ---------- PAMIĘĆ PODRĘCZNA (CacheService, 1.3.1) ----------
 * Pomiar 9.10.2026 (CLAUDE.md, „Pomiar opóźnień"): całe opóźnienie siedzi w wykonaniu — każde wywołanie
 * arkusza to ~0,1 s, a pojedyncze potrafi stanąć na sekundy, raz na 351 s; zapis trzymał blokadę ~2 s
 * (~10 wywołań pod nią). Pamięć Google odpowiada w kilkadziesiąt ms i nie zależy od arkusza. Trzyma
 * dwie rzeczy: katalog psów dla akcji pod blokadą (catalogLocked_ w Dogs.gs) i stan startowy strony
 * (bootState_ w WebApp.gs). Odświeżanie listy (getData) dalej czyta arkusz — i wkłada świeży stan.
 *
 * Poprawności pilnują ZNACZNIKI POKOLENIA: każdy zapis pod blokadą, PO flush, a przed zwolnieniem
 * (withLock_), wymienia znacznik — wpis podpisany innym jest nieważny. Kto czyta arkusz poza blokadą,
 * bierze znacznik PRZED odczytem i nim podpisuje to, co wkłada: jeśli w międzyczasie przeszedł zapis,
 * znacznik jest już inny i wpis nigdy nie zostanie użyty — nie ma okna, w którym stary stan uchodziłby
 * za nowy. Brakujący znacznik zakłada się tylko pod blokadą (zapis, catalogLocked_, cacheGens_) —
 * bez niej zakładanie ścigałoby się z zapisem. Ręczna edycja arkusza znacznika nie zmienia: najbliższe
 * getData (z arkusza) wkłada świeży stan pod tym samym znacznikiem.
 * Google czyści pamięć, kiedy chce, a każdy jej błąd znaczy „czytaj arkusz", jak przed 1.3.1 —
 * pamięć nigdy nie zatrzymuje odczytu ani zapisu.
 */
function cacheGet_(keys) {
  try {
    const got = CacheService.getScriptCache().getAll(keys.map(k => CACHE_PREFIX + k)) || {};
    const out = {};
    keys.forEach(k => { if (got[CACHE_PREFIX + k] != null) out[k] = got[CACHE_PREFIX + k]; });
    return out;
  } catch (e) {
    return {};
  }
}

function cachePut_(values) {
  const v = {};
  Object.keys(values).forEach(k => { v[CACHE_PREFIX + k] = values[k]; });
  if (!Object.keys(v).length) return;
  try { CacheService.getScriptCache().putAll(v, CACHE_TTL_S); } catch (e) { /* za duże albo awaria — zostaje arkusz */ }
}

/** Wpis podpisany znacznikiem — odczytany, jeśli podpis się zgadza, inaczej null. */
function cacheSigned_(raw, gen) {
  if (!raw || !gen) return null;
  try {
    const v = JSON.parse(raw);
    return v && v.gen === gen ? v : null;
  } catch (e) {
    return null;
  }
}

function cacheToken_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

/**
 * Znaczniki do podpisania odczytu arkusza spoza blokady (`got` — to, co już przyszło z pamięci). Brakujące
 * (wygasły po CACHE_TTL_S bez żadnego zapisu — np. rano po nocy — albo Google wyczyścił pamięć) zakładamy
 * pod blokadą, ale tylko gdy jest wolna od ręki: pod nią nikt nie zapisuje, więc odczyt arkusza po
 * założeniu jest co najmniej tak nowy jak znacznik. Trwa zapis — nie zakładamy, zrobi to on sam. Bez tego
 * po każdej cichej nocy strona otwierałaby się z arkusza aż do pierwszej rezerwacji.
 */
function cacheGens_(got, keys) {
  const out = {};
  keys.forEach(k => { if (got[k]) out[k] = got[k]; });
  const missing = keys.filter(k => !out[k]);
  if (!missing.length || lockDepth_) return out;
  try {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(0)) return out;
    try {
      const again = cacheGet_(missing);
      const put = {};
      missing.forEach(k => { out[k] = again[k] || (put[k] = cacheToken_()); });
      cachePut_(put);
    } finally {
      lock.releaseLock();
    }
  } catch (e) { /* bez znacznika — po prostu bez pamięci */ }
  return out;
}

/**
 * Zapis właśnie wylądował w arkuszu: nowy znacznik stanu, a gdy zapis mógł ruszyć katalog — także
 * katalogu. Nieudana wymiana = usunięcie wpisów, żeby żaden stary nie został ważny; gdy i to zawiedzie,
 * najbliższe getData wkłada świeży stan pod starym znacznikiem.
 */
function cacheBump_(dogs) {
  const v = { [CACHE_KEY.GEN]: cacheToken_() };
  if (dogs) v[CACHE_KEY.DOGS_GEN] = cacheToken_();
  const p = {};
  Object.keys(v).forEach(k => { p[CACHE_PREFIX + k] = v[k]; });
  try {
    CacheService.getScriptCache().putAll(p, CACHE_TTL_S);
  } catch (e) {
    try {
      CacheService.getScriptCache().removeAll([CACHE_KEY.BOOT].concat(dogs ? [CACHE_KEY.DOGS] : []).map(k => CACHE_PREFIX + k));
    } catch (e2) { /* nic więcej się nie da */ }
  }
}

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
 * `zapis` — flush do arkusza, nowy znacznik pamięci podręcznej (cacheBump_) i zwolnienie.
 * Mierzymy zawsze (to tylko zegar), piszemy rzadko.
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
  lockKeepsDogs_ = false;
  volLock_ = null;
  try {
    return fn();
  } catch (e) {
    err = e;
    throw e;
  } finally {
    lockDepth_--;
    t2 = Date.now();
    SpreadsheetApp.flush();
    cacheBump_(!lockKeepsDogs_);     // po flush: to, co czyta się z arkusza, jest już nowe
    lock.releaseLock();
    volLock_ = null;
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

/**
 * G13 Spacery — DZIENNIK SPOWOLNIEŃ.
 *
 * Skąd: 7–8.10.2026 dwie osoby zgłosiły, że strona „ładowała się bardzo długo, a potem wisiała".
 * Dziennik wykonań Google pokazał tylko łączny czas (otwarcie strony 37 s i 44 s, odczyt 360 s
 * zakończony limitem czasu) — bez tego, który krok tyle trwał, bez filtra po funkcji i bez
 * żadnego śladu tego, co działo się na telefonie. Ten dziennik siedzi w Panelu i mówi więcej:
 *
 *  - serwer (diagServer_): każde wywołanie dłuższe niż DIAG_SLOW_MS z rozbiciem na kroki —
 *    otwarcie strony (doGet: szablon, odczyty, składanie strony), odczyt listy (getData:
 *    ustawienia, psy, spacery, zadania, reszta) i każdy zapis pod blokadą (withLock_: czekanie
 *    na blokadę, praca, zapis do arkusza), a do tego błąd blokady i nieudany stan startowy.
 *    Liczy NASZ kod: czasu, zanim Google go uruchomi, nie widzi. Telefon czekał długo, a serwer
 *    w tej chwili nie ma wpisu = sieć albo Google przed naszym kodem;
 *  - telefony (reportDiag): wolne i nieudane wywołania widziane z telefonu, odczyt bez
 *    odpowiedzi, strona, która długo do niego szła, przerwy, w których strona stała, choć była
 *    na ekranie, i błędy skryptu (Script.html, „DZIENNIK SPOWOLNIEŃ").
 *
 * Dziennik to kosmetyka: żaden jego błąd nie może zatrzymać odczytu ani zapisu (wszystko
 * w try/catch). Zapis idzie BEZ blokady — dziennik pisze się najczęściej wtedy, gdy blokada
 * jest zakorkowana, a czekanie na nią dokładałoby korka; dwa wpisy naraz mogą zgubić jeden
 * z nich, nic więcej. Na zwykłej pracy nic nie kosztuje: właściwość rusza tylko wolne
 * wywołanie i telefon, który ma coś do zgłoszenia.
 */

/** Długość napisu w bajtach UTF-8 — limit właściwości (9 KB) liczy bajty, a polskie znaki mają po dwa. */
function diagBytes_(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/**
 * Dopisuje wpisy na koniec dziennika pod kluczem `key`: świeży odczyt (nie pamięć wykonania —
 * w tym samym czasie piszą inne telefony), bez powtórek po `id` (telefon ponawia wysyłkę, gdy
 * odpowiedź zginęła), najwyżej DIAG_KEEP najnowszych i DIAG_BYTES bajtów.
 */
function diagPush_(key, entries) {
  try {
    const sp = PropertiesService.getScriptProperties();
    let list = [];
    try { list = JSON.parse(sp.getProperty(key) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    const ids = {};
    list.forEach(e => { if (e && e.id) ids[e.id] = true; });
    entries.forEach(e => { if (!e.id || !ids[e.id]) { list.push(e); if (e.id) ids[e.id] = true; } });
    list = list.slice(-DIAG_KEEP);
    let json = JSON.stringify(list);
    while (list.length > 1 && diagBytes_(json) > DIAG_BYTES) { list.shift(); json = JSON.stringify(list); }
    sp.setProperty(key, json);
    if (propsMemo_) propsMemo_[key] = json;
  } catch (e) {
    // dziennik nie może zatrzymać aplikacji (limit właściwości, awaria usługi)
  }
}

/**
 * Wpis serwera: {at, fn, ms, parts?, err?}. `parts` — czasy kroków w ms (tylko liczby),
 * `err` — błąd blokady albo nieudany stan startowy strony.
 */
function diagServer_(fn, ms, parts, err) {
  try {
    const e = { at: Date.now(), fn: String(fn || '?').slice(0, 40), ms: Math.round(Number(ms) || 0) };
    if (parts) {
      e.parts = {};
      Object.keys(parts).forEach(k => { e.parts[k] = Math.round(Number(parts[k]) || 0); });
    }
    if (err) e.err = String(err && err.message || err).slice(0, 160);
    diagPush_(PROP_DIAG_SERVER, [e]);
  } catch (x) {
    // jak wyżej
  }
}

/**
 * Publiczna funkcja, która wzięła blokadę: pierwsza ramka stosu bez „_" (reserve, endOfDay…),
 * „at reserve (Dogs:553:10)" albo — wołana jako metoda — „at Object.reserve (…)".
 * Liczone tylko przy wolnym wywołaniu. Nie da się odczytać — '?', wpis i tak powstaje.
 */
function diagCaller_() {
  const re = /at (?:Object\.)?([A-Za-z$][\w$]*) \(/g;
  const stack = String(new Error().stack || '');
  let m;
  while ((m = re.exec(stack))) {
    if (m[1].slice(-1) !== '_') return m[1];
  }
  return '?';
}

/** Rodzaje wpisów z telefonu (Script.html, diagNote). */
const DIAG_KINDS = ['call', 'start', 'freeze', 'error'];

/**
 * Wpis z telefonu po sprawdzeniu: tylko znane pola, przycięte napisy, liczby w granicach.
 * reportDiag jest publiczne i bez PIN-u (wolontariusze go nie mają), więc wszystko, co przyjdzie,
 * traktujemy jak obce. `at` — czas zdarzenia z zegara telefonu, `rx` — kiedy doszło do serwera.
 */
function diagClean_(e, rx) {
  if (!e || typeof e !== 'object') return null;
  const id = String(e.id || '');
  if (!/^[a-z0-9]{6,16}$/i.test(id)) return null;
  const kind = String(e.kind || '');
  if (DIAG_KINDS.indexOf(kind) < 0) return null;
  const str = (v, n) => String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
  // Zegar telefonu: w przeszłość wolno (wpis czekał bez zasięgu, nawet kilka dni — „dosłane" w Panelu),
  // w przyszłość najwyżej dzień — telefon z rokiem 2030 stałby na szczycie dziennika (review PR #5, runda 3).
  const at = Number(e.at);
  const out = { id: id, kind: kind, at: isFinite(at) && at > 0 && at <= rx + 86400000 ? Math.round(at) : rx, rx: rx };
  if (e.dev != null && e.dev !== '') out.dev = str(e.dev, 12);
  if (e.ua != null && e.ua !== '') out.ua = str(e.ua, 60);
  if (e.fn != null && e.fn !== '') out.fn = str(e.fn, 30);
  const ms = Number(e.ms);
  if (e.ms != null && isFinite(ms)) out.ms = Math.max(0, Math.min(Math.round(ms), 3600000));
  if (e.msg != null && e.msg !== '') out.msg = str(e.msg, 120);
  return out;
}

/**
 * Telefon dosyła to, co sam widział (Script.html, sendDiag) — gdy nic innego nie leci, po
 * DIAG_REPORT_MAX wpisów naraz. Niepoprawne wpisy przepadają po cichu: telefon i tak usuwa
 * z kolejki wszystko, co wysłał, a dziennik ma się nie zapychać śmieciami.
 */
function reportDiag(entries) {
  if (!Array.isArray(entries)) return { ok: false };
  const rx = Date.now();
  const clean = entries.slice(0, DIAG_REPORT_MAX).map(e => diagClean_(e, rx)).filter(Boolean);
  if (clean.length) diagPush_(PROP_DIAG_PHONES, clean);
  return { ok: true, n: clean.length };
}

/** Dziennik do Panelu (getDiagnostics, PIN): obie strony osobno, zepsuty wpis = pusta lista. */
function diagLog_() {
  const read = k => {
    try {
      const v = JSON.parse(prop_(k) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  };
  return { server: read(PROP_DIAG_SERVER), phones: read(PROP_DIAG_PHONES), slowMs: DIAG_SLOW_MS, keep: DIAG_KEEP };
}

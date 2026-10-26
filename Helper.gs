/**
 * G13 Spacery — POMOCNIK GRAFIKU (1.5, faza testów; projekt, źródła i decyzje: HELPER.md).
 *
 * Bot czyta grupę „Grafik" — ankietę tygodniową i to, co ludzie piszą — z kolejki powiadomień bramki
 * Green API i składa z tego, razem z danymi aplikacji (psy, Historia, rezerwacje), krótkie wiadomości:
 * skład na jutro, dziś rano przy problemie, przegląd tygodnia, nowa ankieta, nowe osoby
 * w grupie, miniony tydzień; do tego odpowiada na pytania w prywatnym czacie. Każda funkcja ma włącznik
 * w panelu — te, które się nie sprawdzą, wyłącza się pojedynczo (decyzja właściciela 24.10.2026).
 *
 * NA CZAS TESTÓW KAŻDA WIADOMOŚĆ IDZIE TYLKO PRYWATNIE, do kontaktu z ustawień. Adres grupy odrzuca zapis
 * ustawień (helperValid_), odczyt (helperSettings_) i każda wysyłka (helperSend_) — B74.
 *
 * Przebieg (helperRun_) co HELPER_TICK_MIN minut z wyzwalacza helperTick: kolejka bramki (helperIntake_) →
 * wiadomości o swoich porach (helperSchedule_) → zapis stanu. Jeden przebieg naraz (helperClaim_).
 * Pomocnik nie pisze do arkusza i nie trzyma blokady aplikacji w czasie wywołań bramki. Błąd bramki zostaje
 * w dzienniku pomocnika (panel), nie wychodzi z wyzwalacza — inaczej Google słałby maila co 10 minut.
 * Stan we właściwościach skryptu, każda z sufitem HELPER_BYTES (limit 9 KB na wartość).
 *
 * Kolejka powiadomień jest jedna na instancję bramki, a test i produkcja dzielą jedną instancję: pomocnik
 * może być włączony tylko w jednym środowisku — dwa czytające zjadałyby sobie powiadomienia (HELPER.md).
 */

/* ---------- słowa: dni, pory, miesiące (tekst po volNorm_: małe litery, bez ogonków) ---------- */

const HELPER_PRIVATE = /^\d{6,15}@c\.us$/;      // prywatny czat — jedyny dozwolony odbiorca w fazie testów
const HELPER_GROUP = /^\d+(-\d+)?@g\.us$/;

const HELPER_WD = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const HELPER_WD_SHORT = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];

/** Słowo → dzień tygodnia (0 = niedziela) albo kilka dni (weekend). Odmiana jak w czacie: „w środę", „z piątku". */
const HELPER_WEEKDAY_WORDS = (function () {
  const m = {};
  [['niedziela', 'niedziele', 'niedzieli', 'niedzielach', 'niedzielna', 'niedzielnej', 'niedz', 'nd', 'sunday'],
   ['poniedzialek', 'poniedzialku', 'poniedzialki', 'poniedzialkach', 'poniedzialkowa', 'poniedzialkowej', 'pon', 'pn', 'monday'],
   ['wtorek', 'wtorku', 'wtorki', 'wtorkach', 'wtorkowa', 'wtorkowej', 'wt', 'tuesday'],
   ['sroda', 'srode', 'srody', 'srodzie', 'srodach', 'srodowa', 'srodowej', 'sr', 'wednesday'],
   ['czwartek', 'czwartku', 'czwartki', 'czwartkach', 'czwartkowa', 'czwartkowej', 'czw', 'thursday'],
   ['piatek', 'piatku', 'piatki', 'piatkach', 'piatkowa', 'piatkowej', 'pt', 'friday'],
   ['sobota', 'sobote', 'soboty', 'sobocie', 'sobotach', 'sobotnia', 'sobotniej', 'sob', 'saturday']]
    .forEach((list, n) => list.forEach(w => { m[w] = n; }));
  ['weekend', 'weekendzie', 'weekendu', 'weekendy'].forEach(w => { m[w] = [6, 0]; });
  return m;
})();
const HELPER_REL = { dzis: 0, dzisiaj: 0, dzisiejszy: 0, jutro: 1, jutra: 1, jutrze: 1, jutrzejszy: 1, pojutrze: 2 };
const HELPER_PARTS = { rano: 'r', rana: 'r', poranek: 'r', wieczor: 'w', wieczorem: 'w', wieczorny: 'w', popoludnie: 'w', popoludniu: 'w' };
const HELPER_MONTHS = { stycznia: 1, styczen: 1, lutego: 2, luty: 2, marca: 3, marzec: 3, kwietnia: 4, kwiecien: 4, maja: 5, maj: 5,
  czerwca: 6, czerwiec: 6, lipca: 7, lipiec: 7, sierpnia: 8, sierpien: 8, wrzesnia: 9, wrzesien: 9, pazdziernika: 10,
  pazdziernik: 10, listopada: 11, listopad: 11, grudnia: 12, grudzien: 12 };

/* Rodzaj wiadomości z czatu (po volNorm_). Kolejność ma znaczenie: „nie będę" zawiera „będę". „Nie mogę się
   wpisać w grafik" (nowa osoba bez dostępu do ankiety) i „nie dam rady wcześniej" to nie odwołanie. */
const HELPER_ABSENT = /(nie ma mnie|nie bedzie mnie|nieobecn|wyjezdzam|wyjade|wracam|wroce|urlop|poza warszaw)/;
const HELPER_OUT = /(nie dam rady(?! (wczesniej|dluzej))|nie bede|nie moge(?! (sie )?(wpisac|zaznaczyc|dopisac|edytowac))|wypis|odpada|odpuszcz|nie przyjde|nie przyjade|nie dojade|rozchorowal|rozlozyl|\bchora\b|\bchory\b|wypadam|nie zdaze)/;
const HELPER_IN = /(\bbede\b|przyjad|przyjde|dolacz|dopisal|dopisze|wpisal|wpisze|moge byc|moge przyjsc|moge wpasc|wpadne|dojade|w drodze|zostane|\bjestem\b)/;

/* ---------- daty i nazwy ---------- */

function helperDate_(ms) { return Utilities.formatDate(new Date(ms), tz_(), 'yyyy-MM-dd'); }
function helperTime_(ms) { return Utilities.formatDate(new Date(ms), tz_(), 'H:mm'); }
function helperHour_() { return Number(Utilities.formatDate(new Date(), tz_(), 'H')); }
/** Ile dni od a do b ('yyyy-MM-dd'); arytmetyka kalendarza, bez zegara (jak addDays_). */
function helperDaysBetween_(a, b) {
  const t = s => { const p = String(s).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  return Math.round((t(b) - t(a)) / 86400000);
}
/** „wtorek 27.10" */
function helperLabel_(d) { return HELPER_WD[weekdayOf_(d)] + ' ' + d.slice(8) + '.' + d.slice(5, 7); }
function helperShortLabel_(d) { return HELPER_WD_SHORT[weekdayOf_(d)] + ' ' + d.slice(8) + '.' + d.slice(5, 7); }
/** „Jutro — wtorek 27.10" / „Środa 28.10" */
function helperTitle_(d) {
  const rel = ['Dziś', 'Jutro', 'Pojutrze'][helperDaysBetween_(today_(), d)];
  const l = helperLabel_(d);
  return rel ? rel + ' — ' + l : l.charAt(0).toUpperCase() + l.slice(1);
}
/** „pn 17:14" — kiedy padła wiadomość. */
function helperWhen_(ms) { return HELPER_WD_SHORT[weekdayOf_(helperDate_(ms))] + ' ' + helperTime_(ms); }

/** Dzień (d, m) z rokiem najbliższym dniu odniesienia — „05.01" pisane w grudniu to styczeń następnego roku. */
function helperYmd_(d, m, ref) {
  const y = Number(String(ref).slice(0, 4));
  let best = '';
  [y - 1, y, y + 1].forEach(yy => {
    const s = yy + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (isDate_(s) && (!best || Math.abs(helperDaysBetween_(ref, s)) < Math.abs(helperDaysBetween_(ref, best)))) best = s;
  });
  return best;
}

/** Nazwa z WhatsAppa bez dopisku grupy („Ania Kowalska Schronisko G13" → „Ania Kowalska"). */
function helperShort_(n) {
  return String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ')
    .replace(/\s*(schronisko\s*)?g\s*13\s*$/i, '').trim().slice(0, 40);
}

/**
 * Osoba do wiadomości: imię z ustawień („…123 = Ania" — końcówka numeru), z WhatsAppa (nadawca, także pod
 * innym formatem numeru — alias) albo końcówka numeru. Pełnego numeru pomocnik nigdzie nie pisze.
 */
function helperName_(s, st, id) {
  const digits = String(id).split('@')[0];
  const named = helperNameMap_(s.names);
  const own = Object.keys(named).filter(k => digits.slice(-k.length) === k)[0];
  if (own) return named[own];
  let p = st.people[id];
  if (!p) {
    const sender = Object.keys(st.alias).filter(k => st.alias[k] === id)[0];
    if (sender) p = st.people[sender];
  }
  return (p && p.n) || ('…' + digits.slice(-3));
}
/** „123 = Ania" w linijkach (albo po przecinku) → {'123': 'Ania'}. */
function helperNameMap_(text) {
  const out = {};
  String(text || '').split(/[\n,;]+/).forEach(line => {
    const m = line.match(/^\s*(?:…|\.\.\.)?\s*(\d{3,15})\s*[=:-]\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].slice(0, 40);
  });
  return out;
}
/** Imiona z pola „fioletowi" / „nowi". */
function helperRoleSet_(text) { return String(text || '').split(/[,;\n]+/).map(x => volNorm_(x)).filter(Boolean); }
function helperHasRole_(set, name) {
  const n = volNorm_(name);
  return set.some(r => n === r || n.indexOf(r + ' ') === 0 || n.split(' ')[0] === r);
}
/** Imię do porównania z Historią aplikacji: pierwszy wyraz, bez wielkości liter i ogonków. */
function helperFirst_(name) { return volNorm_(helperShort_(name)).split(' ')[0] || ''; }

/* ---------- ustawienia ---------- */

/** Zapisane ustawienia (zawsze kompletne). Adres, który nie jest prywatnym czatem, przepada — B74. */
function helperSettings_() {
  let s = {};
  try { s = JSON.parse(prop_(PROP_HELPER) || '{}') || {}; } catch (e) { s = {}; }
  const out = Object.assign({}, DEFAULT_HELPER, s);
  out.features = Object.assign({}, DEFAULT_HELPER.features, s.features && typeof s.features === 'object' ? s.features : {});
  out.weekDays = Array.isArray(s.weekDays) ? s.weekDays.slice() : DEFAULT_HELPER.weekDays.slice();
  if (!HELPER_PRIVATE.test(String(out.toId || ''))) { out.toId = ''; out.toName = ''; }
  if (!HELPER_GROUP.test(String(out.chatId || ''))) { out.chatId = ''; out.chatName = ''; }
  if (!out.chatId || !out.toId) out.enabled = false;
  return out;
}

/** Ustawienia z panelu — sprawdzone, albo błąd z komunikatem. Te same reguły w przeglądarce (helperProblem). */
function helperValid_(o) {
  o = o && typeof o === 'object' ? o : {};
  const chatId = String(o.chatId == null ? '' : o.chatId).trim();
  if (chatId && !HELPER_GROUP.test(chatId)) throw new Error('„Grafik" to grupa — wybierz ją z listy („Pobierz grupy")');
  const toId = String(o.toId == null ? '' : o.toId).trim();
  if (toId && !HELPER_PRIVATE.test(toId)) throw new Error('Na czas testów pomocnik pisze tylko prywatnie — wybierz kontakt z listy, nie grupę');
  const int = (v, lo, hi, msg) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(msg); return n; };
  const min = int(o.min, 1, HELPER_LIMITS.MIN_MAX, 'Minimum osób: od 1 do ' + HELPER_LIMITS.MIN_MAX);
  const evening = int(o.evening, 0, 23, 'Godzina „wieczorem" musi być z zakresu 0–23');
  const morning = int(o.morning, 0, 23, 'Godzina „rano" musi być z zakresu 0–23');
  const weekDays = [];
  (Array.isArray(o.weekDays) ? o.weekDays : []).forEach(d => {
    const n = int(d, 0, 6, 'Nieprawidłowy dzień tygodnia');
    if (weekDays.indexOf(n) < 0) weekDays.push(n);
  });
  weekDays.sort();
  const text = (v, max, what) => {
    const t = String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
    if (t.length > max) throw new Error(what + ' — najwyżej ' + max + ' znaków');
    return t;
  };
  const f = o.features && typeof o.features === 'object' ? o.features : {};
  const features = {};
  HELPER_FEATURES.forEach(k => { features[k] = f[k] === undefined ? !!DEFAULT_HELPER.features[k] : !!f[k]; });
  const enabled = !!o.enabled;
  if (enabled && !chatId) throw new Error('Wybierz grupę „Grafik", zanim włączysz pomocnika');
  if (enabled && !toId) throw new Error('Wybierz kontakt, do którego pomocnik ma pisać');
  const one = v => clean_(String(v || '').replace(/[\r\n]+/g, ' '), 100);
  return { enabled, chatId, chatName: chatId ? one(o.chatName) : '', toId, toName: toId ? one(o.toName) : '',
           min, evening, morning, weekDays,
           purple: text(o.purple, HELPER_LIMITS.NAMES, 'Fioletowi'), rookies: text(o.rookies, HELPER_LIMITS.NAMES, 'Nowi'),
           names: text(o.names, HELPER_LIMITS.NAME_MAP, 'Imiona'), features };
}

/** Wyzwalacz: co HELPER_TICK_MIN minut, gdy pomocnik włączony. */
function installHelperTrigger_(s) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'helperTick')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (!s.enabled) return;
  ScriptApp.newTrigger('helperTick').timeBased().everyMinutes(HELPER_TICK_MIN).create();
}

/** Zapis ustawień z panelu (PIN) i przełożenie wyzwalacza. Idempotentne (RETRIABLE). */
function setHelperSettings(settings, pin) {
  requirePin_(pin);
  const s = helperValid_(settings);
  if (s.enabled && !greenApi_()) throw new Error(GREEN_MISSING);
  withLock_(() => {
    setProp_(PROP_HELPER, JSON.stringify(s));
    installHelperTrigger_(s);
  });
  return helperPanel_();
}

/* ---------- stan (właściwości skryptu) ---------- */

/** Świeży odczyt właściwości — stan zmienia się między wykonaniami (wyzwalacz, panel). */
function helperProp_(k) {
  try { return PropertiesService.getScriptProperties().getProperty(k); } catch (e) { return null; }
}
function helperJson_(k, def) {
  try { const v = JSON.parse(helperProp_(k) || 'null'); return v == null ? def : v; } catch (e) { return def; }
}

function helperLoad_() {
  const people = helperJson_(PROP_HELPER_PEOPLE, {});
  const notes = helperJson_(PROP_HELPER_NOTES, {});
  const x = helperJson_(PROP_HELPER_STATE, {});
  const log = helperJson_(PROP_HELPER_LOG, []);
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const arr = v => Array.isArray(v) ? v : [];
  // ankiety w dwóch właściwościach (helperSave_): nowsze w pierwszej, starsze w drugiej
  const polls = arr(helperJson_(PROP_HELPER_POLLS, [])).concat(arr(helperJson_(PROP_HELPER_POLLS2, [])))
    .filter(p => p && p.id).sort((a, b) => a.t - b.t);
  return {
    polls, people: obj(people.p), alias: obj(people.a),
    notes: arr(notes.n), abs: arr(notes.b), gone: arr(notes.g),
    marks: obj(x.marks), members: x.members && Array.isArray(x.members.ids) ? x.members : null,
    seen: arr(x.seen), sent: obj(x.sent), stat: x.stat || null, queue: arr(x.queue), cmds: arr(x.cmds),
    since: Number(x.since) || 0, gate: x.gate && typeof x.gate === 'object' ? x.gate : null,
    histAt: Number(x.histAt) || 0, catchUp: !!x.catchUp, log: arr(log),
  };
}

/** Porządki przed zapisem: minione dni znikają, listy mają swoje sufity. */
function helperPrune_(st) {
  const T = today_(), y = addDays_(T, -1);
  st.notes = st.notes.filter(n => (n.d || []).some(d => d >= y) || (n.k === 'ask' && Date.now() - n.at < 86400000)).slice(-HELPER_LIMITS.NOTES);
  st.gone = st.gone.filter(g => g.d >= y).slice(-HELPER_LIMITS.GONE);
  st.abs = st.abs.filter(a => (a.iv || []).some(iv => iv[1] >= T)).slice(-HELPER_LIMITS.ABS);
  st.seen = st.seen.slice(-HELPER_LIMITS.SEEN);
  st.queue = st.queue.slice(-10);
  st.cmds = st.cmds.slice(-10);
  const old = Date.now() - 21 * 86400000;
  Object.keys(st.marks).forEach(k => { if (!(st.marks[k] > old)) delete st.marks[k]; });
  const ids = Object.keys(st.people);
  if (ids.length > HELPER_LIMITS.PEOPLE) {
    ids.sort((a, b) => (st.people[a].s || 0) - (st.people[b].s || 0))
      .slice(0, ids.length - HELPER_LIMITS.PEOPLE).forEach(k => { delete st.people[k]; });
  }
}

/** Zapis: każda właściwość najwyżej HELPER_BYTES bajtów — najpierw wypada najstarsze. Błąd zapisu — do dziennika. */
function helperSave_(st) {
  helperPrune_(st);
  const put = (key, build, trim) => {
    try {
      let json = JSON.stringify(build());
      while (diagBytes_(json) > HELPER_BYTES && trim()) json = JSON.stringify(build());
      setProp_(key, json);
    } catch (e) {
      helperLog_(st, 'err', 'zapis stanu (' + key + '): ' + (e && e.message || e));
    }
  };
  const oldestPerson = () => {
    const ids = Object.keys(st.people).sort((a, b) => (st.people[a].s || 0) - (st.people[b].s || 0));
    if (!ids.length) return false;
    delete st.people[ids[0]];
    return true;
  };
  // ankiety w dwóch właściwościach: od najnowszej, ile wejdzie w pierwszą, reszta w drugą (głosy z czasem — `vt` —
  // to ok. 3 KB na ankietę z 30 osobami, a w jednej 8 KB nie zmieściłyby się cztery); co się nie zmieści — wypada
  const newest = st.polls.slice().sort((a, b) => b.t - a.t), parts = [[], []];
  newest.forEach(p => {
    const k = [0, 1].filter(i => diagBytes_(JSON.stringify(parts[i].concat([p]))) <= HELPER_BYTES)[0];
    if (k != null) parts[k].push(p);
  });
  put(PROP_HELPER_POLLS, () => parts[0], () => false);
  put(PROP_HELPER_POLLS2, () => parts[1], () => false);
  put(PROP_HELPER_PEOPLE, () => ({ p: st.people, a: st.alias }), oldestPerson);
  put(PROP_HELPER_NOTES, () => ({ n: st.notes, b: st.abs, g: st.gone }), () => !!(st.notes.shift() || st.gone.shift() || st.abs.shift()));
  put(PROP_HELPER_STATE, () => ({ marks: st.marks, members: st.members, seen: st.seen, sent: st.sent,
                                  stat: st.stat, queue: st.queue, cmds: st.cmds, since: st.since, gate: st.gate,
                                  histAt: st.histAt, catchUp: st.catchUp }),
      () => !!st.seen.shift());
  put(PROP_HELPER_LOG, () => st.log, () => !!st.log.shift());
}

/** Dziennik pomocnika do panelu: {at, k, m, n?}; ten sam wpis pod rząd tylko podbija licznik. */
function helperLog_(st, k, m) {
  m = String(m == null ? '' : m).replace(/\s+/g, ' ').slice(0, 200);
  const last = st.log[st.log.length - 1];
  if (last && last.k === k && last.m === m) { last.n = (last.n || 1) + 1; last.at = Date.now(); return; }
  st.log.push({ at: Date.now(), k, m });
  if (st.log.length > HELPER_LIMITS.LOG) st.log.splice(0, st.log.length - HELPER_LIMITS.LOG);
}

/* ---------- przebieg ---------- */

/** Jeden przebieg naraz: znacznik „pracuję" pod krótką blokadą (bez flush i bez pamięci podręcznej — arkusza nie ruszamy). */
function helperClaim_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return false;
  try {
    const sp = PropertiesService.getScriptProperties();
    const busy = Number(sp.getProperty(PROP_HELPER_BUSY)) || 0;
    if (busy && Date.now() - busy < HELPER_BUSY_MS) return false;
    sp.setProperty(PROP_HELPER_BUSY, String(Date.now()));
    return true;
  } finally {
    lock.releaseLock();
  }
}
function helperRelease_() {
  try { PropertiesService.getScriptProperties().deleteProperty(PROP_HELPER_BUSY); } catch (e) { /* wygaśnie sam po HELPER_BUSY_MS */ }
}

/**
 * Wyzwalacz co HELPER_TICK_MIN minut. Publiczna (wyzwalacz nie woła funkcji z „_"), więc dostępna też
 * z przeglądarki — dlatego niczego nie przyjmuje: wywołana z zewnątrz robi to samo co wyzwalacz, a raporty
 * mają znaczniki „wysłany", więc nie da się nią zasypać właściciela wiadomościami. Nigdy nie rzuca.
 */
function helperTick() {
  const s = helperSettings_();
  if (!s.enabled || !greenApi_()) return null;
  try { return helperRun_(s, false); } catch (e) { return null; }
}

/** Przebieg: kolejka bramki → wiadomości → zapis. `manual` — „Sprawdź teraz" z panelu: zajęty = błąd z komunikatem. */
function helperRun_(s, manual) {
  if (!helperClaim_()) {
    if (manual) throw new Error('Pomocnik właśnie pracuje — spróbuj za kilka minut');
    return null;
  }
  const t0 = Date.now(), run = { events: 0, grafik: 0, sent: 0, err: '', manual: !!manual };
  let st = null;
  try {
    st = helperLoad_();
    if (!st.since) st.since = Date.now();
    try {
      helperGate_(s, st, !!manual);
    } catch (e) {
      helperLog_(st, 'err', 'ustawienia bramki: ' + (e && e.message || e));
    }
    try {
      helperIntake_(s, st, run);
    } catch (e) {
      run.err = String(e && e.message || e);
      helperLog_(st, 'err', 'kolejka bramki: ' + run.err);
    }
    try {
      helperSchedule_(s, st, run);
    } catch (e) {
      run.err = run.err || String(e && e.message || e);
      helperLog_(st, 'err', 'wiadomości: ' + (e && e.message || e));
    }
    st.stat = { at: Date.now(), ms: Date.now() - t0, events: run.events, grafik: run.grafik, sent: run.sent, err: run.err };
    helperSave_(st);
  } finally {
    helperRelease_();
  }
  return run;
}

/* ---------- kolejka bramki ---------- */

/**
 * Powiadomienia po kolei (receive → przetwórz → delete), najwyżej HELPER_MAX_EVENTS i HELPER_INTAKE_MS
 * na przebieg. Usunięte, a nieprzetworzone przez awarię wykonania przepada (rzadkie); przetworzone
 * dwa razy (awaria przed delete) nic nie psuje — wiadomości mają `idMessage` (st.seen), a głosy to stan, nie przyrost.
 */
function helperIntake_(s, st, run) {
  const t0 = Date.now();
  while (run.events < HELPER_MAX_EVENTS && Date.now() - t0 < HELPER_INTAKE_MS) {
    let r;
    try {
      r = greenCall_('receiveNotification', null, '?receiveTimeout=' + HELPER_RECEIVE_S);
    } catch (e) {
      // 408 — bramka nie doczekała się powiadomienia (dziennik testu 25.10, 2:05): pusta kolejka, nie błąd
      if (/błąd 408/.test(String(e && e.message))) break;
      throw e;
    }
    if (!r || r.receiptId == null) break;
    try {
      helperEvent_(s, st, r.body, run, 'queue');
    } catch (e) {
      helperLog_(st, 'err', 'powiadomienie: ' + (e && e.message || e));
    }
    greenCall_('deleteNotification', null, '/' + encodeURIComponent(String(r.receiptId)), 'delete');
    run.events++;
  }
}

/** Tekst wiadomości (zwykła, z odpowiedzią, z podpisem pod zdjęciem); '' = nie tekst. */
function helperText_(md) {
  md = md || {};
  const t = md.textMessageData ? md.textMessageData.textMessage
    : md.extendedTextMessageData ? md.extendedTextMessageData.text
    : md.fileMessageData ? md.fileMessageData.caption : '';
  return String(t == null ? '' : t).trim();
}

/**
 * Jedno zdarzenie: powiadomienie z kolejki (`src` 'queue') albo wiadomość z historii czatu (`src` 'history',
 * helperCatchUp_). Z „Grafiku": ankiety, głosy, wiadomości; z prywatnego czatu (tylko z kolejki): pytania właściciela.
 * Wszystko jest powtarzalne bez skutków ubocznych — ta sama wiadomość z historii i z kolejki to jedna notatka
 * (po `id`), głos to stan osoby z czasem (`vt` w helperApplyVotes_), ankieta po identyfikatorze.
 */
function helperEvent_(s, st, b, run, src) {
  if (!b || typeof b !== 'object') return;
  const type = String(b.typeWebhook || '');
  if (type === 'quotaExceeded') { helperLog_(st, 'warn', 'limit planu bramki: powiadomienie z czatu spoza trzech dozwolonych — pominięte'); return; }
  if (!/MessageReceived$/.test(type)) return;            // statusy wysyłki, stan konta itp.
  const sd = b.senderData || {}, md = b.messageData || {};
  const chat = String(sd.chatId || '');
  const id = String(b.idMessage || '');
  const tm = String(md.typeMessage || '');
  const queue = src !== 'history';
  // powtórka z kolejki po awarii przed deleteNotification — raz (historia czatu idzie bez tej listy: jest długa,
  // a każde zdarzenie i tak daje ten sam skutek drugi raz)
  if (id && queue) {
    const key = tm === 'pollUpdateMessage' ? id + '|' + b.timestamp : id;
    if (st.seen.indexOf(key) >= 0) return;
    st.seen.push(key);
  }
  const at = Number(b.timestamp) > 0 ? Number(b.timestamp) * 1000 : Date.now();
  const incoming = type === 'incomingMessageReceived';
  if (chat === s.chatId) {
    if (queue) run.grafik++;
    const sender = String(sd.sender || '');
    if (incoming && sender) helperPerson_(st, sender, sd.senderContactName || sd.senderName, at);
    if (tm === 'pollMessage') {
      const pd = md.pollMessageData || {};
      const opts = (Array.isArray(pd.options) ? pd.options : []).map(o => String(o && o.optionName || ''));
      // pełny obraz głosów: ankieta przyszła z kolejki (powiadomienia były włączone, gdy powstała — wszystkie późniejsze
      // głosy też są w kolejce) albo z historii, ale po włączeniu powiadomień (helperGate_)
      const full = queue || !!(st.gate && st.gate.from && at >= st.gate.from);
      const known = st.polls.some(x => x.id === id);
      const p = helperPollOf_(st, id, pd.name, opts, at, true, full);
      if (p && queue && st.queue.indexOf(p.id) < 0) st.queue.push(p.id);
      if (!known) helperLog_(st, 'in', (queue ? 'nowa ankieta' : 'ankieta z historii czatu') + ': „' + String(pd.name || '').slice(0, 60) + '"');
    } else if (tm === 'pollUpdateMessage') {
      helperApplyVotes_(st, sender, md.pollMessageData || {}, at);
    } else if (incoming) {
      const text = helperText_(md);
      if (text) helperNote_(st, id, sender, text, at);
    }
  } else if (chat === s.toId && incoming && queue) {
    const text = helperText_(md);
    if (text) st.cmds.push({ t: text.slice(0, 100), at });
  }
}

/** Wiadomość z historii czatu (getChatHistory — inny kształt niż powiadomienie) w kształcie powiadomienia. */
function helperFromHistory_(m, chatId) {
  const md = { typeMessage: String(m.typeMessage || '') };
  if (m.textMessage != null) md.textMessageData = { textMessage: m.textMessage };
  else if (m.extendedTextMessage && m.extendedTextMessage.text != null) md.extendedTextMessageData = { text: m.extendedTextMessage.text };
  else if (m.caption != null) md.fileMessageData = { caption: m.caption };
  if (m.pollMessageData) md.pollMessageData = m.pollMessageData;
  return {
    typeWebhook: m.type === 'incoming' ? 'incomingMessageReceived' : 'outgoingMessageReceived',
    idMessage: m.idMessage, timestamp: m.timestamp,
    senderData: { chatId: String(m.chatId || chatId), sender: String(m.senderId || ''), senderName: m.senderName || '',
                  senderContactName: m.senderContactName || '' },
    messageData: md,
  };
}

/**
 * Historia czatu „Grafiku" (getChatHistory) przepuszczona przez te same reguły co kolejka — po włączeniu powiadomień
 * i przed raportem, w którym brakuje ankiety (najwyżej co HELPER_HISTORY_GAP_H godzin), i przy „Sprawdź teraz".
 * Ankietę wysłaną przez bota bramka trzyma w historii zawsze (wiadomość wysłana z API), a głosy i wiadomości —
 * tylko te, które przyszły przy włączonych powiadomieniach. Wcześniejszych głosów nie odda nic (HELPER.md).
 */
function helperCatchUp_(s, st, run) {
  st.histAt = Date.now();
  st.catchUp = false;
  const list = greenCall_('getChatHistory', { chatId: s.chatId, count: HELPER_HISTORY_COUNT });
  const msgs = (Array.isArray(list) ? list : []).filter(m => m && m.idMessage)
    .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  const before = st.polls.length;
  msgs.forEach(m => {
    try { helperEvent_(s, st, helperFromHistory_(m, s.chatId), run, 'history'); }
    catch (e) { helperLog_(st, 'err', 'historia czatu: ' + (e && e.message || e)); }
  });
  helperLog_(st, 'in', 'historia czatu: ' + msgs.length + ' wiadomości' + (st.polls.length > before ? ', nowe ankiety: ' + (st.polls.length - before) : ''));
}

/**
 * Ustawienia instancji bramki (getSettings): bez powiadomień o wiadomościach i ankietach kolejka jest pusta, a pomocnik
 * nie wie o „Grafiku" nic (test 24–25.10.2026: wszystkie cztery wyłączone, a pomocnik pisał „W Grafiku nie ma ankiety").
 * Sprawdzane przy każdym przebiegu, dopóki czegoś brakuje, potem co HELPER_GATE_H godzin. `from` — od kiedy na pewno
 * są włączone (pierwszy przebieg, który to zobaczył): ankieta z historii sprzed tej chwili jest niepełna. Włączenie
 * (przejście z „brak" albo pierwszy raz) — `catchUp`: historia czatu przy najbliższych wiadomościach.
 */
function helperGate_(s, st, manual) {
  const g = st.gate;
  if (!manual && g && g.ok && Date.now() - g.at < HELPER_GATE_H * 3600000) return;
  const res = greenCall_('getSettings');
  const missing = HELPER_GATE.filter(x => String(res && res[x.key] != null ? res[x.key] : '') !== x.want).map(x => x.key);
  const ok = !missing.length;
  st.gate = { at: Date.now(), ok, missing, from: ok ? (g && g.ok && g.from ? g.from : Date.now()) : 0 };
  if (ok && !(g && g.ok)) { st.catchUp = true; helperLog_(st, 'info', 'bramka: powiadomienia włączone — od teraz widzę „Grafik"'); }
  if (!ok && (!g || g.ok)) helperLog_(st, 'warn', 'bramka: wyłączone — ' + missing.join(', '));
}

/** Alert „nic nie widzę" — raz dziennie, dopóki w ustawieniach bramki czegoś brakuje. */
function helperGateText_(gate) {
  return '⚠️ *Nie widzę „Grafiku"* — w konsoli Green API (instancja → Ustawienia) wyłączone:\n'
    + HELPER_GATE.filter(x => gate.missing.indexOf(x.key) >= 0).map(x => '• ' + x.label).join('\n')
    + '\nBez tego bot nie dostaje ankiet, głosów ani wiadomości, więc nie wysyłam składów (byłyby bez danych). '
    + 'Po włączeniu ruszam sam w ciągu ' + HELPER_TICK_MIN + ' minut; głosów oddanych wcześniej bramka już nie odda.';
}

function helperPerson_(st, id, name, at) {
  const n = helperShort_(name);
  if (!n) return;
  st.people[id] = { n, s: at };
}

/* ---------- ankiety ---------- */

/**
 * Daty ankiety z pytania: „Grafik 26.10-01.11", „Grafik 05-11.10", „Niedziela 16.08". Bez dat — w niedzielę tydzień
 * od jutra (jak ankieta bota, pollMonday_), w inny dzień najbliższe 7 dni. Daty daleko od dnia utworzenia to pomyłka w pytaniu
 * („Grafik 05-11.11" wysłane 4.10) — wtedy też najbliższy tydzień, a `wrong` mówi, że daty się nie zgadzają.
 */
function helperRange_(q, ref) {
  const t = String(q || '');
  const expect = { from: pollMonday_(ref), to: addDays_(pollMonday_(ref), 6) };
  let m, from = '', to = '';
  if ((m = t.match(/(\d{1,2})\.(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})/))) {
    from = helperYmd_(+m[1], +m[2], ref);
    to = from ? helperYmd_(+m[3], +m[4], from) : '';
  } else if ((m = t.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})/))) {
    to = helperYmd_(+m[2], +m[3], ref);
    // „05-11.10" — ten sam miesiąc; „28-03.01" — początek w poprzednim
    if (to) from = +m[1] <= +m[2] ? helperYmd_(+m[1], +m[3], to) : helperYmd_(+m[1], +m[3] === 1 ? 12 : +m[3] - 1, addDays_(to, -15));
  } else if ((m = t.match(/(\d{1,2})\.(\d{1,2})/))) {
    from = to = helperYmd_(+m[1], +m[2], ref);
  }
  if (!isDate_(from) || !isDate_(to) || to < from || helperDaysBetween_(from, to) > 13) {
    // bez dat: w niedzielę — tydzień od jutra (jak ankieta bota), w inny dzień — najbliższe dni („Weekend bez AW" w piątek)
    const start = weekdayOf_(ref) === 0 ? expect.from : ref;
    return { from: start, to: addDays_(start, 6), parsed: false, wrong: false };
  }
  const near = helperDaysBetween_(ref, from) >= -7 && helperDaysBetween_(ref, from) <= 14;
  if (!near) return { from: expect.from, to: expect.to, parsed: true, wrong: true, said: { from, to } };
  return { from, to, parsed: true, wrong: from > expect.to || to < expect.from, said: { from, to } };
}

/**
 * Odpowiedź ankiety → dzień: data w odpowiedzi („Poniedziałek 27.07", „20.07 Monday") albo dzień tygodnia w zakresie
 * ankiety. `p` — pora („rano" / „wieczór"), `x` — dopisek, który robi z odpowiedzi coś osobnego („Niedziela - AW",
 * „Szkolenie z adopcji (Sobota)") — nie liczy się do składu dnia; `no` — „Nie mogę". Ankieta na jeden dzień
 * („Niedziela 16.08": „Rano", „Wieczór") — odpowiedź bez dnia to ten dzień. Dzień tygodnia spoza zakresu
 * szukamy jeszcze od dnia utworzenia (`ref`): „Czwartek wieczór" w ankiecie „26.06 - 28.06" wysłanej w czwartek 25.06.
 */
function helperOptDay_(o, range, ref) {
  const t = volNorm_(o);
  if (/^nie\b/.test(t)) return { d: '', p: '', x: '', no: true };
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  let d = '';
  const dm = t.match(/(\d{1,2})\.(\d{1,2})/);
  if (dm) d = helperYmd_(+dm[1], +dm[2], range.from);
  let wd = null, p = '';
  const rest = words.filter(w => {
    const n = HELPER_WEEKDAY_WORDS[w];
    if (typeof n === 'number') { if (wd == null) wd = n; return false; }
    if (HELPER_PARTS[w]) { p = HELPER_PARTS[w]; return false; }
    return !/^\d+$/.test(w);
  });
  const find = (a, b) => { for (let x = a; x && x <= b; x = addDays_(x, 1)) if (weekdayOf_(x) === wd) return x; return ''; };
  if (!d && wd != null) d = find(range.from, range.to) || (ref && ref < range.from ? find(ref, addDays_(range.from, -1)) : '');
  if (!d && wd == null && range.from === range.to) d = range.from;
  return { d, p, x: rest.length ? String(o).trim().slice(0, 40) : '', no: false };
}

function helperPollDays_(q, opts, at) {
  const ref = helperDate_(at), range = helperRange_(q, ref);
  return { range, days: opts.map(o => helperOptDay_(o, range, ref)) };
}

/**
 * Ankieta po identyfikatorze (z wiadomości o ankiecie albo z pierwszego głosu). `created` — wiadomość o samej ankiecie
 * (znamy chwilę jej wysłania), `full` — znamy wszystkie głosy od początku (helperEvent_). Ankieta poznana dopiero
 * z głosu albo z historii sprzed włączenia powiadomień jest `partial`: głosy oddane wcześniej nigdy do nas nie dojdą.
 */
function helperPollOf_(st, id, name, opts, at, created, full) {
  if (!id) return null;
  let p = st.polls.filter(x => x.id === id)[0];
  if (p) {
    if (name && !p.q) p.q = String(name).slice(0, 120);
    if (opts.length > p.opts.length) {
      p.opts = opts.map(o => o.slice(0, 60));
      const pd = helperPollDays_(p.q, p.opts, p.t);
      p.days = pd.days; p.from = pd.range.from; p.to = pd.range.to; p.wrong = !!pd.range.wrong;
    }
    if (created) { p.t = Math.min(p.t, at); if (full) p.partial = false; }
    return p;
  }
  const pd = helperPollDays_(name, opts, at);
  p = { id: String(id).slice(0, 64), q: String(name || '').slice(0, 120), t: at, opts: opts.map(o => o.slice(0, 60)),
        days: pd.days, from: pd.range.from, to: pd.range.to, wrong: !!pd.range.wrong, v: {}, vt: {},
        partial: !(created && full) };
  st.polls.push(p);
  st.polls.sort((a, b) => a.t - b.t);
  while (st.polls.length > HELPER_LIMITS.POLLS) st.polls.shift();
  return p;
}

/**
 * Głos (pollUpdateMessage). Dokumentacja bramki: powiadomienie dotyczy jednej osoby. Bierzemy to, co pewne:
 * jedna osoba w odpowiedziach — jej aktualne wybory (a gdy jej numer jest w innym formacie niż nadawca,
 * zapamiętujemy powiązanie — alias); nikt — nadawca wycofał wszystko; dwie i więcej — pełny stan ankiety.
 * Wypisania z dni (ktoś był na liście dnia i zniknął) idą do st.gone — skład dnia pokazuje „wypisali się".
 */
function helperApplyVotes_(st, sender, pd, at) {
  const votes = Array.isArray(pd.votes) ? pd.votes : [];
  const names = votes.map(v => String(v && v.optionName || ''));
  const poll = helperPollOf_(st, String(pd.stanzaId || ''), pd.name, names, at, false);
  if (!poll) return;
  const by = {};
  votes.forEach((v, i) => {
    const k = poll.opts.indexOf(names[i].slice(0, 60));
    if (k < 0) return;
    (Array.isArray(v && v.optionVoters) ? v.optionVoters : []).forEach(id => {
      const w = String(id);
      (by[w] = by[w] || []).indexOf(k) < 0 && by[w].push(k);
    });
  });
  const voters = Object.keys(by);
  const before = JSON.parse(JSON.stringify(poll.v));
  // stan osoby z czasem (sekundy): starszy głos niż ten, który już znamy, nic nie zmienia — historia czatu
  // i kolejka podają te same głosy, w dowolnej kolejności i po kilka razy
  poll.vt = poll.vt || {};
  const sec = Math.floor(at / 1000);
  const newer = w => !(poll.vt[w] > sec);
  const put = (w, idx) => { if (!newer(w)) return; if (idx) poll.v[w] = idx.sort((a, b) => a - b); else delete poll.v[w]; poll.vt[w] = sec; };
  if (voters.length >= 2) {
    voters.forEach(w => put(w, by[w]));
    Object.keys(poll.v).forEach(w => { if (!by[w]) put(w, null); });
  } else if (voters.length === 1) {
    const w = voters[0];
    if (sender && sender !== w) st.alias[sender] = w;
    put(w, by[w]);
  } else {
    put(st.alias[sender] || sender, null);
  }
  Object.keys(before).forEach(w => {
    const was = helperDatesOf_(poll, before[w]), now = helperDatesOf_(poll, poll.v[w] || []);
    was.filter(d => now.indexOf(d) < 0).forEach(d => st.gone.push({ d, w, at }));
  });
}

/** Dni, na które wskazują wybrane odpowiedzi (tylko zwykłe — bez dopisków i „Nie mogę"). */
function helperDatesOf_(poll, idx) {
  const out = [];
  (idx || []).forEach(i => { const o = poll.days[i]; if (o && o.d && !o.x && !o.no && out.indexOf(o.d) < 0) out.push(o.d); });
  return out;
}

/** Najnowsza ankieta, w której jest dzień `d` (zwykła odpowiedź) — albo null. */
function helperPollFor_(st, d) {
  const list = st.polls.filter(p => p.days.some(o => o.d === d && !o.x && !o.no));
  return list.length ? list[list.length - 1] : null;
}

/** Kto jest na liście dnia `d` w ankiecie `poll` (numery głosujących, posortowane). */
function helperVotersOn_(poll, d) {
  return Object.keys(poll.v).filter(w => helperDatesOf_(poll, poll.v[w]).indexOf(d) >= 0).sort();
}

/* ---------- czat ---------- */

/** Wyrazy po volNorm_ (małe litery, bez ogonków). */
function helperWords_(text) { return volNorm_(text).split(/[^a-z0-9]+/).filter(Boolean); }

/**
 * Dni, o których mówi wiadomość z dnia `msgDate` (najwyżej 2 tygodnie naprzód): „dziś", „jutro", „pojutrze",
 * dni tygodnia (najbliższy, dziś włącznie), „weekend", daty „16.10". „Jutro" napisane po północy (do 4:00)
 * to jeszcze ten dzień, który się zaczął — ludzie piszą przed snem („Czy jest ktoś jutro do Evera?" o 0:31).
 */
function helperDayRefs_(text, msgDate, hour) {
  const out = {};
  const add = d => { if (d && d >= msgDate && helperDaysBetween_(msgDate, d) <= 13) out[d] = true; };
  const base = hour < 4 ? addDays_(msgDate, -1) : msgDate;
  helperWords_(text).forEach(w => {
    if (HELPER_REL[w] != null) add(addDays_(base, HELPER_REL[w]));
    const n = HELPER_WEEKDAY_WORDS[w];
    if (n != null) [].concat(n).forEach(k => add(addDays_(msgDate, (k - weekdayOf_(msgDate) + 7) % 7)));
  });
  const t = volNorm_(text), re = /(^|[^0-9.:])(\d{1,2})\.(\d{1,2})(?![0-9])/g;
  let m;
  while ((m = re.exec(t))) {
    if (/(^|\s)(o|okolo|kolo|od|do|na|po|przed)\s*$/.test(t.slice(0, m.index + m[1].length))) continue;   // godzina: „o 10.30", „do 12.15"
    add(helperYmd_(+m[2], +m[3], msgDate));
  }
  return Object.keys(out).sort();
}

/** Rodzaj wiadomości: 'ask' (pytanie do grupy), 'abs' (nieobecność), 'out' (nie będzie), 'in' (będzie), 'info'. */
function helperKind_(text) {
  const t = volNorm_(text);
  if (/\?/.test(text) && /\b(kto|ktos|czy)\b/.test(t)) return 'ask';
  if (HELPER_ABSENT.test(t)) return 'abs';
  if (HELPER_OUT.test(t)) return 'out';
  if (HELPER_IN.test(t)) return 'in';
  return 'info';
}

/**
 * Nieobecność z wiadomości: przedziały dat [od, do]. „13-17 sierpnia", „30 kwietnia - 3 maja", „od 15 października
 * do 1 listopada", „do 16 sierpnia" (od dziś), „wrócę 16 lipca" (do dnia przed), „16.10", wyliczanka „1, 17, 22
 * i 31 października". Bez dat — dni z wiadomości („w czwartek i w weekend"). Lata — najbliższe dniu wiadomości.
 */
function helperAbsence_(text, msgDate, hour) {
  const t = volNorm_(text).replace(/[–—]/g, '-');
  const toks = [];
  const re = /(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?|\d{1,2}|[a-z]+|-/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1]) toks.push({ k: 'date', d: helperYmd_(+m[1], +m[2], msgDate) });
    else if (/^\d+$/.test(m[0])) toks.push({ k: 'num', n: +m[0] });
    else if (m[0] === '-') toks.push({ k: 'sep' });
    else if (HELPER_MONTHS[m[0]]) toks.push({ k: 'month', m: HELPER_MONTHS[m[0]] });
    else if (m[0] === 'do') toks.push({ k: 'sep' });
    else if (m[0] === 'i' || m[0] === 'od') toks.push({ k: 'skip' });
    else if (m[0] === 'dzis' || m[0] === 'dzisiaj') toks.push({ k: 'date', d: msgDate });
    else if (m[0] === 'wroce' || m[0] === 'wracam') toks.push({ k: 'back' });
    else toks.push({ k: 'word' });
  }
  // liczby przed nazwą miesiąca dostają ten miesiąc („13-17 sierpnia", „1, 17 i 31 października")
  let pending = [];
  toks.forEach(x => {
    if (x.k === 'num') pending.push(x);
    else if (x.k === 'month') { pending.forEach(p => { p.k = 'date'; p.d = helperYmd_(p.n, x.m, msgDate); }); pending = []; x.k = 'skip'; }
    else if (x.k === 'word' || x.k === 'back') pending = [];
  });
  // „wrócę 16 lipca" — nie ma od dziś do dnia przed powrotem
  const back = toks.findIndex(x => x.k === 'back');
  const ret = back >= 0 ? toks.slice(back).filter(x => x.k === 'date' && x.d)[0] : null;
  if (ret && ret.d > msgDate && helperDaysBetween_(msgDate, ret.d) <= 121) return [[msgDate, addDays_(ret.d, -1)]];
  const seq = toks.filter(x => (x.k === 'date' && x.d) || x.k === 'sep');
  const iv = [];
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].k !== 'date') continue;
    let a = seq[i].d, b = a;
    if (seq[i + 1] && seq[i + 1].k === 'sep' && seq[i + 2] && seq[i + 2].k === 'date') { b = seq[i + 2].d; i += 2; }
    else if (i > 0 && seq[i - 1].k === 'sep' && !iv.length) a = msgDate;          // „do 16 sierpnia" — od dziś
    if (b < a) b = helperYmd_(+b.slice(8), +b.slice(5, 7), addDays_(a, 180));    // „28.12-3.01" — rok dalej
    if (b >= a && helperDaysBetween_(a, b) <= 120) iv.push([a, b]);
  }
  if (!iv.length) helperDayRefs_(text, msgDate, hour).forEach(d => iv.push([d, d]));
  return iv.filter(x => x[1] >= msgDate);
}

/** Notatka z czatu — tylko taka, która dotyczy konkretnych dni (albo nieobecność). */
function helperNote_(st, id, sender, text, at) {
  if (id && (st.notes.some(n => n.id === id) || st.abs.some(a => a.id === id))) return;   // ta sama z historii i z kolejki
  const day = helperDate_(at), hour = Number(helperTime_(at).split(':')[0]);
  const k = helperKind_(text);
  const quote = text.replace(/\s*\n+\s*/g, ' / ').replace(/\s+/g, ' ').trim();
  const x = quote.length > HELPER_LIMITS.TEXT ? quote.slice(0, HELPER_LIMITS.TEXT - 1) + '…' : quote;
  if (k === 'abs') {
    const iv = helperAbsence_(text, day, hour);
    if (iv.length) {
      st.abs.push({ id, w: sender, at, iv, x });
      const d = [];                                       // cytat przy każdym dniu nieobecności z najbliższych dwóch tygodni
      iv.forEach(r => {
        for (let a = r[0]; a <= r[1] && d.length < 14; a = addDays_(a, 1)) {
          if (a >= day && helperDaysBetween_(day, a) <= 13 && d.indexOf(a) < 0) d.push(a);
        }
      });
      if (d.length) st.notes.push({ id, w: sender, at, d: d.sort(), k, x });
      return;
    }
  }
  const d = helperDayRefs_(text, day, hour);
  if (!d.length) return;
  const n = { id, w: sender, at, d, k: k === 'abs' ? 'out' : k, x };
  if (n.k === 'ask') {                                    // ilu było w ankiecie, gdy padło pytanie — „bez odzewu?"
    n.c = {};
    d.forEach(day2 => { const p = helperPollFor_(st, day2); if (p) n.c[day2] = helperVotersOn_(p, day2).length; });
  }
  st.notes.push(n);
}

/* ---------- dane aplikacji (leniwie — przebieg bez raportu nie czyta arkusza) ---------- */

function helperCtx_(s) {
  const memo = {};
  return {
    catalog: () => memo.c || (memo.c = readDogCatalog_()),
    hist: () => memo.h || (memo.h = readHistoryDays_(addDays_(today_(), -HELPER_HIST_DAYS), addDays_(today_(), -1))),
    slots: () => memo.s || (memo.s = readSlots_(walksSheet_())),
    weather: () => memo.w !== undefined ? memo.w : (memo.w = s.features.weather ? helperWeather_() : null),
  };
}

/** Prognoza (Open-Meteo, bez klucza): data → {lo, hi, rain}; awaria = null (bez linijki pogody). */
function helperWeather_() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + HELPER_WEATHER.LAT + '&longitude=' + HELPER_WEATHER.LON
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FWarsaw&forecast_days=8';
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    const d = JSON.parse(r.getContentText()).daily || {};
    const out = {};
    (d.time || []).forEach((day, i) => {
      out[day] = { lo: Math.round(d.temperature_2m_min[i]), hi: Math.round(d.temperature_2m_max[i]),
                   rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null };
    });
    return out;
  } catch (e) {
    return null;
  }
}

/* ---------- skład dnia ---------- */

/** Wszystko o dniu `d`: ankieta, kto, pory, dopiski, wypisani, czat, nieobecni. */
function helperDay_(s, st, d) {
  const poll = helperPollFor_(st, d);
  const voters = poll ? helperVotersOn_(poll, d) : [];
  const parts = {}, extras = [];
  if (poll) {
    poll.days.forEach((o, i) => {
      if (o.d !== d || o.no) return;
      const who = Object.keys(poll.v).filter(w => poll.v[w].indexOf(i) >= 0);
      if (o.x) extras.push({ label: o.x, who });
      else if (o.p) parts[o.p] = (parts[o.p] || []).concat(who.filter(w => (parts[o.p] || []).indexOf(w) < 0));
    });
  }
  const gone = [];
  st.gone.forEach(g => { if (g.d === d && voters.indexOf(g.w) < 0 && !gone.some(x => x.w === g.w)) gone.push(g); });
  const notes = st.notes.filter(n => (n.d || []).indexOf(d) >= 0);
  const abs = st.abs.filter(a => (a.iv || []).some(iv => iv[0] <= d && d <= iv[1]));
  return { d, poll, voters, parts, extras, gone, notes, abs };
}

/** Co jest nie tak z dniem — pusta lista = w porządku. */
function helperProblems_(s, st, info) {
  const out = [];
  if (!info.poll) return ['brak ankiety'];
  // ankieta niepełna (sprzed włączenia powiadomień) — liczba to dolna granica: „mało osób" byłoby fałszywym alarmem
  if (info.voters.length < s.min && !info.poll.partial) out.push('mało osób');
  const names = info.voters.map(w => helperName_(s, st, w));
  const purple = helperRoleSet_(s.purple), rookies = helperRoleSet_(s.rookies);
  if (purple.length && info.voters.length && !names.some(n => helperHasRole_(purple, n))) out.push('brak fioletowego');
  if (rookies.length && info.voters.length && names.every(n => helperHasRole_(rookies, n))) out.push('same nowe osoby');
  return out;
}

/** Skład dnia jako wiadomość. `ctx` — dane aplikacji (helperCtx_). */
function helperDayText_(s, st, d, ctx) {
  const info = helperDay_(s, st, d);
  const L = [];
  const n = info.voters.length;
  const name = w => helperName_(s, st, w);
  if (!info.poll) {
    L.push('*' + helperTitle_(d) + '*: nie widzę ankiety na ten dzień ⚠️');
  } else {
    // ankieta znana częściowo (sprzed włączenia powiadomień) — liczba to dolna granica, nie stan
    const part = info.poll.partial;
    L.push('*' + helperTitle_(d) + '*: ' + (part ? 'co najmniej ' : '') + n + ' os.' + (n < s.min ? ' ⚠️ (minimum ' + s.min + ')' : ' ✅'));
    if (n) L.push('👥 ' + info.voters.map(name).join(', '));
    const pn = Object.keys(info.parts);
    if (pn.length) L.push('   ' + ['r', 'w'].filter(k => info.parts[k]).map(k => (k === 'r' ? 'rano ' : 'wieczór ') + info.parts[k].length).join(' · '));
    info.extras.forEach(x => L.push('➕ osobno — ' + x.label + ': ' + x.who.length + ' os.'));
    if (part) L.push('ℹ️ ankieta sprzed włączenia powiadomień w bramce' + (st.gate && st.gate.from ? ' (' + helperWhen_(st.gate.from) + ')' : '')
      + ' — znam tylko głosy oddane albo zmienione później; pełny obraz od następnej ankiety');
    if (info.poll.wrong) L.push('⚠️ daty w pytaniu ankiety nie pasują do tygodnia');
  }
  if (info.gone.length) L.push('➖ wypisali się: ' + info.gone.map(g => name(g.w) + ' (' + helperWhen_(g.at) + ')').join(', '));
  const names = info.voters.map(name);
  const purple = helperRoleSet_(s.purple), rookies = helperRoleSet_(s.rookies);
  if (info.poll && purple.length && n) {
    const p = names.filter(x => helperHasRole_(purple, x));
    L.push(p.length ? '🟣 fioletowi: ' + p.join(', ') : '🟣 brak fioletowego ⚠️');
  }
  if (info.poll && rookies.length && n) {
    const r = names.filter(x => helperHasRole_(rookies, x));
    if (r.length) L.push(r.length === n ? '🌱 same nowe osoby ⚠️ (' + r.join(', ') + ')' : '🌱 nowi: ' + r.join(', '));
  }
  if (info.abs.length) L.push('🚫 zapowiedziana nieobecność: ' + info.abs.map(a => name(a.w)).filter((x, i, a) => a.indexOf(x) === i).join(', '));
  if (info.notes.length) {
    L.push('💬 Z czatu:');
    info.notes.slice(-HELPER_LIMITS.DAY_NOTES).forEach(x => {
      const c = x.k === 'ask' && x.c && x.c[d] != null ? ', wtedy ' + x.c[d] + ' os.' : '';
      L.push('• ' + (x.k === 'ask' ? '❓ ' : x.k === 'out' ? '➖ ' : x.k === 'abs' ? '🚫 ' : x.k === 'in' ? '➕ ' : '')
        + name(x.w) + ' (' + helperWhen_(x.at) + c + '): „' + x.x + '"');
    });
  }
  if (info.poll) {
    // rozjazd czatu i ankiety: „dopisałam się na wtorek", a głosu nie ma (albo nowa osoba bez dostępu do ankiety);
    // „wypisuję się z jutra", a głos dalej jest — numer nadawcy bywa w innym formacie niż numer głosującego (alias)
    const saysIn = [], saysOut = [];
    info.notes.forEach(x => {
      const there = info.voters.indexOf(st.alias[x.w] || x.w) >= 0;
      if (x.k === 'in' && !there && saysIn.indexOf(x.w) < 0) saysIn.push(x.w);
      if ((x.k === 'out' || x.k === 'abs') && there && saysOut.indexOf(x.w) < 0) saysOut.push(x.w);
    });
    if (saysIn.length) L.push('🔀 pisze, że będzie, a nie ma w ankiecie: ' + saysIn.map(name).join(', '));
    if (saysOut.length) L.push('🔀 pisze, że nie da rady, a dalej w ankiecie: ' + saysOut.map(name).join(', '));
  }
  L.push.apply(L, helperDogLines_(s, st, d, info, ctx));
  const w = ctx.weather();
  const f = w && w[d];
  if (f) L.push('🌦 ' + f.lo + '–' + f.hi + '°C' + (f.rain != null ? ', deszcz ' + f.rain + '%' : '') + (f.hi >= HELPER_HEAT ? ' 🔥 upał' : ''));
  return L.join('\n');
}

/** Psy w składzie dnia: ile naszych i spacerów, kto czeka najdłużej, psy dla wyznaczonych osób, rezerwacje. */
function helperDogLines_(s, st, d, info, ctx) {
  const L = [];
  let catalog = [];
  try { catalog = ctx.catalog(); } catch (e) { return ['🐕 (nie udało się odczytać psów: ' + (e && e.message || e) + ')']; }
  const ours = catalog.filter(x => !x.team);
  if (!ours.length) return L;
  const walks = ours.reduce((a, x) => a + (x.walks === 2 ? 2 : 1), 0), n = info.voters.length;
  L.push('🐕 ' + ours.length + ' psów, ' + walks + ' spacerów' + (n ? ' (~' + Math.ceil(walks / n) + ' na osobę)' : ''));
  const today = today_();
  const wait = ours.filter(x => isDate_(x.lastWalk)).map(x => ({ x, n: helperDaysBetween_(x.lastWalk, today) }))
    .filter(o => o.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3);
  if (wait.length) L.push('⏳ najdłużej bez spaceru: ' + wait.map(o => dogLabel_(o.x.name, o.x.ident, o.x.id) + ' ' + o.n + ' dni').join(', '));
  const hard = ours.filter(x => x.dif === 'hard');
  if (hard.length) {
    let hist = [];
    try { hist = ctx.hist(); } catch (e) { hist = []; }
    const squad = info.voters.map(w => helperFirst_(helperName_(s, st, w))).filter(Boolean);
    hard.forEach(x => {
      const label = dogLabel_(x.name, x.ident, x.id), last = {};
      hist.forEach(e => {
        if (e.name !== label || !e.who) return;
        const k = helperFirst_(e.who);
        if (k && (!last[k] || last[k].d < e.date)) last[k] = { d: e.date, who: helperShort_(e.who) };
      });
      const who = Object.keys(last).sort((a, b) => last[b].d < last[a].d ? -1 : 1);
      const recent = who.slice(0, 3).map(k => last[k].who + ' ' + last[k].d.slice(8) + '.' + last[k].d.slice(5, 7));
      const ok = who.filter(k => squad.indexOf(k) >= 0).map(k => last[k].who);
      L.push('🔴 ' + label + ' (tylko wyznaczone osoby) — ' + (recent.length ? 'ostatnio: ' + recent.join(', ') : 'brak spacerów w Historii')
        + (info.poll && n ? (ok.length ? ' · w składzie: ' + ok.join(', ') + ' ✓' : ' · nikt z nich w składzie ⚠️') : ''));
    });
  }
  try {
    const res = ctx.slots().filter(x => x.date === d && x.status === STATUS.RESERVED);
    if (res.length) L.push('📋 w aplikacji zarezerwowane: ' + res.length + ' spacer' + (res.length === 1 ? '' : 'y'));
  } catch (e) { /* rezerwacje to dodatek */ }
  return L;
}

/** Przegląd 7 dni od jutra: liczby, słabe dni, dni bez ankiety, podpowiedź przepisania, nieobecności. */
function helperWeekText_(s, st) {
  const T = today_(), days = [];
  for (let k = 1; k <= 7; k++) days.push(helperDay_(s, st, addDays_(T, k)));
  const L = ['*Przegląd tygodnia* (' + helperShortLabel_(days[0].d).slice(-5) + '–' + days[6].d.slice(8) + '.' + days[6].d.slice(5, 7) + ')'];
  days.forEach(i => {
    const extra = i.extras.map(x => x.label + ' ' + x.who.length).join(', ');
    L.push(helperShortLabel_(i.d) + ' — ' + (!i.poll ? 'nie widzę ankiety'
      : (i.poll.partial ? '≥ ' : '') + i.voters.length + ' os.' + (i.voters.length < s.min ? ' ⚠️' : '')) + (extra ? ' (osobno: ' + extra + ')' : ''));
  });
  if (days.some(i => i.poll && i.poll.partial)) L.push('ℹ️ ≥ — ankieta sprzed włączenia powiadomień: znam tylko część głosów');
  const withPoll = days.filter(i => i.poll);
  const weak = withPoll.filter(i => i.voters.length < s.min).sort((a, b) => a.voters.length - b.voters.length)[0];
  const strong = withPoll.filter(i => i.voters.length > s.min).sort((a, b) => b.voters.length - a.voters.length)[0];
  if (weak && strong) L.push('↔️ może ktoś z dnia ' + helperShortLabel_(strong.d) + ' (' + strong.voters.length + ') przepisze się na '
    + helperShortLabel_(weak.d) + ' (' + weak.voters.length + ')?');
  const abs = st.abs.filter(a => (a.iv || []).some(iv => iv[1] >= days[0].d && iv[0] <= days[6].d));
  if (abs.length) L.push('🚫 nieobecności: ' + abs.map(a => helperName_(s, st, a.w) + ' ' + a.iv.map(iv => helperSpan_(iv)).join(', ')).join('; '));
  return L.join('\n');
}
function helperSpan_(iv) {
  const f = d => d.slice(8) + '.' + d.slice(5, 7);
  return iv[0] === iv[1] ? f(iv[0]) : f(iv[0]) + '–' + f(iv[1]);
}

/** Nowa ankieta: pytanie, zakres dni, czy pasuje do najbliższego tygodnia, przypomnienie o przypięciu. */
function helperPollText_(st, p) {
  const days = p.days.filter(o => o.d && !o.x).map(o => o.d).sort();
  const L = ['📊 *Nowa ankieta w Grafiku*: „' + p.q + '" (' + p.opts.length + ' odpowiedzi)'];
  if (days.length) L.push('Dni: ' + helperShortLabel_(days[0]) + ' – ' + helperShortLabel_(days[days.length - 1]));
  else L.push('⚠️ nie umiem odczytać dni z odpowiedzi');
  if (p.wrong) L.push('⚠️ daty w pytaniu nie pasują do najbliższego tygodnia (' + helperSpan_([pollMonday_(helperDate_(p.t)), addDays_(pollMonday_(helperDate_(p.t)), 6)]) + ') — sprawdź, zanim ludzie zagłosują');
  const extra = p.days.filter(o => o.x).map(o => o.x);
  if (extra.length) L.push('➕ osobno liczone: ' + extra.join(', '));
  L.push('📌 przypnij ją w grupie');
  return L.join('\n');
}

/** Miniony tydzień (pn–nd przed dziś): ankieta i Historia dzień po dniu, psy z najmniejszą liczbą spacerów. */
function helperLastWeekText_(s, st, ctx) {
  const T = today_(), from = addDays_(T, -7), to = addDays_(T, -1);
  let hist = [];
  try { hist = ctx.hist().filter(e => e.date >= from && e.date <= to); } catch (e) { hist = []; }
  const L = ['*Miniony tydzień* (' + helperSpan_([from, to]) + ')'];
  for (let d = from; d <= to; d = addDays_(d, 1)) {
    const p = helperPollFor_(st, d), day = hist.filter(e => e.date === d);
    const people = day.map(e => helperFirst_(e.who)).filter((x, i, a) => x && a.indexOf(x) === i);
    L.push(helperShortLabel_(d) + ' — ankieta ' + (p ? helperVotersOn_(p, d).length : '?') + ' · wyszło ' + people.length + ' os. · ' + day.length + ' spacerów');
  }
  let ours = [];
  try { ours = ctx.catalog().filter(x => !x.team); } catch (e) { ours = []; }
  const count = ours.map(x => ({ label: dogLabel_(x.name, x.ident, x.id), n: 0 }));
  hist.forEach(e => count.forEach(c => { if (c.label === e.name) c.n++; }));
  const low = count.sort((a, b) => a.n - b.n).slice(0, 3);
  if (low.length) L.push('🐕 najmniej spacerów: ' + low.map(c => c.label + ' ' + c.n).join(', '));
  return L.join('\n');
}

/* ---------- wysyłka ---------- */

/**
 * Wiadomość do właściciela. TYLKO prywatny czat z ustawień (B74) — sprawdzane tu jeszcze raz, niezależnie od
 * ustawień. Sufity: HELPER_SEND_MAX na przebieg, HELPER_DAY_MAX na dzień (ponad — wpis w dzienniku, bez wysyłki).
 */
function helperSend_(s, st, text, run) {
  if (!HELPER_PRIVATE.test(String(s.toId || ''))) throw new Error('Pomocnik pisze tylko prywatnie — w ustawieniach nie ma kontaktu');
  const day = today_();
  if (st.sent.day !== day) st.sent = { day, n: 0 };
  if (run.sent >= HELPER_SEND_MAX || st.sent.n >= HELPER_DAY_MAX) {
    helperLog_(st, 'warn', 'limit wiadomości (' + (run.sent >= HELPER_SEND_MAX ? 'na przebieg' : 'na dzień') + ') — nie wysłano: ' + text.split('\n')[0]);
    return false;
  }
  const head = (env_() === 'prod' ? '' : '🧪 ') + '🤖 *Pomocnik Grafiku*\n';
  const res = greenCall_('sendMessage', { chatId: s.toId, message: (head + text).slice(0, HELPER_LIMITS.MESSAGE) });
  if (!res || !res.idMessage) throw new Error('Bramka WhatsAppa nie potwierdziła wysłania');
  run.sent++;
  st.sent.n++;
  helperLog_(st, 'sent', text.split('\n')[0]);
  return true;
}

/** Raz na klucz (`ev|2026-10-24`…): znacznik po wysłaniu albo po nieznanym wyniku (bramka mogła wysłać). */
function helperOnce_(st, key, run, fn) {
  if (st.marks[key]) return;
  try {
    fn();
    st.marks[key] = Date.now();
  } catch (e) {
    if (e && e.unknown) st.marks[key] = Date.now();
    run.err = run.err || String(e && e.message || e);
    helperLog_(st, 'err', key.split('|')[0] + ': ' + (e && e.message || e));
  }
}

/* ---------- harmonogram ---------- */

/**
 * Po kolejce: odpowiedzi na pytania, nowe ankiety, a o swoich porach — rano i wieczorem. Osobnych wiadomości o każdym
 * dopisaniu i wypisaniu z ankiety nie ma (usunięte 26.10.2026 — decyzja właściciela: męczące, cały sens bota to mniej
 * powiadomień; wypisania widać w wieczornym i porannym składzie, „wypisali się").
 */
function helperSchedule_(s, st, run) {
  const f = s.features, ctx = helperCtx_(s);
  const T = today_(), hour = helperHour_(), wd = weekdayOf_(T);
  const inWin = h => hour >= h && hour < h + HELPER_WINDOW_H;

  // bramka bez powiadomień — pomocnik nic nie widzi: zamiast składów „bez ankiety" jeden alert dziennie (skład grupy
  // idzie innym wywołaniem bramki, więc działa i bez powiadomień); nieznany stan bramki — cisza
  const gate = st.gate;
  if (!gate || !gate.ok) {
    if (gate) helperOnce_(st, 'gate|' + T, run, () => { helperSend_(s, st, helperGateText_(gate), run); });
    if (f.members && inWin(s.evening)) helperOnce_(st, 'mem|' + T, run, () => { helperMembers_(s, st, run, true); });
    return;
  }
  // historia czatu: zaraz po włączeniu powiadomień, przy „Sprawdź teraz" i przed wiadomościami o swojej porze, gdy na
  // któryś z najbliższych dni nie ma ankiety albo zna ją tylko częściowo (najwyżej co HELPER_HISTORY_GAP_H godzin)
  const week = [];
  for (let k = 0; k <= 7; k++) week.push(addDays_(T, k));
  const blind = week.some(d => { const p = helperPollFor_(st, d); return !p || p.partial; });
  const due = inWin(s.evening) || inWin(s.morning);
  if (st.catchUp || run.manual || (blind && due && Date.now() - (st.histAt || 0) >= HELPER_HISTORY_GAP_H * 3600000)) {
    try { helperCatchUp_(s, st, run); }
    catch (e) { helperLog_(st, 'err', 'historia czatu: ' + (e && e.message || e)); }
  }

  const cmds = st.cmds.splice(0, st.cmds.length);
  if (f.commands) cmds.slice(-HELPER_LIMITS.CMDS).forEach(c => {
    try { helperSend_(s, st, helperCommand_(s, st, c.t, ctx), run); }
    catch (e) { helperLog_(st, 'err', 'odpowiedź: ' + (e && e.message || e)); }
  });

  const queue = st.queue.splice(0, st.queue.length);
  if (f.newPoll) queue.forEach(id => {
    const p = st.polls.filter(x => x.id === id)[0];
    if (p) helperOnce_(st, 'poll|' + id, run, () => { helperSend_(s, st, helperPollText_(st, p), run); });
  });

  if (f.morning && inWin(s.morning)) helperOnce_(st, 'mo|' + T, run, () => {
    const info = helperDay_(s, st, T);
    if (helperProblems_(s, st, info).length) helperSend_(s, st, helperDayText_(s, st, T, ctx), run);
  });
  if (f.lastWeek && wd === 1 && inWin(s.morning)) helperOnce_(st, 'lw|' + T, run, () => {
    helperSend_(s, st, helperLastWeekText_(s, st, ctx), run);
  });

  if (f.evening && inWin(s.evening)) helperOnce_(st, 'ev|' + T, run, () => {
    const D = addDays_(T, 1), info = helperDay_(s, st, D);
    if (!f.eveningAlways && !helperProblems_(s, st, info).length) return;
    const top = wd === 0 && !info.poll ? '⚠️ *Nie widzę jeszcze ankiety na nowy tydzień* (w historii czatu też jej nie ma)\n' : '';
    helperSend_(s, st, top + helperDayText_(s, st, D, ctx), run);
  });
  if (f.week && s.weekDays.indexOf(wd) >= 0 && inWin(s.evening)) helperOnce_(st, 'wk|' + T, run, () => {
    helperSend_(s, st, helperWeekText_(s, st), run);
  });
  if (f.members && inWin(s.evening)) helperOnce_(st, 'mem|' + T, run, () => { helperMembers_(s, st, run, true); });
}

/**
 * Skład grupy z bramki (getGroupData) porównany z poprzednim: nowe osoby i odejścia. Pierwszy raz — tylko punkt
 * odniesienia. Nowa osoba nie zobaczy ankiety wysłanej przed jej dołączeniem (WhatsApp nie pokazuje historii).
 */
function helperMembers_(s, st, run, send) {
  const g = greenCall_('getGroupData', { groupId: s.chatId });
  const ids = (g && Array.isArray(g.participants) ? g.participants : []).map(p => String(p && p.id || '')).filter(Boolean).sort();
  if (!ids.length) throw new Error('bramka nie podała składu grupy');
  const prev = st.members;
  st.members = { at: Date.now(), ids };
  if (!prev || !send) return;
  const plus = ids.filter(x => prev.ids.indexOf(x) < 0), minus = prev.ids.filter(x => ids.indexOf(x) < 0);
  if (!plus.length && !minus.length) return;
  const L = ['*Grafik — skład grupy* (' + ids.length + ' os.)'];
  if (plus.length) L.push('👋 nowe osoby: ' + plus.map(w => helperName_(s, st, w)).join(', ')
    + ' — nie zobaczą ankiety wysłanej przed dołączeniem; niech napiszą dostępność w czacie');
  if (minus.length) L.push('🚪 wyszli: ' + minus.map(w => helperName_(s, st, w)).join(', '));
  helperSend_(s, st, L.join('\n'), run);
}

/* ---------- pytania w prywatnym czacie ---------- */

const HELPER_HELP = 'Napisz jedno słowo: *jutro* · *dziś* · *pojutrze* · dzień tygodnia (*sobota*) · data (*31.10*) · *tydzień* · '
  + '*miniony* · *nieobecni* · *nieaktywni* · *ludzie* · *stan*';

/** Odpowiedź na pytanie właściciela (tekst z jego prywatnego czatu z botem). */
function helperCommand_(s, st, text, ctx) {
  const t = volNorm_(text).replace(/[^a-z0-9. ]+/g, ' ').trim();
  const w = t.split(/\s+/)[0] || '';
  const T = today_();
  if (/^(pomoc|help|komendy|\?)$/.test(w) || !w) return HELPER_HELP;
  if (HELPER_REL[w] != null) return helperDayText_(s, st, addDays_(T, HELPER_REL[w]), ctx);
  const wd = HELPER_WEEKDAY_WORDS[w];
  if (typeof wd === 'number') return helperDayText_(s, st, addDays_(T, (wd - weekdayOf_(T) + 7) % 7), ctx);
  const dm = w.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (dm) { const d = helperYmd_(+dm[1], +dm[2], T); if (d) return helperDayText_(s, st, d, ctx); }
  if (/^tydz/.test(w)) return helperWeekText_(s, st);
  if (/^(miniony|zeszly|ubiegly)/.test(w)) return helperLastWeekText_(s, st, ctx);
  if (/^nieobec/.test(w)) {
    const T2 = today_();
    const list = st.abs.filter(a => a.iv.some(iv => iv[1] >= T2));
    return list.length ? '*Zapowiedziane nieobecności*\n' + list.map(a => '🚫 ' + helperName_(s, st, a.w) + ': ' + a.iv.map(helperSpan_).join(', ')
      + '\n   „' + a.x + '"').join('\n') : 'Nikt nie zapowiedział nieobecności.';
  }
  if (/^nieaktyw/.test(w)) return helperInactiveText_(s, st);
  if (/^(ludzie|osoby)/.test(w)) return helperPeopleText_(s, st);
  if (/^(stan|status)/.test(w)) return helperStatusText_(s, st);
  return 'Nie rozumiem „' + String(text).slice(0, 30) + '". ' + HELPER_HELP;
}

/** Osoby z grupy bez głosu w żadnej z zapamiętanych ankiet (skład grupy z bramki). */
function helperInactiveText_(s, st) {
  if (!st.members) return 'Nie znam jeszcze składu grupy — sprawdzę go wieczorem (o ' + s.evening + ':00).';
  const voted = {};
  st.polls.forEach(p => Object.keys(p.v).forEach(w => { voted[w] = true; }));
  Object.keys(st.alias).forEach(k => { if (voted[st.alias[k]]) voted[k] = true; });
  const list = st.members.ids.filter(w => !voted[w]);
  return '*Bez głosu w ostatnich ' + st.polls.length + ' ankietach* (' + list.length + ' z ' + st.members.ids.length + ')\n'
    + (list.length ? list.map(w => helperName_(s, st, w)).join(', ') : '—')
    + (st.polls.some(p => p.partial) ? '\nℹ️ część ankiet sprzed włączenia pomocnika — głosy sprzed tego dnia nie są znane' : '');
}

/** Znane osoby (z wiadomości i głosów) z liczbą ankiet, w których głosowały. */
function helperPeopleText_(s, st) {
  const ids = {};
  Object.keys(st.people).forEach(w => { ids[st.alias[w] || w] = true; });
  st.polls.forEach(p => Object.keys(p.v).forEach(w => { ids[w] = true; }));
  const rows = Object.keys(ids).map(w => ({ n: helperName_(s, st, w), k: st.polls.filter(p => p.v[w]).length }))
    .sort((a, b) => a.n.localeCompare(b.n, 'pl'));
  return '*Znane osoby* (' + rows.length + ')\n' + rows.map(r => r.n + ' — ankiety: ' + r.k).join('\n')
    + '\nImiona dla numerów bez nazwy: panel → „Imiona" („…123 = Ania").';
}

function helperStatusText_(s, st) {
  const x = st.stat;
  const g = st.gate;
  return '*Pomocnik — stan*\n'
    + 'bramka: ' + (!g ? 'jeszcze nie sprawdzona' : g.ok ? 'powiadomienia włączone (od ' + helperWhen_(g.from) + ')'
      : 'wyłączone — ' + g.missing.join(', ')) + '\n'
    + 'ostatni przebieg: ' + (x ? helperDate_(x.at).slice(5).split('-').reverse().join('.') + ' ' + helperTime_(x.at) + ', powiadomień ' + x.events + ' (Grafik ' + x.grafik + ')' : '—') + '\n'
    + 'ankiety: ' + (st.polls.map(p => '„' + p.q + '" — ' + Object.keys(p.v).length + ' głosujących' + (p.partial ? ' (niepełna)' : '')).join('; ') || '—') + '\n'
    + 'osoby: ' + Object.keys(st.people).length + ' · notatki: ' + st.notes.length + ' · nieobecności: ' + st.abs.length
    + ' · skład grupy: ' + (st.members ? st.members.ids.length : '—');
}

/* ---------- panel ---------- */

/** Panel (bez pytania bramki): ustawienia, stan przebiegów, ankiety, dziennik. Bez numerów telefonów. */
function helperPanel_() {
  const st = helperLoad_(), s = helperSettings_();
  return {
    settings: s, configured: !!greenApi_(), env: env_(),
    trigger: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'helperTick'),
    stat: st.stat, log: st.log.slice(-HELPER_LIMITS.PANEL_LOG).reverse(),
    gate: st.gate ? { ok: !!st.gate.ok, at: st.gate.at, from: st.gate.from || 0,
                      missing: HELPER_GATE.filter(x => (st.gate.missing || []).indexOf(x.key) >= 0).map(x => x.label) } : null,
    polls: st.polls.slice().reverse().map(p => ({ q: p.q, at: p.t, voters: Object.keys(p.v).length, partial: !!p.partial, wrong: !!p.wrong,
      days: p.days.map((o, i) => o.d && !o.x && !o.no ? helperShortLabel_(o.d) + (o.p ? (o.p === 'r' ? ' rano' : ' wiecz.') : '') + ' '
        + Object.keys(p.v).filter(w => p.v[w].indexOf(i) >= 0).length : '').filter(Boolean).join(' · ') })),
    people: Object.keys(st.people).length, notes: st.notes.length, abs: st.abs.length,
    members: st.members ? st.members.ids.length : null,
  };
}

/** „Sprawdź teraz" (PIN): przebieg od razu — kolejka i wiadomości, które właśnie wypadają. Nie w RETRIABLE. */
function helperRunNow(pin) {
  requirePin_(pin);
  const s = helperSettings_();
  if (!s.chatId || !s.toId) throw new Error('Najpierw wybierz i zapisz grupę i kontakt');
  if (!greenApi_()) throw new Error(GREEN_MISSING);
  const run = helperRun_(s, true);
  return { run, panel: helperPanel_() };
}

/**
 * Podgląd wiadomości (PIN) ze stanu, który pomocnik już zna — bez czytania kolejki. `send` — wyślij ją też
 * do kontaktu z ustawień (liczy się do sufitów wysyłki).
 */
function helperPreview(pin, kind, send) {
  requirePin_(pin);
  const s = helperSettings_(), st = helperLoad_(), ctx = helperCtx_(s);
  const T = today_();
  const text = kind === 'dzis' ? helperDayText_(s, st, T, ctx)
    : kind === 'tydzien' ? helperWeekText_(s, st)
    : kind === 'miniony' ? helperLastWeekText_(s, st, ctx)
    : kind === 'stan' ? helperStatusText_(s, st)
    : helperDayText_(s, st, addDays_(T, 1), ctx);
  if (send === true) {
    if (!s.toId) throw new Error('Najpierw wybierz i zapisz kontakt');
    if (!helperClaim_()) throw new Error('Pomocnik właśnie pracuje — spróbuj za kilka minut');
    try {
      const fresh = helperLoad_();
      helperSend_(s, fresh, text, { sent: 0 });
      helperSave_(fresh);
    } finally {
      helperRelease_();
    }
  }
  return { text, sent: send === true };
}

/**
 * Ustawienia instancji bramki (PIN, tylko odczyt — getSettings): czego brakuje, żeby kolejka miała głosy
 * i wiadomości. Zmienia je właściciel w konsoli Green API (HELPER.md).
 */
const HELPER_GATE = [
  { key: 'incomingWebhook', want: 'yes', label: 'powiadomienia o wiadomościach przychodzących' },
  { key: 'pollMessageWebhook', want: 'yes', label: 'powiadomienia o ankietach' },
  { key: 'outgoingAPIMessageWebhook', want: 'yes', label: 'powiadomienia o wiadomościach wysłanych z API (ankieta bota)' },
  { key: 'outgoingMessageWebhook', want: 'yes', label: 'powiadomienia o wiadomościach wysłanych z telefonu' },
  { key: 'webhookUrl', want: '', label: 'pusty adres webhooka (inaczej kolejka nie działa)' },
];
function getHelperGateway(pin) {
  requirePin_(pin);
  const g = greenCall_('getSettings');
  return HELPER_GATE.map(x => ({ key: x.key, label: x.label, ok: String(g && g[x.key] != null ? g[x.key] : '') === x.want }));
}

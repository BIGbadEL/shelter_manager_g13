/**
 * G13 Spacery — POMOCNIK GRAFIKU (1.5, faza testów; projekt, źródła i decyzje: HELPER.md).
 *
 * Bot czyta z grupy „Grafik" ankietę tygodniową — JEDYNE źródło prawdy o tym, kto przychodzi (decyzja właściciela
 * 27.10.2026: treści wiadomości z czatu nie analizuje, z czatu bierze tylko nazwę nadawcy) — z kolejki powiadomień bramki
 * Green API i składa z tego, razem z danymi aplikacji (psy, Historia, rezerwacje), krótkie wiadomości:
 * skład na jutro, dziś rano przy problemie, przegląd tygodnia, nowa ankieta, nowe osoby
 * w grupie, miniony tydzień; do tego odpowiada na pytania w prywatnym czacie. Każda funkcja ma włącznik
 * w panelu — te, które się nie sprawdzą, wyłącza się pojedynczo (decyzja właściciela 24.10.2026).
 *
 * DOKĄD (helperDest_): prywatnie, do kontaktu z ustawień — chyba że to PRODUKCJA, a funkcja jest „gotowa" (`ready`,
 * decyzja właściciela 28.10.2026): wtedy do „Grafiku". Na teście wszystko prywatnie. Kontaktem nigdy nie jest grupa —
 * jej adres odrzuca zapis ustawień (helperValid_), odczyt (helperSettings_) i wysyłka (helperDest_) — B74, B85.
 *
 * JEDEN AKTYWNY (28.10.2026): test i produkcja dzielą jedną instancję bramki — pracuje zawsze jeden pomocnik, a pierwszeństwo
 * ma produkcja; pomocnik testu czeka, dopóki ma od niej ważny sygnał „pracuję" (helperLeaseSend_ → doPost → helperLeaseIn_).
 *
 * NUMERY TELEFONÓW NIE OPUSZCZAJĄ SERWERA (decyzja właściciela 27.10.2026) — ani do panelu, ani w tekście wiadomości
 * (podgląd w panelu to ten sam tekst). Osobę wskazuje numer osoby „#17" (helperNr_), a do jej telefonu prowadzi karta
 * kontaktu, którą bot wysyła prosto na WhatsAppa właściciela (helperSendCard_).
 *
 * Przebieg (helperRun_) co HELPER_TICK_MIN minut z wyzwalacza helperTick: kolejka bramki (helperIntake_) →
 * wiadomości o swoich porach (helperSchedule_) → zapis stanu. Jeden przebieg naraz (helperClaim_).
 * Pomocnik nie pisze do arkusza i nie trzyma blokady aplikacji w czasie wywołań bramki. Błąd bramki zostaje
 * w dzienniku pomocnika (panel), nie wychodzi z wyzwalacza — inaczej Google słałby maila co 10 minut.
 * Stan we właściwościach skryptu, każda z sufitem HELPER_BYTES (limit 9 KB na wartość). Stan, klasy i numery osób są
 * osobne w każdym środowisku (osobne projekty Apps Script).
 */

/* ---------- słowa: dni i pory — odpowiedzi ankiety i pytania właściciela (tekst po volNorm_: małe litery, bez ogonków) ---------- */

const HELPER_PRIVATE = /^\d{6,15}@c\.us$/;      // prywatny czat — jedyny dozwolony kontakt (grupa tylko jako „Grafik")
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

/**
 * Nazwa z WhatsAppa bez dopisku grupy („Ania Kowalska Schronisko G13" → „Ania Kowalska") i bez numerów telefonu: nazwą profilu
 * bywa sam numer („+48 600 111 222"), a nazwa idzie do składu dnia (przy „gotowej" — do całego „Grafiku") i do panelu
 * (review PR #8; numery nie opuszczają serwera — decyzja właściciela 27.10). Sam numer → '' (osoba będzie „#17").
 */
function helperShort_(n) {
  return noPhones_(String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f]+/g, ' ')).replace(/…/g, ' ').replace(/\s+/g, ' ')
    .replace(/\s*(schronisko\s*)?g\s*13\s*$/i, '').trim().slice(0, 40);
}

/** Osoba do wiadomości: jej imię (helperNameOnly_), a bez imienia — numer osoby „#17". Numeru telefonu nigdy. */
function helperName_(s, st, id) {
  const n = helperNameOnly_(s, st, id);
  if (n) return n;
  const nr = helperNr_(st, id);
  return nr ? '#' + nr : 'bez nazwy';
}
/**
 * Imię osoby albo '': z panelu („#17 = Ania" albo „…123 = Ania" — końcówka numeru), z listy członków (kontakty telefonu
 * bota, inaczej nazwa z WhatsAppa — z chwili „Pobierz członków"), z „Grafiku" (nadawca). Także pod drugim adresem
 * tej samej osoby (helperSame_).
 */
function helperNameOnly_(s, st, id) {
  const same = helperSame_(st, id), named = helperNameMap_(s.names), nr = helperNr_(st, id);
  if (nr && named['#' + nr]) return named['#' + nr];
  const phones = same.filter(x => HELPER_PRIVATE.test(x)).map(x => x.split('@')[0]);
  const own = Object.keys(named).filter(k => k.charAt(0) !== '#' && phones.some(d => d.slice(-k.length) === k))[0];
  if (own) return named[own];
  // nazwy zapisane przed maskowaniem w helperShort_ (review PR #8) — przy odczycie jeszcze raz
  const roster = same.map(x => helperShort_(st.rosterNames[x])).filter(Boolean)[0];
  if (roster) return roster;
  return same.map(x => helperShort_(st.people[x] && st.people[x].n)).filter(Boolean)[0] || '';
}
/** „#17 = Ania" (numer osoby) albo „123 = Ania" (końcówka numeru telefonu), w linijkach albo po przecinku → {'#17': 'Ania', '123': 'Ania'}. */
function helperNameMap_(text) {
  const out = {};
  String(text || '').split(/[\n,;]+/).forEach(line => {
    const p = line.match(/^\s*#\s*(\d{1,5})\s*[=:-]\s*(.+?)\s*$/);
    if (p) { if (Number(p[1]) > 0) out['#' + Number(p[1])] = p[2].slice(0, 40); return; }
    const m = line.match(/^\s*(?:…|\.\.\.)?\s*(\d{3,15})\s*[=:-]\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].slice(0, 40);
  });
  return out;
}

/* ---------- numery osób (#17) ----------
   Numer osoby nadaje serwer po kolei, przy pierwszym spotkaniu (lista członków, głos, wiadomość z „Grafiku") — i pamięta
   (`helperIds`: adres WhatsAppa → numer, licznik). Nie powstaje z numeru telefonu, więc z numeru osoby nie da się go
   odtworzyć — dawny klucz panelu był skrótem z numeru (FNV) i przeszukanie polskich komórek odzyskiwało numer w ok. 100 s.
   Ten sam człowiek pod drugim adresem (helperSame_) ma ten sam numer. Numery nadają dwa miejsca — przebieg (helperNrsGive_)
   i „Pobierz członków" — więc zawsze pod blokadą skryptu, ze świeżym odczytem (helperNrsAdd_). */

/** Ten sam człowiek pod innymi adresami: z głosu (alias: nadawca @c.us ↔ głosujący @lid) i z kontaktów bota (links: @lid ↔ @c.us). */
function helperSame_(st, id) {
  const out = [String(id)];
  const add = x => { if (x && out.indexOf(x) < 0) out.push(x); };
  add(st.alias[id]);
  Object.keys(st.alias).forEach(k => { if (st.alias[k] === id) add(k); });
  add(st.links && st.links[id]);
  return out;
}
/** Numer osoby albo 0 (jeszcze bez numeru). */
function helperNr_(st, id) {
  const m = st.nrs || {};
  const hit = helperSame_(st, id).filter(x => m[x] > 0)[0];
  return hit ? m[hit] : 0;
}
/** Adres osoby o numerze `nr` — albo ''. */
function helperByNr_(st, nr) {
  const m = st.nrs || {};
  return Object.keys(m).filter(k => m[k] === nr)[0] || '';
}
/** Numer telefonu osoby (same cyfry) — tylko do karty kontaktu, nigdy do tekstu ani panelu; '' — konto bez numeru (@lid). */
function helperPhoneOf_(st, id) {
  const hit = helperSame_(st, id).filter(x => HELPER_PRIVATE.test(x))[0];
  return hit ? hit.split('@')[0] : '';
}
/** Powiązania adresów z listy członków: [adres, imię, adres @c.us tej samej osoby] → {lid: cus, cus: lid}. */
function helperLinks_(list) {
  const out = {};
  (list || []).forEach(x => { if (Array.isArray(x) && x[2]) { out[x[0]] = x[2]; out[x[2]] = x[0]; } });
  return out;
}
/** Wszyscy, o kim pomocnik może napisać: lista członków, nadawcy, głosujący, skład „Grafiku", wypisani z ankiety. */
function helperKnownIds_(st) {
  const ids = {};
  (st.roster ? st.roster.list : []).forEach(x => { ids[x[0]] = 1; });
  Object.keys(st.people).forEach(k => { ids[k] = 1; });
  st.polls.forEach(p => Object.keys(p.v).forEach(w => { ids[w] = 1; }));
  (st.members ? st.members.ids : []).forEach(w => { ids[w] = 1; });
  st.gone.forEach(x => { if (x && x.w) ids[x.w] = 1; });
  return Object.keys(ids);
}
/**
 * Numery dla `ids` bez numeru. Woła się POD BLOKADĄ SKRYPTU (nadają dwa miejsca): świeży odczyt, nadanie, zapis od razu.
 * Ponad HELPER_LIMITS.IDS albo HELPER_BYTES wypadają najpierw numery osób, których pomocnik już nie zna, potem znanych tylko
 * z „Grafiku" — od najstarszego; z listy członków i z klasą nigdy. Numery nie wracają do obiegu (licznik tylko rośnie).
 */
function helperNrsAdd_(st, ids) {
  const cur = helperJson_(PROP_HELPER_IDS, {}) || {};
  const m = cur.m && typeof cur.m === 'object' && !Array.isArray(cur.m) ? cur.m : {};
  st.nrs = m;
  let n = Math.max(Number(cur.n) || 1, 1);
  Object.keys(m).forEach(k => { if (m[k] >= n) n = m[k] + 1; });
  const fresh = [];
  (ids || []).forEach(id => { if (id && !helperNr_(st, id)) { m[String(id)] = n++; fresh.push(String(id)); } });
  if (!fresh.length) return 0;
  const keep = {}, known = {};
  (st.roster ? st.roster.list : []).forEach(x => { keep[x[0]] = 1; if (x[2]) keep[x[2]] = 1; });
  Object.keys(st.roles || {}).forEach(k => { keep[k] = 1; });
  fresh.forEach(k => { keep[k] = 1; });
  helperKnownIds_(st).forEach(k => { known[k] = 1; });
  const drop = Object.keys(m).filter(k => !keep[k]).sort((a, b) => (known[a] || 0) - (known[b] || 0) || m[a] - m[b]);
  let json = JSON.stringify({ n, m });
  while ((Object.keys(m).length > HELPER_LIMITS.IDS || diagBytes_(json) > HELPER_BYTES) && drop.length) {
    delete m[drop.shift()];
    json = JSON.stringify({ n, m });
  }
  setProp_(PROP_HELPER_IDS, json);
  return fresh.length;
}
/** Numery dla osób bez numeru (domyślnie: wszystkich, o kim pomocnik może napisać) — pod krótką blokadą skryptu
 *  (bez flush i pamięci podręcznej: arkusza nie ruszamy). Blokada zajęta — następnym razem. */
function helperNrsGive_(st, ids) {
  const missing = (ids || helperKnownIds_(st)).filter(id => !helperNr_(st, id));
  if (!missing.length) return 0;
  if (lockDepth_ > 0) return helperNrsAdd_(st, missing);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return 0;
  try { return helperNrsAdd_(st, missing); } finally { lock.releaseLock(); }
}
/* ---------- członkowie i ich klasa: fioletowy / pomarańczowy / kandydat (identyfikator w schronisku) ----------
   Lista członków to skład grupy z bramki (getGroupData) — „Grafiku" albo ogłoszeń społeczności, czyli całej
   społeczności — z imionami z kontaktów telefonu bota (getContacts). Właściciel klasyfikuje stuknięciem w panelu
   (setHelperRole). Do przeglądarki idzie numer osoby (#17), nie numer telefonu. Z „Grafiku": „tylko
   fiolet może opiekować się kandydatem", „świeżak nie może być sam" — skład dnia ostrzega o kandydacie bez fioletowego. */
const HELPER_ROLES = ['p', 'o', 'k'];
const HELPER_ROLE_MARK = { p: '🟣', o: '🟠', k: '🌱' };
const HELPER_ROLE_LABEL = { p: '🟣 fioletowy', o: '🟠 pomarańczowy', k: '🌱 kandydat' };
/** Klasa osoby — po jej adresie albo po drugim adresie tej samej osoby (helperSame_: `@lid` / `@c.us`). */
function helperRoleOf_(st, id) {
  const r = st.roles || {};
  const hit = helperSame_(st, id).filter(x => r[x])[0];
  return hit ? r[hit] : '';
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
  out.ready = helperReady_(s.ready, out.features);
  out.weekDays = Array.isArray(s.weekDays) ? s.weekDays.slice() : DEFAULT_HELPER.weekDays.slice();
  if (!HELPER_PRIVATE.test(String(out.toId || ''))) { out.toId = ''; out.toName = ''; }
  if (!HELPER_GROUP.test(String(out.chatId || ''))) { out.chatId = ''; out.chatName = ''; }
  if (!out.chatId || !out.toId) out.enabled = false;
  return out;
}

/**
 * Funkcje „gotowe" (piszą do „Grafiku") — tylko na produkcji i tylko włączone: wyłączona funkcja po ponownym włączeniu
 * wraca jako „w teście", nie prosto do grupy. Na teście zawsze wszystkie false (B85).
 */
function helperReady_(r, features) {
  const out = {}, prod = env_() === 'prod';
  HELPER_READY.forEach(k => { out[k] = prod && !!(r && typeof r === 'object' && r[k] === true) && !!(features && features[k]); });
  return out;
}

/** Ustawienia z panelu — sprawdzone, albo błąd z komunikatem. Te same reguły w przeglądarce (helperProblem). */
function helperValid_(o) {
  o = o && typeof o === 'object' ? o : {};
  const chatId = String(o.chatId == null ? '' : o.chatId).trim();
  if (chatId && !HELPER_GROUP.test(chatId)) throw new Error('„Grafik" to grupa — wybierz ją z listy („Pobierz grupy")');
  const toId = String(o.toId == null ? '' : o.toId).trim();
  if (toId && !HELPER_PRIVATE.test(toId)) throw new Error('Kontakt to osoba, nie grupa — pomocnik pisze do niego tylko prywatnie (do „Grafiku" — funkcje „gotowe" na produkcji)');
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
           min, evening, morning, weekDays, names: text(o.names, HELPER_LIMITS.NAME_MAP, 'Imiona'), features,
           ready: helperReady_(o.ready, features) };
}

/** Wyzwalacz: co HELPER_TICK_MIN minut, gdy pomocnik włączony. */
function installHelperTrigger_(s) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'helperTick')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (!s.enabled) return;
  ScriptApp.newTrigger('helperTick').timeBased().everyMinutes(HELPER_TICK_MIN).create();
}

/**
 * Zapis ustawień z panelu (PIN) i przełożenie wyzwalacza. Idempotentne (RETRIABLE). Kontakt przychodzi jako klucz
 * (`toKey` — contactKey_, jak w liście dnia), nie adres z numerem; `toId` wprost — tylko karta sprzed 27.10.
 * Na produkcji od razu sygnał dla testu (jeden aktywny): włączony — „pracuję", wyłączony — „koniec"; bez czekania
 * na pierwszy przebieg. Brak `ready` (karta sprzed 28.10) — tryby funkcji zostają, jakie były.
 */
function setHelperSettings(settings, pin) {
  requirePin_(pin);
  const o = Object.assign({}, settings && typeof settings === 'object' ? settings : {});
  if (o.toKey != null) {
    const key = String(o.toKey || '').trim();
    o.toId = key ? contactOfKey_(key, [helperSettings_().toId, dayReportSettings_().chatId]) : '';
    if (key && !o.toId) throw new Error('Tego kontaktu nie ma na liście — „Pobierz kontakty" jeszcze raz');
  }
  if (o.ready == null) o.ready = helperSettings_().ready;
  const s = helperValid_(o);
  if (s.enabled && !greenApi_()) throw new Error(GREEN_MISSING);
  withLock_(() => {
    setProp_(PROP_HELPER, JSON.stringify(s));
    installHelperTrigger_(s);
  });
  helperLeaseSend_(s.enabled);
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
  const notes = helperJson_(PROP_HELPER_NOTES, {});      // wypisani z ankiety (g); notatki i nieobecności z czatu — do 27.10, już nie
  const x = helperJson_(PROP_HELPER_STATE, {});
  const log = helperJson_(PROP_HELPER_LOG, []);
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const arr = v => Array.isArray(v) ? v : [];
  // ankiety w dwóch właściwościach (helperSave_): nowsze w pierwszej, starsze w drugiej
  const polls = arr(helperJson_(PROP_HELPER_POLLS, [])).concat(arr(helperJson_(PROP_HELPER_POLLS2, [])))
    .filter(p => p && p.id).sort((a, b) => a.t - b.t);
  // członkowie i klasy — osobne właściwości, pisane tylko z panelu (getHelperMembers, setHelperRole); przebieg ich nie zapisuje.
  // Numery osób — pisane tylko pod blokadą (helperNrsAdd_)
  const roster = helperJson_(PROP_HELPER_ROSTER, null);
  const list = roster && Array.isArray(roster.list) ? roster.list.filter(x => Array.isArray(x) && x[0]) : [];
  const rosterNames = {};
  list.forEach(x => { if (x[1]) rosterNames[x[0]] = x[1]; });
  const nrs = helperJson_(PROP_HELPER_IDS, {}) || {};
  return {
    roles: obj(helperJson_(PROP_HELPER_ROLES, {})), roster: roster && typeof roster === 'object' ? Object.assign({}, roster, { list }) : null, rosterNames,
    links: helperLinks_(list), nrs: obj(nrs.m),
    polls, people: obj(people.p), alias: obj(people.a),
    gone: arr(notes.g),
    marks: obj(x.marks), members: x.members && Array.isArray(x.members.ids) ? x.members : null,
    seen: arr(x.seen), sent: obj(x.sent), stat: x.stat || null, queue: arr(x.queue), cmds: arr(x.cmds),
    since: Number(x.since) || 0, gate: x.gate && typeof x.gate === 'object' ? x.gate : null,
    histAt: Number(x.histAt) || 0, catchUp: !!x.catchUp, log: arr(log),
  };
}

/** Porządki przed zapisem: minione dni znikają, listy mają swoje sufity. */
function helperPrune_(st) {
  const T = today_(), y = addDays_(T, -1);
  st.gone = st.gone.filter(g => g.d >= y).slice(-HELPER_LIMITS.GONE);
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
  put(PROP_HELPER_NOTES, () => ({ g: st.gone }), () => !!st.gone.shift());   // zapis zdejmuje stare notatki z czatu (n, b)
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
 * Na teście z ważnym sygnałem produkcji nic nie robi — pracuje tamten pomocnik (jeden aktywny). Najwyżej raz na
 * HELPER_TICK_GAP_MIN minut od końca poprzedniego przebiegu (review PR #8): wołana w pętli robiłaby przebieg co kilka sekund
 * i zjadała dzienne limity konta (połączenia z bramką, zapisy właściwości), od których zależą ankieta i lista dnia.
 * „Sprawdź teraz" (helperRunNow, PIN) progu nie ma.
 */
function helperTick() {
  const s = helperSettings_();
  if (!s.enabled || !greenApi_() || helperWaits_()) return null;
  const x = helperJson_(PROP_HELPER_STATE, {});
  if (x && x.stat && Date.now() - Number(x.stat.at) < HELPER_TICK_GAP_MIN * 60000) return null;
  try { return helperRun_(s, false); } catch (e) { return null; }
}

/* ---------- jeden aktywny pomocnik: pierwszeństwo ma produkcja (28.10.2026, decyzja właściciela) ----------
   Test i produkcja dzielą jedną instancję bramki, a kolejka powiadomień jest jedna: dwa czytające zjadałyby sobie
   powiadomienia (każdy znałby pół głosów), a właściciel dostawałby każdy skład dwa razy. Pracuje więc jeden. Włączony
   pomocnik produkcji przy każdym przebiegu i przy zapisie ustawień wysyła do aplikacji testowej (jej doPost,
   HELPER_TEST_APP) sygnał „pracuję do …" (HELPER_LEASE_MIN minut), wyłączony — „koniec". Pomocnik testu z ważnym
   sygnałem czeka: nie czyta kolejki, nic nie wysyła, „Sprawdź teraz" odmawia. Przełącznikiem jest więc „włączony"
   w panelu produkcji: wyłączony — w ciągu HELPER_TICK_MIN minut pracuje test (o ile tam włączony), włączony — test ustępuje.
   Sygnał jest podpisany tokenem bramki (HMAC): wspólny token = wspólna instancja = wspólna kolejka. Podpisu nie podrobi
   nikt bez tokenu, a środowiska z osobnymi instancjami (osobne kolejki) nawzajem się nie wstrzymują. Brak sygnału —
   produkcja bez pomocnika (sprzed 1.5) albo bez przebiegów dłużej niż HELPER_LEASE_MIN — test pracuje.
   Pomocnik po przerwie (czekał, był wyłączony) doczytuje historię czatu (HELPER_STALE_MIN, helperRun_). */

/** Podpis sygnału: HMAC-SHA256 tokenem bramki (jak contactKey_). '' — bramka nieustawiona. */
function helperLeaseSig_(until, at) {
  const g = greenApi_();
  if (!g) return '';
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('g13-helper-lease|' + g.id + '|' + until + '|' + at, g.token));
}

/**
 * Produkcja → test: `on` — „pracuję do …", inaczej „koniec". Nigdy nie rzuca; wynik {at, on, ok, err} zostaje dla panelu
 * (PROP_HELPER_LEASE_SENT). Na teście nic — test nikogo nie wstrzymuje.
 */
function helperLeaseSend_(on) {
  if (env_() !== 'prod') return null;
  const at = Date.now(), until = on ? at + HELPER_LEASE_MIN * 60000 : 0;
  const out = { at, on: !!on, ok: false, err: '' };
  try {
    const sig = helperLeaseSig_(until, at);
    if (!sig) throw new Error(GREEN_MISSING);
    const r = UrlFetchApp.fetch('https://script.google.com/macros/s/' + HELPER_TEST_APP + '/exec', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
      payload: JSON.stringify({ g13: 'helperLease', until, at, sig }) });
    let b = null;
    try { b = JSON.parse(r.getContentText()); } catch (e) { b = null; }
    out.ok = !!(b && b.ok === true);
    if (!out.ok) out.err = b && b.err ? String(b.err).slice(0, 100) : 'aplikacja testowa odpowiedziała kodem ' + r.getResponseCode();
  } catch (e) {
    out.err = noPhones_(String(e && e.message || e)).slice(0, 100);
  }
  try { setProp_(PROP_HELPER_LEASE_SENT, JSON.stringify(out)); } catch (e) { /* panel pokaże poprzedni */ }
  return out;
}

/**
 * Test ← produkcja (doPost, WebApp.gs). Publiczne (aplikacja bez logowania), więc treści nie ufa: podpis tokenem tej samej
 * instancji bramki, sygnał świeży (`at` najwyżej 15 min od zegara), `until` 0 albo najwyżej HELPER_LEASE_MIN minut naprzód,
 * nie starszy niż zapisany (spóźniony „pracuję" nie nadpisze późniejszego „koniec"). Zapisuje tylko {until, at, rx}.
 * Na produkcji odmawia (produkcja nie czeka na nikogo). Nigdy nie rzuca — odpowiedź {ok} albo {ok: false, err}.
 */
function helperLeaseIn_(raw) {
  try {
    if (env_() === 'prod') return { ok: false, err: 'to produkcja — sygnał przyjmuje tylko test' };
    let b = null;
    try { b = JSON.parse(String(raw || '')); } catch (e) { b = null; }
    if (!b || b.g13 !== 'helperLease') return { ok: false, err: 'nieznane zapytanie' };
    const now = Date.now(), at = Number(b.at), until = Number(b.until);
    if (!(Math.abs(now - at) <= 15 * 60000) || !(until === 0 || (until > at && until - at <= HELPER_LEASE_MIN * 60000)))
      return { ok: false, err: 'nieważny sygnał' };
    const sig = helperLeaseSig_(until, at);
    if (!sig || String(b.sig || '') !== sig) return { ok: false, err: 'zły podpis — inna instancja bramki albo inny token' };
    const cur = helperLease_();
    if (cur && cur.at > at) return { ok: true, old: true };
    setProp_(PROP_HELPER_LEASE, JSON.stringify({ until, at, rx: now }));
    return { ok: true };
  } catch (e) {
    return { ok: false, err: 'błąd zapisu sygnału' };
  }
}

/** Sygnał z produkcji, który test właśnie ma: {until, at, rx} albo null. Na produkcji zawsze null. */
function helperLease_() {
  if (env_() === 'prod') return null;
  const l = helperJson_(PROP_HELPER_LEASE, null);
  return l && typeof l === 'object' && Number(l.at) > 0 ? l : null;
}
/** Czy pomocnik testu czeka — ma ważny sygnał „pracuję" z produkcji. */
function helperWaits_() {
  const l = helperLease_();
  return !!(l && Number(l.until) > Date.now());
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
    // produkcja: sygnał dla testu przed czytaniem kolejki — test ustępuje, zanim sięgnie po nią drugi raz. Także „Sprawdź
    // teraz" przy wyłączonym: ten przebieg też czyta kolejkę, więc test czeka HELPER_LEASE_MIN, a potem doczytuje historię
    helperLeaseSend_(true);
    st = helperLoad_();
    if (!st.since) st.since = Date.now();
    // po przerwie (czekał na produkcję, był wyłączony) — to, co przyszło w międzyczasie, zdjął z kolejki drugi pomocnik:
    // historia czatu przy najbliższych wiadomościach (helperSchedule_)
    if (st.stat && Date.now() - st.stat.at > HELPER_STALE_MIN * 60000) st.catchUp = true;
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
 * helperCatchUp_). Z „Grafiku": ankiety, głosy, nazwy nadawców (treści wiadomości nie — 27.10); z prywatnego czatu
 * (tylko z kolejki): pytania właściciela. Wszystko jest powtarzalne bez skutków ubocznych — głos to stan osoby z czasem
 * (`vt` w helperApplyVotes_), ankieta po identyfikatorze, nazwa nadawcy po prostu nadpisana.
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
    }
    // zwykłe wiadomości z „Grafiku" — tylko nazwa nadawcy (wyżej); treści nie czytamy: o obecności mówi ankieta (27.10)
  } else if (chat === s.toId && incoming && queue) {
    const cards = helperCards_(tm, md);
    if (cards.length) { st.cmds.push({ c: cards, at }); return; }
    const text = helperText_(md);
    if (text) st.cmds.push({ t: text.slice(0, 100), at });
  }
}

/**
 * Kontakty, które właściciel udostępnił botowi (karta: contactMessage, kilka kart: contactsArrayMessage) — numer WhatsAppa
 * z karty (`waid=` w vCard) i nazwa z karty: [{w, n}], najwyżej 10. Zostają na serwerze (kolejka pytań we właściwościach).
 */
function helperCards_(tm, md) {
  const list = tm === 'contactMessage' ? [md.contactMessageData]
    : tm === 'contactsArrayMessage' ? (md.messageData && md.messageData.contacts) : null;
  return (Array.isArray(list) ? list : []).filter(c => c && typeof c === 'object').slice(0, 10).map(c => {
    const m = String(c.vcard || '').match(/waid=(\d{6,15})/);
    return { w: m ? m[1] : '', n: helperShort_(c.displayName) };
  });
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
 * („Grafik 05-11.11" wysłane 4.10) — wtedy też najbliższy tydzień, a `wrong` mówi, że daty się nie zgadzają. Bliskie daty są
 * `wrong`, gdy zakres skończył się przed dniem wysłania albo zaczyna się po spodziewanym tygodniu — ankieta w środku tygodnia
 * na bieżący weekend („26.06 - 28.06" w czwartek) jest w porządku (review PR #8: dawniej zawsze „nie pasują").
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
  return { from, to, parsed: true, wrong: to < ref || from > expect.to, said: { from, to } };
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
 * Poznana z głosu ma dni od dnia głosu — gdy przyjdzie sama ankieta (wcześniejsza chwila), dni i daty liczą się od dnia jej
 * wysłania (review PR #8; numery odpowiedzi w głosach zostają ważne). Poznana z głosu i bez dat w pytaniu (`nodays`) nie ma
 * dni wcale, dopóki nie przyjdzie sama: dni od dnia głosu byłyby zgadywaniem — dawna „Weekend bez AW" przejmowała dni bieżącej
 * ankiety (decyzja właściciela 28.10). Ponad HELPER_LIMITS.POLLS wypadają najpierw takie, potem najstarsze.
 */
function helperPollOf_(st, id, name, opts, at, created, full) {
  if (!id) return null;
  let p = st.polls.filter(x => x.id === id)[0];
  if (p) {
    if (name && !p.q) p.q = String(name).slice(0, 120);
    const grown = opts.length > p.opts.length, earlier = created && at < p.t, dated = created && p.nodays;
    if (grown) p.opts = opts.map(o => o.slice(0, 60));
    if (created) { p.t = Math.min(p.t, at); if (full) p.partial = false; delete p.nodays; }
    if (grown || earlier || dated) helperPollDaysSet_(p);
    return p;
  }
  p = { id: String(id).slice(0, 64), q: String(name || '').slice(0, 120), t: at, opts: opts.map(o => o.slice(0, 60)), v: {}, vt: {},
        partial: !(created && full) };
  if (!created && !helperRange_(p.q, helperDate_(at)).parsed) p.nodays = true;
  helperPollDaysSet_(p);
  st.polls.push(p);
  st.polls.sort((a, b) => a.t - b.t);
  while (st.polls.length > HELPER_LIMITS.POLLS) {
    const k = st.polls.findIndex(x => x.nodays);
    st.polls.splice(k >= 0 ? k : 0, 1);
  }
  return p;
}
/** Dni i daty ankiety od jej chwili (p.t); ankieta `nodays` — odpowiedzi bez dni i bez ostrzeżenia o datach. */
function helperPollDaysSet_(p) {
  const pd = helperPollDays_(p.q, p.opts, p.t);
  p.days = p.nodays ? pd.days.map(o => Object.assign({}, o, { d: '' })) : pd.days;
  p.from = pd.range.from; p.to = pd.range.to; p.wrong = !p.nodays && !!pd.range.wrong;
}

/**
 * Głos (pollUpdateMessage). Dokumentacja bramki: powiadomienie dotyczy jednej osoby — ale czy nie niesie pełnego stanu
 * ankiety, nie sprawdziliśmy (HELPER.md). Bierzemy to, co pewne przy obu: nikt w odpowiedziach — nadawca wycofał wszystko;
 * dwie osoby i więcej — pełny stan; jedna — sam nadawca (ten sam adres albo jego drugi adres, `@lid` zamiast `@c.us` —
 * zapamiętujemy powiązanie, alias), a gdy to nie może być on — pełny stan: nadawca wycofał wszystko i został jeden głos kogoś
 * innego (review PR #8: dawniej powiązanie z tą osobą „sklejało" dwie osoby — imię, klasa, numer osoby). Drugi adres nadawcy
 * to tylko adres innego rodzaju, którego nikt inny już nie ma, gdy nadawca nie ma jeszcze głosu w tej ankiecie.
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
  const one = voters.length === 1 ? voters[0] : '';
  if (voters.length >= 2 || (one && !helperSelf_(st, poll, sender, one))) {
    voters.forEach(w => put(w, by[w]));
    Object.keys(poll.v).forEach(w => { if (!by[w]) put(w, null); });
  } else if (one) {
    if (sender && sender !== one) st.alias[sender] = one;
    put(one, by[one]);
  } else {
    put(st.alias[sender] || sender, null);
  }
  Object.keys(before).forEach(w => {
    const was = helperDatesOf_(poll, before[w]), now = helperDatesOf_(poll, poll.v[w] || []);
    was.filter(d => now.indexOf(d) < 0).forEach(d => st.gone.push({ d, w, at }));
  });
}

/**
 * Czy głosujący `w` (jedyny w powiadomieniu) to sam nadawca: ten sam adres, znany drugi adres (alias, lista członków) albo
 * adres innego rodzaju (`@lid` ↔ `@c.us`), którego nikt inny nie ma, gdy nadawca nie ma jeszcze głosu w tej ankiecie.
 */
function helperSelf_(st, poll, sender, w) {
  if (!sender || sender === w || st.alias[sender] === w || (st.links && st.links[w] === sender)) return true;
  if (/@lid$/.test(sender) === /@lid$/.test(w)) return false;
  if (helperSame_(st, sender).some(x => poll.v[x] || poll.vt[x])) return false;
  return !Object.keys(st.alias).some(k => st.alias[k] === w) && !(st.links && st.links[w]);
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

/* ---------- czat ----------
   Treści wiadomości z „Grafiku" pomocnik nie analizuje (27.10.2026, decyzja właściciela: „jedynym i świętym źródłem prawdy
   jest ankieta — tam, gdzie ktoś jest zaznaczony, tam ma być"). Do 27.10 rozpoznawał z czatu dni, nieobecności i „będę /
   nie dam rady" (🔀, 🚫, „nieobecni", cytaty „Z czatu") — heurystyka myliła się („nie wpadnę" jako „będzie"), a i tak
   tylko powtarzała albo podważała ankietę. Z czatu zostaje nazwa nadawcy (helperPerson_). Nie przywracać bez pytania. */

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

/** Wszystko o dniu `d` — z ankiety: kto, pory, dopiski, wypisani. */
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
  return { d, poll, voters, parts, extras, gone };
}

/** Co jest nie tak z dniem — pusta lista = w porządku. */
function helperProblems_(s, st, info) {
  const out = [];
  if (!info.poll) return ['brak ankiety'];
  // ankieta niepełna (sprzed włączenia powiadomień) — liczba to dolna granica: „mało osób" byłoby fałszywym alarmem
  if (info.voters.length < s.min && !info.poll.partial) out.push('mało osób');
  const r = helperSquadRoles_(st, info.voters);
  if (r.known && info.voters.length && !r.p.length) out.push('brak fioletowego');
  if (r.k.length && !r.p.length) out.push('kandydat bez fioletowego');
  return out;
}

/**
 * Klasy w składzie dnia: kto jest fioletowy, pomarańczowy, kandydatem. `known` — czy ktokolwiek w ogóle ma klasę
 * „fioletowy" (bez sklasyfikowanych „brak fioletowego" byłoby przy każdym dniu i nic by nie znaczyło).
 */
function helperSquadRoles_(st, voters) {
  const out = { p: [], o: [], k: [], known: Object.keys(st.roles || {}).some(k => st.roles[k] === 'p') };
  voters.forEach(w => { const r = helperRoleOf_(st, w); if (out[r]) out[r].push(w); });
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
    if (n) L.push('👥 ' + info.voters.map(w => (HELPER_ROLE_MARK[helperRoleOf_(st, w)] || '') + name(w)).join(', '));
    const pn = Object.keys(info.parts);
    if (pn.length) L.push('   ' + ['r', 'w'].filter(k => info.parts[k]).map(k => (k === 'r' ? 'rano ' : 'wieczór ') + info.parts[k].length).join(' · '));
    info.extras.forEach(x => L.push('➕ osobno — ' + x.label + ': ' + x.who.length + ' os.'));
    if (part) L.push('ℹ️ ankieta sprzed włączenia powiadomień w bramce' + (st.gate && st.gate.from ? ' (' + helperWhen_(st.gate.from) + ')' : '')
      + ' — znam tylko głosy oddane albo zmienione później; pełny obraz od następnej ankiety');
    if (info.poll.wrong) L.push('⚠️ daty w pytaniu ankiety nie pasują do tygodnia');
  }
  if (info.gone.length) L.push('➖ wypisali się: ' + info.gone.map(g => name(g.w) + ' (' + helperWhen_(g.at) + ')').join(', '));
  const roles = helperSquadRoles_(st, info.voters);
  if (info.poll && n && roles.known && !roles.p.length) L.push('🟣 brak fioletowego ⚠️');
  if (info.poll && roles.k.length) {
    L.push(roles.p.length ? '🌱 kandydaci: ' + roles.k.map(name).join(', ') + ' — z fioletowym ✓'
      : '🌱 kandydat bez fioletowego ⚠️ (' + roles.k.map(name).join(', ') + ') — kandydat nie może być sam');
  }
  // nic z czatu (27.10.2026, decyzja właściciela): o obecności mówi tylko ankieta — bez cytatów, „🔀 pisze, że…"
  // i „🚫 zapowiedziana nieobecność"; wiadomość ma też docelowo iść do „Grafiku", gdzie czat i tak jest
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
  // szczegóły błędu (tekst Google z identyfikatorem arkusza) — do dziennika, nie do wiadomości: skład „gotowy" czyta cały „Grafik"
  try { catalog = ctx.catalog(); } catch (e) { helperLog_(st, 'err', 'psy: ' + (e && e.message || e)); return ['🐕 nie udało się odczytać psów']; }
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
    const squad = info.voters.map(w => helperFirst_(helperNameOnly_(s, st, w))).filter(Boolean);
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

/** Przegląd 7 dni od jutra (z ankiety): liczby, słabe dni, dni bez ankiety, podpowiedź przepisania. */
function helperWeekText_(s, st) {
  const T = today_(), days = [];
  for (let k = 1; k <= 7; k++) days.push(helperDay_(s, st, addDays_(T, k)));
  const L = ['*Przegląd tygodnia* (' + helperShortLabel_(days[0].d).slice(-5) + '–' + days[6].d.slice(8) + '.' + days[6].d.slice(5, 7) + ')'];
  days.forEach(i => {
    const extra = i.extras.map(x => x.label + ' ' + x.who.length).join(', ');
    const r = i.poll ? helperSquadRoles_(st, i.voters) : null;
    const roleNote = !r || !i.voters.length ? '' : r.k.length && !r.p.length ? ' · 🌱 kandydat bez 🟣 ⚠️' : r.known && !r.p.length ? ' · bez 🟣' : '';
    L.push(helperShortLabel_(i.d) + ' — ' + (!i.poll ? 'nie widzę ankiety'
      : (i.poll.partial ? '≥ ' : '') + i.voters.length + ' os.' + (i.voters.length < s.min ? ' ⚠️' : '')) + roleNote + (extra ? ' (osobno: ' + extra + ')' : ''));
  });
  if (days.some(i => i.poll && i.poll.partial)) L.push('ℹ️ ≥ — ankieta sprzed włączenia powiadomień: znam tylko część głosów');
  const withPoll = days.filter(i => i.poll);
  const weak = withPoll.filter(i => i.voters.length < s.min).sort((a, b) => a.voters.length - b.voters.length)[0];
  const strong = withPoll.filter(i => i.voters.length > s.min).sort((a, b) => b.voters.length - a.voters.length)[0];
  if (weak && strong) L.push('↔️ może ktoś z dnia ' + helperShortLabel_(strong.d) + ' (' + strong.voters.length + ') przepisze się na '
    + helperShortLabel_(weak.d) + ' (' + weak.voters.length + ')?');
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
 * Dokąd idzie wiadomość funkcji `feature` (klucz z HELPER_READY albo nic): funkcja „gotowa" na PRODUKCJI — do „Grafiku"
 * (s.chatId, decyzja właściciela 28.10.2026); wszystko inne — funkcja w teście, odpowiedź na pytanie, ostrzeżenie, podgląd
 * z panelu, cokolwiek na teście — prywatnie, do kontaktu z ustawień. Adresy sprawdzane tu jeszcze raz, niezależnie od
 * ustawień: kontakt tylko prywatny, „Grafik" tylko grupa (B74, B85).
 */
function helperDest_(s, feature) {
  const group = !!(feature && env_() === 'prod' && s.ready && s.ready[feature] === true);
  const to = String((group ? s.chatId : s.toId) || '');
  if (group && !HELPER_GROUP.test(to)) throw new Error('Pomocnik nie zna grupy „Grafik" — wybierz ją w ustawieniach');
  if (!group && !HELPER_PRIVATE.test(to)) throw new Error('Pomocnik pisze tylko prywatnie — w ustawieniach nie ma kontaktu');
  return { to, group };
}

/**
 * Wiadomość funkcji `feature` (helperDest_: „gotowa" na produkcji — do „Grafiku", inaczej prywatnie do kontaktu z ustawień).
 * Sufity wspólne: HELPER_SEND_MAX na przebieg, HELPER_DAY_MAX na dzień (ponad — wpis w dzienniku, bez wysyłki).
 */
function helperSend_(s, st, text, run, feature) {
  const dest = helperDest_(s, feature);
  const day = today_();
  if (st.sent.day !== day) st.sent = { day, n: 0 };
  if (run.sent >= HELPER_SEND_MAX || st.sent.n >= HELPER_DAY_MAX) {
    helperLog_(st, 'warn', 'limit wiadomości (' + (run.sent >= HELPER_SEND_MAX ? 'na przebieg' : 'na dzień') + ') — nie wysłano: ' + text.split('\n')[0]);
    return false;
  }
  const head = (env_() === 'prod' ? '' : '🧪 ') + '🤖 *Pomocnik Grafiku*\n';
  const res = greenCall_('sendMessage', { chatId: dest.to, message: (head + text).slice(0, HELPER_LIMITS.MESSAGE) });
  if (!res || !res.idMessage) throw new Error('Bramka WhatsAppa nie potwierdziła wysłania');
  run.sent++;
  st.sent.n++;
  helperLog_(st, 'sent', (dest.group ? 'do Grafiku: ' : '') + text.split('\n')[0]);
  return true;
}

/**
 * Karta kontaktu osoby #nr (sendContact) do właściciela — jedyna droga numeru telefonu poza serwer: bramka → WhatsApp
 * właściciela, nigdy przeglądarka ani tekst. Tylko prywatny czat z ustawień (B74). Osobny sufit dzienny (HELPER_CARD_MAX).
 * Zwraca '' (wysłana) albo tekst dla właściciela, dlaczego karty nie będzie (nie zna osoby, konto bez numeru, sufit).
 */
function helperSendCard_(s, st, nr) {
  if (!HELPER_PRIVATE.test(String(s.toId || ''))) throw new Error('Pomocnik pisze tylko prywatnie — w ustawieniach nie ma kontaktu');
  const id = helperByNr_(st, nr);
  if (!id) return 'Nie znam osoby #' + nr + ' — numery osób są na liście członków w panelu i przy osobach bez imienia w wiadomościach.';
  const name = helperNameOnly_(s, st, id), phone = helperPhoneOf_(st, id);
  if (!phone) return '#' + nr + (name ? ' — ' + name : '') + ': WhatsApp nie podaje numeru telefonu tej osoby (konto bez numeru) — karty kontaktu nie będzie.';
  const day = today_();
  if (st.sent.day !== day) st.sent = { day, n: 0 };
  if ((st.sent.c || 0) >= HELPER_CARD_MAX) {
    helperLog_(st, 'warn', 'limit kart kontaktu na dzień — nie wysłano #' + nr);
    return 'Dziś poszło już ' + HELPER_CARD_MAX + ' kart kontaktu — kolejne jutro.';
  }
  const res = greenCall_('sendContact', { chatId: s.toId, contact: { phoneContact: Number(phone), firstName: name || 'Grafik', lastName: '#' + nr } });
  if (!res || !res.idMessage) throw new Error('Bramka WhatsAppa nie potwierdziła wysłania');
  st.sent.c = (st.sent.c || 0) + 1;
  helperLog_(st, 'sent', 'karta kontaktu #' + nr);
  return '';
}

/**
 * Raz na klucz (`ev|2026-10-24`…): znacznik po wysłaniu albo po nieznanym wyniku (bramka mogła wysłać). `fn` zwraca false —
 * wiadomość zatrzymał sufit (helperSend_): bez znacznika, następny przebieg spróbuje znowu (review PR #8 — dawniej przepadała
 * na cały dzień); nic nie zwraca — świadomie nic nie poszło (rano bez problemu) i znacznik jest. Zwraca: true — znacznik
 * postawiony, false — sufit, undefined — błąd.
 */
function helperOnce_(st, key, run, fn) {
  if (st.marks[key]) return true;
  try {
    if (fn() === false) return false;
    st.marks[key] = Date.now();
    return true;
  } catch (e) {
    if (e && e.unknown) st.marks[key] = Date.now();
    run.err = run.err || String(e && e.message || e);
    helperLog_(st, 'err', key.split('|')[0] + ': ' + (e && e.message || e));
    return undefined;
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
    if (gate) helperOnce_(st, 'gate|' + T, run, () => helperSend_(s, st, helperGateText_(gate), run));
    if (f.members && inWin(s.evening)) helperOnce_(st, 'mem|' + T, run, () => helperMembers_(s, st, run, true));
    return;
  }
  // historia czatu: zaraz po włączeniu powiadomień, po przerwie, przy „Sprawdź teraz" i przed wiadomościami o swojej porze,
  // gdy na dzień, o którym mówią, nie ma ankiety albo zna ją tylko częściowo (najwyżej co HELPER_HISTORY_GAP_H godzin). Tylko
  // te dni (review PR #8): rano — dziś, wieczorem — jutro, w dni przeglądu tygodnia — 7 dni; dawniej zawsze 8 dni, a ankiety
  // na następny tydzień do niedzieli nie ma, więc historia szła co rano i co wieczór także przy pełnej ankiecie
  const need = [];
  if (f.morning && inWin(s.morning)) need.push(T);
  if (inWin(s.evening)) {
    if (f.evening) need.push(addDays_(T, 1));
    if (f.week && s.weekDays.indexOf(wd) >= 0) for (let k = 1; k <= 7; k++) need.push(addDays_(T, k));
  }
  const blind = need.some(d => { const p = helperPollFor_(st, d); return !p || p.partial; });
  if (st.catchUp || run.manual || (blind && Date.now() - (st.histAt || 0) >= HELPER_HISTORY_GAP_H * 3600000)) {
    try { helperCatchUp_(s, st, run); }
    catch (e) { helperLog_(st, 'err', 'historia czatu: ' + (e && e.message || e)); }
  }
  // numery osób dla nowych osób — zanim padną w wiadomościach (bez numeru osoba bez imienia byłaby „bez nazwy")
  try { helperNrsGive_(st); } catch (e) { helperLog_(st, 'err', 'numery osób: ' + (e && e.message || e)); }

  // pytania właściciela: „kto 17" — karta kontaktu; udostępniony kontakt — kto to na liście; reszta — helperCommand_
  const cmds = st.cmds.splice(0, st.cmds.length);
  if (f.commands) cmds.slice(-HELPER_LIMITS.CMDS).forEach(c => {
    try {
      if (c.c) { helperSend_(s, st, helperCardsText_(s, st, c.c), run); return; }
      const nr = helperWho_(c.t);
      if (nr) { const why = helperSendCard_(s, st, nr); if (why) helperSend_(s, st, why, run); return; }
      helperSend_(s, st, helperCommand_(s, st, c.t, ctx), run);
    } catch (e) { helperLog_(st, 'err', 'odpowiedź: ' + (e && e.message || e)); }
  });

  // dalej wiadomości funkcji — każda z kluczem funkcji: „gotowa" na produkcji idzie do „Grafiku" (helperDest_). Callback zwraca
  // wynik helperSend_: zatrzymana sufitem (false) nie dostaje znacznika i idzie w następnym przebiegu (helperOnce_)
  const queue = st.queue.splice(0, st.queue.length);
  if (f.newPoll) queue.forEach(id => {
    const p = st.polls.filter(x => x.id === id)[0];
    // nowa ankieta zatrzymana sufitem wraca do kolejki (inaczej zdjęta z niej nie poszłaby już nigdy)
    if (p && helperOnce_(st, 'poll|' + id, run, () => helperSend_(s, st, helperPollText_(st, p), run, 'newPoll')) === false) st.queue.push(id);
  });

  if (f.morning && inWin(s.morning)) helperOnce_(st, 'mo|' + T, run, () => {
    const info = helperDay_(s, st, T);
    if (helperProblems_(s, st, info).length) return helperSend_(s, st, helperDayText_(s, st, T, ctx), run, 'morning');
  });
  if (f.lastWeek && wd === 1 && inWin(s.morning)) helperOnce_(st, 'lw|' + T, run, () => helperSend_(s, st, helperLastWeekText_(s, st, ctx), run, 'lastWeek'));

  if (f.evening && inWin(s.evening)) helperOnce_(st, 'ev|' + T, run, () => {
    const D = addDays_(T, 1), info = helperDay_(s, st, D);
    if (!f.eveningAlways && !helperProblems_(s, st, info).length) return;
    const top = wd === 0 && !info.poll ? '⚠️ *Nie widzę jeszcze ankiety na nowy tydzień* (w historii czatu też jej nie ma)\n' : '';
    return helperSend_(s, st, top + helperDayText_(s, st, D, ctx), run, 'evening');
  });
  if (f.week && s.weekDays.indexOf(wd) >= 0 && inWin(s.evening)) helperOnce_(st, 'wk|' + T, run, () => helperSend_(s, st, helperWeekText_(s, st), run, 'week'));
  if (f.members && inWin(s.evening)) helperOnce_(st, 'mem|' + T, run, () => helperMembers_(s, st, run, true));
}

/**
 * Skład grupy z bramki (getGroupData) porównany z poprzednim: nowe osoby i odejścia. Pierwszy raz — tylko punkt
 * odniesienia. Nowa osoba nie zobaczy ankiety wysłanej przed jej dołączeniem (WhatsApp nie pokazuje historii).
 * Nowy punkt odniesienia dopiero po wysłaniu (review PR #8): gdy bramka odrzuci wiadomość albo zatrzyma ją sufit, następny
 * przebieg policzy tę samą różnicę — dawniej zmiana składu ginęła na zawsze. Zwraca wynik helperSend_ (false — sufit).
 */
function helperMembers_(s, st, run, send) {
  const g = greenCall_('getGroupData', { groupId: s.chatId });
  const ids = (g && Array.isArray(g.participants) ? g.participants : []).map(p => String(p && p.id || '')).filter(Boolean).sort();
  if (!ids.length) throw new Error('bramka nie podała składu grupy');
  const prev = st.members, now = { at: Date.now(), ids };
  if (!prev || !send) { st.members = now; return; }
  const plus = ids.filter(x => prev.ids.indexOf(x) < 0), minus = prev.ids.filter(x => ids.indexOf(x) < 0);
  if (!plus.length && !minus.length) { st.members = now; return; }
  try { helperNrsGive_(st, plus); } catch (e) { /* bez numeru — „bez nazwy"; nada go następny przebieg */ }
  const L = ['*Grafik — skład grupy* (' + ids.length + ' os.)'];
  if (plus.length) L.push('👋 nowe osoby: ' + plus.map(w => helperName_(s, st, w)).join(', ')
    + ' — nie zobaczą ankiety wysłanej przed dołączeniem; niech napiszą dostępność w czacie');
  if (minus.length) L.push('🚪 wyszli: ' + minus.map(w => helperName_(s, st, w)).join(', '));
  // wyjątek (bramka odrzuciła albo nie odpowiedziała) — punkt odniesienia zostaje; przy braku odpowiedzi wiadomość mogła dojść
  // i następnego dnia pójdzie jeszcze raz (lepiej dwa razy niż wcale)
  const sent = helperSend_(s, st, L.join('\n'), run, 'members');
  if (sent) st.members = now;
  return sent;
}

/* ---------- pytania w prywatnym czacie ---------- */

const HELPER_HELP = 'Napisz jedno słowo: *jutro* · *dziś* · *pojutrze* · dzień tygodnia (*sobota*) · data (*31.10*) · *tydzień* · '
  + '*miniony* · *nieaktywni* · *ludzie* · *stan* · *kto 17* (karta kontaktu osoby #17). '
  + 'Udostępnij mi kontakt z telefonu — odpiszę, kto to na liście członków.';

/** „kto 17", „kto #17", „#17", „17" → 17 (numer osoby); inaczej 0. */
function helperWho_(text) {
  const m = volNorm_(String(text || '')).trim().match(/^(?:kto(?:\s+to)?\s*)?#?\s*(\d{1,5})\s*[?!.]*$/);
  return m ? posInt_(m[1]) : 0;
}

/** Odpowiedź na kontakty udostępnione botowi: kto to na liście — numer osoby, imię u bota, klasa. Bez numerów telefonów. */
function helperCardsText_(s, st, cards) {
  const list = st.roster ? st.roster.list : [];
  return '*Udostępnione kontakty*\n' + cards.map(c => {
    const who = c.n || 'kontakt';
    if (!c.w) return '📇 ' + who + ' — w karcie nie ma numeru WhatsAppa';
    const id = c.w + '@c.us', nr = helperNr_(st, id);
    if (!nr) return '📇 ' + who + ' — nie znam tej osoby (nie ma jej na liście członków ani w „Grafiku")';
    const name = helperNameOnly_(s, st, id), role = helperRoleOf_(st, id), same = helperSame_(st, id);
    const listed = list.some(x => same.indexOf(x[0]) >= 0);
    return '📇 ' + who + ' = *#' + nr + '*' + (name && name !== who ? ' („' + name + '")' : '')
      + (role ? ' · ' + HELPER_ROLE_LABEL[role] : '') + (listed ? '' : ' · spoza listy członków');
  }).join('\n');
}

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
  const rows = Object.keys(ids).map(w => ({ n: helperName_(s, st, w), nr: helperNr_(st, w), k: st.polls.filter(p => p.v[w]).length }))
    .sort((a, b) => a.n.localeCompare(b.n, 'pl'));
  return '*Znane osoby* (' + rows.length + ')\n'
    + rows.map(r => r.n + (r.nr && r.n !== '#' + r.nr ? ' (#' + r.nr + ')' : '') + ' — ankiety: ' + r.k).join('\n')
    + '\nImiona dla osób bez nazwy: panel → „Imiona" („#17 = Ania"); *kto 17* — karta kontaktu.';
}

function helperStatusText_(s, st) {
  const x = st.stat;
  const g = st.gate;
  return '*Pomocnik — stan*\n'
    + 'bramka: ' + (!g ? 'jeszcze nie sprawdzona' : g.ok ? 'powiadomienia włączone (od ' + helperWhen_(g.from) + ')'
      : 'wyłączone — ' + g.missing.join(', ')) + '\n'
    + 'ostatni przebieg: ' + (x ? helperDate_(x.at).slice(5).split('-').reverse().join('.') + ' ' + helperTime_(x.at) + ', powiadomień ' + x.events + ' (Grafik ' + x.grafik + ')' : '—') + '\n'
    + 'ankiety: ' + (st.polls.map(p => '„' + p.q + '" — ' + Object.keys(p.v).length + ' głosujących' + (p.partial ? ' (niepełna)' : '')).join('; ') || '—') + '\n'
    + 'osoby: ' + Object.keys(st.people).length
    + ' · skład grupy: ' + (st.members ? st.members.ids.length : '—');
}

/* ---------- członkowie (panel) ---------- */

/**
 * „Pobierz członków" (PIN): skład grupy `chatId` z bramki (getGroupData; domyślnie „Grafik" z ustawień — dla całej
 * społeczności jej grupa ogłoszeń) z imionami: kontakty telefonu bota (getContacts: nazwa kontaktu, inaczej nazwa
 * z WhatsAppa), wiadomości z „Grafiku"; imiona z panelu („Imiona") dochodzą przy pokazywaniu. Kontakt z drugim adresem
 * (`newChatId` — konto @lid) wiąże oba adresy: karta kontaktu działa wtedy także dla osoby, którą grupa podaje jako @lid.
 * Zapisany skład (`helperRoster`) panel pokazuje do kolejnego pobrania, klasy (`helperRoles`) i numery osób (`helperIds`)
 * zostają przy osobie także wtedy, gdy wypadnie z listy. Numery nadaje pod tą samą blokadą co zapis listy.
 */
function getHelperMembers(pin, chatId) {
  requirePin_(pin);
  const s = helperSettings_();
  const group = String(chatId || s.chatId || '').trim();
  if (!HELPER_GROUP.test(group)) throw new Error('Wybierz grupę z listy („Pobierz grupy")');
  const g = greenCall_('getGroupData', { groupId: group });
  const ids = (g && Array.isArray(g.participants) ? g.participants : []).map(p => String(p && p.id || '')).filter(Boolean);
  if (!ids.length) throw new Error('Bramka nie podała składu tej grupy (bot musi do niej należeć)');
  const known = {}, cusOf = {};
  try {
    const contacts = greenCall_('getContacts');
    (Array.isArray(contacts) ? contacts : []).forEach(c => {
      if (!c || c.type === 'group' || !c.id) return;
      const id = String(c.id), name = helperShort_(c.contactName || c.name || '');
      known[id] = name;
      if (c.newChatId && HELPER_PRIVATE.test(id)) { cusOf[String(c.newChatId)] = id; if (name) known[String(c.newChatId)] = known[String(c.newChatId)] || name; }
    });
  } catch (e) { /* bez imion z kontaktów — zostają wiadomości i panel */ }
  const st = helperLoad_();
  const nameOf = id => known[id] || (st.people[id] && st.people[id].n) || '';
  const list = ids.slice(0, HELPER_LIMITS.ROSTER).map(id => {
    const link = HELPER_PRIVATE.test(id) ? '' : cusOf[id] || '';
    return link ? [id, nameOf(id).slice(0, 30), link] : [id, nameOf(id).slice(0, 30)];
  });
  const roster = { at: Date.now(), chatId: group, chatName: clean_(String(g.subject || (group === s.chatId ? s.chatName : '') || ''), 60), list };
  let json = JSON.stringify(roster);
  while (diagBytes_(json) > HELPER_BYTES && roster.list.length > 1) { roster.list.pop(); json = JSON.stringify(roster); }
  withLock_(() => {
    setProp_(PROP_HELPER_ROSTER, json);
    st.roster = roster;
    st.links = helperLinks_(roster.list);
    helperNrsAdd_(st, roster.list.map(x => x[0]));
  });
  return helperRosterPanel_(helperLoad_(), s);
}

/**
 * Klasa osoby z panelu (PIN): `role` 'p' fioletowy, 'o' pomarańczowy, 'k' kandydat, '' — bez klasy. Osoba po numerze osoby
 * (17 albo „#17") z listy członków — numer telefonu nie przychodzi z przeglądarki. Idempotentne — w RETRIABLE.
 */
function setHelperRole(nr, role, pin) {
  requirePin_(pin);
  const r = String(role == null ? '' : role);
  if (r && HELPER_ROLES.indexOf(r) < 0) throw new Error('Nieznana klasa');
  const n = posInt_(String(nr == null ? '' : nr).replace(/^\s*#/, ''));
  return withLock_(() => {
    const st = helperLoad_();
    const id = n ? helperByNr_(st, n) : '';
    const same = id ? helperSame_(st, id) : [];
    const hit = (st.roster ? st.roster.list : []).filter(x => same.indexOf(x[0]) >= 0)[0];
    if (!hit) throw new Error('Tej osoby nie ma na liście — pobierz członków jeszcze raz');
    const roles = st.roles;
    helperSame_(st, hit[0]).forEach(x => { delete roles[x]; });
    if (r) roles[hit[0]] = r;
    setProp_(PROP_HELPER_ROLES, JSON.stringify(roles));
    return { nr: n, role: r };
  });
}

/**
 * „📲" przy osobie (PIN): karta kontaktu osoby #nr na WhatsAppa właściciela (helperSendCard_). Numer telefonu nie wraca
 * do przeglądarki — w odpowiedzi tylko numer osoby. Nie w RETRIABLE (dwa wywołania = dwie karty); jeden przebieg naraz.
 */
function sendHelperContact(nr, pin) {
  requirePin_(pin);
  const n = posInt_(String(nr == null ? '' : nr).replace(/^\s*#/, ''));
  if (!n) throw new Error('Nieprawidłowy numer osoby');
  const s = helperSettings_();
  if (!s.toId) throw new Error('Najpierw wybierz i zapisz kontakt');
  if (!greenApi_()) throw new Error(GREEN_MISSING);
  if (!helperClaim_()) throw new Error('Pomocnik właśnie pracuje — spróbuj za kilka minut');
  let why = '';
  try {
    const st = helperLoad_();
    try { why = helperSendCard_(s, st, n); }
    finally { helperSave_(st); }
  } finally {
    helperRelease_();
  }
  if (why) throw new Error(why);
  return { nr: n };
}

/**
 * Lista członków do panelu: numer osoby, imię ('' — bez imienia), klasa, czy jest w „Grafiku", czy da się wysłać kartę
 * kontaktu (`card` — znany numer telefonu); liczniki klas. Najpierw osoby z imieniem, po imieniu; bez imienia — po numerze.
 */
function helperRosterPanel_(st, s) {
  const r = st.roster;
  if (!r) return null;
  const inGrafik = st.members && r.chatId !== s.chatId ? st.members.ids : null;
  const list = r.list.map(x => ({ nr: helperNr_(st, x[0]), name: helperNameOnly_(s, st, x[0]), role: helperRoleOf_(st, x[0]),
                                  grafik: inGrafik ? helperSame_(st, x[0]).some(y => inGrafik.indexOf(y) >= 0) : null,
                                  card: !!helperPhoneOf_(st, x[0]) }))
    .sort((a, b) => (!a.name - !b.name) || (a.name && b.name ? a.name.localeCompare(b.name, 'pl') : 0) || a.nr - b.nr);
  const counts = { all: list.length, none: 0, p: 0, o: 0, k: 0 };
  list.forEach(x => { counts[x.role || 'none']++; });
  return { at: r.at, chatId: r.chatId, chatName: r.chatName || '', grafikList: r.chatId === s.chatId, list, counts };
}

/* ---------- panel ---------- */

/**
 * Jeden aktywny (panel): na teście — sygnał z produkcji {until, at, waits}; na produkcji — ostatni sygnał wysłany do testu
 * {at, on, ok, err}. null — jeszcze żadnego.
 */
function helperLeasePanel_() {
  if (env_() === 'prod') {
    const x = helperJson_(PROP_HELPER_LEASE_SENT, null);
    return x && typeof x === 'object' ? { at: Number(x.at) || 0, on: !!x.on, ok: !!x.ok, err: String(x.err || '').slice(0, 100) } : null;
  }
  const l = helperLease_();
  return l ? { at: Number(l.at) || 0, until: Number(l.until) || 0, waits: helperWaits_() } : null;
}

/** Panel (bez pytania bramki): ustawienia, stan przebiegów, ankiety, dziennik, członkowie, sygnał. Bez numerów telefonów. */
function helperPanel_() {
  const st = helperLoad_(), s = helperSettings_();
  // kontakt jako klucz i nazwa — adres prywatnego czatu to numer telefonu (contactKey_, Poll.gs)
  const pub = Object.assign({}, s, { toKey: contactKey_(s.toId) });
  delete pub.toId;
  return {
    settings: pub, configured: !!greenApi_(), env: env_() === 'prod' ? 'prod' : 'test', lease: helperLeasePanel_(),
    trigger: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'helperTick'),
    stat: st.stat, log: st.log.slice(-HELPER_LIMITS.PANEL_LOG).reverse(),
    gate: st.gate ? { ok: !!st.gate.ok, at: st.gate.at, from: st.gate.from || 0,
                      missing: HELPER_GATE.filter(x => (st.gate.missing || []).indexOf(x.key) >= 0).map(x => x.label) } : null,
    polls: st.polls.slice().reverse().map(p => ({ q: p.q, at: p.t, voters: Object.keys(p.v).length, partial: !!p.partial, wrong: !!p.wrong,
      days: p.days.map((o, i) => o.d && !o.x && !o.no ? helperShortLabel_(o.d) + (o.p ? (o.p === 'r' ? ' rano' : ' wiecz.') : '') + ' '
        + Object.keys(p.v).filter(w => p.v[w].indexOf(i) >= 0).length : '').filter(Boolean).join(' · ') })),
    people: Object.keys(st.people).length,
    members: st.members ? st.members.ids.length : null,
    roster: helperRosterPanel_(st, s),
  };
}

/**
 * „Sprawdź teraz" (PIN): przebieg od razu — kolejka i wiadomości, które właśnie wypadają. Nie w RETRIABLE.
 * Na teście, gdy pracuje pomocnik produkcji — odmowa: przebieg zjadłby mu powiadomienia z kolejki (jeden aktywny).
 */
function helperRunNow(pin) {
  requirePin_(pin);
  const s = helperSettings_();
  if (!s.chatId || !s.toId) throw new Error('Najpierw wybierz i zapisz grupę i kontakt');
  if (!greenApi_()) throw new Error(GREEN_MISSING);
  if (helperWaits_()) throw new Error('Pracuje pomocnik produkcji (sygnał ' + helperWhen_(helperLease_().at) + ') — ten czeka. '
    + 'Żeby sprawdzić go tutaj, wyłącz pomocnika w Panelu produkcji.');
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

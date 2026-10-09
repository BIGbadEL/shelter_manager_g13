/**
 * G13 Spacery — ANKIETA TYGODNIOWA NA WHATSAPPIE (1.2).
 *
 * Raz w tygodniu, w ustawionym dniu i godzinie, w wybranej grupie (np. „Grafik" w społeczności G13)
 * wychodzi ankieta „Grafik [TYDZIEŃ]" z dniami tygodnia — to, co prowadzący robił dotąd ręcznie.
 *
 * Wysyła ją bramka Green API: osobny numer WhatsApp (konto bota) połączony z nią kodem QR jako
 * „połączone urządzenie". To droga NIEOFICJALNA — oficjalne API Meta ankiet do zwykłych grup nie
 * wysyła — a regulamin WhatsAppa zabrania automatyzacji konta: numer może zostać zablokowany
 * (decyzja właściciela z 2026-10-05: osobny numer, ryzyko przyjęte). Bot musi być członkiem
 * wybranej grupy; do grupy nadrzędnej społeczności i do „Ogłoszeń" bramka nie wyśle.
 *
 * Dostęp do bramki (greenApiUrl, greenApiInstance, greenApiToken) siedzi we właściwościach skryptu,
 * ustawianych ręcznie jak PIN. Token daje pełny dostęp do konta bota: nigdy w kodzie, w getData,
 * w odpowiedzi do przeglądarki ani w komunikacie błędu (greenCall_ go wycina).
 *
 * Każda ankieta (grupa + tydzień) idzie najwyżej raz (PROP_POLL_SENT): wyzwalacz, „Wyślij teraz"
 * i publiczne sendWeeklyPoll się nie dublują. Wywołanie bramki NIE trzyma blokady — potrafi trwać
 * do minuty, a pod blokadą stałyby wtedy wszystkie rezerwacje (blokada czeka 20 s). Dlatego dwa kroki:
 * pod blokadą znacznik „w toku", bez blokady wysyłka, pod blokadą wynik (sendPoll_).
 * Bramka, która nie odpowiedziała, mogła ankietę wysłać: wynik „nie wiadomo" (znacznik zostaje,
 * wyzwalacz nie ponawia, „Wyślij teraz" — po potwierdzeniu prowadzącej). Druga ankieta w grupie
 * rozbiłaby głosy (review PR #5, runda 2). Stan konta bota panel bierze osobno (getPollState).
 */

/* ---------- tydzień ankiety ---------- */

/** Dzień tygodnia daty 'yyyy-MM-dd': 0 = niedziela … 6 = sobota (arytmetyka kalendarza, bez strefy). */
function weekdayOf_(iso) {
  const p = String(iso).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

/**
 * Poniedziałek tygodnia, na który idzie ankieta wysłana dnia `iso`: najbliższy, dziś włącznie.
 * Niedziela → jutro (zrzut z 27.09: „Grafik 28.09-04.10"), poniedziałek → ten sam tydzień,
 * środa → następny.
 */
function pollMonday_(iso) {
  return addDays_(iso, (8 - weekdayOf_(iso)) % 7);
}

/** [TYDZIEŃ] jak w ręcznych ankietach: „05-11.10" w jednym miesiącu, „28.09-04.10" na przełomie. */
function pollWeekLabel_(monday) {
  const a = String(monday).split('-'), b = addDays_(monday, 6).split('-');
  return a[1] === b[1] ? a[2] + '-' + b[2] + '.' + b[1] : a[2] + '.' + a[1] + '-' + b[2] + '.' + b[1];
}

function pollQuestion_(s, monday) {
  return String(s.question).split('[TYDZIEŃ]').join(pollWeekLabel_(monday));
}

/* ---------- ustawienia ---------- */

/** Zapisane ustawienia ankiety (zawsze kompletne — braki z DEFAULT_POLL). */
function pollSettings_() {
  let s = {};
  try { s = JSON.parse(prop_(PROP_POLL) || '{}') || {}; } catch (e) { s = {}; }
  return Object.assign({}, DEFAULT_POLL, s);
}

/**
 * Ustawienia z panelu — sprawdzone i znormalizowane, albo błąd z komunikatem dla prowadzącej.
 * Te same reguły sprawdza przeglądarka przed wysłaniem (pollProblem w Script.html).
 */
function pollValid_(o) {
  o = o || {};
  const question = String(o.question == null ? '' : o.question).replace(/[\r\n]+/g, ' ').trim();
  if (!question) throw new Error('Wpisz pytanie ankiety');
  if (question.length > POLL_LIMITS.QUESTION) throw new Error('Pytanie jest za długie — najwyżej ' + POLL_LIMITS.QUESTION + ' znaków');
  const options = [], seen = {};
  (Array.isArray(o.options) ? o.options : []).forEach(x => {
    const t = String(x == null ? '' : x).replace(/[\r\n]+/g, ' ').trim();
    if (!t) return;
    if (t.length > POLL_LIMITS.OPTION) throw new Error('Odpowiedź „' + t.slice(0, 20) + '…" jest za długa — najwyżej ' + POLL_LIMITS.OPTION + ' znaków');
    const k = t.toLowerCase();
    if (seen[k]) throw new Error('Odpowiedź „' + t + '" jest dwa razy');
    seen[k] = true;
    options.push(t);
  });
  if (options.length < POLL_LIMITS.OPTIONS_MIN) throw new Error('Ankieta potrzebuje co najmniej ' + POLL_LIMITS.OPTIONS_MIN + ' odpowiedzi');
  if (options.length > POLL_LIMITS.OPTIONS_MAX) throw new Error('Najwyżej ' + POLL_LIMITS.OPTIONS_MAX + ' odpowiedzi — tyle przyjmuje WhatsApp');
  const day = Number(o.day), hour = Number(o.hour);
  if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('Nieprawidłowy dzień tygodnia');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Godzina musi być z zakresu 0–23');
  const chatId = String(o.chatId == null ? '' : o.chatId).trim();
  if (chatId && !/^\d+(-\d+)?@g\.us$/.test(chatId)) throw new Error('Ankieta idzie tylko do grupy — wybierz ją z listy');
  return { question, options, multi: !!o.multi, day, hour, enabled: !!o.enabled,
           chatId, chatName: chatId ? clean_(o.chatName, 100) : '' };
}

/** Wyzwalacz ankiety: co tydzień w dniu `day` między hour:00 a hour:30 (nearMinute 15 ± 15). */
function installPollTrigger_(s) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendWeeklyPoll')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (!s.enabled || !s.chatId) return;
  const days = [ScriptApp.WeekDay.SUNDAY, ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY,
                ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY];
  ScriptApp.newTrigger('sendWeeklyPoll')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(days[s.day])
    .atHour(s.hour)
    .nearMinute(15)
    .inTimezone(TIMEZONE)
    .create();
}

/**
 * Zapis ustawień ankiety z panelu (PIN) i przełożenie wyzwalacza. Włączenie wymaga grupy i bramki.
 * Idempotentne — te same ustawienia dwa razy dają ten sam wyzwalacz (RETRIABLE).
 */
function setPollSettings(settings, pin) {
  requirePin_(pin);
  const s = pollValid_(settings);
  if (s.enabled && !s.chatId) throw new Error('Wybierz grupę, zanim włączysz wysyłanie');
  if (s.enabled && !greenApi_()) throw new Error(GREEN_MISSING);
  withLock_(() => {
    setProp_(PROP_POLL, JSON.stringify(s));
    installPollTrigger_(s);
  });
  return pollPanel_();
}

/* ---------- bramka WhatsAppa (Green API) ---------- */

const GREEN_MISSING = 'Bramka WhatsAppa nie jest ustawiona — we właściwościach skryptu dodaj greenApiUrl, greenApiInstance i greenApiToken';
const GREEN_SCOPE = 'https://www.googleapis.com/auth/script.external_request';
const GREEN_CONSENT = 'Brak zgody na połączenie z bramką — w edytorze tego projektu uruchom authorizeWhatsApp() i zatwierdź';

/**
 * Z edytora, raz po wdrożeniu 1.2 (na teście i na produkcji): zgoda właściciela na połączenie
 * z bramką WhatsAppa (UrlFetchApp). Od 2025 edytor pyta tylko o uprawnienia, których wykonanie
 * faktycznie potrzebuje — installTriggers() czy sendWeeklyPoll() z wyłączoną ankietą z bramką się
 * nie łączą, więc o tę zgodę nie pytały (sprawdzone na teście 2026-10-05). requireScopes kończy
 * wykonanie i pokazuje okno zgody; z nią — od razu sprawdza połączenie i wpisuje stan do dziennika.
 * Publiczna (edytor nie uruchamia funkcji z „_"); z przeglądarki nic nie zwraca ani nie zmienia.
 */
function authorizeWhatsApp() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [GREEN_SCOPE]);
  if (!greenApi_()) { console.log('Zgoda jest. ' + GREEN_MISSING + '.'); return; }
  const r = greenCall_('getStateInstance');
  const v = String(r && r.stateInstance || '');
  console.log('Zgoda jest. Konto WhatsApp bota: ' + (POLL_STATES[v] || v));
}

/** Dostęp do bramki z właściwości skryptu albo null. */
function greenApi_() {
  const url = String(prop_(PROP_GREEN_URL) || '').trim().replace(/\/+$/, '');
  const id = String(prop_(PROP_GREEN_ID) || '').trim();
  const token = String(prop_(PROP_GREEN_TOKEN) || '').trim();
  return url && id && token ? { url, id, token } : null;
}

/**
 * Wywołanie bramki: `method` (sendPoll, getContacts…), `body` — POST z JSON-em, bez niego GET,
 * `query` — dopisek do adresu. Token jest w samym adresie, więc żaden komunikat błędu (także błąd
 * sieci z UrlFetchApp, który potrafi zacytować adres) nie wychodzi z niego nietknięty.
 * Błąd bez odpowiedzi bramki (timeout, zerwane połączenie) ma `unknown = true`: żądanie mogło
 * dojść i zostać wykonane — dla wysyłki to „nie wiadomo", nie „nie wyszła" (review PR #5, runda 2).
 */
function greenCall_(method, body, query) {
  const g = greenApi_();
  if (!g) throw new Error(GREEN_MISSING);
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(g.url)) throw new Error('greenApiUrl musi być adresem https://… z konsoli Green API');
  if (!/^\d+$/.test(g.id)) throw new Error('greenApiInstance to sam numer instancji (idInstance)');
  const hide = s => String(s).split(g.token).join('…');
  const opts = { method: body ? 'post' : 'get', muteHttpExceptions: true };
  if (body) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  let res;
  try {
    res = UrlFetchApp.fetch(g.url + '/waInstance' + g.id + '/' + method + '/' + encodeURIComponent(g.token) + (query || ''), opts);
  } catch (e) {
    const m = String(e && e.message || e);
    // brak zgody właściciela na UrlFetchApp (po wdrożeniu 1.2) — po ludzku, co zrobić, zamiast komunikatu Google
    if (/script\.external_request|UrlFetchApp\.fetch/.test(m)) throw new Error(GREEN_CONSENT);   // nic nie wyszło
    const err = new Error('Bramka WhatsAppa nie odpowiada: ' + hide(m));
    err.unknown = true;
    throw err;
  }
  const code = res.getResponseCode(), text = String(res.getContentText() || '');
  if (code !== 200) {
    const err = new Error('Bramka WhatsAppa: błąd ' + code + (text ? ' (' + hide(text).slice(0, 150) + ')' : ''));
    // 5xx (502, 504…) daje zwykle pośrednik, za którym bramka nie zdążyła odpowiedzieć — żądanie mogło
    // dojść i ankieta wyjść, więc „nie wiadomo" jak przy braku odpowiedzi (review PR #5, runda 3).
    // 4xx to pewna odmowa: nic nie wyszło.
    if (code >= 500) err.unknown = true;
    throw err;
  }
  try { return JSON.parse(text); } catch (e) { throw new Error('Bramka WhatsAppa: nieczytelna odpowiedź'); }
}

/**
 * Grupy, w których jest konto bota — do wyboru w panelu (PIN). Grupa w społeczności to zwykła grupa
 * (…@g.us); bot musi być jej członkiem. Grupa nadrzędna społeczności i „Ogłoszenia" też bywają
 * na liście, ale tam bramka nie wyśle — prowadząca wybiera konkretną grupę.
 * Społeczność i jej ogłoszenia mają w WhatsAppie tę samą nazwę (zgłoszenie z panelu 1.3: „G13, G13,
 * Grafik") — powtórzone nazwy dostają dopisek z getGroupData (chatNote_), a gdy bramka nic nie powie,
 * kolejny numer: na liście nie ma dwóch takich samych pozycji.
 */
const CHAT_NOTE_MAX = 6;                          // najwyżej tyle dodatkowych pytań bramki na jedno „Pobierz grupy"
function getPollChats(pin) {
  requirePin_(pin);
  const list = greenCall_('getContacts', null, '?group=true');
  const chats = (Array.isArray(list) ? list : [])
    .filter(c => c && c.type === 'group' && /^\d+(-\d+)?@g\.us$/.test(String(c.id)))
    .map(c => ({ id: String(c.id), name: String(c.name || c.contactName || c.id).slice(0, 100) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const count = {};
  chats.forEach(c => { count[c.name] = (count[c.name] || 0) + 1; });
  let asked = 0;
  chats.forEach(c => {
    if (count[c.name] < 2 || asked >= CHAT_NOTE_MAX) return;
    asked++;
    let note = '';
    try { note = chatNote_(greenCall_('getGroupData', { groupId: c.id })); } catch (e) { note = ''; }
    if (note) c.name += ' (' + note + ')';
  });
  const left = {}, seen = {};                       // dopisek nie rozróżnił — numer: „G13 #1", „G13 #2"
  chats.forEach(c => { left[c.name] = (left[c.name] || 0) + 1; });
  chats.forEach(c => {
    const k = c.name;
    if (left[k] < 2) return;
    seen[k] = (seen[k] || 0) + 1;
    c.name = k + ' #' + seen[k];
  });
  return chats;
}

/**
 * Dopisek do grupy o powtórzonej nazwie, z getGroupData. isCommunity / isCommunityAnnounce bramka podaje
 * tylko administratorom społeczności; allowParticipantsSendMessages === false = piszą tylko admini
 * (tak wyglądają ogłoszenia). Bez żadnej z tych wskazówek — liczba osób.
 */
function chatNote_(g) {
  if (!g || typeof g !== 'object') return '';
  if (g.isCommunity) return 'cała społeczność — tu bot nie wyśle';
  if (g.isCommunityAnnounce) return 'ogłoszenia — piszą tylko administratorzy';
  if (g.allowParticipantsSendMessages === false) return 'piszą tylko administratorzy';
  const n = Number(g.size) || (Array.isArray(g.participants) ? g.participants.length : 0);
  return n > 0 ? n + ' os.' : '';
}

/* ---------- wysyłka ---------- */

/** Świeży odczyt znaczników wysłanych ankiet — pod blokadą (pamięć wykonania mogła się zestarzeć). */
function pollSent_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(PROP_POLL_SENT);
    const m = raw ? JSON.parse(raw) : {};
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) {
    return {};
  }
}
function savePollSent_(m) {
  const keys = Object.keys(m);                       // klucze zaczynają się cyframi, ale zawierają „|" — kolejność dopisywania
  keys.slice(0, Math.max(0, keys.length - 20)).forEach(k => { delete m[k]; });
  setProp_(PROP_POLL_SENT, JSON.stringify(m));
}

function stamp_() { return today_() + ' ' + now_(); }

/** Znacznik „w toku" starszy niż tyle minut = wysyłka przerwana (wykonanie ubite) — wynik nieznany. */
const POLL_PENDING_MIN = 5;

/**
 * Stan ankiety (grupa + tydzień) ze znacznika: 'sent' — poszła, 'pending' — właśnie się wysyła,
 * 'unknown' — nie wiadomo, czy wyszła (bramka nie odpowiedziała albo wysyłka urwała się w połowie),
 * '' — nie było próby. Przy 'unknown' ankieta MOGŁA dojść: wyzwalacz jej nie ponawia, a „Wyślij
 * teraz" tylko po potwierdzeniu prowadzącej, że w grupie jej nie ma (druga ankieta rozbiłaby głosy).
 */
function pollMarkState_(m) {
  if (!m) return '';
  if (m.unknown) return 'unknown';
  if (m.pending) return Date.now() - (m.t || 0) > POLL_PENDING_MIN * 60000 ? 'unknown' : 'pending';
  return 'sent';
}

/**
 * Wysyła ankietę na tydzień od `monday` do grupy z ustawień — najwyżej raz (grupa + tydzień).
 * `manual` — „Wyślij teraz" z panelu: ankieta już wysłana albo w drodze to błąd z komunikatem
 * (wyzwalacz po cichu nic nie robi). `force` — „Wyślij teraz" po potwierdzeniu prowadzącej przy
 * wyniku nieznanym (pollMarkState_); niczego innego nie przełamuje. Zwraca {week, question, at}
 * albo null (wyzwalacz, ankieta już poszła, idzie albo nie wiadomo).
 * Wynik zostaje w PROP_POLL_LAST do panelu: wysłana / nie wyszła (błąd bramki z kodem, brak zgody —
 * znacznik zdjęty, można ponowić) / nie wiadomo (bramka nie odpowiedziała — znacznik zostaje).
 * Błąd idzie dalej (wyzwalacz, który rzuca, Google zgłasza mailem właścicielowi skryptu).
 */
function sendPoll_(s, monday, manual, force) {
  const key = s.chatId + '|' + monday;
  const question = pollQuestion_(s, monday);
  const busy = withLock_(() => {
    const sent = pollSent_(), m = sent[key], st = pollMarkState_(m);
    if (st === 'sent') return 'Ankieta na ten tydzień już poszła do tej grupy (' + m.at + ')';
    if (st === 'pending') return 'Ankieta na ten tydzień właśnie się wysyła (od ' + m.at + ')';
    if (st === 'unknown' && !(manual && force)) return 'Nie wiadomo, czy ankieta na ten tydzień wyszła (próba ' + m.at
      + ') — sprawdź w grupie; jeśli jej tam nie ma, „Wyślij teraz" zapyta, czy wysłać mimo to';
    sent[key] = { at: stamp_(), t: Date.now(), pending: true };
    savePollSent_(sent);
    return '';
  });
  if (busy) {
    if (manual) throw new Error(busy);
    return null;
  }
  const last = { at: stamp_(), week: monday, question, chatName: s.chatName, manual: !!manual };
  let err = null;
  try {
    const res = greenCall_('sendPoll', { chatId: s.chatId, message: question,
                                         options: s.options.map(o => ({ optionName: o })), multipleAnswers: !!s.multi });
    if (!res || !res.idMessage) throw new Error('Bramka WhatsAppa nie potwierdziła wysłania');
  } catch (e) {
    err = e;
  }
  const unknown = !!(err && err.unknown);
  withLock_(() => {
    const sent = pollSent_();
    if (!err) sent[key] = { at: last.at };
    else if (unknown) sent[key] = { at: last.at, t: Date.now(), unknown: true };
    else delete sent[key];
    savePollSent_(sent);
    setProp_(PROP_POLL_LAST, JSON.stringify(Object.assign(last, !err ? { ok: true }
      : { ok: false, unknown, msg: String(err.message || err) })));
  });
  if (err) throw err;
  return { week: monday, question, at: last.at };
}

/**
 * Termin ankiety, który właśnie trwa: dzień `s.day` (dziś albo — tuż po północy — wczoraj), od
 * `s.hour`:00 do POLL_WINDOW_H godzin później. null = teraz nie ma czego wysyłać.
 */
function pollDueDay_(s) {
  const today = today_(), hour = Number(Utilities.formatDate(new Date(), tz_(), 'H'));
  for (let back = 0; back <= 1; back++) {
    const day = addDays_(today, -back);
    const since = back * 24 + hour - s.hour;
    if (weekdayOf_(day) === s.day && since >= 0 && since < POLL_WINDOW_H) return day;
  }
  return null;
}

/**
 * Wyzwalacz tygodniowy. Publiczna, bo wyzwalacz nie woła funkcji z „_" — a więc dostępna też
 * z przeglądarki przez google.script.run. Dlatego niczego nie przyjmuje i sama pilnuje, że wysyła
 * tylko w swoim terminie i tylko raz: wywołana z zewnątrz najwyżej wyprzedzi wyzwalacz o kilka minut.
 */
function sendWeeklyPoll() {
  const s = pollSettings_();
  if (!s.enabled || !s.chatId) return null;
  const day = pollDueDay_(s);
  if (!day) return null;
  return sendPoll_(s, pollMonday_(day), false);
}

/**
 * „Wyślij teraz" z panelu (PIN): ankieta na najbliższy tydzień (dziś włącznie), do grupy z zapisanych
 * ustawień. `force` = prowadząca sprawdziła w grupie, że ankiety z próby o nieznanym wyniku tam nie ma.
 */
function sendPollNow(pin, force) {
  requirePin_(pin);
  const s = pollSettings_();
  if (!s.chatId) throw new Error('Wybierz i zapisz grupę, zanim wyślesz ankietę');
  const sent = sendPoll_(s, pollMonday_(today_()), true, force === true);
  return { sent, panel: pollPanel_() };
}

/* ---------- panel ---------- */

const POLL_STATES = {
  authorized: 'połączone',
  notAuthorized: 'niepołączone — zeskanuj kod QR w konsoli Green API (WhatsApp → Połączone urządzenia)',
  sleepMode: 'telefon bota wyłączony albo bez internetu',
  starting: 'uruchamia się — sprawdź za kilka minut',
  blocked: 'ZABLOKOWANE przez WhatsAppa',
  suspended: 'czasowo ograniczone przez WhatsAppa',
  yellowCard: 'czasowo ograniczone przez WhatsAppa',
};

/** Następna ankieta z wyzwalacza: dzień 'yyyy-MM-dd' (dziś, jeśli godzina jeszcze nie minęła). */
function pollNextDay_(s) {
  const today = today_(), hour = Number(Utilities.formatDate(new Date(), tz_(), 'H'));
  for (let k = 0; k < 8; k++) {
    const d = addDays_(today, k);
    if (weekdayOf_(d) === s.day && (k > 0 || hour < s.hour)) return d;
  }
  return addDays_(today, 7);
}

/**
 * Wszystko, co panel pokazuje o ankiecie — bez tokenu i BEZ pytania bramki: idzie w getDiagnostics,
 * a bramka potrafi odpowiadać do minuty — cały „Stan serwera" czekałby na nią (review PR #5, runda 2).
 * Stan konta bota przeglądarka bierze osobno (getPollState). `now.status` — stan ankiety na
 * najbliższy tydzień w zapisanej grupie (pollMarkState_), `now.at` — kiedy była próba.
 */
function pollPanel_() {
  const s = pollSettings_();
  let last = null;
  try { last = JSON.parse(prop_(PROP_POLL_LAST) || 'null'); } catch (e) { last = null; }
  let sent = {};
  try { sent = JSON.parse(prop_(PROP_POLL_SENT) || '{}') || {}; } catch (e) { sent = {}; }
  const next = pollNextDay_(s), now = pollMonday_(today_());
  const mark = s.chatId ? sent[s.chatId + '|' + now] : null;
  return {
    settings: s, configured: !!greenApi_(), state: null, last,
    next: { day: next, label: pollWeekLabel_(pollMonday_(next)) },
    now: { label: pollWeekLabel_(now), question: pollQuestion_(s, now), status: pollMarkState_(mark), at: mark ? mark.at : '' },
  };
}

/**
 * Stan konta bota z bramki (PIN) — osobno od panelu, żeby panel nie czekał na bramkę. Błąd bramki
 * to też stan ('error' z powodem), nie wyjątek: w panelu ma stać, co jest nie tak.
 */
function getPollState(pin) {
  requirePin_(pin);
  if (!greenApi_()) return { code: 'missing', text: GREEN_MISSING };
  try {
    const r = greenCall_('getStateInstance');
    const v = String(r && r.stateInstance || '');
    return { code: v, text: POLL_STATES[v] || ('nieznany stan: ' + v) };
  } catch (e) {
    const m = String(e.message || e);
    return { code: 'error', text: m === GREEN_CONSENT ? m : 'nie udało się sprawdzić (' + m + ')' };
  }
}

/* ---------- lista dnia do prowadzącej (1.3) ----------
   Po nocnym czyszczeniu bot wysyła prowadzącej na WhatsAppie listę każdego domkniętego dnia ze
   spacerami — dokładnie tę treść, którą w minionym dniu kopiuje „📋 Skopiuj treść" (szablon maila
   z panelu z [DATA] i [LISTA]; dayReportText_ = mailText w Script.html, S139 pilnuje obu). Prowadząca
   przesyła ją dalej do schroniska. Decyzje właściciela (2026-10-09): numer z kontaktów telefonu bota
   (wybór w panelu), dzień bez spacerów — nic, każdy dzień najwyżej raz, czyszczenie nigdy nie czeka
   na bota ani przez niego nie pada, wynik w panelu, włącznik w panelu. */

const DAY_REPORT_CHAT = /^\d{6,15}@c\.us$/;      // prywatny czat WhatsAppa: numer z kierunkowym + @c.us

/** Zapisane ustawienia: {enabled, chatId, chatName}; włączone tylko z kontaktem. */
function dayReportSettings_() {
  let s = null;
  try { s = JSON.parse(prop_(PROP_DAY_REPORT) || 'null'); } catch (e) { s = null; }
  s = s && typeof s === 'object' ? s : {};
  const chatId = DAY_REPORT_CHAT.test(String(s.chatId || '')) ? String(s.chatId) : '';
  return { enabled: !!s.enabled && !!chatId, chatId, chatName: chatId ? String(s.chatName || '').slice(0, 100) : '' };
}

/** Ustawienia z panelu (PIN). Idempotentne — w RETRIABLE. Reguły jak dayReportProblem w Script.html. */
function setDayReportSettings(settings, pin) {
  requirePin_(pin);
  const o = settings && typeof settings === 'object' ? settings : {};
  const chatId = String(o.chatId || '').trim();
  if (chatId && !DAY_REPORT_CHAT.test(chatId)) throw new Error('Nieprawidłowy kontakt — wybierz go z listy („Pobierz kontakty")');
  if (o.enabled && !chatId) throw new Error('Wybierz kontakt prowadzącej, zanim włączysz wysyłanie');
  const s = { enabled: !!o.enabled, chatId, chatName: chatId ? clean_(String(o.chatName || '').replace(/[\r\n]+/g, ' '), 100) : '' };
  withLock_(() => setProp_(PROP_DAY_REPORT, JSON.stringify(s)));
  return dayReportPanel_();
}

/**
 * Kontakty z telefonu bota — do wyboru prowadzącej w panelu (PIN). Tylko zapisane w kontaktach
 * (`contactName`): bez tego lista zawierałaby każdego, kto jest w społeczności. Numer do opisu pozycji.
 */
function getDayReportContacts(pin) {
  requirePin_(pin);
  const list = greenCall_('getContacts', null, '?group=false');
  return (Array.isArray(list) ? list : [])
    .filter(c => c && c.type === 'user' && DAY_REPORT_CHAT.test(String(c.id)) && String(c.contactName || '').trim())
    .map(c => ({ id: String(c.id), name: String(c.contactName).trim().slice(0, 100), phone: '+' + String(c.id).split('@')[0] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** '2026-10-08' -> '08.10.2026' — jak plDate w Script.html. */
function plDate_(iso) { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(iso); }
function csvCell_(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

/**
 * [LISTA] — CSV `data,pies,numer`, pies raz na dzień, po imieniu; pies bez imienia (etykieta „#numer")
 * z pustą kolumną „pies". Wpisy z readHistoryDays_ — z tego samego odczytu bierze je przeglądarka
 * (getHistoryDays), więc tekst jest ten sam co w „Skopiuj treść" (mailList w Script.html).
 */
function dayList_(date, entries) {
  const seen = {}, dogs = [];
  (entries || []).forEach(e => {
    const nr = String(e.ident == null ? '' : e.ident).trim(), k = e.name + '|' + nr;
    if (!seen[k]) { seen[k] = true; dogs.push({ name: String(e.name), nr }); }
  });
  dogs.sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.nr.localeCompare(b.nr, 'pl'));
  const pies = d => d.nr && d.name === '#' + d.nr ? '' : d.name;
  return ['data,pies,numer'].concat(dogs.map(d => [plDate_(date), pies(d), d.nr].map(csvCell_).join(','))).join('\n');
}
function dayReportText_(date, entries) {
  return mailTemplate_().split('[DATA]').join(plDate_(date)).split('[LISTA]').join(dayList_(date, entries));
}

/** Świeży odczyt znaczników wysłanych list — pod blokadą, jak pollSent_. */
function dayReportSent_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(PROP_DAY_REPORT_SENT);
    const m = raw ? JSON.parse(raw) : {};
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) {
    return {};
  }
}
function saveDayReportSent_(m) {
  const keys = Object.keys(m).sort();                // klucze to daty — najstarsze wypadają
  keys.slice(0, Math.max(0, keys.length - 31)).forEach(k => { delete m[k]; });
  setProp_(PROP_DAY_REPORT_SENT, JSON.stringify(m));
}

/**
 * Wysyła prowadzącej listę dnia `date` — najwyżej raz (dayReportSent), jak ankieta: znacznik „w toku"
 * pod blokadą → wysyłka BEZ blokady (bramka potrafi odpowiadać do minuty) → wynik pod blokadą
 * (wysłana / nie wyszła — znacznik zdjęty / nie wiadomo — znacznik zostaje; pollMarkState_).
 * `manual` — z panelu: każdy powód, dla którego nic nie poszło, to błąd z komunikatem; `force` —
 * prowadząca potwierdziła wysyłkę mimo „już poszła" albo „nie wiadomo" (prywatna wiadomość drugi raz
 * nikomu nie szkodzi). Zwraca {day, at} albo null.
 */
function sendDayReport_(date, manual, force) {
  const s = dayReportSettings_();
  if (!s.chatId) { if (manual) throw new Error('Najpierw wybierz i zapisz kontakt prowadzącej'); return null; }
  const entries = readHistoryDays_(date, date);
  if (!entries.length) { if (manual) throw new Error('Z ' + plDate_(date) + ' nie ma spacerów w Historii — nie ma czego wysłać'); return null; }
  const text = dayReportText_(date, entries);
  const busy = withLock_(() => {
    const sent = dayReportSent_(), m = sent[date], st = pollMarkState_(m);
    if (st === 'pending') return 'Lista z ' + plDate_(date) + ' właśnie się wysyła (od ' + m.at + ')';
    if (st === 'sent' && !(manual && force)) return 'Lista z ' + plDate_(date) + ' już poszła (' + m.at + ')';
    if (st === 'unknown' && !(manual && force)) return 'Nie wiadomo, czy lista z ' + plDate_(date) + ' wyszła (próba ' + m.at + ')';
    sent[date] = { at: stamp_(), t: Date.now(), pending: true };
    saveDayReportSent_(sent);
    return '';
  });
  if (busy) {
    if (manual) throw new Error(busy);
    return null;
  }
  const last = { day: date, at: stamp_(), chatName: s.chatName, manual: !!manual };
  let err = null;
  try {
    const res = greenCall_('sendMessage', { chatId: s.chatId, message: text });
    if (!res || !res.idMessage) throw new Error('Bramka WhatsAppa nie potwierdziła wysłania');
  } catch (e) {
    err = e;
  }
  const unknown = !!(err && err.unknown);
  withLock_(() => {
    const sent = dayReportSent_();
    if (!err) sent[date] = { at: last.at };
    else if (unknown) sent[date] = { at: last.at, t: Date.now(), unknown: true };
    else delete sent[date];
    saveDayReportSent_(sent);
    setProp_(PROP_DAY_REPORT_LAST, JSON.stringify(Object.assign(last, !err ? { ok: true }
      : { ok: false, unknown, msg: String(err.message || err) })));
  });
  if (err) throw err;
  return { day: date, at: last.at };
}

/**
 * Po nocnym czyszczeniu (endOfDay, już bez blokady): lista każdego domkniętego dnia ze spacerami,
 * po kolei. Nic stąd nie wychodzi na zewnątrz — czyszczenie jest już zrobione, a błąd bramki zostaje
 * w panelu (PROP_DAY_REPORT_LAST), skąd prowadząca wyśle listę jeszcze raz.
 */
function sendClosedDayReports_(days) {
  try {
    if (!days || !days.length || !dayReportSettings_().enabled) return;
    days.slice().sort().forEach(d => {
      try { sendDayReport_(d, false); } catch (e) { console.warn('Lista z ' + d + ' do prowadzącej nie wyszła: ' + (e && e.message || e)); }
    });
  } catch (e) {
    console.warn('Lista dnia do prowadzącej: ' + (e && e.message || e));
  }
}

/** Ostatni dzień w Historii (zamknięty) — o niego pyta „Wyślij listę" w panelu. '' = Historia pusta. */
function lastHistDay_() {
  const sh = ss_().getSheetByName(SHEETS.HIST);
  const last = sh ? sh.getLastRow() : 0;
  if (last < 2) return '';
  let max = '';
  sh.getRange(2, HIST.DATE, last - 1, 1).getValues().forEach(r => { const d = cellDate_(r[0]); if (isDate_(d) && d > max) max = d; });
  return max;
}

/** Panel: ustawienia, ostatnia próba i stan listy ostatniego dnia z Historii. Bez pytania bramki. */
function dayReportPanel_() {
  let last = null, sent = {};
  try { last = JSON.parse(prop_(PROP_DAY_REPORT_LAST) || 'null'); } catch (e) { last = null; }
  try { sent = JSON.parse(prop_(PROP_DAY_REPORT_SENT) || '{}') || {}; } catch (e) { sent = {}; }
  const day = lastHistDay_(), m = day ? sent[day] : null;
  return {
    settings: dayReportSettings_(), configured: !!greenApi_(), last,
    day: day ? { date: day, label: plDate_(day), status: pollMarkState_(m), at: m ? m.at : '' } : null,
  };
}

/** „Wyślij listę" z panelu (PIN): dzień już zamknięty; `force` — mimo „już poszła" / „nie wiadomo". Nie w RETRIABLE. */
function sendDayReportNow(pin, date, force) {
  requirePin_(pin);
  const d = String(date || '');
  if (!isDate_(d) || d >= businessDate_()) throw new Error('Listę wysyła się za dzień już zamknięty');
  const sent = sendDayReport_(d, true, force === true);
  return { sent, panel: dayReportPanel_() };
}

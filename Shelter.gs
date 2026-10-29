/**
 * G13 Spacery — RAPORT DO SCHRONISKA (1.6, prośba właściciela 29.10.2026).
 *
 * Schronisko zbiera spacery formularzem Microsoft Forms, osobnym dla każdej grupy („Grupa G13"): data spaceru
 * i psy do zaznaczenia — nasze i te psy innych grup, które schronisko dopisało do naszego formularza (dziś TTB).
 * Formularz pozwala na wstępne wypełnienie z adresu (AllowPrefill), więc „📝 Raport do schroniska" (lista
 * bieżącego dnia i miniony dzień — shelterBox w Script.html) otwiera go z datą i zaznaczonymi psami: zostaje
 * stuknąć „Prześlij". Wysyła człowiek — aplikacja sama niczego do schroniska nie wysyła.
 *
 * Definicję formularza (pytania, lista psów) czyta serwer: przeglądarka nie może (inna domena), a lista psów
 * w formularzu się zmienia — schronisko dopisuje nowe. Bierzemy ją z tego samego adresu, z którego formularz
 * pobiera ją przy otwarciu (ResponsePageStartup.ashx), bez logowania (formularz jest anonimowy). Zapis linku
 * w panelu (setShelterForm, PIN) od razu sprawdza, czy formularz da się tak wypełnić; dalej definicja odświeża
 * się przy nocnym czyszczeniu (shelterNightly_) i przyciskiem w panelu (checkShelterForm). Nieudane odświeżenie
 * zostawia ostatnią dobrą definicję — przycisk działa dalej, a błąd stoi w panelu.
 *
 * Link do formularza to nie sekret jak token bramki (dostaje go każdy wolontariusz), ale nie trafia do
 * repozytorium: każdy z nim może wysłać schronisku odpowiedź. Siedzi we właściwości `shelterForm`, a w getData
 * jest numer formularza i jego lista psów — jak adres maila schroniska.
 *
 * Psa z pozycją w formularzu łączy w przeglądarce NUMER psa (shelterKey: „0552/26" w formularzu = „552/26"
 * u nas). Kto i kiedy otwierał raport dnia — `shelterOpened` (shelterReportOpened): drugi raport tego samego
 * dnia podwoiłby spacery w schronisku, więc kolejna osoba widzi „raport otwierany o 17:20" i może dosłać same
 * nowe psy. Czy formularz WYSŁANO, nie wiemy (odpowiedzi widzi tylko schronisko) — mówimy „otwierany".
 */

const SHELTER_PAGE = '/Pages/ResponsePage.aspx';
const SHELTER_HOSTS = ['forms.cloud.microsoft', 'forms.office.com', 'forms.microsoft.com'];
const SHELTER_ID = /^[A-Za-z0-9_.-]{10,300}$/;           // numer formularza (id=…) — tak, jak trafia do adresu
const SHELTER_QID = /^[A-Za-z0-9_-]{1,64}$/;              // numer pytania („r" + 32 znaki szesnastkowe)
const SHELTER_KEY = /^(0|[1-9]\d{0,5})\/\d{2}$/;          // numer psa po shelterKey w przeglądarce: „552/26"
const SHELTER_BAD_LINK = 'To nie jest link do formularza Microsoft Forms — wklej link od schroniska '
  + '(https://forms.cloud.microsoft/… albo https://forms.office.com/…)';
const SHELTER_CONSENT = 'Brak zgody na połączenie z formularzem — w edytorze tego projektu uruchom authorizeWhatsApp() '
  + 'i zatwierdź (ta sama zgoda co dla WhatsAppa)';

/* ---------- formularz: link, definicja ---------- */

/**
 * Link z panelu → {id} albo {short} (krótki link …/e/… — numer formularza zna dopiero przekierowanie); pusty → null.
 * Tylko https i adresy Microsoft Forms. Ta sama reguła w przeglądarce (shelterLinkProblem) — komunikat od razu.
 */
function shelterLink_(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const m = s.length <= SHELTER_LIMITS.LINK ? s.match(/^https:\/\/([^\/?#\s]+)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i) : null;
  if (!m || SHELTER_HOSTS.indexOf(m[1].toLowerCase()) < 0) throw new Error(SHELTER_BAD_LINK);
  const q = (m[3] || '').match(/[?&]id=([^&]*)/);
  if (q) {
    let id = '';
    try { id = decodeURIComponent(q[1]); } catch (e) { id = ''; }
    if (!SHELTER_ID.test(id)) throw new Error('W linku jest zły numer formularza (id=…) — skopiuj link jeszcze raz');
    return { id };
  }
  const sh = m[2].match(/^\/(e|r)\/([A-Za-z0-9]{4,40})\/?$/);
  if (sh) return { short: 'https://' + m[1].toLowerCase() + '/' + sh[1] + '/' + sh[2] };
  throw new Error(SHELTER_BAD_LINK);
}

/** GET do Microsoft Forms. Brak zgody na UrlFetchApp (projekt bez authorizeWhatsApp()) — po ludzku, co zrobić. */
function shelterGet_(url, follow) {
  try {
    return UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: !!follow });
  } catch (e) {
    const m = String(e && e.message || e);
    if (/script\.external_request|UrlFetchApp\.fetch/.test(m)) throw new Error(SHELTER_CONSENT);
    throw new Error('Formularz nie odpowiada — spróbuj za chwilę (' + m.slice(0, 120) + ')');
  }
}

/** Nagłówek odpowiedzi bez względu na wielkość liter (Location). */
function shelterHeader_(res, name) {
  let h = {};
  try { h = (res.getAllHeaders ? res.getAllHeaders() : res.getHeaders()) || {}; } catch (e) { h = {}; }
  const k = Object.keys(h).filter(x => x.toLowerCase() === name)[0];
  const v = k ? h[k] : '';
  return String((Array.isArray(v) ? v[0] : v) || '');
}

/** Krótki link → numer formularza: za przekierowaniami (najwyżej 4), tylko po adresach Microsoft Forms. */
function shelterResolve_(url) {
  let u = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = shelterGet_(u, false);
    const code = res.getResponseCode();
    const loc = code >= 300 && code < 400 ? shelterHeader_(res, 'location') : '';
    if (!loc) break;
    const next = /^https:\/\//i.test(loc) ? loc : loc.charAt(0) === '/' && loc.charAt(1) !== '/' ? u.match(/^https:\/\/[^\/?#]+/i)[0] + loc : '';
    let p = null;
    try { p = shelterLink_(next); } catch (e) { p = null; }
    if (!p) break;
    if (p.id) return p.id;
    u = p.short;
  }
  throw new Error('Krótki link nie prowadzi do formularza — wklej pełny link (…ResponsePage.aspx?id=…)');
}

function shelterJson_(s) {
  try { const o = JSON.parse(s || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
}

/**
 * Definicja formularza z Microsoft Forms. Zły numer formularza Microsoft oddaje jako 200 z błędem 1001,
 * formularz tylko dla zalogowanych — bez definicji.
 */
function shelterFetch_(id) {
  const res = shelterGet_(SHELTER_HOST + '/handlers/ResponsePageStartup.ashx?id=' + encodeURIComponent(id) + '&mobile=false', true);
  const code = res.getResponseCode();
  if (code !== 200) throw new Error('Formularz nie odpowiada (błąd ' + code + ') — spróbuj za chwilę');
  const top = shelterJson_(String(res.getContentText() || ''));
  const data = top && top.data;
  const err = data && data.error;
  if (err) {
    if (String(err.code) === '1001') throw new Error('Nie ma takiego formularza — sprawdź link');
    throw new Error('Formularz odmówił: ' + String(err.message || err.code || '?').slice(0, 120));
  }
  if (!data || !data.form || !Array.isArray(data.form.questions)) {
    throw new Error('Nie udało się odczytać formularza — musi być otwarty dla każdego z linkiem, bez logowania');
  }
  return shelterDef_(data.form, id);
}

/**
 * Z definicji to, czego potrzebuje raport, sprawdzone: wstępne wypełnienie włączone, pytanie o datę (sama data,
 * bez godziny), lista psów z wyborem wielu odpowiedzi. Pytanie i listę rozpoznajemy po rodzaju, a gdy jest ich
 * kilka — po tytule. Pozycje listy dokładnie tak, jak są w formularzu (z tabulatorem w środku) — wstępne
 * wypełnienie zaznacza tylko pozycję o identycznej treści. `extra` — inne wymagane pytania (wolontariusz
 * uzupełni je sam), `active` — formularz przyjmuje odpowiedzi.
 */
function shelterDef_(f, id) {
  const settings = typeof f.settings === 'string' ? shelterJson_(f.settings) || {} : (f.settings || {});
  if (settings.AllowPrefill !== true) {
    throw new Error('Formularz nie pozwala na wstępne wypełnienie — poproś schronisko, żeby je włączyło '
      + '(Microsoft Forms: wstępnie wypełniony adres URL)');
  }
  const qs = f.questions.map(q => ({ id: String(q && q.id || ''), type: String(q && q.type || ''),
    title: String(q && q.title || '').replace(/\s+/g, ' ').trim(), required: !!(q && q.required),
    info: shelterJson_(q && q.questionInfo) || {} }));
  const pick = (list, re) => {
    if (list.length === 1) return list[0];
    const named = list.filter(q => re.test(q.title));
    return named.length === 1 ? named[0] : null;
  };
  const dates = qs.filter(q => q.type === 'Question.DateTime' && q.info.Time !== true);
  const lists = qs.filter(q => q.type === 'Question.Choice' && Array.isArray(q.info.Choices) && q.info.Choices.length);
  const dateQ = pick(dates, /data|dzie[nń]/i);
  const dogQ = pick(lists, /pies|psy|ps[oó]w/i);
  if (!dateQ) throw new Error(dates.length ? 'W formularzu jest kilka pytań o datę — nie wiem, które to data spaceru' : 'W formularzu nie ma pytania o datę spaceru');
  if (!dogQ) throw new Error(lists.length ? 'W formularzu jest kilka list wyboru — nie wiem, która to psy' : 'W formularzu nie ma listy psów');
  if (Number(dogQ.info.ChoiceType) !== 2) throw new Error('Lista psów w formularzu pozwala zaznaczyć tylko jednego psa — raport potrzebuje wyboru wielu');
  if (!SHELTER_QID.test(dateQ.id) || !SHELTER_QID.test(dogQ.id)) throw new Error('Nieznany układ formularza (numery pytań)');
  const choices = dogQ.info.Choices.map(c => String(c && c.Description != null ? c.Description : '')).filter(c => c.trim());
  if (!choices.length) throw new Error('Lista psów w formularzu jest pusta');
  if (choices.length > SHELTER_LIMITS.CHOICES) throw new Error('Formularz ma za dużo psów (' + choices.length + ', najwyżej ' + SHELTER_LIMITS.CHOICES + ')');
  if (choices.some(c => c.length > SHELTER_LIMITS.CHOICE)) throw new Error('Za długa pozycja na liście psów w formularzu');
  const extra = qs.filter(q => q.required && q !== dateQ && q !== dogQ).map(q => (q.title || 'pytanie bez tytułu').slice(0, 80)).slice(0, 5);
  return { id, title: String(f.title || '').replace(/\s+/g, ' ').trim().slice(0, 120), dateQ: dateQ.id, dogQ: dogQ.id,
           choices, extra, active: String(f.status || '') === 'Active' };
}

/* ---------- formularz: zapis, odświeżanie, panel ---------- */

/** Zapisany formularz albo null (brak, zepsuty wpis). `raw` — świeży odczyt pod blokadą; bez niego — z pamięci wykonania. */
function shelterSaved_(raw) {
  const o = shelterJson_(raw === undefined ? prop_(PROP_SHELTER_FORM) : raw);
  return o && o.id && o.dateQ && o.dogQ && Array.isArray(o.choices) && o.choices.length ? o : null;
}
function shelterFresh_() { return shelterSaved_(PropertiesService.getScriptProperties().getProperty(PROP_SHELTER_FORM)); }

/** Wpis formularza jako JSON — za duży na właściwość (limit 9 KB) to błąd, zanim cokolwiek się zapisze. */
function shelterStored_(o) {
  const json = JSON.stringify(o);
  if (diagBytes_(json) > SHELTER_LIMITS.BYTES) throw new Error('Lista psów w formularzu jest za długa, żeby ją zapamiętać');
  return json;
}

/**
 * Link do formularza z panelu (PIN). Pusty = bez raportu (przycisk znika). Zapis dopiero po udanym odczycie
 * formularza — zły link albo formularz bez wstępnego wypełniania nie zastąpi działającego. Zapis pod blokadą:
 * stan startowy strony (pamięć podręczna) niesie formularz, więc jej znacznik musi się zmienić.
 */
function setShelterForm(link, pin) {
  requirePin_(pin);
  const p = shelterLink_(link);
  if (!p) {
    withLock_(() => { lockKeepsDogs_ = true; delProp_(PROP_SHELTER_FORM); });
    return shelterReply_();
  }
  const def = shelterFetch_(p.id || shelterResolve_(p.short));
  const json = shelterStored_(Object.assign({ link: String(link).trim() }, def, { at: stamp_(), t: Date.now(), err: '', errAt: '' }));
  withLock_(() => { lockKeepsDogs_ = true; setProp_(PROP_SHELTER_FORM, json); });
  return shelterReply_();
}

/** „Sprawdź formularz" z panelu (PIN): definicja od nowa. Błąd nie jest wyjątkiem — zostaje w panelu i w `error`. */
function checkShelterForm(pin) {
  requirePin_(pin);
  const cur = shelterSaved_();
  if (!cur) throw new Error('Formularz raportu nie jest ustawiony — wklej link i zapisz');
  return shelterReply_(shelterRefresh_(cur));
}

/**
 * Definicja od nowa (panel, nocne czyszczenie). Odczyt bez blokady (Microsoft potrafi odpowiadać sekundami, a zapisy
 * czekają na blokadę), zapis pod nią ze świeżym odczytem: gdy w międzyczasie zapisano inny formularz albo go usunięto —
 * nic. Nieudany odczyt zostawia ostatnią dobrą definicję, a błąd (`err`, `errAt`) idzie do panelu. Zwraca błąd albo ''.
 */
function shelterRefresh_(cur) {
  let def = null, err = '';
  try { def = shelterFetch_(cur.id); } catch (e) { err = String(e && e.message || e).slice(0, 300); }
  withLock_(() => {
    lockKeepsDogs_ = true;
    const now = shelterFresh_();
    if (!now || now.id !== cur.id) return;
    let json = '';
    if (def) {
      try { json = shelterStored_(Object.assign({ link: String(now.link || '') }, def, { at: stamp_(), t: Date.now(), err: '', errAt: '' })); }
      catch (e) { err = String(e && e.message || e); }
    }
    setProp_(PROP_SHELTER_FORM, json || JSON.stringify(Object.assign(now, { err, errAt: stamp_() })));
  });
  return err;
}

/** Po nocnym czyszczeniu (endOfDay, już bez blokady): definicja starsza niż SHELTER_REFRESH_H — od nowa. Nigdy nie rzuca. */
function shelterNightly_() {
  try {
    const cur = shelterSaved_();
    if (!cur || Date.now() - (Number(cur.t) || 0) < SHELTER_REFRESH_H * 3600000) return;
    const err = shelterRefresh_(cur);
    if (err) console.warn('Formularz raportu do schroniska: ' + err);
  } catch (e) {
    console.warn('Formularz raportu do schroniska: ' + (e && e.message || e));
  }
}

/** Dla przeglądarki (getData): strona formularza, numery pytań i lista psów — bez linku z panelu i bez błędów. */
function shelterForClient_() {
  try {
    const o = shelterSaved_();
    return o ? { page: SHELTER_HOST + SHELTER_PAGE, id: o.id, title: String(o.title || ''), dateQ: o.dateQ, dogQ: o.dogQ,
                 choices: o.choices, extra: Array.isArray(o.extra) ? o.extra : [], active: o.active !== false } : null;
  } catch (e) {
    return null;                                     // raport to dodatek — odczyt listy idzie bez niego
  }
}

/** Panel (getDiagnostics): link, tytuł, ile psów, kiedy sprawdzony, ostatni błąd. */
function shelterPanel_() {
  const o = shelterSaved_();
  return o ? { link: String(o.link || ''), title: String(o.title || ''), count: o.choices.length, at: String(o.at || ''),
               err: String(o.err || ''), errAt: String(o.errAt || ''), active: o.active !== false } : { link: '' };
}
/** Odpowiedź zapisu i sprawdzenia: panel, formularz dla listy, `error` — błąd sprawdzenia ('' = udane). */
function shelterReply_(error) { return { panel: shelterPanel_(), form: shelterForClient_(), error: String(error || '') }; }

/* ---------- kto otwierał raport dnia ---------- */

function shelterMarks_(raw) {
  const m = shelterJson_(raw);
  return m && !Array.isArray(m) ? m : {};
}
function shelterMarkOut_(e) {
  return { at: String(e && e.at || ''), t: Number(e && e.t) || 0,
           keys: String(e && e.k || '').split(',').filter(k => SHELTER_KEY.test(k)) };
}

/** Otwarcia raportów dni od `from` do `to` (getData — ostatnie dni, getHistoryDays — zakres): dzień -> {at, t, keys}. */
function shelterOpenedIn_(from, to) {
  const out = {};
  try {
    const m = shelterMarks_(prop_(PROP_SHELTER_OPENED));
    Object.keys(m).forEach(d => { if (isDate_(d) && d >= from && d <= to && m[d]) out[d] = shelterMarkOut_(m[d]); });
  } catch (e) { /* pamięć otwarć to dodatek — odczyt listy idzie bez niej */ }
  return out;
}

/**
 * Ktoś właśnie otworzył raport dnia `date` z psami `keys` (numery po shelterKey). Publiczne bez PIN-u — robi to każdy
 * wolontariusz, więc wejście sprawdzane jak obce: dzień trwający albo miniony, numery tylko w znanym kształcie. Dopisuje
 * psy do tych, z którymi raport już otwierano (suma — powtórka niczego nie zmienia, więc RETRIABLE), z godziną ostatniego
 * otwarcia. Pamięć: SHELTER_KEEP_DAYS dni i SHELTER_LIMITS.BYTES bajtów — najstarsze wypadają. Zwraca {date, mark}.
 */
function shelterReportOpened(date, keys) {
  const d = String(date == null ? '' : date);
  if (!isDate_(d) || d > businessDate_()) throw new Error('Raport tylko z dnia, który trwa albo już minął');
  const list = [];
  (Array.isArray(keys) ? keys : []).slice(0, SHELTER_KEYS_MAX * 2).forEach(k => {
    const s = String(k == null ? '' : k);
    if (SHELTER_KEY.test(s) && list.indexOf(s) < 0) list.push(s);
  });
  if (!list.length) throw new Error('W raporcie nie było psów z numerami');
  return withLock_(() => {
    lockKeepsDogs_ = true;
    const m = shelterMarks_(PropertiesService.getScriptProperties().getProperty(PROP_SHELTER_OPENED));
    const had = m[d] ? shelterMarkOut_(m[d]).keys : [];
    const mark = { at: stamp_(), t: Date.now(), k: had.concat(list.filter(k => had.indexOf(k) < 0)).slice(0, SHELTER_KEYS_MAX).join(',') };
    m[d] = mark;
    const floor = addDays_(today_(), -SHELTER_KEEP_DAYS);
    Object.keys(m).forEach(x => { if (!isDate_(x) || x < floor) delete m[x]; });
    const days = Object.keys(m).sort();
    let json = JSON.stringify(m);
    while (days.length > 1 && diagBytes_(json) > SHELTER_LIMITS.BYTES) { delete m[days.shift()]; json = JSON.stringify(m); }
    setProp_(PROP_SHELTER_OPENED, json);
    return { date: d, mark: shelterMarkOut_(mark) };
  });
}

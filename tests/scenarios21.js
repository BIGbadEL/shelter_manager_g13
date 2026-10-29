// S144: pole „Twoje imię" w polu 1/2 / 2/2 psa na dwa spacery — „OK" w ramce (zgłoszenie z 1.4, 360 px, Android).
// S145: panel pomocnika Grafiku (1.5, faza testów; Helper.gs, HELPER.md) — ustawienia, szkic, zapis, podgląd,
// „Sprawdź teraz", „Sprawdź bramkę", te same reguły i limity co serwer. Serwer: tests/helper.js (B74–B80).
const { buildApp, dogFree, ROOT } = require('./harness');
const { makeContext } = require('./backend-harness');
const fs = require('fs'), path = require('path');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const D = '2026-10-24';
const base = o => Object.assign({dogs: [], slots: [], tasks: [], today: D, businessDate: D, resetHour: 18, env: 'test'}, o || {});
const doc = app => app.window.document;
const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '(brak)';
const toastOf = app => doc(app).getElementById('toast').textContent;
const calls = (app, fn) => app.pending.filter(p => p.fn===fn);
const lastCall = (app, fn) => calls(app, fn).slice(-1)[0];
const hidden = (app, sel) => { const el = doc(app).querySelector(sel); return !el || el.classList.contains('hidden'); };
const opts = (app, sel) => [...doc(app).querySelector(sel).options].map(o => o.value + '=' + o.textContent).join('|');
function respondTo(app, fn, res){
  const i = app.pending.findIndex(p => p.fn===fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].ok(res);
}
function failTo(app, fn, msg){
  const i = app.pending.findIndex(p => p.fn===fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].fail(new Error(msg));
}
/** Pole jak człowiek: wartość (albo zaznaczenie) + zdarzenie. */
function fill(app, fields){
  Object.keys(fields).forEach(sel => {
    const el = doc(app).querySelector(sel);
    if(!el) throw new Error('brak pola ' + sel);
    if(el.type === 'checkbox') el.checked = !!fields[sel]; else el.value = fields[sel];
    el.dispatchEvent(new app.window.Event(el.tagName==='SELECT' || el.type === 'checkbox' ? 'change' : 'input', {bubbles:true}));
  });
}

/* ---------- S144: „OK" w ramce pola 2/2 ---------- */
function S144(){
  console.log('S144: „Twoje imię" w polu 1/2 / 2/2 — pole bez własnej szerokości, „OK" zostaje w ramce');
  const css = fs.readFileSync(path.join(ROOT, 'Styles.html'), 'utf8');
  const rule = sel => { const m = css.match(new RegExp('\\n\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : ''; };
  // jsdom nie liczy układu — pomiar w Chromium (320–412 px, też szerszym fontem): przed poprawką „OK" wystawał
  // do 55 px poza pole 2/2, po niej 0. Tu pilnujemy reguł, które to dają.
  check('pole imienia: width:0 i min-width:0 — zajmuje to, co zostaje obok „OK"', /(^|;)width:0;/.test(rule('.entry input')) && /min-width:0/.test(rule('.entry input'))
    && /flex:1/.test(rule('.entry input')), rule('.entry input'));
  check('wiersz pola: min-width:0 — zwęża się w polu 2/2 (flex)', /min-width:0/.test(rule('.entry')), rule('.entry'));
  check('„OK" się nie ściska', /flex:none/.test(rule('.entry .btn')), rule('.entry .btn'));
  const app = buildApp();
  app.seed(base({dogs: [dogFree({id: 1, name: 'Hańcza', walks: 2})]}));
  app.click('.slot[data-slot="2"] [data-act="reserve"]');
  const box = doc(app).querySelector('.slot[data-slot="2"]');
  const entry = box && box.querySelector('.entry:not(.hidden)');
  check('„Zarezerwuj" w 2/2 otwiera pole w ramce pola 2/2: pole imienia i „OK"', !!entry && !!entry.querySelector('input[data-input="1"]')
    && txt(entry.querySelector('[data-act="confirm"]')) === 'OK', box && box.innerHTML.slice(0, 200));
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));
}

/* ---------- S145: panel pomocnika Grafiku ---------- */
// kontakt (odbiorca) to klucz z serwera (contactKey_), nie adres z numerem — numery nie opuszczają serwera (27.10)
const GRAFIK = '120363000000000001@g.us', OWNER = 'kGrzesiek00000001';
const FEATS = {evening:true, eveningAlways:true, morning:true, morningAlways:true, week:true, newPoll:true, members:true, lastWeek:true, weather:true, commands:true};
const NOT_READY = {evening:false, morning:false, week:false, newPoll:false, members:false, lastWeek:false};
const HELPER = (o, s) => Object.assign({settings: Object.assign({enabled:false, chatId:'', chatName:'', toKey:'', toName:'', min:3, evening:20, morning:7,
    weekDays:[0,3], names:'', features: Object.assign({}, FEATS), ready: Object.assign({}, NOT_READY)}, s),
  configured: true, env: 'test', lease: null, trigger: false, stat: null, log: [], polls: [], people: 0, members: null}, o);
/** Sekcja Panelu po kluczu (panelSec) i jej rozwinięcie stuknięciem w nagłówek — jak człowiek. */
const sec = (app, key) => doc(app).querySelector('.psec[data-sec="' + key + '"]');
const openSec = (app, key) => { if(!sec(app, key).classList.contains('open')) app.click('.psec[data-sec="' + key + '"] [data-act="panelSec"]'); return sec(app, key); };
const POLL = {settings: {question:'Grafik [TYDZIEŃ]', options:['Pon','Wt'], multi:true, day:0, hour:12, enabled:false, chatId:'', chatName:''},
  configured: true, state: null, last: null, next: {day:'2026-10-25', label:'26.10-01.11'}, now: {label:'26.10-01.11', question:'Grafik 26.10-01.11', status:'', at:''}};
const DIAG = h => ({env:'test', triggerInstalled:true, triggerCount:1, resetHour:18, serverDate:D, serverTime:'10:00', businessDate:D,
  timezone:'Europe/Warsaw', dogCount:1, taskCount:0, histCount:3, poll: POLL, dayReport: null, helper: h});
function openPanel(h, o){
  const app = buildApp(o);
  app.seed(base({dogs: [dogFree({id: 1, name: 'Borys'})]}));
  app.window.__setAdmin('1234');
  app.click('.tab[data-tab="diag"]');
  respondTo(app, 'getDiagnostics', DIAG(h));
  calls(app, 'getPollState').forEach(() => respondTo(app, 'getPollState', {code:'authorized', text:'połączone'}));
  return app;
}

function S145(){
  console.log('S145: panel pomocnika Grafiku — grupa i kontakt z list bota, szkic, zapis z PIN-em, podgląd, „Sprawdź teraz", bramka');
  const app = openPanel(HELPER());
  openSec(app, 'botTest');
  check('sekcja w panelu: „Pomocnik Grafiku — test", wyłączony', /Pomocnik Grafiku — test/.test(txt(sec(app, 'botTest'))) && /Wyłączony\./.test(txt(sec(app, 'botTest'))));
  app.click('[data-act="pollChats"]');
  respondTo(app, 'getPollChats', [{id: GRAFIK, name: 'Grafik'}, {id: '120363000000000002@g.us', name: 'Grupa próbna'}]);
  app.click('[data-act="reportContacts"]');
  respondTo(app, 'getDayReportContacts', [{key: OWNER, name: 'Grzesiek'}]);
  check('grupa z listy grup bota, kontakt z kontaktów telefonu bota — po nazwie, bez numeru', opts(app, '#helperChat') === '=— wybierz grupę —|' + GRAFIK + '=Grafik|120363000000000002@g.us=Grupa próbna'
    && opts(app, '#helperTo') === '=— wybierz kontakt —|' + OWNER + '=Grzesiek' && !/4860|@c\.us/.test(app.html()), opts(app, '#helperChat') + ' / ' + opts(app, '#helperTo'));
  fill(app, {'#helperEnabled': true});
  app.click('[data-act="helperSave"]');
  check('włączenie bez grupy — komunikat, nic nie idzie', /Wybierz grupę/.test(toastOf(app)) && !calls(app, 'setHelperSettings').length, toastOf(app));
  fill(app, {'#helperChat': GRAFIK, '#helperTo': OWNER, '#helperMin': '4', '#helperF_weather': false, '#helperWd3': false, '#helperWd5': true,
             '#helperNames': '123 = Ania'});
  check('pól „Fioletowi" i „Nowi" już nie ma (klasy z listy członków)', !doc(app).getElementById('helperPurple') && !doc(app).getElementById('helperRookies'));
  check('„Niezapisane zmiany" przy pomocniku, nie przy ankiecie', !hidden(app, '.helperdirty') && hidden(app, '.polldirty'));
  app.window.eval('fetchDiag()');                       // panel się przerysowuje (odświeżenie) — szkic zostaje
  respondTo(app, 'getDiagnostics', DIAG(HELPER()));
  calls(app, 'getPollState').forEach(() => respondTo(app, 'getPollState', {code:'authorized', text:'połączone'}));
  check('szkic przeżył przerysowanie', doc(app).getElementById('helperChat').value === GRAFIK && doc(app).getElementById('helperMin').value === '4'
    && !doc(app).getElementById('helperF_weather').checked && doc(app).getElementById('helperWd5').checked);
  app.click('[data-act="helperSave"]');
  const save = lastCall(app, 'setHelperSettings');
  const want = {chatId: GRAFIK, chatName: 'Grafik', toKey: OWNER, toName: 'Grzesiek', min: 4, evening: 20, morning: 7, weekDays: [0, 5],
    names: '123 = Ania', features: Object.assign({}, FEATS, {weather: false}), ready: Object.assign({}, NOT_READY), enabled: true};
  check('zapis: grupa, kontakt (klucz i nazwa), minimum, dni, imiona, włączniki, PIN; na teście nic „gotowego" (wszystko prywatnie)',
    !!save && JSON.stringify(save.args) === JSON.stringify([want, '1234']), save && JSON.stringify(save.args));
  respondTo(app, 'setHelperSettings', HELPER({trigger: true}, Object.assign({}, want, {features: want.features})));
  check('po zapisie: komunikat, bez „Niezapisane", włączony z wyzwalaczem', /zapisany i włączony/.test(toastOf(app)) && hidden(app, '.helperdirty')
    && /Włączony — przebieg co 10 min, pisze do Grzesiek/.test(txt(doc(app).getElementById('view'))), toastOf(app));

  app.click('[data-act="helperPreview"][data-kind="tydzien"]');
  check('podgląd: pytanie z rodzajem, przyciski wstrzymane do odpowiedzi', JSON.stringify(lastCall(app, 'helperPreview').args) === JSON.stringify(['1234', 'tydzien'])
    && doc(app).querySelector('[data-act="helperRun"]').disabled);
  respondTo(app, 'helperPreview', {text: '*Przegląd tygodnia* (26.10–01.11)\npn 26.10 — 3 os.\n<b>nie HTML</b>', sent: false});
  const pre = doc(app).querySelector('[data-helper-preview]');
  check('podgląd w panelu jak na WhatsAppie (tekst, nie HTML), przyciski z powrotem', !!pre && /pn 26\.10 — 3 os\./.test(pre.textContent)
    && !pre.querySelector('b') && !doc(app).querySelector('[data-act="helperRun"]').disabled, pre && pre.innerHTML);
  let asked = '';
  app.window.confirm = m => { asked = m; return true; };
  app.click('[data-act="helperSendPreview"]');
  check('„Wyślij mi to": pytanie, potem wysyłka tego samego podglądu', /Wysłać ten podgląd do Grzesiek/.test(asked)
    && JSON.stringify(lastCall(app, 'helperPreview').args) === JSON.stringify(['1234', 'tydzien', true]), asked);
  respondTo(app, 'helperPreview', {text: 'x', sent: true});
  check('...komunikat', /Wysłane do Grzesiek/.test(toastOf(app)), toastOf(app));

  app.click('[data-act="helperRun"]');
  check('„Sprawdź teraz" — wprost do serwera (bez kolejki zapisów), z PIN-em', JSON.stringify(lastCall(app, 'helperRunNow').args) === JSON.stringify(['1234'])
    && /Pracuję…/.test(txt(doc(app).querySelector('[data-act="helperRun"]'))));
  respondTo(app, 'helperRunNow', {run: {events: 3, grafik: 2, sent: 1, err: ''}, panel: HELPER({trigger: true, stat: {at: Date.parse('2026-10-24T20:05:00+02:00'), ms: 900, events: 3, grafik: 2, sent: 1, err: ''},
    log: [{at: Date.parse('2026-10-24T20:05:00+02:00'), k: 'sent', m: '*Jutro — niedziela 25.10*: 2 os. ⚠️'}],
    polls: [{q: 'Grafik 19-25.10', at: 0, voters: 5, partial: true, wrong: false, days: 'pn 19.10 3 · wt 20.10 2'}], people: 7, notes: 2, abs: 1, members: 30}, want)});
  const view = txt(doc(app).getElementById('view'));
  check('wynik przebiegu: komunikat, ostatni przebieg, ankiety (niepełna), dziennik', /Przebieg: powiadomień 3, wiadomości 1/.test(toastOf(app))
    && /powiadomień 3 \(z Grafiku 2\), wiadomości 1\./.test(view) && /„Grafik 19-25\.10" — głosujących 5 \(niepełna/.test(view)
    && /wysłane\s*\*Jutro — niedziela 25\.10/.test(view) && /skład grupy 30 os\./.test(view)
    && !/nieobecności|wiadomości o najbliższych dniach/.test(view), view.slice(view.indexOf('Wie o')));

  app.click('[data-act="helperGate"]');
  respondTo(app, 'getHelperGateway', [{key: 'incomingWebhook', label: 'powiadomienia o wiadomościach przychodzących', ok: true},
                                      {key: 'pollMessageWebhook', label: 'powiadomienia o ankietach', ok: false}]);
  const gate = doc(app).querySelector('.helpergate');
  check('„Sprawdź bramkę": co jest, czego brakuje, gdzie to włączyć', !!gate && /✓ powiadomienia o wiadomościach/.test(txt(gate))
    && /✗ powiadomienia o ankietach/.test(txt(gate)) && /konsoli Green API/.test(app.html()));
  app.click('[data-act="helperGate"]');
  failTo(app, 'getHelperGateway', 'Bramka WhatsAppa: błąd 401');
  check('błąd bramki — komunikat, przyciski z powrotem', /401/.test(toastOf(app)) && !doc(app).querySelector('[data-act="helperGate"]').disabled, toastOf(app));

  // zapis jest idempotentny — zgubiona odpowiedź: jedna powtórka (RETRIABLE)
  fill(app, {'#helperMin': '5'});
  app.click('[data-act="helperSave"]');
  const sent = app.shipped.filter(f => f === 'setHelperSettings').length;
  failTo(app, 'setHelperSettings', 'Przekroczono limit czasu');
  check('zapis bez odpowiedzi — powtórzony raz (RETRIABLE)', app.shipped.filter(f => f === 'setHelperSettings').length === sent + 1, app.shipped.join(','));
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));
}

/* ---------- S145b: te same reguły i limity co serwer ---------- */
function S145b(){
  console.log('S145b: pomocnik — przeglądarka sprawdza to samo co serwer (helperProblem = helperValid_), limity równe HELPER_LIMITS');
  const src = fs.readFileSync(path.join(ROOT, 'Script.html'), 'utf8');
  const env = makeContext({ props: { pin: '1234', greenApiUrl: 'https://7103.api.greenapi.com', greenApiInstance: '7103123456', greenApiToken: 't' } });
  const L = env.conf.HELPER_LIMITS;
  const num = name => Number((src.match(new RegExp('const ' + name + ' = (\\d+)')) || [])[1]);
  check('limity: minimum osób, „imiona"', num('HELPER_MIN_MAX') === L.MIN_MAX && num('HELPER_NAME_MAP_MAX') === L.NAME_MAP,
    [num('HELPER_MIN_MAX'), num('HELPER_NAME_MAP_MAX')].join());
  const keys = Object.keys(env.conf.DEFAULT_HELPER.features);
  const client = (src.match(/const HELPER_FEATURES = \[([\s\S]*?)\n  \];/) || [])[1] || '';
  check('włączniki w panelu = funkcje serwera (' + keys.length + ')', keys.every(k => client.indexOf("['" + k + "'") >= 0) && (client.match(/\['/g) || []).length === keys.length);
  const app = buildApp();
  app.seed(base());
  // kontakt jak z „Pobierz kontakty": klucz, który serwer zna. Nieznany klucz sprawdza tylko serwer — przeglądarka adresów nie zna
  env.http.handler = url => /\/getContacts\//.test(url) ? { code: 200, body: JSON.stringify([{ id: '48600111222@c.us', contactName: 'G', type: 'user' }]) } : { code: 404, body: '' };
  const KEY = env.api.getDayReportContacts('1234')[0].key;
  const ok = {chatId: GRAFIK, chatName: 'Grafik', toKey: KEY, toName: 'G', min: 3, evening: 20, morning: 7, weekDays: [0], names: '',
    features: Object.assign({}, FEATS), enabled: true};
  const cases = [ok, Object.assign({}, ok, {min: 0}), Object.assign({}, ok, {min: L.MIN_MAX + 1}),
    Object.assign({}, ok, {names: 'x'.repeat(L.NAME_MAP)}), Object.assign({}, ok, {names: 'x'.repeat(L.NAME_MAP + 1)}),
    Object.assign({}, ok, {chatId: ''}), Object.assign({}, ok, {toKey: ''}), Object.assign({}, ok, {chatId: '', enabled: false})];
  const diff = cases.map((c, i) => {
    const browser = !!app.window.helperProblem(c, true);
    let server = false;
    try { env.api.setHelperSettings(c, '1234'); } catch(e){ server = true; }
    return browser === server ? '' : i + ': przeglądarka ' + browser + ', serwer ' + server;
  }).filter(Boolean);
  check(cases.length + ' przypadków: przeglądarka odrzuca dokładnie to, co serwer', diff.length === 0, diff.join(' | '));
}

/* ---------- S145d: panel mówi wprost, że pomocnik nic nie widzi ---------- */
function S145d(){
  console.log('S145d: pomocnik — w bramce wyłączone powiadomienia (test 24–25.10): panel mówi, czego brakuje; po włączeniu — od kiedy widzi');
  const on = {chatId: GRAFIK, chatName: 'Grafik', toKey: OWNER, toName: 'Grzesiek', enabled: true};
  const off = openPanel(HELPER({trigger: true, gate: {ok: false, at: Date.now(), from: 0,
    missing: ['powiadomienia o wiadomościach przychodzących', 'powiadomienia o ankietach']}}, on));
  const box = sec(off, 'botTest');
  const warn = box && [...box.querySelectorAll('.pollstate')].map(txt).join(' | ');
  check('bramka bez powiadomień: ostrzeżenie z listą, stan pomocnika nie „zielony"', /Nie widzi „Grafiku" — w konsoli Green API wyłączone: powiadomienia o wiadomościach przychodzących; powiadomienia o ankietach/.test(warn)
    && !box.querySelector('.pollstate.ok'), warn);
  const ok = openPanel(HELPER({trigger: true, gate: {ok: true, at: Date.now(), from: Date.parse('2026-10-25T21:30:00+01:00'), missing: []}}, on));   // 25.10 — już czas zimowy
  const box2 = sec(ok, 'botTest');
  check('włączone: „Powiadomienia w bramce włączone (od 25.10 21:30…)", stan zielony', /Powiadomienia w bramce włączone \(od 25\.10 21:30/.test(txt(box2))
    && !!box2.querySelector('.pollstate.ok'));
  check('bez błędów', off.errors.length === 0 && ok.errors.length === 0, off.errors.concat(ok.errors).join('; '));
}

/* ---------- S146: członkowie i klasy w panelu ---------- */
function S146(){
  console.log('S146: członkowie — imię z numerem osoby „(#2)", bez imienia sam „#3"; 📲 karta kontaktu wprost; klasa jednym stuknięciem po numerze osoby (kolejka), drugie zdejmuje, filtr; bez numerów telefonu');
  const on = {chatId: GRAFIK, chatName: 'Grafik', toKey: OWNER, toName: 'Grzesiek', enabled: true};
  const ROSTER = () => ({at: Date.parse('2026-10-26T12:00:00+01:00'), chatId: GRAFIK, chatName: 'Grafik', grafikList: true,
    list: [{nr: 1, name: 'Ania Kowalska', role: 'p', grafik: null, card: true}, {nr: 2, name: 'Basia', role: '', grafik: null, card: true},
           {nr: 3, name: '', role: 'k', grafik: null, card: true}, {nr: 4, name: '', role: '', grafik: null, card: false}],
    counts: {all: 4, none: 2, p: 1, o: 0, k: 1}});
  const empty = openPanel(HELPER({trigger: true}, on));
  check('bez pobranej listy — podpowiedź i „Pobierz członków"', /Lista jeszcze nie pobrana/.test(empty.html()) && !!doc(empty).querySelector('[data-act="rosterLoad"]'));
  empty.click('[data-act="rosterLoad"]');
  check('„Pobierz członków" — wprost do serwera, z PIN-em i grupą (domyślnie „Grafik")', JSON.stringify(lastCall(empty, 'getHelperMembers').args) === JSON.stringify(['1234', GRAFIK]));
  respondTo(empty, 'getHelperMembers', ROSTER());
  check('...lista na ekranie i komunikat', doc(empty).querySelectorAll('.roster .rrow').length === 4 && /Lista członków: 4 os\./.test(toastOf(empty)), toastOf(empty));

  const app = openPanel(HELPER({trigger: true, roster: ROSTER()}, on));
  const rows = () => [...doc(app).querySelectorAll('.roster .rrow')];
  const row = label => rows().find(li => txt(li.querySelector('.rname')) === label);
  const active = label => { const li = row(label); const b = li && li.querySelector('.rrole.on'); return b ? b.dataset.role : ''; };
  const tap = (label, sel) => row(label).querySelector(sel).dispatchEvent(new app.window.Event('click', {bubbles: true}));
  check('osoba: imię i numer osoby w nawiasie, bez imienia — sam numer osoby', JSON.stringify(rows().map(li => txt(li.querySelector('.rname'))))
    === JSON.stringify(['Ania Kowalska (#1)', 'Basia (#2)', '#3', '#4']) && !!row('Basia (#2)').querySelector('.rnr') && !row('#3').querySelector('.rnr'),
    JSON.stringify(rows().map(li => txt(li.querySelector('.rname')))));
  check('lista: klasy zaznaczone, liczniki w filtrze', active('Ania Kowalska (#1)') === 'p' && active('Basia (#2)') === '' && active('#3') === 'k'
    && /wszyscy 4/.test(txt(doc(app).querySelector('.rchips'))) && /🟣 fioletowi 1/.test(txt(doc(app).querySelector('.rchips'))));
  check('w panelu żadnych numerów telefonu', !/4860|@c\.us|@lid/.test(doc(app).querySelector('.roster').innerHTML));
  check('📲 przy osobach, do których bot zna numer — przy koncie bez numeru nie', !!row('#3').querySelector('[data-act="rosterCard"]')
    && !row('#4').querySelector('[data-act="rosterCard"]') && rows().filter(li => li.querySelector('[data-act="rosterCard"]')).length === 3);
  tap('Basia (#2)', '[data-role="o"]');
  check('stuknięcie „pomarańczowy": od razu na ekranie, zapis (numer osoby, klasa, PIN)', active('Basia (#2)') === 'o'
    && JSON.stringify(lastCall(app, 'setHelperRole').args) === JSON.stringify([2, 'o', '1234']));
  respondTo(app, 'setHelperRole', {nr: 2, role: 'o'});
  tap('Basia (#2)', '[data-role="o"]');
  check('drugie stuknięcie w tę samą klasę — zdejmuje', active('Basia (#2)') === '' && JSON.stringify(lastCall(app, 'setHelperRole').args) === JSON.stringify([2, '', '1234']));
  respondTo(app, 'setHelperRole', {nr: 2, role: ''});
  tap('#3', '[data-role="p"]');
  check('zmiana klasy: kandydat → fioletowy', active('#3') === 'p');
  const sent = app.shipped.filter(f => f === 'setHelperRole').length;
  failTo(app, 'setHelperRole', 'Przekroczono limit czasu');
  check('zapis bez odpowiedzi — powtórzony raz (RETRIABLE)', app.shipped.filter(f => f === 'setHelperRole').length === sent + 1);
  failTo(app, 'setHelperRole', 'Tej osoby nie ma na liście — pobierz członków jeszcze raz');
  check('nieudany zapis — wraca poprzednia klasa i komunikat', active('#3') === 'k' && /pobierz członków/.test(toastOf(app)), toastOf(app));

  tap('#3', '[data-act="rosterCard"]');
  check('📲 — wprost do serwera: numer osoby i PIN; w czasie wysyłki 📲 wstrzymane', JSON.stringify(lastCall(app, 'sendHelperContact').args) === JSON.stringify([3, '1234'])
    && row('Basia (#2)').querySelector('[data-act="rosterCard"]').disabled);
  respondTo(app, 'sendHelperContact', {nr: 3});
  check('...komunikat „Karta kontaktu #3", 📲 z powrotem', /Karta kontaktu #3/.test(toastOf(app)) && !row('Basia (#2)').querySelector('[data-act="rosterCard"]').disabled, toastOf(app));
  const cards = app.shipped.filter(f => f === 'sendHelperContact').length;
  tap('Basia (#2)', '[data-act="rosterCard"]');
  failTo(app, 'sendHelperContact', 'Przekroczono limit czasu');
  check('📲 bez odpowiedzi — bez powtórki (dwa wywołania = dwie karty), komunikat', app.shipped.filter(f => f === 'sendHelperContact').length === cards + 1
    && calls(app, 'sendHelperContact').length === 0 && /limit czasu/.test(toastOf(app)), toastOf(app));
  app.click('[data-act="rosterFilter"][data-f="none"]');
  check('filtr „bez klasy" — tylko osoby bez klasy', rows().length === 2 && !!row('Basia (#2)') && !!row('#4'));
  check('bez błędów', app.errors.length === 0 && empty.errors.length === 0, app.errors.concat(empty.errors).join('; '));
}

/* ---------- S147: Panel w sekcjach; pomocnik — produkcja i test (jeden aktywny), tryb funkcji na produkcji ---------- */
function S147(){
  console.log('S147: Panel w zwijanych sekcjach (28.10); pomocnik — dwie sekcje, aktywna z tego środowiska, druga wyszarzona; na produkcji tryb funkcji („w teście" / „gotowa" — do Grafiku) z pytaniem');
  const on = {chatId: GRAFIK, chatName: 'Grafik', toKey: OWNER, toName: 'Grzesiek', enabled: true};
  const app = openPanel(HELPER({trigger: true}, on));
  const keys = [...doc(app).querySelectorAll('#view .psec')].map(s => s.dataset.sec);
  check('sekcje po kolei: lista i e-mail, WhatsApp, pomocnik — produkcja, pomocnik — test, członkowie, diagnostyka', keys.join() === 'app,wa,botProd,botTest,members,diag', keys.join());
  const body = key => sec(app, key).querySelector('.psec-b');
  check('na start wszystkie zwinięte (treść ukryta), w nagłówku krótki stan', ['app', 'wa', 'botTest', 'members', 'diag'].every(k => body(k).classList.contains('hidden'))
    && /ankieta wył\./.test(txt(sec(app, 'wa').querySelector('.psec-badge'))) && txt(sec(app, 'botTest').querySelector('.psec-badge')) === 'włączony');
  openSec(app, 'app');
  check('stuknięcie w nagłówek rozwija sekcję', !body('app').classList.contains('hidden') && sec(app, 'app').querySelector('[data-act="panelSec"]').getAttribute('aria-expanded') === 'true'
    && !!sec(app, 'app').querySelector('#mailTemplate'));
  app.window.eval('fetchDiag()');                         // odświeżenie panelu — rozwinięte zostaje rozwinięte
  respondTo(app, 'getDiagnostics', DIAG(HELPER({trigger: true}, on)));
  calls(app, 'getPollState').forEach(() => respondTo(app, 'getPollState', {code:'authorized', text:'połączone'}));
  check('po przerysowaniu panelu sekcja dalej rozwinięta, reszta zwinięta', !body('app').classList.contains('hidden') && body('wa').classList.contains('hidden'));
  app.click('.psec[data-sec="app"] [data-act="panelSec"]');
  check('drugie stuknięcie zwija', body('app').classList.contains('hidden'));

  // test: sekcja produkcji wyszarzona (ustawia się ją w aplikacji produkcyjnej), sekcja testu działa
  const prodOff = sec(app, 'botProd');
  check('test: „Pomocnik Grafiku — produkcja" wyszarzona, bez rozwijania i bez pól, mówi, gdzie się ją ustawia i że ma pierwszeństwo',
    prodOff.classList.contains('off') && !prodOff.querySelector('[data-act], input, select') && /aplikacji produkcyjnej/.test(txt(prodOff)) && /pierwszeństwo/.test(txt(prodOff)),
    txt(prodOff));
  openSec(app, 'botTest');
  check('test: zwykłe włączniki, bez trybu „gotowa" (tu wszystko prywatnie), w opisie 🧪 i pierwszeństwo produkcji', !!doc(app).getElementById('helperF_evening')
    && !doc(app).querySelector('[id^="helperM_"]') && /tylko prywatnie/.test(txt(sec(app, 'botTest'))) && /pierwszeństwo ma produkcja/.test(txt(sec(app, 'botTest'))));

  // test czeka na produkcję — panel to mówi w obu sekcjach
  const lease = {at: Date.parse('2026-10-24T18:40:00+02:00'), until: Date.parse('2026-10-24T19:10:00+02:00'), waits: true};
  const wait = openPanel(HELPER({trigger: true, lease}, on));
  openSec(wait, 'botTest');
  check('test z sygnałem produkcji: „Czeka — pracuje pomocnik produkcji (sygnał 18:40, ważny do 19:10)", nie „zielony"; w nagłówku „czeka"',
    /Czeka — pracuje pomocnik produkcji \(sygnał 18:40, ważny do 19:10\)/.test(txt(sec(wait, 'botTest'))) && !sec(wait, 'botTest').querySelector('.pollstate.ok')
    && /czeka/.test(txt(sec(wait, 'botTest').querySelector('.psec-badge'))), txt(sec(wait, 'botTest').querySelector('.pollstate')));
  check('...a wyszarzona sekcja produkcji: „Teraz pracuje (sygnał …)"', /Teraz pracuje \(sygnał 24\.10 18:40/.test(txt(sec(wait, 'botProd'))), txt(sec(wait, 'botProd')));

  // produkcja: aktywna sekcja produkcji z trybem funkcji, sekcja testu wyszarzona
  const PROD = (o, s) => HELPER(Object.assign({env: 'prod'}, o), s);
  const pd = openPanel(PROD({trigger: true, lease: {at: Date.parse('2026-10-24T18:40:00+02:00'), on: true, ok: true, err: ''}}, on));
  const testOff = sec(pd, 'botTest');
  check('produkcja: „Pomocnik Grafiku — test" wyszarzona — ustawia się w aplikacji testowej, pracuje, gdy tu wyłączony; ostatni sygnał ✓',
    testOff.classList.contains('off') && !testOff.querySelector('[data-act], input, select') && /aplikacji testowej/.test(txt(testOff))
    && /tu\s+pomocnik jest wyłączony/.test(txt(testOff)) && /Ostatni sygnał: 24\.10 18:40:00 ✓/.test(txt(testOff)), txt(testOff));
  openSec(pd, 'botProd');
  const modes = [...doc(pd).querySelectorAll('[id^="helperM_"]')].map(s => s.id.slice(8));
  check('produkcja: tryb przy każdej funkcji z wiadomością (' + modes.length + '), „codziennie", pogoda i pytania — zwykłe włączniki',
    modes.join() === 'evening,morning,week,newPoll,members,lastWeek' && !doc(pd).getElementById('helperF_evening')
    && ['eveningAlways', 'weather', 'commands'].every(k => !!doc(pd).getElementById('helperF_' + k)), modes.join());
  check('...trzy tryby: wyłączona / w teście → do kontaktu / gotowa → do Grafiku; na start „w teście"', opts(pd, '#helperM_evening')
    === 'off=wyłączona|test=w teście → do kontaktu|group=gotowa → do Grafiku' && doc(pd).getElementById('helperM_week').value === 'test');
  check('...sygnał dla bota testowego doszedł', /Sygnał dla bota testowego \(„pracuję", 24\.10 18:40:00\): doszedł ✓/.test(txt(sec(pd, 'botProd'))), txt(sec(pd, 'botProd')));
  fill(pd, {'#helperM_evening': 'group', '#helperM_lastWeek': 'off'});
  check('zmiana trybu — „Niezapisane zmiany"', !hidden(pd, '.helperdirty'));
  let asked = '';
  pd.window.confirm = m => { asked = m; return false; };
  pd.click('[data-act="helperSave"]');
  check('nowa funkcja „gotowa" — pytanie przed zapisem (do kogo i co pójdzie); „Anuluj" — nic nie idzie', /Do grupy „Grafik" — do wszystkich jej członków — zaczną iść: skład na jutro — wieczorem\./.test(asked)
    && /imiona z kontaktów bota/.test(asked) && !calls(pd, 'setHelperSettings').length, asked);
  pd.window.confirm = m => { asked = m; return true; };
  pd.click('[data-act="helperSave"]');
  const save = lastCall(pd, 'setHelperSettings');
  check('„OK" — zapis z trybami: skład na jutro gotowy, miniony tydzień wyłączony, reszta w teście', !!save && save.args[0].ready.evening === true
    && save.args[0].features.evening === true && save.args[0].features.lastWeek === false && save.args[0].ready.lastWeek === false
    && save.args[0].ready.week === false && save.args[0].features.week === true, save && JSON.stringify(save.args[0]));
  const saved = Object.assign({}, save.args[0], {ready: Object.assign({}, NOT_READY, {evening: true})});
  respondTo(pd, 'setHelperSettings', PROD({trigger: true, lease: {at: Date.parse('2026-10-24T18:45:00+02:00'), on: true, ok: false, err: 'aplikacja testowa odpowiedziała kodem 404'}}, saved));
  const st = txt(sec(pd, 'botProd'));
  check('po zapisie: „do Grafiku: skład na jutro — wieczorem"; sygnał nie doszedł — ostrzeżenie', /pisze do Grzesiek; do Grafiku: skład na jutro — wieczorem/.test(st)
    && /nie doszedł — aplikacja testowa odpowiedziała kodem 404\. Jeśli bot testowy jest włączony, może pracować równocześnie/.test(st)
    && !!sec(pd, 'botProd').querySelector('.hint.pollerr'), st);
  asked = '';
  fill(pd, {'#helperMin': '4'});
  pd.click('[data-act="helperSave"]');
  check('zapis bez nowej funkcji „gotowej" — bez pytania', asked === '' && lastCall(pd, 'setHelperSettings').args[0].min === 4);

  // stałe przeglądarki = serwer (Config.gs)
  const env = makeContext({ props: { pin: '1234' } });
  const src = fs.readFileSync(path.join(ROOT, 'Script.html'), 'utf8');
  const client = JSON.parse(((src.match(/const HELPER_READY = (\[[^\]]*\]);/) || [])[1] || '[]').replace(/'/g, '"'));
  check('funkcje z trybem w przeglądarce = HELPER_READY na serwerze', JSON.stringify(client) === JSON.stringify(env.conf.HELPER_READY),
    JSON.stringify(client) + ' / ' + JSON.stringify(env.conf.HELPER_READY));

  // bez trybu edycji (5 stuknięć w datę) Panel to sama diagnostyka — bez sekcji
  const plain = buildApp();
  plain.seed(base({dogs: [dogFree({id: 1, name: 'Borys'})]}));
  plain.window.__state.view = 'diag';
  plain.window.eval("render('nav')");
  check('Panel bez trybu edycji: bez sekcji, diagnostyka od razu', !doc(plain).querySelector('.psec') && /Dane serwera tylko w trybie edycji/.test(plain.html()));
  // nieudane pobranie panelu — sekcja diagnostyki sama się rozwija (tam komunikat i „Spróbuj jeszcze raz")
  const failed = buildApp();
  failed.seed(base({dogs: [dogFree({id: 1, name: 'Borys'})]}));
  failed.window.__setAdmin('1234');
  failed.click('.tab[data-tab="diag"]');
  failTo(failed, 'getDiagnostics', 'Przekroczono limit czasu');
  check('nieudane pobranie: diagnostyka rozwinięta, „Spróbuj jeszcze raz" na wierzchu', !sec(failed, 'diag').querySelector('.psec-b').classList.contains('hidden')
    && !!sec(failed, 'diag').querySelector('[data-act="diagRetry"]') && /nie udało się pobrać/.test(txt(sec(failed, 'diag').querySelector('.psec-badge'))));
  check('bez błędów', [app, wait, pd, plain, failed].every(a => a.errors.length === 0), [app, wait, pd, plain, failed].map(a => a.errors.join('; ')).join(' | '));
}

/* ---------- S147b: pytanie także przy zmianie grupy i przy włączeniu, gdy coś jest już „gotowe" (review PR #8, nr 1) ---------- */
function S147b(){
  console.log('S147b: pomocnik na produkcji — zapis, po którym „gotowe" zaczną pisać do innej grupy albo w ogóle zaczną pisać (włączenie), najpierw pyta');
  const COMMUNITY = '120363000000000009@g.us';
  const PROD = (o, s) => HELPER(Object.assign({env: 'prod'}, o), s);
  const saved = {chatId: GRAFIK, chatName: 'Grafik', toKey: OWNER, toName: 'Grzesiek', enabled: true, ready: Object.assign({}, NOT_READY, {evening: true})};
  const app = openPanel(PROD({trigger: true}, saved));
  openSec(app, 'botProd');
  app.click('[data-act="pollChats"]');
  respondTo(app, 'getPollChats', [{id: GRAFIK, name: 'Grafik'}, {id: COMMUNITY, name: 'G13'}]);
  fill(app, {'#helperChat': COMMUNITY});
  let asked = '';
  app.window.confirm = m => { asked = m; return false; };
  app.click('[data-act="helperSave"]');
  check('zmiana grupy przy funkcji „gotowej" — pytanie z nową grupą i listą „gotowych"; „Anuluj" — nic nie idzie',
    /Do grupy „G13"/.test(asked) && /skład na jutro — wieczorem/.test(asked) && !calls(app, 'setHelperSettings').length, asked);
  app.window.confirm = () => true;
  app.click('[data-act="helperSave"]');
  check('...„OK" — zapis z nową grupą', !!lastCall(app, 'setHelperSettings') && lastCall(app, 'setHelperSettings').args[0].chatId === COMMUNITY);

  const off = openPanel(PROD({trigger: false}, Object.assign({}, saved, {enabled: false})));
  openSec(off, 'botProd');
  fill(off, {'#helperEnabled': true});
  asked = '';
  off.window.confirm = m => { asked = m; return false; };
  off.click('[data-act="helperSave"]');
  check('włączenie pomocnika z zapisanymi „gotowymi" — pytanie; „Anuluj" — nic nie idzie', /Do grupy „Grafik"/.test(asked) && /skład na jutro — wieczorem/.test(asked)
    && !calls(off, 'setHelperSettings').length, asked);

  // drugie review PR #8, nr 5 (decyzja właściciela 29.10): przy wyłączonym pomocniku nic nie idzie — zapis bez pytania,
  // pytanie dopiero przy włączeniu
  const idle = openPanel(PROD({trigger: false}, Object.assign({}, saved, {enabled: false})));
  openSec(idle, 'botProd');
  idle.click('[data-act="pollChats"]');
  respondTo(idle, 'getPollChats', [{id: GRAFIK, name: 'Grafik'}, {id: COMMUNITY, name: 'G13'}]);
  fill(idle, {'#helperChat': COMMUNITY});
  asked = '';
  idle.window.confirm = m => { asked = m; return true; };
  idle.click('[data-act="helperSave"]');
  check('wyłączony pomocnik: zmiana grupy przy „gotowej" — zapis bez pytania (nic nie zacznie pisać)', asked === ''
    && !!lastCall(idle, 'setHelperSettings') && lastCall(idle, 'setHelperSettings').args[0].chatId === COMMUNITY, asked);
  respondTo(idle, 'setHelperSettings', PROD({trigger: false}, Object.assign({}, saved, {enabled: false, chatId: COMMUNITY, chatName: 'G13'})));
  fill(idle, {'#helperEnabled': true});
  idle.click('[data-act="helperSave"]');
  check('...a włączenie — pytanie z grupą i „gotowymi"', /Do grupy „G13"/.test(asked) && /skład na jutro — wieczorem/.test(asked), asked);

  const same = openPanel(PROD({trigger: true}, saved));
  openSec(same, 'botProd');
  asked = '';
  same.window.confirm = m => { asked = m; return true; };
  fill(same, {'#helperMin': '4'});
  same.click('[data-act="helperSave"]');
  check('ta sama grupa, pomocnik był włączony — zapis bez pytania', asked === '' && !!lastCall(same, 'setHelperSettings') && lastCall(same, 'setHelperSettings').args[0].min === 4);
  check('bez błędów', [app, off, idle, same].every(a => a.errors.length === 0), [app, off, idle, same].map(a => a.errors.join('; ')).join(' | '));
}

/* ---------- S145c: przycisk bez odpowiedzi nie blokuje panelu na zawsze (bug nr 8) ---------- */
async function S145c(){
  console.log('S145c: pomocnik — odpowiedź nie przyszła (google.script.run nie oddzwonił): po T.helperWait przyciski wracają');
  const app = openPanel(HELPER({}, {chatId: GRAFIK, chatName: 'Grafik', toKey: OWNER, toName: 'Grzesiek', enabled: true}), {timing: {helperWait: 60}});
  app.click('[data-act="helperRun"]');
  check('przebieg w toku — przyciski wstrzymane', doc(app).querySelector('[data-act="helperGate"]').disabled);
  await new Promise(r => setTimeout(r, 120));
  check('po czasie: komunikat i przyciski z powrotem', /długo nie odpowiada/.test(toastOf(app)) && !doc(app).querySelector('[data-act="helperGate"]').disabled, toastOf(app));
  respondTo(app, 'helperRunNow', {run: {events: 0, sent: 0, err: ''}, panel: null});   // spóźniona odpowiedź — nic nie psuje
  check('spóźniona odpowiedź po czasie — bez błędów', app.errors.length === 0, app.errors.join('; '));
}

(async () => {
  for(const s of [S144, S145, S145b, S145d, S146, S147, S147b, S145c]){
    try{ await s(); }
    catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
  }
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})();

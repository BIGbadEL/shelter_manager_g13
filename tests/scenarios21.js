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
const GRAFIK = '120363000000000001@g.us', OWNER = '48600111222@c.us';
const FEATS = {evening:true, eveningAlways:true, morning:true, week:true, newPoll:true, members:true, lastWeek:true, weather:true, commands:true};
const HELPER = (o, s) => Object.assign({settings: Object.assign({enabled:false, chatId:'', chatName:'', toId:'', toName:'', min:3, evening:20, morning:7,
    weekDays:[0,3], names:'', features: Object.assign({}, FEATS)}, s),
  configured: true, env: 'test', trigger: false, stat: null, log: [], polls: [], people: 0, notes: 0, abs: 0, members: null}, o);
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
  check('sekcja w panelu: „Pomocnik Grafiku (test)", wyłączony', /Pomocnik Grafiku \(test\)/.test(app.html()) && /Wyłączony\./.test(app.html()));
  app.click('[data-act="pollChats"]');
  respondTo(app, 'getPollChats', [{id: GRAFIK, name: 'Grafik'}, {id: '120363000000000002@g.us', name: 'Grupa próbna'}]);
  app.click('[data-act="reportContacts"]');
  respondTo(app, 'getDayReportContacts', [{id: OWNER, name: 'Grzesiek', phone: '+48600111222'}]);
  check('grupa z listy grup bota, kontakt z kontaktów telefonu bota', opts(app, '#helperChat') === '=— wybierz grupę —|' + GRAFIK + '=Grafik|120363000000000002@g.us=Grupa próbna'
    && opts(app, '#helperTo') === '=— wybierz kontakt —|' + OWNER + '=Grzesiek (+48600111222)', opts(app, '#helperChat') + ' / ' + opts(app, '#helperTo'));
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
  const want = {chatId: GRAFIK, chatName: 'Grafik', toId: OWNER, toName: 'Grzesiek', min: 4, evening: 20, morning: 7, weekDays: [0, 5],
    names: '123 = Ania', features: Object.assign({}, FEATS, {weather: false}), enabled: true};
  check('zapis: grupa, kontakt (nazwa bez numeru), minimum, dni, imiona, włączniki, PIN', !!save && JSON.stringify(save.args) === JSON.stringify([want, '1234']),
    save && JSON.stringify(save.args));
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
    && /wysłane\s*\*Jutro — niedziela 25\.10/.test(view) && /skład grupy 30 os\./.test(view), view.slice(view.indexOf('Ankiety, które zna')));

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
  const ok = {chatId: GRAFIK, chatName: 'Grafik', toId: OWNER, toName: 'G', min: 3, evening: 20, morning: 7, weekDays: [0], names: '',
    features: Object.assign({}, FEATS), enabled: true};
  const cases = [ok, Object.assign({}, ok, {toId: GRAFIK}), Object.assign({}, ok, {min: 0}), Object.assign({}, ok, {min: L.MIN_MAX + 1}),
    Object.assign({}, ok, {names: 'x'.repeat(L.NAME_MAP)}), Object.assign({}, ok, {names: 'x'.repeat(L.NAME_MAP + 1)}),
    Object.assign({}, ok, {chatId: ''}), Object.assign({}, ok, {toId: ''}), Object.assign({}, ok, {chatId: '', enabled: false})];
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
  const on = {chatId: GRAFIK, chatName: 'Grafik', toId: OWNER, toName: 'Grzesiek', enabled: true};
  const off = openPanel(HELPER({trigger: true, gate: {ok: false, at: Date.now(), from: 0,
    missing: ['powiadomienia o wiadomościach przychodzących', 'powiadomienia o ankietach']}}, on));
  const box = [...doc(off).querySelectorAll('.panelbox')].find(b => /Pomocnik Grafiku/.test(b.textContent));
  const warn = box && [...box.querySelectorAll('.pollstate')].map(txt).join(' | ');
  check('bramka bez powiadomień: ostrzeżenie z listą, stan pomocnika nie „zielony"', /Nie widzi „Grafiku" — w konsoli Green API wyłączone: powiadomienia o wiadomościach przychodzących; powiadomienia o ankietach/.test(warn)
    && !box.querySelector('.pollstate.ok'), warn);
  const ok = openPanel(HELPER({trigger: true, gate: {ok: true, at: Date.now(), from: Date.parse('2026-10-25T21:30:00+01:00'), missing: []}}, on));   // 25.10 — już czas zimowy
  const box2 = [...doc(ok).querySelectorAll('.panelbox')].find(b => /Pomocnik Grafiku/.test(b.textContent));
  check('włączone: „Powiadomienia w bramce włączone (od 25.10 21:30…)", stan zielony', /Powiadomienia w bramce włączone \(od 25\.10 21:30/.test(txt(box2))
    && !!box2.querySelector('.pollstate.ok'));
  check('bez błędów', off.errors.length === 0 && ok.errors.length === 0, off.errors.concat(ok.errors).join('; '));
}

/* ---------- S146: członkowie i klasy w panelu ---------- */
function S146(){
  console.log('S146: członkowie — lista z grupy, klasa jednym stuknięciem (od razu na ekranie, zapis przez kolejkę), drugie zdejmuje, filtr, bez numerów');
  const on = {chatId: GRAFIK, chatName: 'Grafik', toId: OWNER, toName: 'Grzesiek', enabled: true};
  const ROSTER = () => ({at: Date.parse('2026-10-26T12:00:00+01:00'), chatId: GRAFIK, chatName: 'Grafik', grafikList: true,
    list: [{key: 'ma1', name: 'Ania Kowalska', named: true, role: 'p', grafik: null}, {key: 'mb2', name: 'Basia', named: true, role: '', grafik: null},
           {key: 'mc3', name: '…003', named: false, role: 'k', grafik: null}], counts: {all: 3, none: 1, p: 1, o: 0, k: 1}});
  const empty = openPanel(HELPER({trigger: true}, on));
  check('bez pobranej listy — podpowiedź i „Pobierz członków"', /Lista jeszcze nie pobrana/.test(empty.html()) && !!doc(empty).querySelector('[data-act="rosterLoad"]'));
  empty.click('[data-act="rosterLoad"]');
  check('„Pobierz członków" — wprost do serwera, z PIN-em i grupą (domyślnie „Grafik")', JSON.stringify(lastCall(empty, 'getHelperMembers').args) === JSON.stringify(['1234', GRAFIK]));
  respondTo(empty, 'getHelperMembers', ROSTER());
  check('...lista na ekranie i komunikat', doc(empty).querySelectorAll('.roster .rrow').length === 3 && /Lista członków: 3 os\./.test(toastOf(empty)), toastOf(empty));

  const app = openPanel(HELPER({trigger: true, roster: ROSTER()}, on));
  const row = name => [...doc(app).querySelectorAll('.roster .rrow')].find(li => txt(li.querySelector('.rname')) === name);
  const active = name => { const li = row(name); const b = li && li.querySelector('.rrole.on'); return b ? b.dataset.role : ''; };
  check('lista: imiona, klasy zaznaczone, liczniki w filtrze', !!row('Ania Kowalska') && active('Ania Kowalska') === 'p' && active('Basia') === '' && active('…003') === 'k'
    && /wszyscy 3/.test(txt(doc(app).querySelector('.rchips'))) && /🟣 fioletowi 1/.test(txt(doc(app).querySelector('.rchips'))));
  check('w panelu żadnych numerów telefonu — tylko klucze', !/4860|@c\.us|@lid/.test(doc(app).querySelector('.roster').innerHTML));
  row('Basia').querySelector('[data-role="o"]').dispatchEvent(new app.window.Event('click', {bubbles: true}));
  check('stuknięcie „pomarańczowy": od razu na ekranie, zapis (klucz, klasa, PIN)', active('Basia') === 'o'
    && JSON.stringify(lastCall(app, 'setHelperRole').args) === JSON.stringify(['mb2', 'o', '1234']));
  respondTo(app, 'setHelperRole', {key: 'mb2', role: 'o'});
  row('Basia').querySelector('[data-role="o"]').dispatchEvent(new app.window.Event('click', {bubbles: true}));
  check('drugie stuknięcie w tę samą klasę — zdejmuje', active('Basia') === '' && JSON.stringify(lastCall(app, 'setHelperRole').args) === JSON.stringify(['mb2', '', '1234']));
  respondTo(app, 'setHelperRole', {key: 'mb2', role: ''});
  row('…003').querySelector('[data-role="p"]').dispatchEvent(new app.window.Event('click', {bubbles: true}));
  check('zmiana klasy: kandydat → fioletowy', active('…003') === 'p');
  const sent = app.shipped.filter(f => f === 'setHelperRole').length;
  failTo(app, 'setHelperRole', 'Przekroczono limit czasu');
  check('zapis bez odpowiedzi — powtórzony raz (RETRIABLE)', app.shipped.filter(f => f === 'setHelperRole').length === sent + 1);
  failTo(app, 'setHelperRole', 'Tej osoby nie ma na liście — pobierz członków jeszcze raz');
  check('nieudany zapis — wraca poprzednia klasa i komunikat', active('…003') === 'k' && /pobierz członków/.test(toastOf(app)), toastOf(app));
  app.click('[data-act="rosterFilter"][data-f="none"]');
  check('filtr „bez klasy" — tylko osoby bez klasy', doc(app).querySelectorAll('.roster .rrow').length === 1 && !!row('Basia'));
  check('bez błędów', app.errors.length === 0 && empty.errors.length === 0, app.errors.concat(empty.errors).join('; '));
}

/* ---------- S145c: przycisk bez odpowiedzi nie blokuje panelu na zawsze (bug nr 8) ---------- */
async function S145c(){
  console.log('S145c: pomocnik — odpowiedź nie przyszła (google.script.run nie oddzwonił): po T.helperWait przyciski wracają');
  const app = openPanel(HELPER({}, {chatId: GRAFIK, chatName: 'Grafik', toId: OWNER, toName: 'Grzesiek', enabled: true}), {timing: {helperWait: 60}});
  app.click('[data-act="helperRun"]');
  check('przebieg w toku — przyciski wstrzymane', doc(app).querySelector('[data-act="helperGate"]').disabled);
  await new Promise(r => setTimeout(r, 120));
  check('po czasie: komunikat i przyciski z powrotem', /długo nie odpowiada/.test(toastOf(app)) && !doc(app).querySelector('[data-act="helperGate"]').disabled, toastOf(app));
  respondTo(app, 'helperRunNow', {run: {events: 0, sent: 0, err: ''}, panel: null});   // spóźniona odpowiedź — nic nie psuje
  check('spóźniona odpowiedź po czasie — bez błędów', app.errors.length === 0, app.errors.join('; '));
}

(async () => {
  for(const s of [S144, S145, S145b, S145d, S146, S145c]){
    try{ await s(); }
    catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
  }
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})();

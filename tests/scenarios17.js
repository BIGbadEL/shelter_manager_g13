// S122-S128: dziennik spowolnień (1.2) — to, co widzi telefon: wolne i nieudane wywołania, odczyt
// bez odpowiedzi, strona, która długo szła, chwile, w których strona stała, błędy skryptu; wysyłka do
// serwera (reportDiag) i Panel. Serwer (Diag.gs) sprawdza backend.js (B62-B64); S128 łączy oba harnessy.
const { buildApp, dogFree } = require('./harness');
const { makeContext } = require('./backend-harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const D = '2026-10-08';
const base = o => Object.assign({dogs:[dogFree({id:1, name:'Borys'})], slots:[], tasks:[{id:1, text:'Woda', date:D, done:false}],
  today:D, businessDate:D, resetHour:18, env:'prod'}, o || {});
// krótkie czasy dziennika: wolne od 50 ms, bez odpowiedzi po 150 ms, zamrożenie od 300 ms, wysyłka co 100 ms, zegar co 40 ms
const FAST = { diagSlow:50, diagNoReply:150, diagFreeze:300, diagSend:100, diagBeat:40 };
const URL = 'https://n-test-0lu-script.googleusercontent.com/userCodeAppPanel';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pendingOf = app => app.window.__diag().pending;
const calls = (app, fn) => app.pending.filter(p => p.fn===fn);
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
const block = (app, ms) => app.window.eval(`(()=>{ const t = Date.now(); while(Date.now() - t < ${ms}){} })()`);
const reported = app => [].concat(...app.diagReports);

/* ---------- S122: wywołania widziane z telefonu ---------- */
async function S122(){
  console.log('S122: dziennik — wolne i nieudane zapisy oraz odczyty widziane z telefonu, bez imion, z opisem telefonu');
  // wysyłka bez odpowiedzi wolno ponowić po diagNoReply — tu dłużej niż cały scenariusz
  const app = buildApp({ timing: Object.assign({}, FAST, {diagNoReply: 5000}), diagManual: true });
  app.seed(base());
  app.window.__enqueue('setTaskDone', [1, true], {key:'task:1'});
  respondTo(app, 'setTaskDone', {ok:true});
  check('szybki zapis: nic w dzienniku', pendingOf(app).length === 0, JSON.stringify(pendingOf(app)));
  app.window.__enqueue('setTaskDone', [1, false], {key:'task:1'});
  await sleep(80);
  respondTo(app, 'setTaskDone', {ok:true});
  let p = pendingOf(app);
  check('wolny zapis: wpis „call" z nazwą i czasem tam i z powrotem', p.length === 1 && p[0].kind === 'call' && p[0].fn === 'setTaskDone'
    && p[0].ms >= 50 && !p[0].msg, JSON.stringify(p));
  check('...z identyfikatorem wpisu, znakiem telefonu i opisem (bez imion)', /^[a-z0-9]{8}$/.test(p[0].id) && /^[a-z0-9]{6}$/.test(p[0].dev)
    && typeof p[0].ua === 'string' && p[0].ua.length > 0 && !/Borys/.test(JSON.stringify(p)), JSON.stringify(p[0]));
  app.window.__enqueue('setTaskDone', [1, true], {key:'task:1'});
  failTo(app, 'setTaskDone', 'Usługa niedostępna');
  failTo(app, 'setTaskDone', 'Usługa niedostępna');            // powtórka RETRIABLE też
  p = pendingOf(app);
  check('nieudany zapis i jego powtórka: dwa wpisy z komunikatem serwera', p.length === 3 && p[1].msg === 'Usługa niedostępna'
    && p[2].msg === 'Usługa niedostępna', JSON.stringify(p.slice(1)));
  app.window.__enqueue('setTaskDone', [1, false], {key:'task:1'});
  app.window.__force();
  app.window.eval('checkStuck()');
  p = pendingOf(app);
  check('zapis bez odpowiedzi (watchdog): wpis z komunikatem „zerwane"', p.length === 4 && /zerwane/.test(p[3].msg), JSON.stringify(p[3]));
  // wysyłka do serwera: tylko gdy nic innego nie leci
  check('w trakcie zapisu dziennik nie leci na serwer', calls(app, 'reportDiag').length === 0 && app.state().sending === true);
  await sleep(150);
  check('...nadal nie (zapis w drodze)', calls(app, 'reportDiag').length === 0);
  while(calls(app, 'setTaskDone').length) respondTo(app, 'setTaskDone', {ok:true});   // zaginiony i jego powtórka
  await sleep(160);
  check('po zapisach: jedna wysyłka z wpisami', calls(app, 'reportDiag').length === 1 && calls(app, 'reportDiag')[0].args[0].length >= 4,
    JSON.stringify(app.pending.map(x => x.fn)));
  await sleep(150);
  check('...i nie druga, dopóki pierwsza nie wróciła', calls(app, 'reportDiag').length === 1);
  failTo(app, 'reportDiag', 'brak sieci');
  check('nieudana wysyłka: wpisy zostają', pendingOf(app).length >= 4);
  await sleep(150);
  const batch = calls(app, 'reportDiag')[0].args[0];
  respondTo(app, 'reportDiag', {ok:true, n:batch.length});
  check('udana: wysłane znikają z kolejki', pendingOf(app).length === 0, JSON.stringify(pendingOf(app)));
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));

  // wysyłka, na którą odpowiedź nie przyszła: po diagNoReply wolno ponowić (serwer odrzuca powtórki po id)
  const lost = buildApp({ timing: Object.assign({}, FAST, {diagNoReply: 400}), diagManual: true, boot: base() });
  lost.window.dispatchEvent(new lost.window.ErrorEvent('error', { message: 'x' }));
  await sleep(220);
  check('wysyłka bez odpowiedzi: na razie jedna', calls(lost, 'reportDiag').length === 1);
  await sleep(450);
  check('...po diagNoReply druga z tym samym wpisem', calls(lost, 'reportDiag').length === 2
    && calls(lost, 'reportDiag')[1].args[0][0].id === calls(lost, 'reportDiag')[0].args[0][0].id);
}

/* ---------- S123: odczyt bez odpowiedzi ---------- */
async function S123(){
  console.log('S123: dziennik — odczyt (getData) bez odpowiedzi: wpis, zanim wróci; po powrocie drugi z czasem; nieudany odczyt');
  const app = buildApp({ timing: FAST });
  const all = () => reported(app).concat(pendingOf(app));     // wysłane (harness odpowiada sam) i czekające
  await sleep(250);                                            // startowy getData wisi
  check('odczyt wisi dłużej niż diagNoReply: wpis „bez odpowiedzi"', all().filter(e => e.fn === 'getData' && e.msg === 'bez odpowiedzi').length === 1, JSON.stringify(all()));
  await sleep(120);
  check('...raz, nie z każdym tyknięciem zegara', all().filter(e => e.msg === 'bez odpowiedzi').length === 1);
  app.seed(base());
  check('odpowiedź po czasie: drugi wpis z pełnym czasem', all().filter(e => e.fn === 'getData' && e.msg === 'odpowiedź po czasie' && e.ms >= 250).length === 1,
    JSON.stringify(all()));
  check('lista działa jak zwykle', /Borys/.test(app.html()));
  app.window.eval('refresh()');
  failTo(app, 'getData', 'Przekroczono limit czasu');
  check('nieudany odczyt: wpis z komunikatem', all().filter(e => e.fn === 'getData' && e.msg === 'Przekroczono limit czasu').length === 1);
  app.window.eval('refresh()');
  respondTo(app, 'getData', base());
  check('szybki odczyt: bez wpisu', all().filter(e => e.fn === 'getData').length === 3, JSON.stringify(all().map(e => e.msg)));
  await sleep(300);
  check('...także po diagNoReply (odczyt, który wrócił, nie wisi dalej w „w drodze")', all().filter(e => e.fn === 'getData').length === 3,
    JSON.stringify(all().map(e => e.msg)));
  check('wpisy pojechały na serwer (reportDiag) i zniknęły z kolejki', reported(app).length >= 3 && pendingOf(app).length === 0);
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));
}

/* ---------- S124: strona stała ---------- */
async function S124(){
  console.log('S124: dziennik — strona stała, choć była na ekranie (zegar się spóźnił); karta w tle i okienko pytania to nie zamrożenie');
  const app = buildApp({ timing: FAST, boot: base() });
  const freezes = () => reported(app).concat(pendingOf(app)).filter(e => e.kind === 'freeze');
  await sleep(100);
  check('zwykła praca: nic', reported(app).length + pendingOf(app).length === 0, JSON.stringify(pendingOf(app)));
  block(app, 450);
  await sleep(100);
  let p = freezes();
  check('skrypt zajęty 450 ms: wpis „freeze" z czasem przerwy', p.length === 1 && p[0].ms >= 450, JSON.stringify(p));
  // karta w tle: przeglądarka usypia zegary — to nie jest zamrożenie. Zegar nie tyka w tle (blok),
  // a pierwsze tyknięcie przychodzi już po powrocie na ekran — dopiero to rozróżnia „tło" od „stała"
  const hide = h => {
    Object.defineProperty(app.window.document, 'hidden', { configurable: true, get: () => h });
    app.window.document.dispatchEvent(new app.window.Event('visibilitychange'));
  };
  hide(true);
  block(app, 450);
  hide(false);
  await sleep(100);
  check('karta w tle: bez wpisu', freezes().length === 1, JSON.stringify(freezes()));
  hide(true);
  await sleep(100);
  block(app, 450);
  await sleep(100);
  hide(false);
  await sleep(100);
  check('...ani wtedy, gdy zegar tykał w tle', freezes().length === 1, JSON.stringify(freezes()));
  // okienko „Usunąć zadanie?" zatrzymuje skrypt na czas pytania
  app.window.confirm = () => { const t = Date.now(); while(Date.now() - t < 450){} return false; };
  app.window.__setAdmin('1234');
  app.click('[data-act="taskRemove"][data-id="1"]');
  await sleep(100);
  check('okienko pytania: bez wpisu', freezes().length === 1, JSON.stringify(freezes()));
  check('...a pytanie naprawdę padło (odmowa — zadanie zostaje)', app.window.__state.tasks.length === 1);
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));
}

/* ---------- S125: strona, która długo szła ---------- */
async function S125(){
  console.log('S125: dziennik — ile strona szła do telefonu (od oddania przez serwer do startu skryptu)');
  // próg 5 s — samo wczytanie strony w jsdom trwa dłużej niż FAST.diagSlow
  const T5 = Object.assign({}, FAST, { diagSlow: 5000 });
  const slow = buildApp({ timing: T5, boot: base(), served: Date.now() - 12000 });
  let p = pendingOf(slow);
  check('12 s od oddania strony: wpis „start" z czasem', p.length === 1 && p[0].kind === 'start' && p[0].ms >= 12000 && !p[0].msg, JSON.stringify(p));
  const nob = buildApp({ timing: T5, served: Date.now() - 9000 });
  check('...bez danych w stronie (serwer nie wpisał stanu): z dopiskiem', pendingOf(nob).filter(e => e.kind === 'start' && e.msg === 'bez danych w stronie').length === 1);
  const fast = buildApp({ timing: T5, boot: base(), served: Date.now() - 10 });
  const none = buildApp({ timing: T5, boot: base() });
  const clock = buildApp({ timing: T5, boot: base(), served: Date.now() - 5 * 3600000 });
  const future = buildApp({ timing: T5, boot: base(), served: Date.now() + 60000 });
  check('szybko, bez znacznika, zły zegar (5 h), znacznik z przyszłości: bez wpisu',
    [fast, none, clock, future].every(a => pendingOf(a).filter(e => e.kind === 'start').length === 0));
  check('bez błędów', [slow, nob, fast, none, clock, future].every(a => a.errors.length === 0));
}

/* ---------- S126: błędy skryptu, pamięć między otwarciami ---------- */
async function S126(){
  console.log('S126: dziennik — błędy skryptu (raz na minutę ten sam), niewysłane wpisy przeżywają przeładowanie strony');
  const app = buildApp({ timing: Object.assign({}, FAST, {diagSend: 60000}), boot: base(), url: URL });
  const err = msg => app.window.dispatchEvent(new app.window.ErrorEvent('error', { message: msg, lineno: 42 }));
  err('x is not defined');
  err('x is not defined');
  err('y is null');
  let p = pendingOf(app).filter(e => e.kind === 'error');
  check('błąd skryptu z linią, ten sam komunikat raz', p.length === 2 && p[0].msg === 'x is not defined (linia 42)' && p[1].msg === 'y is null (linia 42)', JSON.stringify(p));
  app.window.__state.dogs = null;                               // rysowanie się wywróci
  app.window.eval('render()');
  p = pendingOf(app).filter(e => e.kind === 'error');
  check('wywrotka rysowania: wpis „rysowanie: …"', p.length === 3 && /^rysowanie: /.test(p[2].msg), JSON.stringify(p[2]));
  app.window.__state.dogs = base().dogs;
  const stored = JSON.parse(app.window.localStorage.getItem('g13diag'));
  check('niewysłane czekają w localStorage', Array.isArray(stored) && stored.length === pendingOf(app).length);
  const dev = app.window.localStorage.getItem('g13dev');
  // przeładowanie strony: to samo urządzenie, wpisy z poprzedniego otwarcia jadą przy pierwszej okazji
  const again = buildApp({ timing: FAST, boot: base(), url: URL, storage: { g13diag: JSON.stringify(stored), g13dev: dev } });
  check('po przeładowaniu: te same wpisy w kolejce, ten sam znak telefonu', pendingOf(again).length === stored.length
    && again.window.__diag().dev === dev);
  await sleep(150);
  check('...i wysłane przy pierwszej okazji', reported(again).length === stored.length && pendingOf(again).length === 0
    && JSON.parse(again.window.localStorage.getItem('g13diag')).length === 0);
  // sufit kolejki: telefon bez zasięgu nie zbiera w nieskończoność
  for(let i = 0; i < 30; i++) err('błąd ' + i);
  check('najwyżej 20 wpisów czeka, najnowsze zostają', pendingOf(app).length === 20 && pendingOf(app)[19].msg === 'błąd 29 (linia 42)');
  // localStorage niedostępny (about:blank w jsdom, tryb prywatny) — dziennik działa w pamięci
  const nols = buildApp({ timing: FAST, boot: base() });
  nols.window.dispatchEvent(new nols.window.ErrorEvent('error', { message: 'z' }));
  check('bez localStorage: wpis w pamięci, bez wyjątku', pendingOf(nols).length === 1 && nols.errors.length === 1);
}

/* ---------- S127: Panel ---------- */
async function S127(){
  console.log('S127: dziennik w Panelu — serwer i telefony razem, od najnowszego, z krokami, opisem telefonu i „dosłane"');
  const app = buildApp({ boot: base() });
  app.window.__setAdmin('1234');
  app.click('.tab[data-tab="diag"]');
  const at = iso => Date.parse(iso);
  respondTo(app, 'getDiagnostics', {env:'prod', triggerInstalled:true, triggerCount:1, resetHour:18, serverDate:D, serverTime:'15:00',
    businessDate:D, timezone:'Europe/Warsaw', dogCount:1, taskCount:1, histCount:0, poll:null,
    diag: { slowMs: 3000, keep: 30,
      server: [
        { at: at('2026-10-07T21:31:31+02:00'), fn:'doGet', ms: 43898, parts: { szablon: 40, ustawienia: 120, psy: 300, spacery: 41500, zadania: 90, reszta: 50, strona: 400 } },
        { at: at('2026-10-07T21:36:44+02:00'), fn:'reserve', ms: 10365, parts: { blokada: 30, praca: 10300, zapis: 35 } },
        { at: at('2026-10-02T10:05:00+02:00'), fn:'reserve', ms: 20000, parts: { blokada: 20000 }, err: 'Lock timeout <b>' },
      ],
      phones: [
        { id:'aaaaaaa1', kind:'call', fn:'getData', ms: 41234, msg:'bez odpowiedzi', dev:'a3f9c1', ua:'iPhone iOS 17.5 · Safari 17.5',
          at: at('2026-10-07T21:32:00+02:00'), rx: at('2026-10-07T21:40:00+02:00') },
        { id:'aaaaaaa2', kind:'freeze', ms: 8100, dev:'a3f9c1', ua:'iPhone iOS 17.5 · Safari 17.5', at: at('2026-10-08T12:04:10+02:00'), rx: at('2026-10-08T12:04:20+02:00') },
        { id:'aaaaaaa3', kind:'error', msg:'<img src=x onerror=alert(1)>', dev:'77bb00', at: at('2026-10-08T12:00:00+02:00'), rx: at('2026-10-08T12:00:10+02:00') },
        { id:'aaaaaaa4', kind:'start', ms: 12500, dev:'77bb00', ua:'Android 14 · Chrome 129', at: at('2026-10-08T11:01:10+02:00'), rx: at('2026-10-08T11:01:20+02:00') },
      ] } });
  const doc = app.window.document;
  const rows = [...doc.querySelectorAll('.diaglog')];
  const txt = rows.map(r => r.textContent.replace(/\s+/g, ' ').trim());
  check('sekcja „Dziennik spowolnień" z 7 wpisami', /Dziennik spowolnień/.test(app.html()) && rows.length === 7, txt.join(' || '));
  check('od najnowszego: telefon 12:04, …, serwer 2.10 na końcu', /strona stała 8,1 s/.test(txt[0]) && /2\.10 10:05:00/.test(txt[6]), txt.join(' || '));
  const og = txt.find(t => /otwarcie strony/.test(t));
  check('serwer: „otwarcie strony 43,9 s" z krokami od 100 ms (spacery 41,5 s; bez „szablon 0,0")', /serwer/.test(og) && /otwarcie strony 43,9 s/.test(og)
    && /spacery 41,5 s/.test(og) && /ustawienia 0,1 s/.test(og) && /strona 0,4 s/.test(og) && !/szablon/.test(og) && !/reszta/.test(og), og);
  check('serwer: zapis z blokadą / pracą', txt.some(t => /reserve 10,4 s/.test(t) && /praca 10,3 s/.test(t)));
  const ph = txt.find(t => /bez odpowiedzi/.test(t));
  check('telefon: znak, opis, „odczyt listy 41,2 s — bez odpowiedzi", „dosłane"', /telefon a3f9c1 · iPhone iOS 17\.5 · Safari 17\.5/.test(ph)
    && /odczyt listy 41,2 s — bez odpowiedzi/.test(ph) && /dosłane 7\.10 21:40:00/.test(ph), ph);
  check('telefon: „strona szła do telefonu 12,5 s"', txt.some(t => /strona szła do telefonu 12,5 s/.test(t) && /Android 14 · Chrome 129/.test(t)));
  check('treść z telefonu i serwera jako tekst, nie HTML', !doc.querySelector('.diaglog img') && !doc.querySelector('.diaglog b b')
    && txt.some(t => /<img src=x/.test(t)) && txt.some(t => /Lock timeout <b>/.test(t)));
  check('bez wpisu „dosłane", gdy doszło od razu', !/dosłane/.test(txt[0]));

  const empty = buildApp({ boot: base() });
  empty.window.__setAdmin('1234');
  empty.click('.tab[data-tab="diag"]');
  respondTo(empty, 'getDiagnostics', {env:'prod', triggerInstalled:true, triggerCount:1, resetHour:18, serverDate:D, serverTime:'15:00',
    businessDate:D, timezone:'Europe/Warsaw', dogCount:1, taskCount:1, histCount:0, poll:null, diag: { server: [], phones: [], slowMs: 3000, keep: 30 }});
  check('pusty dziennik: „Pusto — nic wolnego ani nieudanego."', /Pusto — nic wolnego ani nieudanego\./.test(empty.html()));
  const old = buildApp({ boot: base() });
  old.window.__setAdmin('1234');
  old.click('.tab[data-tab="diag"]');
  respondTo(old, 'getDiagnostics', {env:'prod', triggerInstalled:true, triggerCount:1, resetHour:18, serverDate:D, serverTime:'15:00',
    businessDate:D, timezone:'Europe/Warsaw', dogCount:1, taskCount:1, histCount:0, poll:null});
  check('serwer bez dziennika (starszy): bez sekcji, panel działa', !/Dziennik spowolnień/.test(old.html()) && /Stan serwera/.test(old.html()));

  const ua = s => app.window.uaLabel(s);
  const cases = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'iPhone iOS 17.5 · Safari 17.5'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1', 'iPhone iOS 16.6 · Chrome 129'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'iPhone iOS 17.5 · WebView'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', 'Android 14 · Chrome 129'],
    ['Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 OPR/84.0.0.0', 'Android 13 · Opera 84'],
    ['Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'Android 14 · Samsung 26'],
    ['Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36', 'Android 14 · WebView'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0', 'Windows · Edge 129'],
    ['', 'nieznany'],
  ];
  const bad = cases.filter(([s, want]) => ua(s) !== want).map(([s, want]) => want + ' ≠ ' + ua(s));
  check('opis telefonu z userAgent (iPhone/Android, Safari/Chrome/Opera/Samsung/Edge/WebView)', bad.length === 0, bad.join('; '));
  check('bez błędów', app.errors.length === 0 && empty.errors.length === 0 && old.errors.length === 0, app.errors.concat(empty.errors, old.errors).join('; '));
}

/* ---------- S128: kontrakt telefon → serwer ---------- */
async function S128(){
  console.log('S128: dziennik — wpisy z telefonu (wszystkie rodzaje) przyjmuje serwer bez strat (oba harnessy)');
  const app = buildApp({ timing: FAST, served: Date.now() - 8000 });   // start bez danych w stronie
  await sleep(200);                                                    // getData bez odpowiedzi
  app.seed(base());
  app.window.__enqueue('setTaskDone', [1, true], {key:'task:1'});
  failTo(app, 'setTaskDone', 'Zły stan');
  failTo(app, 'setTaskDone', 'Zły stan');
  app.window.dispatchEvent(new app.window.ErrorEvent('error', { message: 'boom', lineno: 7 }));
  block(app, 400);
  await sleep(250);
  const sent = reported(app);
  const kinds = [...new Set(sent.map(e => e.kind))].sort().join(',');
  check('telefon wysłał wszystkie rodzaje wpisów', kinds === 'call,error,freeze,start', kinds + ' | ' + JSON.stringify(sent));
  const env = makeContext({ sheets: [], props: { pin: '1' } });
  const r = env.api.reportDiag(sent.slice(0, 10));
  const got = JSON.parse(env.props.diagPhones || '[]');
  check('serwer przyjmuje każdy z nich', r.ok === true && r.n === Math.min(10, sent.length) && got.length === r.n, JSON.stringify(r));
  const same = got.every(g => { const s = sent.find(x => x.id === g.id); return s && s.kind === g.kind && s.fn === g.fn && s.ms === g.ms
    && (s.msg || undefined) === g.msg && s.dev === g.dev && s.ua === g.ua && s.at === g.at; });
  check('...bez zmian w treści', same, JSON.stringify(got.slice(0, 3)));
  check('bez błędów (poza celowym „boom")', app.errors.length === 1 && /boom/.test(app.errors[0]), app.errors.join('; '));
}

(async ()=>{
  for(const s of [S122, S123, S124, S125, S126, S127, S128]){
    try{ await s(); }
    catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
  }
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})();

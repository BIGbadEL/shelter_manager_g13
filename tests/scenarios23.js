// S153–S158 (1.6): raport do schroniska w przeglądarce — ramka pod listą bieżącego dnia i w minionym dniu, adres formularza
// z datą i psami, psy spoza formularza (inna grupa, inny numer, bez numeru, numer kilka razy), pamięć otwarć („otwierany o…",
// „Doślij nowe"), osłona stuknięć, panel (link, zapis i sprawdzenie wprost, formularz a katalog) i te same reguły co serwer
// (serwer: tests/shelter.js, B101–B106). Numer formularza wymyślony.
const { buildApp, dogFree, ROOT } = require('./harness');
const { makeContext } = require('./backend-harness');
const fs = require('fs'), path = require('path');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = s => JSON.stringify(s);
const D = '2026-10-29', Y = '2026-10-28';
const FORM_ID = 'TESTFORMaBcDeFgHiJkLmNoPq_RsTuV-0123456789.u';
const PAGE = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx';
const LINK = PAGE + '?id=' + FORM_ID;
const DQ = 'r' + 'a1'.repeat(16), PQ = 'r' + 'b2'.repeat(16);
// jak formularz schroniska: psy TTB z grupą w nazwie, tabulator w środku, zera z przodu; „Dubel" — numer na dwóch pozycjach
const CHOICES = ['Bysiu(TTB) 0689/21', 'Marvel\t1075/24', 'Draco\t0552/26', 'Mała Mi 0893/26', 'Hania(TTB) 0236/25',
  'Dubel 0111/26', 'Dubel bis 111/26', 'Ktoś\t0999/26'];
const FORM = o => Object.assign({page: PAGE, id: FORM_ID, title: 'Grupa G13', dateQ: DQ, dogQ: PQ, choices: CHOICES, extra: [], active: true}, o);
const DOGS = () => [
  dogFree({id:1, name:'Draco', ident:'552/26', walks:2}),
  dogFree({id:2, name:'Bysiu', ident:'0689/21', team:'TTB'}),
  dogFree({id:3, name:'Elvis', ident:'756/26', team:'Psubraty'}),
  dogFree({id:4, name:'Luna', ident:''}),
  dogFree({id:5, name:'Marvel', ident:'1075/24'}),
  dogFree({id:6, name:'Rex', ident:'900/26'}),
  dogFree({id:7, name:'Mała Mi', ident:'893/26'}),
  dogFree({id:8, name:'Hania', ident:'236/25', team:'TTB'}),
  dogFree({id:9, name:'Dubel', ident:'111/2026'}),
];
const sl = (id, status, n) => ({date: D, dogId: id, slot: n || 1, status, who: status === 'team' ? 'TTB' : 'Ania',
  time: status === 'walked' ? '12:00' : '', group: 0});
// Draco — oba spacery; Hanię wzięła jej grupa (nie nasz spacer); Marvel — jeszcze na spacerze
const SLOTS = () => [sl(1,'walked',1), sl(1,'walked',2), sl(2,'walked'), sl(3,'walked'), sl(4,'walked'), sl(5,'reserved'),
  sl(6,'walked'), sl(8,'team'), sl(9,'walked')];
const base = o => Object.assign({dogs: DOGS(), slots: SLOTS(), tasks: [], today: D, businessDate: D, resetHour: 18, env: 'prod',
  shelterForm: FORM(), shelterOpened: {}}, o || {});
const DIAG = shelter => ({env:'prod', triggerInstalled:true, triggerCount:1, resetHour:18, serverDate:D, serverTime:'10:00', businessDate:D,
  timezone:'Europe/Warsaw', dogCount:9, taskCount:0, histCount:3, poll:null, dayReport:null, helper:null, shelter});
const PANEL = o => Object.assign({link: LINK, title: 'Grupa G13', count: 8, at: '2026-10-29 3:05', err: '', errAt: '', active: true}, o);

const doc = app => app.window.document;
const S = app => app.window.__state;
const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '(brak)';
const box = app => doc(app).querySelector('.shelterbox');
const links = app => [...doc(app).querySelectorAll('.shelterbox [data-act="shelterReport"]')];
const warns = app => [...doc(app).querySelectorAll('.shelterbox .shelter-w')].map(txt);
const toastOf = app => doc(app).getElementById('toast').textContent;
const calls = (app, fn) => app.pending.filter(p => p.fn === fn);
const lastCall = (app, fn) => calls(app, fn).slice(-1)[0];
const urlOf = a => new URL(a.getAttribute('href'));
const picked = a => JSON.parse(urlOf(a).searchParams.get(PQ));
function respondTo(app, fn, res){
  const i = app.pending.findIndex(p => p.fn === fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].ok(res);
}
function failTo(app, fn, msg){
  const i = app.pending.findIndex(p => p.fn === fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].fail(new Error(msg));
}
function fill(app, sel, value){
  const el = doc(app).querySelector(sel);
  if(!el) throw new Error('brak pola ' + sel);
  el.value = value;
  el.dispatchEvent(new app.window.Event('input', {bubbles:true}));
}
const go = (app, date) => { S(app).date = date; S(app).follow = false; app.window.eval("render('nav')"); };
const ev = (app, type, detail) => new app.window.MouseEvent(type, {bubbles:true, cancelable:true, clientX:0, clientY:0, detail:detail||0});
/**
 * Prawdziwe stuknięcie palcem w link (pointerdown + klik z licznikiem). Zwraca, czy aplikacja zatrzymała otwarcie
 * formularza (preventDefault) — po niej i tak zatrzymujemy, żeby jsdom nie próbował nawigacji.
 */
function tapLink(app, el){
  let prevented = null;
  const spy = e => { prevented = e.defaultPrevented; e.preventDefault(); };
  app.window.addEventListener('click', spy);
  el.dispatchEvent(ev(app, 'pointerdown'));
  el.dispatchEvent(ev(app, 'click', 1));
  app.window.removeEventListener('click', spy);
  return prevented;
}
const sec = (app, key) => doc(app).querySelector('.psec[data-sec="' + key + '"]');
const openSec = (app, key) => { if(!sec(app, key).classList.contains('open')) app.click('.psec[data-sec="' + key + '"] [data-act="panelSec"]'); return sec(app, key); };
const backend = () => makeContext({ now: '2026-10-29T10:00:00+02:00', props: { pin: '4321' } });

/* ---------- S153: numer psa — ta sama reguła po obu stronach ---------- */
function S153(){
  console.log('S153: numer psa do porównania z formularzem (shelterKey) — i serwer przyjmuje dokładnie takie numery');
  const app = buildApp(); app.seed(base());
  const k = s => app.window.shelterKey(s);
  const cases = [['Draco\t0552/26','552/26'], ['Bysiu(TTB) 0689/21','689/21'], ['Mała Mi 0893/26','893/26'], ['552/26','552/26'],
    ['0552/26','552/26'], ['552/2026','552/26'], [' 552 / 26 ','552/26'], ['nr 1075/24','1075/24'], ['0/26','0/26'], ['000000/26','0/26'],
    ['', ''], [null, ''], ['Luna', ''], ['552-26', ''], ['12/345', ''], ['1234567/26', ''], ['Pies 2 1/26', '1/26'],
    ['stary 1/25, nowy 7/26', '7/26'], ['12/3', ''], ['1/26/27', '1/26']];
  const bad = cases.filter(([s, want]) => k(s) !== want);
  check('zera z przodu, rok czterocyfrowy, spacje, ostatni numer w tekście; bez numeru — pusto (' + cases.length + ' przypadków)', bad.length === 0,
    J(bad.map(([s]) => [s, k(s)])));
  const env = backend();
  const accepted = key => { try { return J(env.api.shelterReportOpened(D, [key]).mark.keys).indexOf(J(key)) >= 0; } catch(e){ return false; } };
  const keys = cases.map(([s]) => k(s)).filter(Boolean);
  check('serwer przyjmuje każdy numer z przeglądarki', keys.every(accepted), J(keys.filter(x => !accepted(x))));
  check('...i odrzuca numery w innym kształcie (to przeglądarka je ujednolica)', ['0552/26', '552/2026', '552 /26', 'x/26', '1/2', '07/26'].every(x => !accepted(x)));
}

/* ---------- S154: ramka pod listą bieżącego dnia ---------- */
function S154(){
  console.log('S154: ramka pod listą bieżącego dnia — psy, które z nami wróciły i są w formularzu; reszta z powodem');
  const app = buildApp(); app.seed(base());
  const view = doc(app).getElementById('view');
  check('ramka na samym dole (pod listą innych grup) — pojawienie się niczego nie przesuwa', view.lastElementChild === box(app)
    && !!doc(app).querySelector('ul.others-list'), view.lastElementChild && view.lastElementChild.className);
  const a = links(app);
  check('jeden link: „📝 Raport do schroniska · 2 psy"', a.length === 1 && txt(a[0]) === '📝 Raport do schroniska · 2 psy', a.map(txt).join(' | '));
  check('w nowej karcie (aplikacja zostaje), bez dostępu formularza do aplikacji', a[0].getAttribute('target') === '_blank' && a[0].getAttribute('rel') === 'noopener');
  const want = PAGE + '?id=' + encodeURIComponent(FORM_ID) + '&' + DQ + '=' + D + '&' + PQ + '=' + encodeURIComponent(J(['Bysiu(TTB) 0689/21', 'Draco\t0552/26']));
  check('adres: strona, numer formularza, data rrrr-mm-dd, psy jako JSON z dokładną treścią pozycji, w kolejności formularza',
    a[0].getAttribute('href') === want, a[0].getAttribute('href'));
  check('tabulator w treści pozycji idzie jako \\t (%5Ct), polskie litery zakodowane', /Draco%5Ct0552%2F26/.test(a[0].getAttribute('href')));
  check('psy: Bysiu (TTB, ale w formularzu), Draco (dwa spacery — raz); bez Hani (wzięła ją jej grupa) i bez Marvela (jeszcze na spacerze)',
    J(picked(a[0])) === J(['Bysiu(TTB) 0689/21', 'Draco\t0552/26']), J(picked(a[0])));
  const w = warns(app);
  check('zarezerwowany spacer — w raporcie tylko te, które wróciły', w.some(x => /^⏳ 1 spacer jeszcze zarezerwowany — w raporcie są tylko psy, które już wróciły\.$/.test(x)), J(w));
  check('nasz pies spoza formularza: z numerem, do prowadzącej', w.some(x => /^Nie ma w formularzu: Rex nr 900\/26 — nie trafi do raportu\. Powiedz prowadzącej/.test(x)), J(w));
  check('pies innej grupy spoza formularza: z grupą', w.some(x => x === 'Psy innych grup spoza formularza: Elvis nr 756/26 (Psubraty) — nie trafi do raportu.'), J(w));
  check('bez numeru — do zaznaczenia ręcznie', w.some(x => x === 'Bez numeru, nie da się ich dopasować: Luna — w formularzu zaznacz ręcznie.'), J(w));
  check('numer na kilku pozycjach — nie zgadujemy', w.some(x => /^Numer jest w formularzu kilka razy: Dubel nr 111\/2026 — w formularzu zaznacz ręcznie/.test(x)), J(w));
  check('podpowiedź: data i „Prześlij"', /Otworzy się formularz z datą 29\.10\.2026 i zaznaczonymi psami — sprawdź i stuknij „Prześlij”\./.test(txt(box(app))));
  // Marvel wraca — ramka zmienia się w miejscu (bez przerysowania listy)
  const first = doc(app).querySelector('li.dog');
  app.click('[data-act="walk"][data-id="5"]');
  check('„Wrócił ✓" Marvela: od razu trzy psy (w kolejności formularza), bez „zarezerwowany"', txt(links(app)[0]) === '📝 Raport do schroniska · 3 psy'
    && J(picked(links(app)[0])) === J(['Bysiu(TTB) 0689/21', 'Marvel\t1075/24', 'Draco\t0552/26']) && !warns(app).some(x => /zarezerwowan/.test(x)), txt(box(app)));
  check('...bez przerysowania listy (ten sam pierwszy kafelek)', doc(app).querySelector('li.dog') === first);
  // dzień przyszły — bez ramki
  go(app, '2026-10-30');
  check('dzień przyszły — bez ramki', !box(app));
  go(app, D);
  const none = buildApp(); none.seed(base({shelterForm: undefined}));
  check('formularz nieustawiony (albo serwer sprzed 1.6) — ramka pusta', !!box(none) && box(none).innerHTML === '' && none.errors.length === 0);
  const early = buildApp(); early.seed(base({slots: [sl(5, 'reserved')]}));
  check('nikt jeszcze nie wrócił — ramka pusta', box(early).innerHTML === '');
  const out = buildApp(); out.seed(base({slots: [sl(3, 'walked'), sl(6, 'walked')]}));
  check('wrócili tylko psy spoza formularza — bez linku, z wyjaśnieniem', !links(out).length
    && /Żadnego z tych psów nie ma w formularzu schroniska — raportu nie da się wysłać\./.test(txt(box(out))), txt(box(out)));
  const closed = buildApp(); closed.seed(base({shelterForm: FORM({active: false, extra: ['Imię wolontariusza']})}));
  check('formularz zamknięty i dodatkowe wymagane pytanie — powiedziane', /Formularz schroniska nie przyjmuje teraz odpowiedzi\./.test(txt(box(closed)))
    && /W formularzu uzupełnij jeszcze: Imię wolontariusza\./.test(txt(box(closed))));
  const odd = buildApp(); odd.seed(base({shelterForm: FORM({page: 'javascript:alert(1)'})}));
  check('dziwny adres strony formularza — bez ramki', !links(odd).length && box(odd).innerHTML === '');
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));
}

/* ---------- S155: otwarcie raportu, pamięć otwarć, osłona stuknięć ---------- */
async function S155(){
  console.log('S155: otwarcie — zapamiętane („otwierany o…"), potem „Doślij nowe"; ramka zmieniona pod palcem nie otwiera formularza');
  const app = buildApp({timing: {tapGuard: 60}});
  app.seed(base());
  const opened = tapLink(app, links(app)[0]);
  check('formularz się otwiera (aplikacja nie zatrzymuje linku)', opened === false);
  const c = lastCall(app, 'shelterReportOpened');
  check('serwer dostaje dzień i numery psów z linku', c && J(c.args) === J([D, ['689/21', '552/26']]), c && J(c.args));
  check('od razu w pamięci telefonu', J(S(app).shelterOpened[D].keys) === J(['689/21', '552/26']));
  check('ramka podmieniona dopiero po stuknięciu (link w trakcie kliknięcia zostaje)', txt(links(app)[0]) === '📝 Raport do schroniska · 2 psy');
  await sleep(5);
  check('potem: „otwierany dziś o …", „Raport jeszcze raz" z ramką i ostrzeżenie przed drugim',
    /^✓ Raport otwierany dziś o \d{1,2}:\d{2} \(2 psy\)\. Czy wysłany — nie wiemy\./.test(txt(box(app))) && links(app).length === 1
    && txt(links(app)[0]) === 'Raport jeszcze raz · 2 psy' && links(app)[0].classList.contains('again')
    && /drugi raport podwoi spacery w schronisku/.test(txt(box(app))), txt(box(app)));
  // podwójne stuknięcie: drugie trafia w „Raport jeszcze raz", który właśnie stanął pod palcem — po cichu nic
  const toastBefore = toastOf(app);
  const second = tapLink(app, links(app)[0]);
  check('podwójne stuknięcie: drugie nie otwiera formularza drugi raz (po cichu)', second === true && calls(app, 'shelterReportOpened').length === 1
    && toastOf(app) === toastBefore);
  respondTo(app, 'shelterReportOpened', {date: D, mark: {at: D + ' 17:20', t: 1, keys: ['689/21', '552/26']}});
  check('odpowiedź serwera: czas z serwera', /otwierany dziś o 17:20 \(2 psy\)/.test(txt(box(app))), txt(box(app)));
  // Marvel wraca po otwarciu raportu
  app.click('[data-act="walk"][data-id="5"]');
  respondTo(app, 'markWalked', {slot: {status: 'walked', who: 'Ania', time: '17:30'}});
  const a = links(app);
  check('nowy pies: „📝 Doślij nowe · 1 pies" (sam Marvel) i „Cały raport jeszcze raz · 3 psy"', a.length === 2
    && txt(a[0]) === '📝 Doślij nowe · 1 pies' && J(picked(a[0])) === J(['Marvel\t1075/24']) && !a[0].classList.contains('again')
    && txt(a[1]) === 'Cały raport jeszcze raz · 3 psy' && a[1].classList.contains('again')
    && J(picked(a[1])) === J(['Bysiu(TTB) 0689/21', 'Marvel\t1075/24', 'Draco\t0552/26']), a.map(txt).join(' | '));
  check('...z tym, kto wrócił od tamtej pory', /Od tamtej pory wróciły: Marvel nr 1075\/24\./.test(txt(box(app))));
  // odświeżenie: inny telefon właśnie otworzył raport z Marvelem — ramka zmienia się pod palcem
  await sleep(80);
  app.window.eval('refresh()');
  const now = SLOTS().map(s => s.dogId === 5 ? Object.assign({}, s, {status: 'walked', time: '17:30'}) : s);
  respondTo(app, 'getData', base({slots: now, shelterOpened: {[D]: {at: D + ' 17:31', t: 2, keys: ['689/21', '552/26', '1075/24']}}}));
  check('cudze otwarcie po odświeżeniu: „Raport jeszcze raz · 3 psy", czas ostatniego', txt(links(app)[0]) === 'Raport jeszcze raz · 3 psy'
    && /otwierany dziś o 17:31 \(3 psy\)/.test(txt(box(app))), txt(box(app)));
  const refused = tapLink(app, links(app)[0]);
  check('stuknięcie tuż po zmianie ramki: formularz się nie otwiera, komunikat', refused === true && calls(app, 'shelterReportOpened').length === 0
    && toastOf(app) === 'Raport właśnie się zmienił — sprawdź i stuknij jeszcze raz', toastOf(app));
  await sleep(80);
  check('chwilę później — normalnie', tapLink(app, links(app)[0]) === false && calls(app, 'shelterReportOpened').length === 1);
  respondTo(app, 'shelterReportOpened', {date: D, mark: {at: D + ' 17:40', t: 3, keys: ['689/21', '552/26', '1075/24']}});
  // spóźniony odczyt ze starszym stanem otwarć niczego nie cofa (pamięć tylko rośnie)
  await sleep(80);
  app.window.eval('refresh()');
  respondTo(app, 'getData', base({slots: now, shelterOpened: {[D]: {at: D + ' 17:20', t: 1, keys: ['689/21']}}}));
  check('starszy stan otwarć z serwera nie zabiera psów ani późniejszej godziny', J(S(app).shelterOpened[D].keys) === J(['689/21', '552/26', '1075/24'])
    && S(app).shelterOpened[D].at === D + ' 17:40', J(S(app).shelterOpened[D]));
  // zaznaczanie spacerów do grupy: stuknięcie w link tylko „zaznacza" (nic się nie otwiera)
  S(app).select = {date: D, anchor: '7:1', gid: 0, ids: ['7:1'], seen: []};
  app.window.eval("render('nav')");
  await sleep(80);
  check('w trakcie zaznaczania grupy link nie otwiera formularza', tapLink(app, links(app)[0]) === true && calls(app, 'shelterReportOpened').length === 0);
  S(app).select = null;
  app.window.eval("render('nav')");
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));
}

/* ---------- S156: miniony dzień ---------- */
function S156(){
  console.log('S156: miniony dzień — ta sama ramka nad mailem, z wpisów Historii; otwarcia starszych dni z getHistoryDays');
  const app = buildApp();
  app.seed(base({mailTemplate: 'Lista z [DATA]:\n[LISTA]', mailSubject: 'Spacery [DATA]', mailTo: ''}));
  go(app, Y);
  respondTo(app, 'getHistoryDays', {history: [
    {date: Y, name: 'Draco', who: 'Ania', time: '10:00', group: 0, ident: '552/26'},
    {date: Y, name: 'Draco', who: 'Ola', time: '15:00', group: 0, ident: '552/26'},
    {date: Y, name: 'Bysiu', who: 'Ola', time: '11:00', group: 0, ident: '0689/21'},
    {date: Y, name: '#0893/26', who: 'Ola', time: '11:30', group: 0, ident: '0893/26'},
    {date: Y, name: 'Stary', who: 'Ania', time: '12:00', group: 0, ident: '1/20'},
    {date: Y, name: 'Bezimienny', who: 'Ania', time: '12:30', group: 0, ident: ''},
  ], shelterOpened: {[Y]: {at: Y + ' 18:05', t: 5, keys: ['552/26']}}});
  const b = box(app);
  check('ramka nad mailem do schroniska', !!b && b.classList.contains('past') && !!doc(app).querySelector('.shelterbox + a.mailsend'), app.html().slice(0, 300));
  check('otwierany wczoraj o 18:05 (1 pies) — z pamięci z getHistoryDays', /^✓ Raport otwierany wczoraj o 18:05 \(1 pies\)\./.test(txt(b)), txt(b));
  const a = links(app);
  check('„Doślij nowe": Bysiu i pies bez imienia po numerze („#0893/26"), z datą tamtego dnia', txt(a[0]) === '📝 Doślij nowe · 2 psy'
    && urlOf(a[0]).searchParams.get(DQ) === Y && J(picked(a[0])) === J(['Bysiu(TTB) 0689/21', 'Mała Mi 0893/26']), a.map(txt).join(' | '));
  check('cały: trzy psy, Draco raz (dwa wpisy w Historii)', J(picked(a[1])) === J(['Bysiu(TTB) 0689/21', 'Draco\t0552/26', 'Mała Mi 0893/26']));
  const w = warns(app);
  check('pies z Historii, którego nie ma w formularzu ani w katalogu — jako nasz', w.some(x => /^Nie ma w formularzu: Stary nr 1\/20 — nie trafi/.test(x)), J(w));
  check('wpis bez numeru — ręcznie', w.some(x => /Bez numeru.*: Bezimienny — w formularzu zaznacz ręcznie/.test(x)), J(w));
  check('w minionym dniu nic nie jest „zarezerwowane"', !w.some(x => /zarezerwowan/.test(x)));
  check('nowe od tamtej pory: grupa psa z katalogu po numerze; pies bez imienia jako „#0893/26", bez numeru drugi raz',
    /Od tamtej pory wróciły: Bysiu nr 0689\/21 \(TTB\), #0893\/26\./.test(txt(b)), txt(b));
  tapLink(app, a[0]);
  check('otwarcie raportu minionego dnia — z jego datą', J(lastCall(app, 'shelterReportOpened').args) === J([Y, ['689/21', '893/26']]),
    J(lastCall(app, 'shelterReportOpened').args));
  const empty = buildApp(); empty.seed(base());
  go(empty, Y);
  respondTo(empty, 'getHistoryDays', {history: []});
  check('dzień bez spacerów — bez ramki (jak bez maila)', !box(empty) && /nie zapisano żadnego spaceru/.test(empty.html()));
  check('bez błędów', app.errors.length === 0 && empty.errors.length === 0, app.errors.concat(empty.errors).join('; '));
}

/* ---------- S157: panel ---------- */
async function S157(){
  console.log('S157: panel — link do formularza, zapis i sprawdzenie wprost (bez kolejki), formularz a katalog');
  const app = buildApp({timing: {shelterWait: 80}});
  app.seed(base());
  app.window.__setAdmin('1234');
  app.click('.tab[data-tab="diag"]');
  check('do odpowiedzi panelu: „Pobieram…"', /Pobieram…/.test(txt(sec(app, 'shelter'))));
  respondTo(app, 'getDiagnostics', DIAG(PANEL()));
  const s = openSec(app, 'shelter');
  check('sekcja „Raport do schroniska — formularz": link w polu, stan', /Raport do schroniska — formularz/.test(txt(s)) && doc(app).getElementById('shelterLink').value === LINK
    && /Formularz „Grupa G13” — 8 pozycji na liście psów, sprawdzony 2026-10-29 3:05\./.test(txt(s)), txt(s).slice(0, 300));
  const t = txt(s);
  check('formularz a katalog: ile psów, w tym innych grup', /Psy z katalogu w formularzu: 6, w tym innych grup: Bysiu nr 0689\/21 \(TTB\), Hania nr 236\/25 \(TTB\)\./.test(t), t);
  check('nasz pies spoza formularza (problem)', /Nasze psy, których nie ma w formularzu — nie trafią do raportu \(inny numer albo schronisko musi je dopisać\): Rex nr 900\/26\./.test(t));
  check('pies innej grupy spoza formularza', /Psy innych grup spoza formularza — nie trafią do raportu: Elvis nr 756\/26 \(Psubraty\)\./.test(t));
  check('bez numeru', /Bez numeru albo z numerem w innym kształcie niż „552\/26” — nie da się ich dopasować: Luna\./.test(t));
  check('numer na kilku pozycjach', /Ten sam numer na kilku pozycjach formularza \(raport ich nie zaznaczy\): Dubel 0111\/26\./.test(t));
  check('pozycja formularza, której nie ma w katalogu', /W formularzu, a nie ma ich w katalogu: Ktoś 0999\/26\./.test(t));
  // zły link — od razu, bez serwera
  fill(app, '#shelterLink', 'https://docs.google.com/forms/d/x/viewform');
  check('szkic: „Niezapisany link"', !doc(app).querySelector('.shelterdirty').classList.contains('hidden'));
  app.click('[data-act="shelterSave"]');
  check('zły link: komunikat od razu, nic nie idzie', /To nie jest link do formularza Microsoft Forms/.test(toastOf(app)) && !calls(app, 'setShelterForm').length, toastOf(app));
  // szkic przeżywa przerysowanie panelu
  const SHORT = 'https://forms.cloud.microsoft/e/prdk98PT49';
  fill(app, '#shelterLink', SHORT);
  app.window.eval('fetchDiag()');
  respondTo(app, 'getDiagnostics', DIAG(PANEL()));
  check('szkic przeżył przerysowanie', doc(app).getElementById('shelterLink').value === SHORT);
  app.click('[data-act="shelterSave"]');
  const c = lastCall(app, 'setShelterForm');
  check('zapis: link i PIN, wprost (bez kolejki zapisów)', c && J(c.args) === J([SHORT, '1234']) && !app.window.__dbg().pending.length, c && J(c.args));
  check('w trakcie: „Sprawdzam formularz…", przyciski wyłączone', txt(doc(app).querySelector('[data-act="shelterSave"]')) === 'Sprawdzam formularz…'
    && doc(app).querySelector('[data-act="shelterSave"]').disabled && doc(app).querySelector('[data-act="shelterCheck"]').disabled);
  app.click('[data-act="shelterCheck"]');
  check('drugi przycisk w trakcie nic nie wysyła', !calls(app, 'checkShelterForm').length);
  respondTo(app, 'setShelterForm', {panel: PANEL({link: SHORT, count: 9, at: '2026-10-29 10:00'}), form: FORM({choices: CHOICES.concat(['Rex 900/26'])}), error: ''});
  check('po zapisie: komunikat, szkic zdjęty, nowa lista psów od razu (Rex już w formularzu)', toastOf(app) === 'Formularz zapisany: „Grupa G13” — 9 pozycji'
    && S(app).shelterDraft === null && S(app).shelter.choices.length === 9 && !/Nasze psy, których nie ma w formularzu/.test(txt(sec(app, 'shelter')))
    && txt(doc(app).querySelector('[data-act="shelterSave"]')) === 'Zapisz', toastOf(app));
  app.click('[data-act="shelterCheck"]');
  check('„Sprawdź formularz": PIN', J(lastCall(app, 'checkShelterForm').args) === J(['1234']));
  const err = 'Formularz nie odpowiada (błąd 503) — spróbuj za chwilę';
  respondTo(app, 'checkShelterForm', {panel: PANEL({link: SHORT, count: 9, at: '2026-10-29 10:00', err, errAt: '2026-10-29 10:05'}), form: FORM(), error: err});
  check('nieudane sprawdzenie: komunikat i błąd w panelu, raport według ostatniej listy', toastOf(app) === 'Nie udało się sprawdzić formularza: ' + err
    && /Ostatnie sprawdzenie \(2026-10-29 10:05\) nie wyszło: Formularz nie odpowiada \(błąd 503\) — spróbuj za chwilę Raport działa dalej według listy psów z 2026-10-29 10:00\./.test(txt(sec(app, 'shelter')))
    && /błąd sprawdzenia/.test(txt(sec(app, 'shelter').querySelector('.psec-badge'))), txt(sec(app, 'shelter')).slice(0, 400));
  app.click('[data-act="shelterCheck"]');
  failTo(app, 'checkShelterForm', 'Zły PIN');
  check('odmowa serwera: komunikat, przycisk wraca', toastOf(app) === 'Zły PIN' && !doc(app).querySelector('[data-act="shelterCheck"]').disabled);
  app.click('[data-act="shelterCheck"]');
  await sleep(120);
  check('bez odpowiedzi (bug nr 8): po T.shelterWait przycisk wraca, komunikat, panel dociąga stan', toastOf(app) === 'Formularz długo nie odpowiada — sprawdź za chwilę'
    && !doc(app).querySelector('[data-act="shelterCheck"]').disabled && calls(app, 'getDiagnostics').length === 1, toastOf(app));
  respondTo(app, 'getDiagnostics', DIAG(PANEL({link: SHORT})));
  // usunięcie: pusty link — z pytaniem
  let asked = '';
  app.window.confirm = m => { asked = m; return true; };
  fill(app, '#shelterLink', '');
  app.click('[data-act="shelterSave"]');
  check('pusty link: pytanie, potem zapis pustego', /Usunąć formularz raportu\?/.test(asked) && J(lastCall(app, 'setShelterForm').args) === J(['', '1234']));
  respondTo(app, 'setShelterForm', {panel: {link: ''}, form: null, error: ''});
  check('formularz usunięty: komunikat, panel „nie ustawiony", na liście bez ramki', toastOf(app) === 'Formularz usunięty — bez raportu'
    && /Nie ustawiony/.test(txt(sec(app, 'shelter'))) && S(app).shelter === null && !doc(app).querySelector('[data-act="shelterCheck"]'));
  check('bez błędów', app.errors.length === 0, app.errors.join('; '));
  const failed = buildApp(); failed.seed(base());
  failed.window.__setAdmin('1234');
  failed.click('.tab[data-tab="diag"]');
  failTo(failed, 'getDiagnostics', 'Przekroczono limit czasu');
  check('nieudane pobranie panelu: sekcja mówi o tym, nie wieczne „Pobieram…" (jak S114)', /Nie udało się pobrać ustawień/.test(txt(sec(failed, 'shelter')))
    && !/Pobieram/.test(txt(sec(failed, 'shelter'))), txt(sec(failed, 'shelter')));
  // bez trybu edycji Panel to sama diagnostyka
  const plain = buildApp(); plain.seed(base());
  plain.click('.tab[data-tab="diag"]');
  check('bez trybu edycji — bez ustawień raportu', !sec(plain, 'shelter') && !doc(plain).getElementById('shelterLink'));
}

/* ---------- S158: te same reguły i stałe co serwer ---------- */
function S158(){
  console.log('S158: link z panelu — te same reguły co serwer; stałe; RETRIABLE');
  const html = fs.readFileSync(path.join(ROOT, 'Script.html'), 'utf8'), conf = fs.readFileSync(path.join(ROOT, 'Config.gs'), 'utf8'),
        sh = fs.readFileSync(path.join(ROOT, 'Shelter.gs'), 'utf8');
  check('SHELTER_LINK_MAX = SHELTER_LIMITS.LINK', Number((html.match(/const SHELTER_LINK_MAX = (\d+)/) || [])[1]) === Number((conf.match(/SHELTER_LIMITS = \{[^}]*LINK: (\d+)/) || [])[1]));
  check('SHELTER_HOSTS jak w Shelter.gs', (html.match(/const SHELTER_HOSTS = (\[[^\]]*\])/) || [])[1] === (sh.match(/const SHELTER_HOSTS = (\[[^\]]*\])/) || [0, 'x'])[1]);
  const R = (html.match(/const RETRIABLE = new Set\((\[[^\]]*\])\)/) || [])[1] || '';
  check('RETRIABLE: otwarcie raportu tak (suma — powtórka niczego nie zmienia); zapis i sprawdzenie formularza nie (idą wprost)',
    /'shelterReportOpened'/.test(R) && !/setShelterForm|checkShelterForm/.test(R));
  const app = buildApp(); app.seed(base());
  const env = backend();
  const cases = [LINK, ' ' + LINK + ' ', LINK.replace('Pages/ResponsePage.aspx', 'pages/responsepage.aspx') + '&route=shorturl',
    'https://forms.office.com/Pages/ResponsePage.aspx?id=' + FORM_ID, 'https://forms.microsoft.com/Pages/ResponsePage.aspx?id=' + FORM_ID,
    'https://forms.cloud.microsoft/e/prdk98PT49', 'https://forms.office.com/r/AbCd1234/', 'https://FORMS.CLOUD.MICROSOFT/e/abcd',
    '', '   ', 'http://forms.cloud.microsoft/e/prdk98PT49', 'https://forms.cloud.microsoft.evil.com/e/prdk98PT49',
    'https://example.com/?id=' + FORM_ID, 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx', 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=abc',
    'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=%E0%A4%A' + FORM_ID, LINK + '%22%3E', LINK + '&x=' + 'a'.repeat(500),
    'https://forms.cloud.microsoft/e/ab', 'https://forms.cloud.microsoft/x/prdk98PT49', 'formularz', 'javascript:alert(1)', LINK.replace('_', '%5F')];
  const server = s => { try { env.ctx.__api.shelterLink_(s); return ''; } catch(e){ return e.message; } };
  const diff = cases.filter(s => app.window.shelterLinkProblem(s) !== server(s));
  check('shelterLinkProblem = shelterLink_ na serwerze (' + cases.length + ' przypadków)', diff.length === 0,
    J(diff.map(s => [s.slice(0, 60), app.window.shelterLinkProblem(s), server(s)])));
  check('...i to nie same zgody ani same odmowy', cases.filter(s => !server(s)).length >= 8 && cases.filter(s => server(s)).length >= 10);
}

(async () => {
  S153(); S154(); await S155(); S156(); await S157(); S158();
  console.log(failures ? `\n${failures} niepowodzeń.` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('WYJĄTEK', e && e.stack || e); process.exit(1); });

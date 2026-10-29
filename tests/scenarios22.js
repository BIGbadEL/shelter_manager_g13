// S148–S152 (1.6): kilka notatek przy psie i odkleszczanie w przeglądarce — kafelek (📌 i 💊), zadania
// „💊 Odkleszczanie" (odhaczenie, cofnięcie), edycja psa (notatki, metoda) i te same reguły co serwer
// (serwer: tests/care.js, B91–B99).
const { buildApp, dogFree, ROOT } = require('./harness');
const { makeContext } = require('./backend-harness');
const fs = require('fs'), path = require('path');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
const D = '2026-10-29';                                    // czwartek
const base = o => Object.assign({dogs: [], slots: [], tasks: [], today: D, businessDate: D, resetHour: 18, env: 'prod'}, o || {});
const tk = (method, n, u, next, last) => ({method, n, u, next, last: last || ''});
const DOGS = () => [
  dogFree({id:1, name:'Draco', box:'438', tick: tk('Bravecto', 3, 'm', D)}),                       // termin dziś
  dogFree({id:2, name:'Luna', tick: tk('Advantix', 4, 't', '2026-10-27')}),                        // zaległe 2 dni
  dogFree({id:3, name:'Rex', tick: tk('Bravecto', 3, 'm', '2026-11-05')}),                         // za 7 dni
  dogFree({id:4, name:'Max', tick: tk('Simparica', 1, 'm', '2026-11-06')}),                        // za 8 dni
  dogFree({id:5, name:'Tosia', note:'Uważać na ręce', noteUntil:'nigdy', notes: [
    {text:'Uważać na ręce', until:'nigdy'}, {text:'Zapoznawczy', until:'2026-10-31'}, {text:'Zdjęcia o 12', until: D}]}),
];
const doc   = app => app.window.document;
const S     = app => app.window.__state;
const txt   = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '(brak)';
const tileOf = (app, id) => doc(app).querySelector(`li.dog[data-dog="${id}"]`);
const notesOf = (app, id) => { const li = tileOf(app, id); return li ? [...li.querySelectorAll('.note')].map(txt) : []; };
const toastOf = app => doc(app).getElementById('toast').textContent;
const calls   = (app, fn) => app.pending.filter(p => p.fn===fn);
const lastCall = (app, fn) => calls(app, fn).slice(-1)[0];
/** Zadania z listy: treść i odznaka („od 2 dni", „na …") — osobne elementy, więc ze spacją. */
const tasksTxt = app => [...doc(app).querySelectorAll('.tasksbox .task')]
  .map(el => [el.querySelector('.txt'), el.querySelector('.age, .plan')].filter(Boolean).map(txt).join(' '));
function respondTo(app, fn, res){
  const i = app.pending.findIndex(p => p.fn===fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].ok(res);
}
function fill(app, fields){
  Object.keys(fields).forEach(sel => {
    const el = doc(app).querySelector(sel);
    if(!el) throw new Error('brak pola ' + sel);
    if(el.type === 'checkbox') el.checked = fields[sel]; else el.value = fields[sel];
    el.dispatchEvent(new app.window.Event(el.tagName==='SELECT' || el.type==='checkbox' ? 'change' : 'input', {bubbles:true}));
  });
}
const hidden = (app, sel) => { const el = doc(app).querySelector(sel); return !el || el.classList.contains('hidden') || !!el.closest('.hidden'); };
const go = (app, date) => { S(app).date = date; S(app).follow = false; app.window.eval("render('nav')"); };
const J = s => JSON.stringify(s);
function started(){ const app = buildApp(); app.seed(base({dogs: DOGS(), tasks: [{id:7, text:'Umyć miski', date:D, done:false}]})); return app; }

/* ---------- S148: notatki i 💊 na kafelku ---------- */
function S148(){
  console.log('S148: kilka notatek przy psie, każda ze swoim terminem; 💊 tydzień przed terminem, na górze');
  const app = started();
  check('wszystkie trzy notatki dziś, po kolei, z terminem tylko przy tej z datą', J(notesOf(app, 5)) ===
    J(['📌 Uważać na ręce', '📌 Zapoznawczy do soboty', '📌 Zdjęcia o 12']), J(notesOf(app, 5)));
  go(app, '2026-10-30');
  check('jutro: bez „Zdjęcia o 12" (bez terminu — tylko dziś)', J(notesOf(app, 5)) === J(['📌 Uważać na ręce', '📌 Zapoznawczy do soboty']), J(notesOf(app, 5)));
  go(app, '2026-11-01');
  check('po terminie „Zapoznawczego" — tylko „nigdy"', J(notesOf(app, 5)) === J(['📌 Uważać na ręce']), J(notesOf(app, 5)));
  go(app, D);
  check('💊 termin dziś', J(notesOf(app, 1)) === J(['💊 Odkleszczanie: Bravecto dziś']), J(notesOf(app, 1)));
  const late = tileOf(app, 2).querySelector('.note.tick');
  check('💊 zaległe — z dniem i wyróżnione', txt(late) === '💊 Odkleszczanie: Advantix zaległe od 2 dni (wt 27.10)' && late.classList.contains('late'), txt(late));
  check('💊 za 7 dni — już widać', J(notesOf(app, 3)) === J(['💊 Odkleszczanie: Bravecto czw 05.11']), J(notesOf(app, 3)));
  check('za 8 dni — jeszcze nie', J(notesOf(app, 4)) === '[]', J(notesOf(app, 4)));
  go(app, '2026-10-30');
  check('na przyszłym dniu tydzień przed terminem — termin dalej względem dziś', J(notesOf(app, 4)) === J(['💊 Odkleszczanie: Simparica pt 06.11']), J(notesOf(app, 4)));
  go(app, D);
  // 💊 nad zwykłymi notatkami
  const two = buildApp();
  two.seed(base({dogs: [dogFree({id:1, name:'Draco', note:'Kaganiec', noteUntil:'nigdy', tick: tk('Bravecto', 3, 'm', D)})]}));
  check('💊 na górze, pod nim 📌 (stary kształt: sama note / noteUntil)', J(notesOf(two, 1)) === J(['💊 Odkleszczanie: Bravecto dziś', '📌 Kaganiec']), J(notesOf(two, 1)));
}

/* ---------- S149: zadania „💊 Odkleszczanie" ---------- */
function S149(){
  console.log('S149: zadanie w dniu terminu — odhaczenie liczy termin od dziś, cofnięcie tego samego dnia');
  const app = started();
  check('zadania: odkleszczanie (z imieniem, boksem, metodą), potem zwykłe; za 7 dni — jeszcze nie', J(tasksTxt(app)) ===
    J(['💊 Odkleszczanie: Draco, boks 438 — Bravecto', '💊 Odkleszczanie: Luna — Advantix od 2 dni', 'Umyć miski']), J(tasksTxt(app)));
  app.click('[data-act="tickToggle"][data-id="1"]');
  const c = lastCall(app, 'setTickDone');
  check('wysłane: pies, odhaczenie, termin z ekranu', c && J(c.args) === J([1, true, D]), c && J(c.args));
  const d1 = S(app).dogs.filter(d => d.id === 1)[0];
  check('od razu: termin = dziś + 3 miesiące, „ostatnio" = dziś', d1.tick.next === '2027-01-29' && d1.tick.last === D, J(d1.tick));
  check('od razu: zadanie odhaczone, 💊 przy psie znika', doc(app).querySelector('[data-act="tickToggle"][data-id="1"]').classList.contains('done')
    && J(notesOf(app, 1)) === '[]', J(notesOf(app, 1)));
  check('kręciołek przy zadaniu, dopóki zapis w drodze', !!doc(app).querySelector('[data-act="tickToggle"][data-id="1"] .saving'));
  respondTo(app, 'setTickDone', {id:1, tick: tk('Bravecto', 3, 'm', '2027-01-29', D)});
  check('odpowiedź serwera — bez zmian na ekranie', S(app).dogs.filter(d => d.id === 1)[0].tick.next === '2027-01-29'
    && !doc(app).querySelector('[data-act="tickToggle"][data-id="1"] .saving'));
  app.click('[data-act="tickToggle"][data-id="1"]');
  check('cofnięcie: pies, false, „ostatnio" z ekranu', J(lastCall(app, 'setTickDone').args) === J([1, false, D]), J(lastCall(app, 'setTickDone').args));
  check('od razu: zadanie znowu do zrobienia, 💊 wraca', !doc(app).querySelector('[data-act="tickToggle"][data-id="1"]').classList.contains('done')
    && J(notesOf(app, 1)) === J(['💊 Odkleszczanie: Bravecto dziś']), J(notesOf(app, 1)));
  respondTo(app, 'setTickDone', {id:1, tick: tk('Bravecto', 3, 'm', D, '')});
  // zaległe: serwer dostaje stary termin z ekranu, a nowy liczy się od dziś, nie od starego terminu
  app.click('[data-act="tickToggle"][data-id="2"]');
  check('zaległe: termin z ekranu (27.10), nowy od dziś (+4 tyg. = 26.11)', J(lastCall(app, 'setTickDone').args) === J([2, true, '2026-10-27'])
    && S(app).dogs.filter(d => d.id === 2)[0].tick.next === '2026-11-26', J(lastCall(app, 'setTickDone').args) + ' ' + J(S(app).dogs.filter(d => d.id === 2)[0].tick));
  respondTo(app, 'setTickDone', {id:2, tick: tk('Advantix', 4, 't', '2026-11-26', D)});
  // przyszły dzień: zadanie zaplanowane, bez odhaczania
  go(app, '2026-11-05');
  const plan = [...doc(app).querySelectorAll('.tasksbox .task')].filter(el => /Rex/.test(txt(el)))[0];
  check('w dniu terminu na przyszłym dniu — zaplanowane, bez odhaczania', !!plan && plan.classList.contains('planned') && !plan.dataset.act
    && /na czwartek 05\.11/.test(txt(plan)), plan && txt(plan));
  go(app, D);
  // tryb edycji: odkleszczanie jak na liście dnia, bez ✕ (znika razem z metodą)
  app.window.__setAdmin('1234');
  const adm = [...doc(app).querySelectorAll('.tasksbox .task')];
  check('tryb edycji: zadania odkleszczania bez ✕, zwykłe z ✕', adm.filter(el => el.classList.contains('tick')).length === 2
    && adm.filter(el => el.classList.contains('tick')).every(el => !el.querySelector('[data-act="taskRemove"]'))
    && !!adm.filter(el => /Umyć miski/.test(txt(el)))[0].querySelector('[data-act="taskRemove"]'), adm.map(txt).join(' | '));
  // niezależne od zwykłych zadań: odhaczenie zwykłego idzie przez setTaskDone
  S(app).admin = false; app.window.eval("render('nav')");
  app.click('[data-act="taskToggle"][data-id="7"]');
  check('zwykłe zadanie dalej przez setTaskDone', J(lastCall(app, 'setTaskDone').args) === J([7, true]));
}

/* ---------- S150: edycja psa — kilka notatek ---------- */
function S150(){
  console.log('S150: edycja psa — notatki w wierszach, „+ Notatka", ✕, „nigdy nie znika" w swoim wierszu, zapis listy');
  const app = started();
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="5"]');
  const rows = () => [...doc(app).querySelectorAll('[data-noterow]')];
  const rowVals = () => rows().map(r => [r.querySelector('[data-ef="note"]').value, r.querySelector('[data-ef="noteUntil"]').value,
    r.querySelector('[data-ef="noteUntil"]').disabled, r.querySelector('[data-ef="noteForever"]').checked]);
  check('trzy wiersze: „nigdy" zaznaczone i data wyłączona, termin, bez terminu (puste pole)', J(rowVals()) === J([
    ['Uważać na ręce','',true,true], ['Zapoznawczy','2026-10-31',false,false], ['Zdjęcia o 12','',false,false]]), J(rowVals()));
  app.click('[data-act="noteAdd"]');
  check('„+ Notatka" — pusty wiersz na końcu, z fokusem', rows().length === 4 && rows()[3].querySelector('[data-ef="note"]').value === ''
    && doc(app).activeElement === rows()[3].querySelector('[data-ef="note"]'));
  app.click('[data-act="noteAdd"]'); app.click('[data-act="noteAdd"]');
  check('przy 6 przycisk znika', rows().length === 6 && hidden(app, '[data-act="noteAdd"]'));
  app.click('[data-act="noteAdd"]');
  check('...i siódmej nie ma', rows().length === 6);
  rows()[5].querySelector('[data-act="noteDel"]').dispatchEvent(new app.window.Event('click', {bubbles:true}));
  check('✕ usuwa wiersz, przycisk wraca', rows().length === 5 && !hidden(app, '[data-act="noteAdd"]'));
  const forever = rows()[1].querySelector('[data-ef="noteForever"]');
  forever.checked = true; forever.dispatchEvent(new app.window.Event('change', {bubbles:true}));
  check('„nigdy nie znika" wyłącza datę tylko w swoim wierszu', rows()[1].querySelector('[data-ef="noteUntil"]').disabled
    && !rows()[2].querySelector('[data-ef="noteUntil"]').disabled);
  rows()[3].querySelector('[data-ef="note"]').value = 'RTG';
  rows()[3].querySelector('[data-ef="noteUntil"]').value = '2026-11-04';
  rows()[2].querySelector('[data-ef="noteUntil"]').value = '2026-10-01';
  app.click('[data-act="editSave"][data-id="5"]');
  check('data z przeszłości — komunikat, nic nie idzie, edycja otwarta', /nie może być z przeszłości/.test(toastOf(app))
    && calls(app, 'updateDog').length === 0 && rows().length === 5);
  rows()[2].querySelector('[data-ef="noteUntil"]').value = '';
  app.click('[data-act="editSave"][data-id="5"]');
  const f = lastCall(app, 'updateDog').args[1];
  check('zapis: lista po kolei, puste odpadają; pierwsza też jako note / noteUntil', J(f.notes) === J([
    {text:'Uważać na ręce', until:'nigdy'}, {text:'Zapoznawczy', until:'nigdy'}, {text:'Zdjęcia o 12', until:''}, {text:'RTG', until:'2026-11-04'}])
    && f.note === 'Uważać na ręce' && f.noteUntil === 'nigdy', J(f));
  check('od razu na kafelku katalogu — cztery notatki', [...tileOf(app, 5).querySelectorAll('.note')].length === 4,
    [...tileOf(app, 5).querySelectorAll('.note')].map(txt).join(' | '));
  respondTo(app, 'updateDog', base({dogs: DOGS()}));
  // ✕ przy jedynej notatce — wiersz zostaje, pusty; zapis bez notatek
  app.click('[data-act="edit"][data-id="1"]');
  check('pies bez notatek — jeden pusty wiersz', rows().length === 1 && rows()[0].querySelector('[data-ef="note"]').value === '');
  rows()[0].querySelector('[data-ef="note"]').value = 'x';
  rows()[0].querySelector('[data-act="noteDel"]').dispatchEvent(new app.window.Event('click', {bubbles:true}));
  check('✕ przy jedynej — wiersz pusty, nie znika', rows().length === 1 && rows()[0].querySelector('[data-ef="note"]').value === '');
  app.click('[data-act="editSave"][data-id="1"]');
  check('zapis bez notatek: pusta lista', J(lastCall(app, 'updateDog').args[1].notes) === '[]' && lastCall(app, 'updateDog').args[1].note === '');
}

/* ---------- S151: edycja psa — odkleszczanie ---------- */
function S151(){
  console.log('S151: edycja psa — metoda z listy albo nowa, okres, następne; bez metody — bez odkleszczania');
  const app = started();
  app.window.__setAdmin('1234');
  check('katalog: przy psie metoda, okres i następny termin', /💊 Bravecto · co 3 miesiące · następne dziś/.test(txt(tileOf(app, 1)))
    && /💊 Advantix · co 4 tygodnie · następne zaległe od 2 dni/.test(txt(tileOf(app, 2))), txt(tileOf(app, 1)));
  app.click('[data-act="edit"][data-id="4"]');
  const v = sel => doc(app).querySelector(sel).value;
  check('pies z metodą: wybrana, okres i termin w polach', v('[data-ef="tick"]') === 'Simparica' && !hidden(app, '.tickmore')
    && v('[data-ef="tickN"]') === '1' && v('[data-ef="tickU"]') === 'm' && v('[data-ef="tickNext"]') === '2026-11-06');
  check('lista metod: brak, metody z katalogu po kolei bez powtórek, „Inna metoda…"',
    [...doc(app).querySelector('[data-ef="tick"]').options].map(o => o.value).join('|') === '|Advantix|Bravecto|Simparica|__new');
  fill(app, {'[data-ef="tick"]': ''});
  check('„brak" — reszta schowana', hidden(app, '.tickmore'));
  app.click('[data-act="editSave"][data-id="4"]');
  check('zapis bez metody: tick {method: ""}', J(lastCall(app, 'updateDog').args[1].tick) === J({method:''}));
  check('...od razu bez odkleszczania', S(app).dogs.filter(d => d.id === 4)[0].tick === null && !/💊/.test(txt(tileOf(app, 4))));
  respondTo(app, 'updateDog', base({dogs: DOGS()}));

  app.click('[data-act="edit"][data-id="5"]');
  check('pies bez metody: „brak", schowane', v('[data-ef="tick"]') === '' && hidden(app, '.tickmore'));
  fill(app, {'[data-ef="tick"]': 'Bravecto'});
  check('metoda z listy — okres jak u psa z tą metodą', !hidden(app, '.tickmore') && v('[data-ef="tickN"]') === '3' && v('[data-ef="tickU"]') === 'm');
  fill(app, {'[data-ef="tick"]': '__new'});
  check('„Inna metoda…" — pole na nazwę', !hidden(app, '[data-ef="tickNew"]'));
  app.click('[data-act="editSave"][data-id="5"]');
  check('pusta nazwa — komunikat, nic nie idzie', /Wpisz nazwę metody/.test(toastOf(app)) && calls(app, 'updateDog').length === 0);
  fill(app, {'[data-ef="tickNew"]': ' bra vecto ', '[data-ef="tickN"]': ''});
  app.click('[data-act="editSave"][data-id="5"]');
  check('bez okresu — komunikat, nic nie idzie', /co ile — od 1 do 12 miesięcy/.test(toastOf(app)) && calls(app, 'updateDog').length === 0, toastOf(app));
  fill(app, {'[data-ef="tickN"]': '13'});
  app.click('[data-act="editSave"][data-id="5"]');
  check('13 miesięcy — za dużo', calls(app, 'updateDog').length === 0);
  fill(app, {'[data-ef="tickN"]': '12', '[data-ef="tickU"]': 't', '[data-ef="tickNext"]': ''});
  app.click('[data-act="editSave"][data-id="5"]');
  check('nowa nazwa w pisowni z katalogu, pusty termin idzie pusty', J(lastCall(app, 'updateDog').args[1].tick) ===
    J({method:'Bravecto', n:12, u:'t', next:''}), J(lastCall(app, 'updateDog').args[1].tick));
  check('od razu: termin = dziś + 12 tygodni (jak policzy serwer)', J(S(app).dogs.filter(d => d.id === 5)[0].tick) ===
    J(tk('Bravecto', 12, 't', '2027-01-21')), J(S(app).dogs.filter(d => d.id === 5)[0].tick));
}

/* ---------- S152: te same reguły co serwer ---------- */
function S152(){
  console.log('S152: stałe, przesuwanie terminu i pisownia metody — jak na serwerze');
  const gs = fs.readFileSync(path.join(ROOT, 'Config.gs'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'Script.html'), 'utf8');
  const one = (src, re) => (src.match(re) || [])[1];
  check('NOTES_MAX', !!one(gs, /const NOTES_MAX = (\d+)/) && one(gs, /const NOTES_MAX = (\d+)/) === one(html, /const NOTES_MAX = (\d+)/));
  check('TICK_SOON = TICK_SOON_DAYS', !!one(gs, /const TICK_SOON_DAYS = (\d+)/) && one(gs, /const TICK_SOON_DAYS = (\d+)/) === one(html, /const TICK_SOON = (\d+)/));
  check('TICK_LIMITS', one(gs, /const TICK_LIMITS = \{ t: (\d+), m: (\d+) \}/) === one(html, /const TICK_LIMITS = \{t: (\d+), m: (\d+)\}/)
    && /const TICK_LIMITS = \{ t: 52, m: 12 \}/.test(gs) && /const TICK_LIMITS = \{t: 52, m: 12\}/.test(html));
  check('TICK_MAX = MAX_LEN.TICK', one(html, /const TICK_MAX = (\d+)/) === one(gs, /const MAX_LEN = \{[^}]*\bTICK: (\d+)/));
  const app = buildApp(), env = makeContext({});
  const dates = ['2026-01-31','2026-02-28','2028-02-29','2026-10-29','2026-12-31','2026-03-31','2026-08-30'];
  const diff = [];
  dates.forEach(d => [['t',1],['t',12],['t',52],['m',1],['m',3],['m',12],['m',7]].forEach(([u, n]) => {
    const a = app.window.addPeriod(d, n, u), b = env.ctx.__api.addPeriod_(d, n, u);
    if(a !== b) diff.push(d + '+' + n + u + ': ' + a + ' / ' + b);
  }));
  check('addPeriod = addPeriod_ (' + dates.length * 7 + ' przypadków)', diff.length === 0, diff.join(', '));
  const cases = [['Bravecto', []], ['  bra  vecto ', ['Bravecto']], ['BRAVECTO', ['Bravecto','Simparica']], ['', ['x']],
    ['a\tb', []], ['x'.repeat(40), []], ['Seresto  obroża', ['Bravecto']]];
  const bad = cases.filter(([v, k]) => app.window.tickClean(v, k) !== env.ctx.__api.tickMethod_(v, k));
  check('tickClean = tickMethod_ (' + cases.length + ' przypadków)', bad.length === 0, J(bad));
}

S148(); S149(); S150(); S151(); S152();
if(failures){ console.log('\n' + failures + ' FAIL'); process.exit(1); }
console.log('\nWszystko zielone.');
process.exit(0);

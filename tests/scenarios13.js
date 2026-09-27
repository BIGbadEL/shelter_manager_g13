// S83-S89: poprawki po review PR #1 — strona przeglądarki. Część scenariuszy
// przytrzymuje kafelek (prawdziwy zegar), więc zestaw jest asynchroniczny.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const D = '2026-09-24';
const DOGS = () => [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna'}), dogFree({id:3, name:'Rex'})];
const base = o => Object.assign({dogs: DOGS(), walks: [], tasks: [], today: D, businessDate: D,
                                 resetHour: 20, env: 'prod'}, o || {});
const doc   = app => app.window.document;
const li    = (app, id) => doc(app).querySelector(`li.dog[data-dog="${id}"]`);
const S     = app => app.window.__state;
const ev    = (app, type) => new app.window.MouseEvent(type, {bubbles:true, clientX:0, clientY:0});
const tapEl = (app, el) => el.dispatchEvent(new app.window.Event('click', {bubbles:true}));
const bgOf  = (app, id) => (li(app, id).getAttribute('style') || '').match(/background:(#[0-9a-f]+)/i);
const calls = (app, fn) => app.pending.filter(p => p.fn===fn);
async function press(app, id){
  li(app, id).dispatchEvent(ev(app, 'pointerdown'));
  await sleep(650);
  const l = li(app, id);
  if(l) l.dispatchEvent(ev(app, 'pointerup'));
}
/** Odpowiedź na konkretne oczekujące wywołanie, nie na pierwsze w kolejce. */
function respondTo(app, pred, res){
  const i = app.pending.findIndex(pred);
  if(i < 0) throw new Error('brak oczekującego wywołania');
  const j = app.pending.splice(i, 1)[0];
  j.ok(res);
}

async function S83(){
  console.log('S83: zły numer grupy nie wywraca listy, a wywrotka renderu nie robi pętli getData');
  const app = buildApp();
  app.seed(base({walks:[{date:D, dogId:1, status:'reserved', who:'Ala', group:1.5},
                        {date:D, dogId:2, status:'reserved', who:'Ola', group:1.5}]}));
  check('lista narysowana', !!li(app, 1) && !/Coś poszło nie tak/.test(app.html()), app.html().slice(0, 200));
  check('1.5 to brak grupy', S(app).slots[D+'|1|1'].group===0 && !bgOf(app, 1));
  check('żadnego ratunkowego getData', calls(app, 'getData').length===0, app.pending.map(p=>p.fn).join(','));

  // błąd, który powtarza się przy każdym rysowaniu
  app.window.dogMeta = () => { throw new Error('zepsuty kafelek'); };
  app.window.eval('render()');
  check('komunikat zamiast zamrożonego ekranu', /Coś poszło nie tak/.test(app.html()));
  check('jedno ratunkowe odświeżenie', calls(app, 'getData').length===1);
  app.respondNext(base());
  check('po nim — cisza, nie pętla', calls(app, 'getData').length===0, app.pending.map(p=>p.fn).join(','));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S84(){
  console.log('S84: podgląd minionego dnia po przełomie dnia dociąga się sam');
  const app = buildApp();
  app.seed(base());
  app.click('#prevDay');
  respondTo(app, p => p.fn==='getHistoryDays', {history:[{date:'2026-09-23', name:'Borys', who:'Ala', time:'9:00'}]});
  check('wczoraj widać', /Borys/.test(app.html()) && /Ala/.test(app.html()));
  // telefon zablokowany o 19:00, odblokowany po 20:00 — odświeżenie przynosi nowy dzień
  app.window.eval('refresh()');
  app.respondNext(base({businessDate:'2026-09-25'}));
  check('ekran zostaje na oglądanym dniu', S(app).date==='2026-09-23', S(app).date);
  check('pyta serwer od nowa, zamiast wisieć na „Wczytuję…"', calls(app, 'getHistoryDays').length===1,
    app.pending.map(p=>p.fn).join(','));
  respondTo(app, p => p.fn==='getHistoryDays', {history:[{date:'2026-09-23', name:'Borys', who:'Ala', time:'9:00'}]});
  check('dzień znów widać', /Borys/.test(app.html()) && !/Wczytuję/.test(app.html()), app.html().slice(0, 300));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S85(){
  console.log('S85: notatka „bez terminu" (termin = bieżący dzień) wygląda jak bez terminu');
  const note = until => [dogFree({id:1, name:'Borys', note:'Zdjęcia o 12:00', noteUntil:until})];
  // 20:10 — lista pracuje już na 25.09, notatka zapisana bez terminu dostała 25.09
  const app = buildApp();
  app.seed(base({dogs: note('2026-09-25'), businessDate:'2026-09-25'}));
  check('notatka widoczna', /Zdjęcia o 12:00/.test(app.html()));
  check('bez odznaki „do jutra"', !/class="until"/.test(app.html()), (app.html().match(/class="until">([^<]*)/)||[])[1]);
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="1"]');
  const el = doc(app).querySelector('[data-ef="noteUntil"]');
  check('w edycji pole daty puste', !!el && el.value==='', el && el.value);

  const app2 = buildApp();
  app2.seed(base({dogs: note('2026-09-27'), businessDate:'2026-09-25'}));
  check('własny termin — z odznaką', /class="until"/.test(app2.html()));
  app2.window.__setAdmin('1234');
  app2.click('[data-act="edit"][data-id="1"]');
  check('...i z datą w edycji', doc(app2).querySelector('[data-ef="noteUntil"]').value==='2026-09-27');
  check('bez błędów', app.errors.length===0 && app2.errors.length===0, app.errors.concat(app2.errors).join('; '));
}

async function S86(){
  console.log('S86: zmiana składu wysyła widziany skład i zdejmuje tylko spośród niego');
  const app = buildApp();
  app.seed(base({dogs: DOGS().concat([dogFree({id:4, name:'Cyra'})]),
                 walks:[{date:D, dogId:1, status:'free', group:1}, {date:D, dogId:2, status:'free', group:1}]}));
  await press(app, 1);
  check('zaznaczanie z widzianym składem', JSON.stringify(S(app).select.seen)==='["1:1","2:1"]', JSON.stringify(S(app).select));
  // w tym czasie ktoś inny dołożył Rexa — tego składu na ekranie nie było
  S(app).slots[D+'|3|1'] = {status:'free', who:'', time:'', group:1};
  tapEl(app, li(app, 4));                              // dokładamy Cyrę
  tapEl(app, doc(app).getElementById('selGroup'));
  const job = app.pending[app.pending.length-1];
  check('setGroup(dzień, skład, 1, widziany skład)', job.fn==='setGroup' && JSON.stringify(job.args[1])==='["1:1","2:1","4:1"]'
    && job.args[2]===1 && JSON.stringify(job.args[3])==='["1:1","2:1"]', JSON.stringify(job.args));
  check('Rex, dołożony przez kogoś innego, zostaje w grupie', S(app).slots[D+'|3|1'].group===1,
    JSON.stringify(S(app).slots[D+'|3|1']));
  check('Cyra doszła', S(app).slots[D+'|4|1'].group===1 && S(app).slots[D+'|1|1'].group===1);
  app.respondNext({group:1, walks:[1,2,3,4].map(id => ({date:D, dogId:id, group:1}))});

  await press(app, 1);                                 // teraz widać już wszystkich czterech
  tapEl(app, li(app, 2));                              // odznaczamy Lunę
  tapEl(app, doc(app).getElementById('selGroup'));
  check('widziany i odznaczony pies wypada', S(app).slots[D+'|2|1'].group===0 && S(app).slots[D+'|3|1'].group===1);
  app.respondNext({group:1, walks:[{date:D, dogId:2, group:0}].concat([1,3,4].map(id => ({date:D, dogId:id, group:1})))});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S87(){
  console.log('S87: spóźniona odpowiedź setGroup nie przywraca grupy rozwiązanej cofnięciem');
  const app = buildApp();
  app.seed(base({
    dogs: [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna'}), dogFree({id:3, name:'Rex'})],
    walks: [{date:D, dogId:1, status:'reserved', who:'Ala'}, {date:D, dogId:2, status:'reserved', who:'Ola'}],
  }));
  await press(app, 1);
  tapEl(app, li(app, 2));
  tapEl(app, doc(app).getElementById('selGroup'));
  app.click('[data-act="walk"][data-id="1"]');         // od razu wspólny spacer…
  app.click('[data-act="free"][data-id="1"]');         // …i „Cofnij" u Borysa: wychodzi z grupy, Luna zostaje sama
  check('lokalnie grupy już nie ma', S(app).slots[D+'|1|1'].group===0 && S(app).slots[D+'|2|1'].group===0);
  // serwer przerobił setGroup przed resztą, ale jego odpowiedź dochodzi ostatnia
  respondTo(app, p => p.fn==='markWalked' && p.args[0]===2, {slot:{slot:1, status:'walked', who:'Ola', time:'10:00'}});
  respondTo(app, p => p.fn==='markWalked' && p.args[0]===1, {slot:{slot:1, status:'walked', who:'Ala', time:'10:00'}});
  respondTo(app, p => p.fn==='setFree' && p.args[0]===1, {slot:{slot:1, status:'free'}});
  respondTo(app, p => p.fn==='setGroup', {group:1, slots:[{date:D, dogId:1, slot:1, group:1}, {date:D, dogId:2, slot:1, group:1}]});
  check('grupa nie wraca', S(app).slots[D+'|1|1'].group===0 && S(app).slots[D+'|2|1'].group===0,
    JSON.stringify([S(app).slots[D+'|1|1'], S(app).slots[D+'|2|1']]));
  check('...także na ekranie', !bgOf(app, 1) && !bgOf(app, 2));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S88(){
  console.log('S88: zadanie i pies dodane Enterem z klawiatury pojawiają się od razu');
  const app = buildApp();
  app.seed(base());
  app.window.__setAdmin('1234');
  const full = extra => Object.assign(base(), extra);
  const enter = el => el.dispatchEvent(new app.window.KeyboardEvent('keydown', {key:'Enter', bubbles:true}));

  const t = doc(app).getElementById('newTask');
  t.value = 'Umyć miski';
  t.focus();
  enter(t);
  check('poszło addTask', calls(app, 'addTask').length===1);
  app.respondNext(full({tasks:[{id:1, text:'Umyć miski', date:D, done:false}]}));
  check('zadanie widać bez stukania obok', /Umyć miski/.test(app.html()));

  const n = doc(app).getElementById('newName');
  n.value = 'Kora';
  n.focus();
  enter(n);
  check('poszło addDog', calls(app, 'addDog').length===1);
  app.respondNext(full({dogs: DOGS().concat([dogFree({id:4, name:'Kora'})])}));
  check('pies widoczny w katalogu', !!li(app, 4) && /Kora/.test(li(app, 4).textContent));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S89(){
  console.log('S89: „Zwolnij" mówi serwerowi, CO zwalnia');
  const app = buildApp();
  app.seed(base({walks:[{date:D, dogId:1, status:'reserved', who:'Ola'}, {date:D, dogId:2, status:'walked', who:'Ala', time:'9:00'}]}));
  app.click('[data-act="free"][data-id="1"]');
  const job = app.pending[app.pending.length-1];
  check('setFree(pies, dzień, widziany stan)', job.fn==='setFree' && job.args[1]===D
    && JSON.stringify(job.args[2])==='{"status":"reserved","who":"Ola"}', JSON.stringify(job.args));
  // serwer: w międzyczasie psa wzięła Iza — zwolnienie nie przeszło
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'reserved', who:'Iza'})});
  check('widać rezerwację Izy', /Iza/.test(li(app, 1).textContent), li(app, 1).textContent.replace(/\s+/g, ' '));
  check('i komunikat', /innego opiekuna/.test(doc(app).getElementById('toast').textContent));
  app.click('[data-act="free"][data-id="2"]');         // „Cofnij"
  check('cofnięcie też z widzianym stanem', JSON.stringify(app.pending[app.pending.length-1].args[2])==='{"status":"walked","who":"Ala"}');
  app.respondNext({dog: dogFree({id:2, name:'Luna'})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

(async ()=>{
  for(const s of [S83, S84, S85, S86, S87, S88, S89]){
    try{ await s(); }
    catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
  }
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})();

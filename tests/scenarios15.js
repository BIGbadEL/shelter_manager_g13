// S112-S115: przegląd kodu przed pracą nad panelem prowadzącej (1.2) — strona przeglądarki.
// S115 czeka na prawdziwy zegar komunikatu (~3 s), więc zestaw jest asynchroniczny.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const D = '2026-09-24';
const DOGS = () => [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna'})];
const base = o => Object.assign({dogs: DOGS(), slots: [], tasks: [], today: D, businessDate: D,
                                 resetHour: 20, env: 'prod'}, o || {});
const withRex = o => base(Object.assign({dogs: DOGS().concat([dogFree({id:3, name:'Rex', ident:'552/26', box:'12', dif:'hard'})])}, o));
const doc     = app => app.window.document;
const val     = (app, id) => doc(app).getElementById(id).value;
const li      = (app, id) => doc(app).querySelector(`li.dog[data-dog="${id}"]`);
const adding  = app => doc(app).querySelector('li.dog.adding');
const toastOf = app => doc(app).getElementById('toast').textContent;
const shipped = (app, fn) => app.shipped.filter(f => f===fn).length;
const calls   = (app, fn) => app.pending.filter(p => p.fn===fn);
const lastCall = (app, fn) => calls(app, fn).slice(-1)[0];
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
/** Wpisanie w pola tak, jak robi to człowiek: wartość + zdarzenie (lista i data — 'change'). */
function fill(app, fields){
  Object.keys(fields).forEach(id => {
    const el = doc(app).getElementById(id);
    el.value = fields[id];
    el.dispatchEvent(new app.window.Event(el.tagName==='SELECT' || el.type==='date' ? 'change' : 'input', {bubbles:true}));
  });
}
const REX = {newName:'Rex', newIdent:'552/26', newBox:'12', newDif:'hard'};
function admin(){ const app = buildApp(); app.seed(base()); app.window.__setAdmin('1234'); return app; }

/* ---------- S112: dodanie psa ---------- */
async function S112(){
  console.log('S112: „Dodaj" psa — kilka stuknięć to jeden pies, od razu „dodaję…" (zgłoszenie z panelu, 1.2)');
  const app = admin();
  fill(app, REX);
  app.click('[data-act="add"]');
  app.click('[data-act="add"]');
  app.click('[data-act="add"]');
  check('trzy stuknięcia — jedno addDog', shipped(app, 'addDog')===1, app.shipped.join(','));
  const job = lastCall(app, 'addDog');
  check('wysyła dane psa i token dodania', job.args[0].name==='Rex' && job.args[0].ident==='552/26' && job.args[0].box==='12'
    && job.args[0].dif==='hard' && job.args[1]==='1234' && /^d[a-z0-9]{8,}$/.test(job.args[2]), JSON.stringify(job.args));
  check('formularz pusty od razu', ['newName','newIdent','newBox'].every(id => val(app, id)==='') && val(app, 'newDif')==='easy');
  const row = adding(app), all = doc(app).querySelectorAll('li.dog');
  check('pies na końcu katalogu jako „dodaję…", bez przycisków', !!row && /Rex/.test(row.textContent) && /dodaję/.test(row.textContent)
    && !row.querySelector('[data-act]') && all[all.length-1]===row, row ? row.outerHTML : '(brak)');
  check('kolejne stuknięcia po cichu — bez „Podaj imię" i bez klawiatury (fokus wstrzymałby przerysowanie)',
    !/Podaj imię/.test(toastOf(app)) && doc(app).activeElement !== doc(app).getElementById('newName'), toastOf(app));
  respondTo(app, 'addDog', withRex());
  check('Rex w katalogu, „dodaję…" zniknęło', !!li(app, 3) && /Rex/.test(li(app, 3).textContent) && !adding(app), app.html().slice(-600));
  check('komunikat „Dodano: Rex"', /Dodano: Rex/.test(toastOf(app)), toastOf(app));
  app.click('[data-act="add"]');
  check('pusty formularz, nic w drodze — „Podaj imię…" jak dawniej', /Podaj imię/.test(toastOf(app)) && shipped(app, 'addDog')===1);
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S112b(){
  console.log('S112b: zaginiona odpowiedź na „Dodaj" — jedna powtórka z TYM SAMYM tokenem (serwer psa drugi raz nie doda)');
  const app = admin();
  fill(app, REX);
  app.click('[data-act="add"]');
  const first = lastCall(app, 'addDog');
  app.window.__force(); app.window.eval('checkStuck()');
  check('poszła powtórka', shipped(app, 'addDog')===2, app.shipped.join(','));
  const retry = lastCall(app, 'addDog');
  check('...z tym samym tokenem i danymi', retry !== first && retry.args[2]===first.args[2]
    && JSON.stringify(retry.args[0])===JSON.stringify(first.args[0]), JSON.stringify([first.args, retry.args]));
  check('w czasie powtórki dalej „dodaję…"', !!adding(app));
  app.pending.splice(app.pending.indexOf(retry), 1)[0].ok(withRex());
  check('jeden Rex w katalogu', doc(app).querySelectorAll('li.dog[data-dog="3"]').length===1 && !adding(app));
  first.ok(withRex());                                 // spóźniona pierwsza odpowiedź niczego nie psuje
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S112c(){
  console.log('S112c: „Dodaj" nie przeszło — dane wracają do formularza; te same dane = ten sam token, zmienione = nowy');
  const app = admin();
  fill(app, REX);
  app.click('[data-act="add"]');
  const token = lastCall(app, 'addDog').args[2];
  failTo(app, 'addDog', 'Zły PIN');                    // pierwsza próba
  failTo(app, 'addDog', 'Zły PIN');                    // powtórka — ostatecznie nie
  check('komunikat serwera', /Zły PIN/.test(toastOf(app)), toastOf(app));
  check('„dodaję…" zniknęło', !adding(app));
  check('wpisane dane wróciły do formularza', val(app, 'newName')==='Rex' && val(app, 'newIdent')==='552/26'
    && val(app, 'newBox')==='12' && val(app, 'newDif')==='hard', [val(app,'newName'), val(app,'newIdent'), val(app,'newBox'), val(app,'newDif')].join('|'));
  app.click('[data-act="add"]');
  check('ponowne „Dodaj" z tym samym tokenem (pies mógł powstać, zginęła tylko odpowiedź)', lastCall(app, 'addDog').args[2]===token);
  failTo(app, 'addDog', 'x'); failTo(app, 'addDog', 'x');
  fill(app, {newName:'Reks'});
  app.click('[data-act="add"]');
  const t2 = lastCall(app, 'addDog').args[2];
  check('zmienione dane — nowy token (to już inny pies)', t2 !== token && lastCall(app, 'addDog').args[0].name==='Reks', t2);
  failTo(app, 'addDog', 'x');
  fill(app, {newName:'Kora'});                         // ktoś zaczął wpisywać następnego psa
  failTo(app, 'addDog', 'x');
  check('nieudany zapis nie nadpisuje następnego psa w formularzu', val(app, 'newName')==='Kora', val(app, 'newName'));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S112d(){
  console.log('S112d: odpowiedź na „Dodaj", gdy w drodze jest inny zapis — „dodaję…" stoi do pełnego stanu z psem (bez mrugnięcia)');
  const app = admin();
  fill(app, REX);
  app.click('[data-act="add"]');
  app.click('[data-act="edit"][data-id="1"]');
  app.click('[data-act="editSave"][data-id="1"]');     // updateDog na torze psa 1 — równolegle
  respondTo(app, 'addDog', withRex());
  app.window.eval('render()');                         // ekran ze STANU — bez tego test patrzyłby na stary DOM
  check('pełny stan odłożony (zapis psa 1 w drodze), a „dodaję…" dalej stoi', !li(app, 3) && !!adding(app), app.html().slice(-500));
  respondTo(app, 'updateDog', withRex());
  check('po pełnym stanie: Rex jest, „dodaję…" nie ma', !!li(app, 3) && !adding(app));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S112e(){
  console.log('S112e: formularze trybu edycji przeżywają przerysowanie (pies, zadanie, wybrany dzień zadania)');
  const app = admin();
  fill(app, {newName:'Kora', newBox:'7', newDif:'med', newTask:'Umyć miski', newTaskDate:'2026-09-27'});
  app.window.eval('refresh()');                        // ktoś inny dodał psa — katalog się przerysowuje
  app.respondNext(base({dogs: DOGS().concat([dogFree({id:9, name:'Od kogoś'})])}));
  check('przerysowane (nowy pies widać)', !!li(app, 9));
  check('pies w formularzu został', val(app, 'newName')==='Kora' && val(app, 'newBox')==='7' && val(app, 'newDif')==='med',
    [val(app,'newName'), val(app,'newBox'), val(app,'newDif')].join('|'));
  check('zadanie i jego dzień zostały', val(app, 'newTask')==='Umyć miski' && val(app, 'newTaskDate')==='2026-09-27',
    val(app, 'newTask') + ' | ' + val(app, 'newTaskDate'));
  app.click('[data-act="taskAdd"]');
  check('zadanie idzie na wybrany dzień', lastCall(app, 'addTask').args[2]==='2026-09-27', JSON.stringify(lastCall(app, 'addTask').args));
  respondTo(app, 'addTask', base({dogs: DOGS().concat([dogFree({id:9, name:'Od kogoś'})]),
                                  tasks:[{id:1, text:'Umyć miski', date:'2026-09-27', done:false}]}));
  check('po dodaniu pole zadania puste, dzień wraca na bieżący', val(app, 'newTask')==='' && val(app, 'newTaskDate')===D,
    val(app, 'newTask') + ' | ' + val(app, 'newTaskDate'));
  check('pies w formularzu nadal czeka', val(app, 'newName')==='Kora');
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S113: spóźniony odczyt nie cofa zapisu ---------- */
async function S113(){
  console.log('S113: odczyt z 15-sekundowego odświeżenia, który wyruszył przed zapisem, nie cofa go na ekranie');
  const app = buildApp();
  app.seed(base());
  app.window.eval('refresh()');                        // odświeżenie wyrusza
  app.click('[data-act="reserve"][data-id="1"]');
  app.type('[data-input="1"]', 'Ola');
  app.click('[data-act="confirm"][data-id="1"]');      // a w tym czasie rezerwacja
  respondTo(app, 'reserve', {slot:{slot:1, status:'reserved', who:'Ola', time:''}});
  respondTo(app, 'getData', base());                   // odczyt sprzed rezerwacji
  check('rezerwacja Oli zostaje', app.state().dogs[0]==='reserved:Ola', JSON.stringify(app.state().dogs));
  check('...także na ekranie', /Ola/.test(li(app, 1).textContent), li(app, 1).textContent.replace(/\s+/g, ' '));
  check('stan dociąga się od nowa', calls(app, 'getData').length===1, app.shipped.join(','));
  respondTo(app, 'getData', base({slots:[{date:D, dogId:1, slot:1, status:'reserved', who:'Ola'},
                                         {date:D, dogId:2, slot:1, status:'reserved', who:'Iza'}]}));
  check('świeży odczyt stosowany (Iza z innego telefonu)', app.state().dogs[1]==='reserved:Iza', JSON.stringify(app.state().dogs));

  // to samo w trybie edycji: usunięty pies nie wraca ze starego odczytu
  const ed = admin();
  ed.window.eval('refresh()');
  ed.click('[data-act="remove"][data-id="2"]');
  respondTo(ed, 'removeDog', base({dogs:[dogFree({id:1, name:'Borys'})]}));
  respondTo(ed, 'getData', base());                    // sprzed usunięcia — z Luną
  check('usunięta Luna nie wraca', !li(ed, 2), ed.html().slice(0, 400));
  check('bez błędów', app.errors.length===0 && ed.errors.length===0, app.errors.concat(ed.errors).join('; '));
}

/* ---------- S114: PIN i panel przy braku połączenia ---------- */
async function S114(){
  console.log('S114: PIN i stan serwera w panelu — brak odpowiedzi to komunikat, nie cisza');
  const app = buildApp();
  app.seed(base());
  app.click('#gear');
  app.type('#pinInput', '1234');
  app.click('#pinOk');
  app.failNext('NetworkError: Connection failure due to HTTP 0');
  check('PIN: komunikat o braku połączenia', /Nie udało się sprawdzić PIN-u/.test(toastOf(app)), toastOf(app));
  check('...a nie „Zły PIN"', doc(app).getElementById('pinErr').classList.contains('hidden'));
  app.click('#pinOk');
  app.respondNext(true);
  check('druga próba wpuszcza', app.window.__state.admin===true);

  app.click('.tab[data-tab="diag"]');
  failTo(app, 'getDiagnostics', 'Przekroczono limit czasu');
  check('panel: „nie udało się pobrać" z powodem, nie wieczne „Pobieram…"',
    /Nie udało się pobrać \(Przekroczono limit czasu\)/.test(app.html()) && !/Pobieram/.test(app.html()), app.html().slice(-700));
  app.click('[data-act="diagRetry"]');
  check('„Spróbuj jeszcze raz" pyta ponownie', calls(app, 'getDiagnostics').length===1 && /Pobieram/.test(app.html()));
  respondTo(app, 'getDiagnostics', {env:'prod', triggerInstalled:true, triggerCount:1, resetHour:20, serverDate:D,
    serverTime:'10:00', businessDate:D, timezone:'Europe/Warsaw', dogCount:2, taskCount:0, histCount:5});
  check('stan serwera widać', /wyzwalacz resetu/.test(app.html()) && /aktywny \(1\)/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S115: komunikaty ---------- */
async function S115(){
  console.log('S115: drugi komunikat stoi pełny czas — zegar pierwszego go nie gasi');
  const app = buildApp();
  app.seed(base());
  const t = doc(app).getElementById('toast');
  app.window.eval('toast("pierwszy")');
  await sleep(2000);
  app.window.eval('toast("drugi")');
  await sleep(1000);                                   // 3 s od pierwszego, 1 s od drugiego
  check('drugi wciąż widoczny', t.classList.contains('show') && t.textContent==='drugi', t.className + ' ' + t.textContent);
  await sleep(1900);
  check('...i znika po swoich 2,6 s', !t.classList.contains('show'), t.className);
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

(async ()=>{
  for(const s of [S112, S112b, S112c, S112d, S112e, S113, S114, S115]){
    try{ await s(); }
    catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
  }
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})();

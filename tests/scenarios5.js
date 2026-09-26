// S25-S31: zakładka Panel, dynamiczna godzina czyszczenia, gest 5 tapnięć,
// oraz oszczędne renderowanie (patch pojedynczego kafelka + deduplikacja HTML).
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }

const pack = (n, extra)=>Object.assign({
  dogs: Array.from({length:n}, (_,i)=>dogFree({id:i+1, name:'Pies'+(i+1)})),
  tasks: [], today: '2026-08-04', resetHour: 22,
}, extra||{});

const DIAG = {
  resetHour:22, triggerInstalled:true, triggerCount:1, timezone:'Europe/Warsaw',
  serverTime:'10:15', serverDate:'2026-08-04', dogCount:3, taskCount:0, histCount:12,
};
function tap(app, n){
  const el = app.window.document.getElementById('today');
  for(let i=0;i<n;i++) el.dispatchEvent(new app.window.Event('pointerdown',{bubbles:true}));
}

/* ---------- S25: zakładka Panel tylko w trybie edycji ---------- */
(()=>{
  console.log('S25: zakładka Panel widoczna tylko dla admina');
  const app = buildApp();
  app.seed(pack(3));
  const tab = app.window.document.getElementById('tabDiag');

  check('bez PIN-u zakładka ukryta', tab.classList.contains('hidden'));
  app.window.__setAdmin('1234');
  check('po PIN-ie zakładka widoczna', !tab.classList.contains('hidden'));

  app.click('[data-tab="diag"]');
  check('poszło getDiagnostics', app.shipped.includes('getDiagnostics'), app.shipped.join(','));
  app.respondNext(DIAG);
  check('widać stan wyzwalacza', /wyzwalacz resetu/.test(app.html()) && /aktywny/.test(app.html()));
  check('widać selektor godziny', /id="resetHour"/.test(app.html()));
  check('widać log wywołań', /Ostatnie wywołania/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S26: wyjście z trybu edycji zamyka Panel ---------- */
(()=>{
  console.log('S26: wyłączenie trybu edycji zamyka Panel');
  const app = buildApp();
  app.seed(pack(2));
  app.window.__setAdmin('1234');
  app.click('[data-tab="diag"]');
  app.respondNext(DIAG);
  check('jesteśmy w Panelu', /Ostatnie wywołania/.test(app.html()));

  app.window.document.getElementById('gear').dispatchEvent(new app.window.Event('click',{bubbles:true}));
  check('wróciliśmy na listę psów', /Zarezerwuj/.test(app.html()), app.html().slice(0,120));
  check('zakładka znów ukryta', app.window.document.getElementById('tabDiag').classList.contains('hidden'));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S27: gest 5 tapnięć w datę ---------- */
(()=>{
  console.log('S27: 5 tapnięć w datę otwiera Panel (także bez PIN-u)');
  const app = buildApp();
  app.seed(pack(2));

  tap(app, 4);
  check('4 tapnięcia nie wystarczają', /Zarezerwuj/.test(app.html()));
  tap(app, 1);
  check('piąte otwiera Panel', /Ostatnie wywołania/.test(app.html()), app.html().slice(0,120));
  check('bez PIN-u brak danych serwera', /tylko w trybie edycji/.test(app.html()));
  check('nie wołamy getDiagnostics bez PIN-u', !app.shipped.includes('getDiagnostics'), app.shipped.join(','));

  tap(app, 5);
  check('kolejne 5 tapnięć wraca na listę', /Zarezerwuj/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S28: zmiana godziny czyszczenia ---------- */
(()=>{
  console.log('S28: godzina czyszczenia ustawiana z panelu');
  const app = buildApp();
  app.seed(pack(2));
  app.window.__setAdmin('1234');
  app.click('[data-tab="diag"]');
  app.respondNext(DIAG);

  const note = app.window.document.getElementById('resetNote');
  check('nagłówek startowo 22:00', /22:00/.test(note.textContent), note.textContent);

  const sel = app.window.document.getElementById('resetHour');
  sel.value = '6';
  sel.dispatchEvent(new app.window.Event('change',{bubbles:true}));

  check('nagłówek od razu 06:00', /06:00/.test(note.textContent), note.textContent);
  check('poszedł setResetHour', app.shipped.includes('setResetHour'), app.shipped.join(','));

  const job = app.pending[0];
  check('z godziną i PIN-em', job.args[0]===6 && job.args[1]==='1234', JSON.stringify(job.args));

  app.respondNext(pack(2, {resetHour:6}));
  app.respondNext(Object.assign({}, DIAG, {resetHour:6}));   // odświeżony panel
  check('serwer potwierdził 06:00', /06:00/.test(note.textContent), note.textContent);
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S29: patch jednego kafelka nie rusza pozostałych ---------- */
(()=>{
  console.log('S29: rezerwacja przerysowuje TYLKO swój kafelek');
  const app = buildApp();
  app.seed(pack(4));
  const doc = app.window.document;

  // znacznik tożsamości węzłów: jeśli render był pełny, znaczniki przepadną
  doc.querySelectorAll('li.dog').forEach(li=>{ li.__mark = 'orig'; });

  app.click('[data-act="reserve"][data-id="2"]');
  app.type('[data-input="2"]', 'Ala');
  app.click('[data-act="confirm"][data-id="2"]');

  const marks = [...doc.querySelectorAll('li.dog')].map(li=>li.__mark || 'new');
  check('podmieniony dokładnie jeden kafelek',
    marks.filter(m=>m==='new').length===1, marks.join(','));
  check('podmieniony ten właściwy', doc.querySelector('li.dog[data-dog="2"]').__mark===undefined);
  check('licznik przeliczony', /<b>1<\/b> zarezerwowane/.test(app.html()), app.html().match(/class="count">[^<]*<b>\d+<\/b>[^<]*/));

  app.respondNext({dog: dogFree({id:2,name:'Pies2',status:'reserved',who:'Ala'})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S30: odświeżanie bez zmian nie dotyka DOM ---------- */
(()=>{
  console.log('S30: odświeżenie identycznym stanem nie przerysowuje listy');
  const app = buildApp();
  app.seed(pack(3));
  const doc = app.window.document;
  doc.querySelectorAll('li.dog').forEach(li=>{ li.__mark = 'orig'; });

  // symulacja cyklicznego getData z identycznymi danymi
  app.window.__state.loaded = true;
  app.window.eval('applyData(' + JSON.stringify(pack(3)) + '); render();');

  const marks = [...doc.querySelectorAll('li.dog')].map(li=>li.__mark || 'new');
  check('żaden kafelek nie został przerysowany', marks.every(m=>m==='orig'), marks.join(','));

  // ale realna zmiana już musi wejść
  app.window.eval('applyData(' + JSON.stringify(pack(3, {dogs:[
    dogFree({id:1,name:'Pies1',status:'walked',who:'Ala',time:'10:00'}),
    dogFree({id:2,name:'Pies2'}), dogFree({id:3,name:'Pies3'}),
  ]})) + '); render();');
  check('zmiana stanu przerysowuje', /✓ Ala/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S31: godzina resetu przeżywa zwykłe odświeżenie ---------- */
(()=>{
  console.log('S31: godzina z serwera trafia do nagłówka przy każdym getData');
  const app = buildApp();
  app.seed(pack(2, {resetHour:7}));
  const note = app.window.document.getElementById('resetNote');
  check('nagłówek 07:00', /07:00/.test(note.textContent), note.textContent);
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(0);

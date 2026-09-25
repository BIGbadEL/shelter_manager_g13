// S63-S71: symetryczne strzałki, stan wpisany w stronę, tryb edycji jako katalog
// (bez dat i rezerwacji), zadania na konkretny dzień, notatka „nigdy" i odświeżanie
// w trybie edycji.
const fs = require('fs');
const path = require('path');
const { buildApp, dogFree, ROOT } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }

const base = o => Object.assign({
  dogs: [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna', walks:2})],
  walks: [], tasks: [],
  today: '2026-09-24', businessDate: '2026-09-24', resetHour: 20, env: 'prod',
}, o || {});
const doc    = app => app.window.document;
const fwd    = (app, n) => { for(let i=0; i<(n||1); i++) app.click('#nextDay'); };
const back   = (app, n) => { for(let i=0; i<(n||1); i++) app.click('#prevDay'); };
const gear   = app => doc(app).getElementById('gear').dispatchEvent(new app.window.Event('click',{bubbles:true}));
const toastT = app => doc(app).getElementById('toast').textContent;
const TASKS = [
  {id:1, text:'Umyć miski',        date:'2026-09-24', done:false},
  {id:2, text:'Wynieść koce',      date:'2026-09-22', done:false},   // zaległe od 2 dni
  {id:3, text:'Kąpiel Borysa',     date:'2026-09-26', done:false},   // zaplanowane na sobotę
  {id:4, text:'Posprzątać boks 3', date:'2026-09-24', done:true},
];

/* ---------- S63: strzałki symetryczne ---------- */
(()=>{
  console.log('S63: strzałki rysowane, prawa to lustro lewej');
  const idx = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const pathOf = id => { const m = idx.match(new RegExp(`id="${id}"[^>]*>\\s*<svg[^>]*><path d="([^"]+)"`)); return m ? m[1] : null; };
  const nums = d => (d || '').match(/-?\d+(\.\d+)?/g).map(Number);
  const L = nums(pathOf('prevDay')), R = nums(pathOf('nextDay'));
  check('obie strzałki to SVG', !!pathOf('prevDay') && !!pathOf('nextDay'), idx.match(/prevDay[\s\S]{0,120}/)[0]);
  check('bez znaków ← → zależnych od fontu telefonu', !/id="(prev|next)Day"[^>]*>\s*[←→]/.test(idx));
  const mirrored = L.length===R.length && L.every((v,i)=> i%2===0 ? Math.abs((24 - v) - R[i]) < 1e-9 : v===R[i]);
  check('prawa strzałka = dokładne lustro lewej względem środka', mirrored, JSON.stringify({L, R}));
  const xs = L.filter((_,i)=>i%2===0);
  check('lewa wyśrodkowana w polu 24×24', Math.abs((Math.min(...xs)+Math.max(...xs))/2 - 12) < 1e-9, JSON.stringify(xs));
})();

/* ---------- S64: stan wpisany w stronę ---------- */
(()=>{
  console.log('S64: lista od razu, bez drugiego przelotu do serwera');
  const app = buildApp({boot: base({walks:[{date:'2026-09-24', dogId:1, status:'reserved', who:'Ala'}]})});
  check('żadnego getData na starcie', !app.shipped.includes('getData'), app.shipped.join(','));
  check('lista narysowana od razu', /Borys/.test(app.html()) && /Ala/.test(app.html()), app.html().slice(0,200));
  check('pasek dnia ustawiony', /24 września 2026/.test(doc(app).getElementById('dayName').textContent));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));

  const nul = buildApp({boot: 'null'});                    // serwer nie zdołał odczytać stanu
  check('„null" — zwykłe getData, jak dawniej', nul.shipped.includes('getData'), nul.shipped.join(','));
  const bad = buildApp({boot: '{"dogs": [ ucięte'});
  check('nieczytelne — też getData, zamiast wywrotki', bad.shipped.includes('getData') && bad.errors.length===0,
    bad.shipped.join(',') + ' / ' + bad.errors.join('; '));
})();

/* ---------- S65: tryb edycji bez dat i bez rezerwacji ---------- */
(()=>{
  console.log('S65: tryb edycji to katalog psów');
  const app = buildApp();
  app.seed(base({walks:[{date:'2026-09-24', dogId:1, status:'reserved', who:'Ola'}]}));
  app.window.__setAdmin('1234');
  const bar = doc(app).getElementById('dateBar');
  check('wybór dnia schowany', bar.classList.contains('hidden'));
  check('żadnych rezerwacji ani spacerów', !/data-act="(reserve|walk|free|confirm|undoFirst)"/.test(app.html()), app.html().slice(0,300));
  check('nic o stanie dnia — nie widać, kto ma Borysa', !/Ola/.test(app.html()) && !/zarezerwowany/.test(app.html()));
  check('każdy pies z edycją i usuwaniem',
    /data-act="edit" data-id="1"/.test(app.html()) && /data-act="remove" data-id="2"/.test(app.html()));
  check('kolejność z arkusza, bez przestawiania', app.html().indexOf('Borys') < app.html().indexOf('Luna'));
  check('ustawienie spacerów zamiast postępu', /2 spacery dziennie/.test(app.html()) && !/spacery 0\/2/.test(app.html()));
  check('dodawanie psa na miejscu', /id="newName"/.test(app.html()));

  gear(app);
  check('po wyjściu wybór dnia wraca', !bar.classList.contains('hidden'));
  check('...i lista dnia z rezerwacjami', /Ola/.test(app.html()) && /data-act="reserve" data-id="2"/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S66: zadania na liście dnia ---------- */
(()=>{
  console.log('S66: zadanie pojawia się dopiero w swoim dniu');
  const app = buildApp();
  app.seed(base({tasks: TASKS}));
  const html = () => app.html();
  check('dziś: bieżące, zaległe i odhaczone', /Umyć miski/.test(html()) && /Wynieść koce/.test(html()) && /Posprzątać/.test(html()));
  check('dziś: sobotniego jeszcze nie ma', !/Kąpiel Borysa/.test(html()));
  check('nagłówek bez „na dziś" — dzień mówi pasek u góry', /<h3>Zadania<\/h3>/.test(html()) && !/na dziś/.test(html()));
  check('zaległe liczone od bieżącego dnia', /Wynieść koce[\s\S]{0,200}od 2 dni/.test(html()), html().slice(0,600));

  fwd(app);                                                 // piątek — nic zaplanowanego
  check('piątek: bez ramki zadań', !/tasksbox/.test(html()));
  fwd(app);                                                 // sobota
  check('sobota: zaplanowane widać', /Kąpiel Borysa/.test(html()) && /zaplanowane na ten dzień/.test(html()));
  check('...bez odhaczania — to się robi w jego dniu', !/data-act="taskToggle" data-id="3"/.test(html()));
  check('...i bez dzisiejszych', !/Umyć miski/.test(html()));
  back(app, 3);                                             // środa — miniony
  check('miniony dzień: bez zadań', !/tasksbox/.test(html()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S67: zadania w trybie edycji ---------- */
(()=>{
  console.log('S67: prowadząca dodaje zadanie na konkretny dzień');
  const app = buildApp();
  app.seed(base({tasks: TASKS}));
  app.window.__setAdmin('1234');
  const html = app.html();
  check('widać wszystkie, także zaplanowane', ['Umyć miski','Wynieść koce','Kąpiel Borysa','Posprzątać'].every(t=>html.includes(t)));
  check('zaplanowane opisane dniem', /Kąpiel Borysa[\s\S]{0,200}na sobotę 26\.09/.test(html), html.slice(0,900));
  check('zaplanowanego nie da się odhaczyć przed czasem', !/data-act="taskToggle" data-id="3"/.test(html));
  check('każde da się usunąć', /data-act="taskRemove" data-id="3"/.test(html) && /data-act="taskRemove" data-id="1"/.test(html));
  const dateEl = doc(app).getElementById('newTaskDate');
  check('pole daty: domyślnie bieżący dzień, wcześniej się nie da',
    dateEl && dateEl.value==='2026-09-24' && dateEl.getAttribute('min')==='2026-09-24', dateEl && dateEl.outerHTML);
  check('formularz to nie „pole imienia" — nie blokuje odświeżania', !/class="entry"/.test(html));

  app.type('#newTask', 'Przegląd smyczy');
  app.type('#newTaskDate', '2026-09-27');
  app.click('[data-act="taskAdd"]');
  const job = app.pending[app.pending.length-1];
  check('addTask niesie dzień', job.fn==='addTask' && job.args[0]==='Przegląd smyczy' && job.args[2]==='2026-09-27',
    JSON.stringify(job.args));
  app.respondNext(base({tasks: TASKS.concat([{id:5, text:'Przegląd smyczy', date:'2026-09-27', done:false}])}));
  check('potwierdzenie, na kiedy', /na niedzielę 27\.09/.test(toastT(app)), toastT(app));
  check('nowe zadanie od razu na liście prowadzącej', /Przegląd smyczy/.test(app.html()));

  app.type('#newTask', 'Wczorajsze');
  app.type('#newTaskDate', '2026-09-23');
  const before = app.shipped.length;
  app.click('[data-act="taskAdd"]');
  check('dzień, który minął — zatrzymane przed wysłaniem', app.shipped.length===before, app.shipped.join(','));
  check('...z wyjaśnieniem', /minął/.test(toastT(app)), toastT(app));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S68: notatka „nigdy" ---------- */
(()=>{
  console.log('S68: notatka, która nie znika');
  const app = buildApp();
  app.seed(base());
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="1"]');
  const box = doc(app).querySelector('[data-ef="noteForever"]');
  check('jest opcja „nigdy nie znika"', !!box && box.type==='checkbox');
  app.type('[data-ef="note"]', 'Tylko w kagańcu');
  box.checked = true;
  box.dispatchEvent(new app.window.Event('change', {bubbles:true}));
  check('termin wyłączony, gdy „nigdy"', doc(app).querySelector('[data-ef="noteUntil"]').disabled===true);
  app.click('[data-act="editSave"][data-id="1"]');
  const job = app.pending[app.pending.length-1];
  check('zapis wysyła „nigdy"', job.fn==='updateDog' && job.args[1].noteUntil==='nigdy', JSON.stringify(job.args[1]));
  check('w katalogu: „na stałe"', /Tylko w kagańcu[\s\S]{0,80}na stałe/.test(app.html()), app.html().slice(0,600));
  app.respondNext(base({dogs:[dogFree({id:1, name:'Borys', note:'Tylko w kagańcu', noteUntil:'nigdy'}),
                              dogFree({id:2, name:'Luna', walks:2})]}));

  app.click('[data-act="edit"][data-id="1"]');
  check('ponowna edycja: zaznaczone i bez daty',
    doc(app).querySelector('[data-ef="noteForever"]').checked===true
    && doc(app).querySelector('[data-ef="noteUntil"]').value==='', doc(app).querySelector('[data-ef="noteUntil"]').outerHTML);
  app.click('[data-act="editCancel"]');

  gear(app);
  check('na liście dnia widać ją dziś', /Tylko w kagańcu/.test(app.html()));
  fwd(app, 5);
  check('...i za tydzień też', /Tylko w kagańcu/.test(app.html()));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S69: odpowiedzi w trybie edycji się wyświetlają ---------- */
(()=>{
  console.log('S69: dodany pies i zadanie pojawiają się po odpowiedzi serwera');
  // Błąd z produkcji: pole nowego zadania było `.entry`, a busyEditing() brało każde widoczne
  // `.entry` za „ktoś pisze imię" — w trybie edycji nic się więc nie przerysowywało.
  const app = buildApp();
  app.seed(base());
  app.window.__setAdmin('1234');
  app.type('#newTask', 'Umyć miski');
  app.click('[data-act="taskAdd"]');
  app.respondNext(base({tasks:[{id:1, text:'Umyć miski', date:'2026-09-24', done:false}]}));
  check('zadanie widać po odpowiedzi', /Umyć miski/.test(app.html()), app.html().slice(0,300));

  app.type('#newName', 'Rex');
  app.click('[data-act="add"]');
  app.respondNext(base({dogs:[dogFree({id:1,name:'Borys'}), dogFree({id:2,name:'Luna', walks:2}), dogFree({id:3,name:'Rex'})],
                        tasks:[{id:1, text:'Umyć miski', date:'2026-09-24', done:false}]}));
  check('nowego psa widać po odpowiedzi', /Rex/.test(app.html()), app.html().slice(0,300));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S70: odświeżanie w tle działa w trybie edycji ---------- */
(()=>{
  console.log('S70: tryb edycji nie blokuje odświeżania, dopóki nikt nie pisze');
  const app = buildApp();
  app.seed(base());
  app.window.__setAdmin('1234');
  app.window.eval('refresh()');
  app.respondNext(base({dogs:[dogFree({id:1,name:'Borys'}), dogFree({id:2,name:'Luna', walks:2}), dogFree({id:9,name:'Nowy od kogoś'})]}));
  check('zmiany z arkusza docierają', /Nowy od kogoś/.test(app.html()), app.html().slice(0,300));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

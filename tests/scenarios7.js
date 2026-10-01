// S40-S42, S105: miniony dzień (strzałka wstecz) — zastępuje dawną zakładkę Historia.
// Tylko podgląd, dociągany blokami po dwa tygodnie; ekran nigdy nie może utknąć
// na „Wczytuję…".
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const base = o => Object.assign({
  dogs: [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna'})],
  walks: [], tasks: [], today: '2026-09-24', businessDate: '2026-09-24', resetHour: 20, env: 'prod',
}, o || {});
const sentPast = app => app.shipped.filter(f => f === 'getHistoryDays').length;
const dayRel   = app => app.window.document.getElementById('dayRel').textContent;
const back     = (app, n) => { for(let i=0; i<(n||1); i++) app.click('#prevDay'); };

/* ---------- S40: podgląd minionego dnia ---------- */
(()=>{
  console.log('S40: wczoraj — tylko podgląd');
  const app = buildApp();
  app.seed(base());
  back(app);
  check('zanim dojdą dane: „Wczytuję…", nie pusta lista', /Wczytuję/.test(app.html()), app.html());
  const job = app.pending[app.pending.length-1];
  check('pyta o blok dwóch tygodni kończący się wczoraj',
    job.fn==='getHistoryDays' && job.args[0]==='2026-09-10' && job.args[1]==='2026-09-23', JSON.stringify(job.args));

  app.respondNext({history:[
    {date:'2026-09-23', name:'Luna',  who:'Ola', time:'17:00'},
    {date:'2026-09-23', name:'Borys', who:'Ala', time:'9:05'},
    {date:'2026-09-23', name:'Rex',   who:'Ela', time:'10:30'},
    {date:'2026-09-20', name:'Borys', who:'Iza', time:'11:00'},
  ]});
  const html = app.html();
  check('mówi, że to podgląd', /Miniony dzień — tylko podgląd/.test(html));
  check('liczba z poprawną odmianą', /3 spacery/.test(html), html);
  check('po wolontariuszu: Ala, Ela, Ola (kolejność z serwera inna — S105)',
    html.indexOf('Ala') < html.indexOf('Ela') && html.indexOf('Ela') < html.indexOf('Ola'), html);
  check('tylko ten dzień — bez wpisu z 20.09', !/Iza/.test(html));
  check('żadnego przycisku akcji', !/data-act=/.test(html), html);
  check('pasek dnia: wczoraj, z drogą powrotu', /wczoraj/.test(dayRel(app)) && /wróć/.test(dayRel(app)), dayRel(app));
  check('etykieta oznaczona jako przeszłość',
    app.window.document.getElementById('dayLabel').classList.contains('past'));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S41: strzałka w tył nie czeka na serwer w obrębie bloku ---------- */
(()=>{
  console.log('S41: kolejne dni wstecz z pamięci, dalszy blok dociągany sam');
  const app = buildApp();
  app.seed(base());
  back(app);
  app.respondNext({history:[{date:'2026-09-20', name:'Borys', who:'Iza', time:'11:00'}]});
  back(app, 3);                                        // 20 września — w tym samym bloku
  check('bez nowego pytania do serwera', sentPast(app)===1, app.shipped.join(','));
  check('widać wpis z 20.09 od razu', /Iza/.test(app.html()) && /1 spacer\b/.test(app.html()), app.html());
  back(app);                                           // 19 września — pusty dzień
  check('pusty dzień nazwany wprost', /nie zapisano żadnego spaceru/.test(app.html()), app.html());

  back(app, 10);                                       // 9 września — poza pierwszym blokiem
  check('dalszy blok dociągnięty', sentPast(app)===2, app.shipped.join(','));
  const job = app.pending[app.pending.length-1];
  check('...kończący się na wybranym dniu', job.args[1]==='2026-09-09' && job.args[0]==='2026-08-27',
    JSON.stringify(job.args));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S42: nic nie może zamrozić ekranu ---------- */
(()=>{
  console.log('S42: błąd, zguba odpowiedzi i strzałki w trakcie ładowania');
  const app = buildApp();
  app.seed(base());
  back(app);
  app.click('#nextDay');                               // wracamy, zanim cokolwiek doszło
  check('strzałka działa w trakcie ładowania', /Zarezerwuj/.test(app.html()), app.html().slice(0,200));

  app.failNext('boom');
  back(app);
  check('po błędzie jest nowa próba, a nie wieczne „Wczytuję…"', sentPast(app)===2, app.shipped.join(','));
  app.failNext('boom');
  check('komunikat zamiast zawieszenia', /Nie udało się wczytać/.test(app.html()), app.html());

  // odpowiedź zginęła po drodze: po czasie watchdoga wolno zapytać jeszcze raz
  app.click('#nextDay');
  back(app);
  check('zgubione pytanie trzyma się przez chwilę', sentPast(app)===3, app.shipped.join(','));
  app.pending.shift();                                 // odpowiedź nigdy nie przyjdzie
  app.click('#nextDay');
  back(app);
  check('...więc nie dublujemy od razu', sentPast(app)===3, app.shipped.join(','));
  app.window.eval('for (const k in __state.pastLoading) __state.pastLoading[k] = 0;');   // minął watchdog
  app.click('#nextDay');
  back(app);
  check('...ale po watchdogu pytamy znowu', sentPast(app)===4, app.shipped.join(','));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S105: miniony dzień po wolontariuszu (1.1.1) ---------- */
(()=>{
  console.log('S105: miniony dzień — jedna reguła: wolontariusz, spacery jednej osoby razem');
  const app = buildApp();
  app.seed(base());
  back(app);
  // kolejność z serwera celowo ani po godzinie, ani po osobie
  const day = [
    {name:'Borys', who:'GRZESIEK', time:'13:00'},
    {name:'Kora',  who:'',         time:'8:00'},
    {name:'Luna',  who:'Ania',     time:'17:00'},
    {name:'Draco', who:'Grzesiek', time:'9:00'},
    {name:'Rex',   who:'Zuza',     time:'12:00'},
    {name:'Bysiu', who:' grzesiek',time:'11:00'},
    {name:'Łatka', who:'Łukasz',   time:'14:00'},
    {name:'Nero',  who:'Ania',     time:'10:00'},
  ];
  app.respondNext({history: day.map(e => Object.assign({date:'2026-09-23'}, e))});
  const doc = app.window.document;
  const rows = [...doc.querySelectorAll('.hist-item')].map(el => el.querySelector('b').textContent);
  const whoOf = n => day.find(e => e.name === n).who.trim().toLowerCase();
  check('wszystkie wpisy dnia', rows.length === day.length, rows.join(','));
  const runs = rows.map(whoOf).filter((w, i, a) => i === 0 || a[i-1] !== w);
  check('spacery jednej osoby stoją razem (wielkość liter i spacje bez znaczenia)',
    new Set(runs).size === runs.length, rows.join(','));
  check('osoby alfabetycznie, Łukasz jak „L", wpis bez osoby na końcu',
    JSON.stringify(runs) === JSON.stringify(['ania','grzesiek','łukasz','zuza','']), JSON.stringify(runs));
  check('to jedyna reguła: w obrębie osoby kolejność z serwera, nie godzina',
    rows.join(',') === 'Luna,Nero,Borys,Draco,Bysiu,Łatka,Rex,Kora', rows.join(','));
  check('godzina nadal widoczna przy wpisie', /9:00/.test(app.html()) && /17:00/.test(app.html()), app.html());
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

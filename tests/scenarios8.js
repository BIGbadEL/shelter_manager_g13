// S43-S46: kolejność kafelków (wolne -> zarezerwowane -> wyprowadzone) wraz
// z zamrożeniem jej na czas akcji, oraz przełącznik dwóch spacerów w Panelu.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }
const ord = app => JSON.stringify(app.window.__order());
const tap = app => app.window.document.dispatchEvent(new app.window.Event('pointerdown'));

/* ---------- S43: grupowanie po statusie ---------- */
(()=>{
  console.log('S43: wolne na górze, wyprowadzone na dole');
  const app = buildApp();
  app.seed({dogs:[
    dogFree({id:1, name:'Pies1', status:'walked',   who:'Ala'}),
    dogFree({id:2, name:'Pies2'}),
    dogFree({id:3, name:'Pies3', status:'reserved', who:'Ola'}),
    dogFree({id:4, name:'Pies4'}),
  ], tasks:[], today:'2026-07-08'});

  check('kolejność: wolne, zarezerwowane, wyprowadzone', ord(app)==='[2,4,3,1]', ord(app));
  check('w obrębie grupy zostaje kolejność z arkusza', ord(app).indexOf('2,4')>=0, ord(app));
  check('godzina zniknęła z kafelka wyprowadzonego',
    /✓ Ala/.test(app.html()) && !/✓ Ala ·/.test(app.html()), app.html().slice(0,400));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S44: nic nie ucieka spod palca ---------- */
(()=>{
  console.log('S44: lista zamrożona na czas akcji');
  const app = buildApp();
  app.seed({dogs:[dogFree({id:1,name:'A'}), dogFree({id:2,name:'B'}), dogFree({id:3,name:'C'})],
            tasks:[], today:'2026-07-08'});
  check('start: wszystkie wolne, kolejność z arkusza', ord(app)==='[1,2,3]', ord(app));

  tap(app);                                            // palec dotyka ekranu
  app.click('[data-act="reserve"][data-id="1"]');
  app.type('[data-input="1"]', 'Ania');
  app.click('[data-act="confirm"][data-id="1"]');
  check('po rezerwacji kafelek zmienia się W MIEJSCU', ord(app)==='[1,2,3]', ord(app));
  check('widać rezerwację', /Ania/.test(app.html()));

  app.respondNext({dog: dogFree({id:1,name:'A',status:'reserved',who:'Ania'})});
  check('po odpowiedzi serwera nadal bez skoku', ord(app)==='[1,2,3]', ord(app));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));

  // najgorszy możliwy moment: odświeżenie w tle wchodzi tuż po tapnięciu
  // i przynosi PEŁNY stan, czyli przerysowuje całą listę
  app.window.document.dispatchEvent(new app.window.Event('visibilitychange'));
  check('odświeżenie w tle wystartowało',
    app.pending[app.pending.length-1].fn==='getData', app.pending.map(p=>p.fn).join(','));
  app.respondNext({dogs:[
    dogFree({id:1,name:'A',status:'reserved',who:'Ania'}), dogFree({id:2,name:'B'}), dogFree({id:3,name:'C'}),
  ], tasks:[], today:'2026-07-08'});
  check('pełne odświeżenie tuż po tapnięciu NIE przestawia listy', ord(app)==='[1,2,3]', ord(app));

  app.window.__settle();                               // dopiero cisza układa listę
  check('po ciszy zarezerwowany schodzi pod wolne', ord(app)==='[2,3,1]', ord(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S45: seria akcji pod rząd bez ani jednego skoku ---------- */
(()=>{
  console.log('S45: seria akcji — kolejność stoi do końca, układa się po ciszy');
  const app = buildApp();
  app.seed({dogs:[
    dogFree({id:1,name:'A'}), dogFree({id:2,name:'B'}), dogFree({id:3,name:'C',status:'reserved',who:'Ola'}),
  ], tasks:[], today:'2026-07-08'});
  check('start: wolne nad zarezerwowanym', ord(app)==='[1,2,3]', ord(app));

  tap(app);
  app.click('[data-act="reserve"][data-id="1"]');
  app.type('[data-input="1"]', 'Ania');
  app.click('[data-act="confirm"][data-id="1"]');
  check('kolejność stoi po rezerwacji', ord(app)==='[1,2,3]', ord(app));

  tap(app);
  app.click('[data-act="walk"][data-id="3"]');
  check('kolejność stoi po wyprowadzeniu', ord(app)==='[1,2,3]', ord(app));

  app.respondNext({dog: dogFree({id:1,name:'A',status:'reserved',who:'Ania'})});
  app.respondNext({dog: dogFree({id:3,name:'C',status:'walked',who:'Ola'})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('po rozliczeniu zapisów nadal bez skoku', ord(app)==='[1,2,3]', ord(app));

  app.window.__settle();
  check('po ciszy: wolny, zarezerwowany, wyprowadzony', ord(app)==='[2,1,3]', ord(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S46: przełącznik dwóch spacerów w Panelu ---------- */
(()=>{
  console.log('S46: dwa spacery dla wszystkich psów z Panelu');
  const app = buildApp();
  app.seed({dogs:[dogFree({id:1,name:'A'})], tasks:[], today:'2026-07-08'});
  app.window.__setAdmin('1234');
  app.click('.tab[data-tab="diag"]');

  // Panel sam z siebie pyta o diagnostykę — odpowiedzmy, żeby nie mylić się
  // później z odpowiedziami na właściwą akcję
  check('Panel pyta o stan serwera', app.pending[0] && app.pending[0].fn==='getDiagnostics',
    app.pending.map(p=>p.fn).join(','));
  app.respondNext({resetHour:22, triggerInstalled:true, triggerCount:1, timezone:'Europe/Warsaw',
                   serverTime:'10:00', serverDate:'2026-07-08', dogCount:1, taskCount:0, histCount:0});

  const html = app.html();
  check('przycisk „wszystkie po 2 spacery"', /data-act="allWalks" data-walks="2"/.test(html), html.slice(0,400));
  check('przycisk „wszystkie po 1 spacerze"', /data-act="allWalks" data-walks="1"/.test(html));
  check('wyjaśnienie, co się stanie z psem już wyprowadzonym', /po pierwszym z dwóch/.test(html));

  app.click('[data-act="allWalks"][data-walks="2"]');
  const job = app.pending[app.pending.length-1];
  check('poszedł setAllWalks(2) z PIN-em',
    job.fn==='setAllWalks' && job.args[0]===2 && job.args[1]==='1234', JSON.stringify(job.args));

  app.respondNext({dogs:[dogFree({id:1,name:'A',walks:2})], tasks:[], today:'2026-07-08'});
  check('stan po serwerze: pies ma 2 spacery', app.window.__state.dogs[0].walks===2);
  check('potwierdzenie dla użytkownika',
    /2 spacery/.test(app.window.document.getElementById('toast').textContent),
    app.window.document.getElementById('toast').textContent);

  app.click('[data-act="allWalks"][data-walks="1"]');
  const job1 = app.pending[app.pending.length-1];
  check('powrót wysyła setAllWalks(1)', job1.fn==='setAllWalks' && job1.args[0]===1, JSON.stringify(job1.args));
  app.respondNext({dogs:[dogFree({id:1,name:'A',walks:1})], tasks:[], today:'2026-07-08'});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S47: przy dwóch spacerach liczy się dorobek, nie sam status ---------- */
(()=>{
  console.log('S47: pies po pierwszym spacerze schodzi pod psy bez spaceru');
  const app = buildApp();
  const d2 = o => dogFree(Object.assign({walks:2}, o));

  // układ 1:1 z listy zgłoszonej z terenu
  app.seed({dogs:[
    d2({id:1, name:'Barwik'}),
    d2({id:2, name:'Freja'}),
    d2({id:3, name:'Finito',  who1:'Joanna',   time1:'19:59'}),                    // wolny, ale po 1. spacerze
    d2({id:4, name:'Lego'}),
    d2({id:5, name:'Marvel'}),
    d2({id:6, name:'Witkacy', status:'reserved', who:'Grzesiek',
        who1:'Grzesiek', time1:'20:00'}),                                          // zarezerwowany po 1. spacerze
    d2({id:7, name:'Bibi',    status:'reserved', who:'Grzesiek'}),                  // zarezerwowany, bez spaceru
    d2({id:8, name:'Ever',    status:'reserved', who:'Joanna'}),                    // j.w.
    d2({id:9, name:'Siena',   status:'walked',   who:'Grzesiek',
        who1:'Joanna', time1:'19:59'}),                                            // komplet 2/2
  ], tasks:[], today:'2026-08-10'});

  const o = app.window.__order();
  const at = id => o.indexOf(id);
  check('pełna kolejność', ord(app)==='[1,2,4,5,7,8,3,6,9]', ord(app));
  check('Finito (1/2) pod Lego (0/2)',      at(3) > at(4), ord(app));
  check('Finito (1/2) pod Everem (0/2)',    at(3) > at(8), ord(app));
  check('Witkacy (1/2) pod Bibi (0/2)',     at(6) > at(7), ord(app));
  check('Witkacy (1/2) pod Everem (0/2)',   at(6) > at(8), ord(app));
  check('wolny przed zarezerwowanym w tym samym dorobku', at(5) < at(7), ord(app));
  check('Finito (1/2) nad Witkacym (1/2, zajęty)', at(3) < at(6), ord(app));
  check('komplet 2/2 na samym dole', at(9)===o.length-1, ord(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S48: psy jednospacerowe zachowują dotychczasową kolejność ---------- */
(()=>{
  console.log('S48: tryb jednego spaceru bez zmian');
  const app = buildApp();
  app.seed({dogs:[
    dogFree({id:1, name:'A', status:'walked', who:'Ala'}),
    dogFree({id:2, name:'B'}),
    dogFree({id:3, name:'C', status:'reserved', who:'Ola'}),
    dogFree({id:4, name:'D'}),
  ], tasks:[], today:'2026-08-10'});
  check('wolne, zarezerwowany, wyprowadzony', ord(app)==='[2,4,3,1]', ord(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

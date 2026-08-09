// S40-S42: widok Historii — ograniczenie do ostatnich dni nie może wyglądać
// jak skasowane dane, a liczba dni ma iść z serwera, nie z kodu interfejsu.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

function openHistory(app){
  app.seed({dogs:[dogFree()], tasks:[], today:'2026-07-08'});
  app.click('.tab[data-tab="history"]');
  return app;
}

/* ---------- S40: grupowanie po dniach + informacja o zakresie ---------- */
(()=>{
  console.log('S40: Historia — dni, spacery i notka o zakresie');
  const app = openHistory(buildApp());
  check('poszedł getHistory', app.pending[0] && app.pending[0].fn==='getHistory',
    app.pending.map(p=>p.fn).join(','));

  app.respondNext({days:14, history:[
    {date:'2026-07-08', name:'Borys', who:'Ala', time:'10:00'},
    {date:'2026-07-08', name:'Luna',  who:'Ola', time:'17:00'},
    {date:'2026-07-07', name:'Borys', who:'Ela', time:'09:30'},
  ]});
  const html = app.html();
  check('dwa dni w widoku', (html.match(/hist-day/g)||[]).length===2, html.slice(0,200));
  check('licznik spacerów przy dacie', /2 spacerów/.test(html));
  check('widać wolontariuszy', /Ala/.test(html) && /Ela/.test(html));
  check('notka o zakresie', /Pokazane ostatnie 14 dni/.test(html), html.slice(-200));
  check('notka mówi, gdzie jest komplet', /arkusz/.test(html), html.slice(-200));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S41: zakres pochodzi z serwera ---------- */
(()=>{
  console.log('S41: liczba dni idzie z serwera, nie jest wpisana w interfejs');
  const app = openHistory(buildApp());
  app.respondNext({days:30, history:[{date:'2026-07-08', name:'Borys', who:'Ala', time:'10:00'}]});
  check('notka pokazuje 30', /Pokazane ostatnie 30 dni/.test(app.html()), app.html().slice(-200));
  check('nie ma wpieczonego 14', !/ostatnie 14 dni/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S42: pusta historia i starszy serwer bez pola days ---------- */
(()=>{
  console.log('S42: pusta historia oraz odpowiedź bez pola days');
  const app = openHistory(buildApp());
  app.respondNext({days:14, history:[]});
  check('pusto: komunikat zamiast notki', /Brak zapisanych dni/.test(app.html()), app.html());
  check('pusto: bez notki o zakresie', !/Pokazane ostatnie/.test(app.html()));

  // odpowiedź bez `days` (np. karta otwarta przed wdrożeniem) nie może wywalić widoku
  const old = openHistory(buildApp());
  old.respondNext({history:[{date:'2026-07-08', name:'Borys', who:'Ala', time:'10:00'}]});
  check('bez pola days: widok żyje', /Borys/.test(old.html()), old.html().slice(0,200));
  check('bez pola days: notka z wartością domyślną', /Pokazane ostatnie 14 dni/.test(old.html()));
  check('bez błędów', old.errors.length===0, old.errors.join('; '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

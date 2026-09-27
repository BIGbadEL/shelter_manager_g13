// S53-S62: nawigacja ← data →, rezerwacje z wyprzedzeniem, przeskok dnia
// o godzinie resetu, notatki i kolejność w kontekście dnia.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }

const base = o => Object.assign({
  dogs: [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna'})],
  walks: [], tasks: [{id:1, text:'Umyć miski', date:'2026-09-24', done:false}],
  today: '2026-09-24', businessDate: '2026-09-24', resetHour: 20, env: 'prod',
}, o || {});
const doc      = app => app.window.document;
const dayName  = app => doc(app).getElementById('dayName').textContent;
const dayRel   = app => doc(app).getElementById('dayRel').textContent;
const fwd      = (app, n) => { for(let i=0; i<(n||1); i++) app.click('#nextDay'); };
const back     = (app, n) => { for(let i=0; i<(n||1); i++) app.click('#prevDay'); };
const ord      = app => JSON.stringify(app.window.__order());
const refresh  = (app, data) => {                      // odświeżenie w tle, np. po powrocie do karty
  app.window.eval('refresh()');
  const j = app.pending[app.pending.length-1];
  if(!j || j.fn!=='getData') throw new Error('brak getData: ' + app.pending.map(p=>p.fn).join(','));
  app.respondNext(data);
};
function reserveOn(app, id, who){
  app.click(`[data-act="reserve"][data-id="${id}"]`);
  app.type(`[data-input="${id}"]`, who);
  app.click(`[data-act="confirm"][data-id="${id}"]`);
}

/* ---------- S53: pasek dnia ---------- */
(()=>{
  console.log('S53: ← data → zamiast zakładek Dziś / Historia');
  const app = buildApp();
  app.seed(base());
  check('nie ma już zakładki Historia', !doc(app).querySelector('[data-tab="history"]'));
  check('data jak w zgłoszeniu', /24 września 2026/.test(dayName(app)), dayName(app));
  check('dzień tygodnia i „dziś"', /czwartek/.test(dayRel(app)) && /dziś/.test(dayRel(app)), dayRel(app));
  check('na bieżącym dniu bez „wróć"', !/wróć/.test(dayRel(app)));

  // po resecie (20:00) bieżący dzień to już jutro — i pasek mówi to wprost
  const eve = buildApp();
  eve.seed(base({businessDate:'2026-09-25'}));
  check('po resecie pracujemy na 25 września', /25 września 2026/.test(dayName(eve)), dayName(eve));
  check('...opisanym jako „jutro"', /jutro/.test(dayRel(eve)), dayRel(eve));
  check('bez błędów', app.errors.length===0 && eve.errors.length===0, app.errors.concat(eve.errors).join('; '));
})();

/* ---------- S54: strzałki w przód i powrót ---------- */
(()=>{
  console.log('S54: przyszłe dni — z pamięci, bez czekania na serwer');
  const app = buildApp();
  app.seed(base({walks:[
    {date:'2026-09-26', dogId:1, status:'reserved', who:'Zosia'},
  ]}));
  const before = app.shipped.length;
  fwd(app, 2);
  check('26 września', /26 września 2026/.test(dayName(app)), dayName(app));
  check('„za 2 dni" i droga powrotu', /za 2 dni/.test(dayRel(app)) && /wróć/.test(dayRel(app)), dayRel(app));
  check('rezerwacja z tego dnia widoczna', /Zosia/.test(app.html()), app.html().slice(0,300));
  check('żadnego pytania do serwera', app.shipped.length===before, app.shipped.join(','));

  app.click('#dayLabel');                              // stuknięcie w datę = powrót
  check('powrót na bieżący dzień', /24 września 2026/.test(dayName(app)) && !/Zosia/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S55: rezerwacja z wyprzedzeniem ---------- */
(()=>{
  console.log('S55: rezerwacja na sobotę');
  const app = buildApp();
  app.seed(base());
  fwd(app, 2);
  check('bez zadań na przyszły dzień', !/Zadania/.test(app.html()));
  check('podpowiedź, że to rezerwacja z wyprzedzeniem', /z wyprzedzeniem/.test(app.html()));

  reserveOn(app, 1, 'Zosia');
  const job = app.pending[app.pending.length-1];
  check('reserve niesie datę soboty', job.fn==='reserve' && job.args[2]==='2026-09-26', JSON.stringify(job.args));
  check('rezerwacja od razu na kafelku', /Zosia/.test(app.html()));
  check('w przyszłości nie ma „Wyprowadzony ✓"', !/data-act="walk"/.test(app.html()));
  check('...ale da się zwolnić', /data-act="free" data-id="1"/.test(app.html()));
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'reserved', who:'Zosia', date:'2026-09-26'})});

  app.click('#dayLabel');
  check('bieżący dzień nietknięty', !/Zosia/.test(app.html()) && /Zadania/.test(app.html()));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S56: odpowiedź wraca do SWOJEGO dnia ---------- */
(()=>{
  console.log('S56: rezerwacja na jutro, powrót strzałką przed odpowiedzią');
  const app = buildApp();
  app.seed(base());
  fwd(app);
  reserveOn(app, 1, 'Ania');
  back(app);                                           // wracamy, odpowiedź jeszcze w drodze
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'reserved', who:'Ania', date:'2026-09-25'})});
  check('dzisiejszy Borys nadal wolny (ekran)', !/Ania/.test(app.html()) && /data-act="reserve" data-id="1"/.test(app.html()));
  // ekran sprzed odpowiedzi to za mało — przerysuj dziś ze STANU, tam siedziałby błąd
  fwd(app); back(app);
  check('dzisiejszy Borys nadal wolny (stan)', !/Ania/.test(app.html()) && /data-act="reserve" data-id="1"/.test(app.html()),
    app.html().slice(0,300));
  fwd(app);
  check('jutrzejszy Borys zarezerwowany przez Anię', /Ania/.test(app.html()));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S57: przeskok dnia o godzinie resetu ---------- */
(()=>{
  console.log('S57: po resecie lista sama przechodzi na nowy dzień');
  const app = buildApp();
  app.seed(base());
  refresh(app, base({businessDate:'2026-09-25'}));
  check('kto był na bieżącym dniu, jest na nowym', /25 września 2026/.test(dayName(app)), dayName(app));

  // kto przeglądał niedzielę, zostaje na niedzieli
  const away = buildApp();
  away.seed(base());
  fwd(away, 3);
  refresh(away, base({businessDate:'2026-09-25'}));
  check('przeglądający przyszłość zostaje tam, gdzie był', /27 września 2026/.test(dayName(away)), dayName(away));
  check('bez błędów', app.errors.length===0 && away.errors.length===0, app.errors.concat(away.errors).join('; '));
})();

/* ---------- S58: reset w trakcie wpisywania imienia ---------- */
(()=>{
  console.log('S58: reset, gdy ktoś właśnie wpisuje imię');
  const app = buildApp();
  app.seed(base());
  app.click('[data-act="reserve"][data-id="1"]');      // pole „Twoje imię" otwarte
  refresh(app, base({businessDate:'2026-09-25'}));
  check('dzień nie zmienia się pod palcami (ekran)', /24 września 2026/.test(dayName(app)), dayName(app));
  // sam pasek to za mało: nie przerysowuje się, gdy ktoś pisze — liczy się stan,
  // bo to od niego zależy, na który dzień poleci wpisane imię
  check('...ani w stanie aplikacji', app.window.__state.date==='2026-09-24', app.window.__state.date);

  app.type('[data-input="1"]', 'Ania');
  app.click('[data-act="confirm"][data-id="1"]');       // OK na dniu, który się właśnie zamknął
  check('jasny komunikat zamiast ciszy', /zamknięty/.test(doc(app).getElementById('toast').textContent),
    doc(app).getElementById('toast').textContent);
  check('...i przejście na nowy dzień', /25 września 2026/.test(dayName(app)), dayName(app));
  check('nic nie poleciało na zamknięty dzień', !app.shipped.includes('reserve'), app.shipped.join(','));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S59: notatki na właściwych dniach ---------- */
(()=>{
  console.log('S59: notatka bez terminu tylko dziś, z terminem — do terminu');
  const app = buildApp();
  app.seed(base({dogs:[
    dogFree({id:1, name:'Borys', note:'Zdjęcia o 12:00'}),
    dogFree({id:2, name:'Luna',  note:'Spacer zapoznawczy', noteUntil:'2026-09-26'}),
  ]}));
  check('dziś widać obie', /Zdjęcia/.test(app.html()) && /zapoznawczy/.test(app.html()));
  fwd(app);
  check('jutro tylko ta z terminem', !/Zdjęcia/.test(app.html()) && /zapoznawczy/.test(app.html()));
  fwd(app);
  check('w dniu terminu nadal', /zapoznawczy/.test(app.html()));
  fwd(app);
  check('dzień po terminie — nie ma', !/zapoznawczy/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S60: nowy dzień = od razu właściwa kolejność ---------- */
(()=>{
  console.log('S60: zmiana dnia układa listę od razu, mimo świeżego dotknięcia');
  const app = buildApp();
  app.seed(base({walks:[{date:'2026-09-25', dogId:1, status:'reserved', who:'Ola'}]}));
  check('dziś oba wolne, kolejność z arkusza', ord(app)==='[1,2]', ord(app));
  app.window.document.dispatchEvent(new app.window.Event('pointerdown'));   // palec na ekranie
  fwd(app);
  check('jutro wolna Luna nad zarezerwowanym Borysem', ord(app)==='[2,1]', ord(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S61: odznaka „bez spaceru" tylko na bieżącym dniu ---------- */
(()=>{
  console.log('S61: „bez spaceru" liczone od bieżącego dnia, z dniami jeszcze niezamkniętymi');
  const app = buildApp();
  app.seed(base({
    dogs: [dogFree({id:1, name:'Borys', lastWalk:'2026-09-20'}), dogFree({id:2, name:'Luna', lastWalk:'2026-09-20'})],
    walks: [{date:'2026-09-23', dogId:1, status:'walked', who:'Ala', time:'10:00'}],   // czyszczenie jeszcze nie domknęło
  }));
  const borys = () => app.window.document.querySelector('li.dog[data-dog="1"]').textContent;
  const luna  = () => app.window.document.querySelector('li.dog[data-dog="2"]').textContent;
  check('Borys wyszedł wczoraj — bez odznaki', !/bez spaceru/.test(borys()), borys());
  check('Luna od 20.09 — odznaka', /bez spaceru od 3 dni/.test(luna()), luna());
  fwd(app);
  check('na przyszłym dniu żadnych odznak', !/bez spaceru/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S62: ten sam pies na dwa dni — dwa niezależne zapisy ---------- */
(()=>{
  console.log('S62: dziś i jutro dla tego samego psa jadą równolegle');
  const app = buildApp();
  app.seed(base());
  reserveOn(app, 1, 'Ala');
  fwd(app);
  reserveOn(app, 1, 'Ola');
  const res = app.pending.filter(p => p.fn==='reserve');
  check('oba zapisy w drodze naraz', res.length===2, app.pending.map(p=>p.fn+':'+JSON.stringify(p.args)).join(' '));
  check('każdy ze swoją datą', res[0] && res[1] && res[0].args[2]==='2026-09-24' && res[1].args[2]==='2026-09-25',
    JSON.stringify(res.map(r=>r.args)));
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'reserved', who:'Ala'})});
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'reserved', who:'Ola'})});
  check('jutro Ola', /Ola/.test(app.html()));
  back(app);
  check('dziś Ala', /Ala/.test(app.html()) && !/Ola/.test(app.html()));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

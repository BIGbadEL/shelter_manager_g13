const { buildApp, dogFree, dogReserved, dogWalked } = require('./harness');

let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){
  const s = app.state();
  return s.sending === false && s.queueLen === 0 && s.pending.length === 0;
}
function alive(app){
  // "żywość": klik na dostępny przycisk musi zmienić stan i wysłać wywołanie
  const before = app.shipped.length;
  const w = app.window.document.querySelector('[data-act="walk"], [data-act="free"], [data-act="reserve"]');
  if(!w) return false;
  w.dispatchEvent(new app.window.Event('click',{bubbles:true}));
  if(w.dataset.act === 'reserve'){ // otwiera pole — dokończ rezerwację
    const id = w.dataset.id;
    app.type(`[data-input="${id}"]`,'Test');
    app.click(`[data-act="confirm"][data-id="${id}"]`);
  }
  return app.shipped.length > before;
}

/* ---------- 1: odpowiedź setFree przychodzi, gdy pole imienia jest OTWARTE ---------- */
(()=>{ 
  console.log('S1: odpowiedź w trakcie wpisywania imienia');
  const app = buildApp();
  app.seed({dogs:[dogWalked('G')], tasks:[], today:'2026-07-08'});
  app.click('[data-act="free"]');
  app.click('[data-act="reserve"]');                    // pole otwarte
  app.respondNext({dog: dogFree()});                    // odp. setFree w trakcie
  app.type('[data-input="1"]','Grzesiek');
  app.click('[data-act="confirm"]');
  app.respondNext({dog: dogReserved('Grzesiek')});
  check('stan reserved', app.state().dogs[0]==='reserved:Grzesiek', JSON.stringify(app.state()));
  check('kolejka pusta', drained(app));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- 2: wszystkie odpowiedzi dopiero po całej sekwencji klików ---------- */
(()=>{
  console.log('S2: klik-klik-klik, odpowiedzi na końcu');
  const app = buildApp();
  app.seed({dogs:[dogWalked('G')], tasks:[], today:'2026-07-08'});
  app.click('[data-act="free"]');
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','G'); app.click('[data-act="confirm"]');
  app.click('[data-act="walk"]');
  app.click('[data-act="free"]');
  app.respondNext({dog:dogFree()});
  app.respondNext({dog:dogReserved('G')});
  app.respondNext({dog:dogWalked('G','15:00')});
  app.respondNext({dog:dogFree()});
  check('finalnie free', app.state().dogs[0]==='free:', JSON.stringify(app.state()));
  check('kolejka pusta', drained(app));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- 3: PODWÓJNY klik w OK (dubel na telefonie) ---------- */
(()=>{
  console.log('S3: dwuklik w OK przy rezerwacji');
  const app = buildApp();
  app.seed({dogs:[dogFree()], tasks:[], today:'2026-07-08'});
  app.click('[data-act="reserve"]');
  app.type('[data-input="1"]','G');
  const btn = app.window.document.querySelector('[data-act="confirm"]');
  btn.dispatchEvent(new app.window.Event('click',{bubbles:true}));
  btn.dispatchEvent(new app.window.Event('click',{bubbles:true}));   // dubel na starym węźle
  app.respondNext({dog:dogReserved('G')});
  check('jedna rezerwacja wysłana', app.shipped.filter(f=>f==='reserve').length===1, app.shipped.join(','));
  check('kolejka pusta', drained(app));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- 4: dwuklik w Cofnij ---------- */
(()=>{
  console.log('S4: dwuklik w Cofnij');
  const app = buildApp();
  app.seed({dogs:[dogWalked('G')], tasks:[], today:'2026-07-08'});
  const btn = app.window.document.querySelector('[data-act="free"]');
  btn.dispatchEvent(new app.window.Event('click',{bubbles:true}));
  btn.dispatchEvent(new app.window.Event('click',{bubbles:true}));
  while(app.pending.length) app.respondNext({dog:dogFree()});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- 5: BŁĄD serwera w środku sekwencji ---------- */
(()=>{
  console.log('S5: failure w środku łańcucha');
  const app = buildApp();
  app.seed({dogs:[dogWalked('G')], tasks:[], today:'2026-07-08'});
  app.click('[data-act="free"]');
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','G'); app.click('[data-act="confirm"]');
  app.failNext('awaria');                        // setFree pada -> automatyczny retry
  check('retry setFree', app.shipped.filter(f=>f==='setFree').length===2, app.shipped.join(','));
  app.failNext('awaria2');                       // retry też pada -> definitywnie, needRefresh
  app.respondNext({dog:dogReserved('G')});       // reserve ok
  check('poszło dosynchronizowanie', app.shipped[app.shipped.length-1]==='getData', app.shipped.join(','));
  app.respondNext({dogs:[dogReserved('G')],tasks:[],today:'2026-07-08'});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- 6: konflikt (ktoś ubiegł) + dalsze akcje ---------- */
(()=>{
  console.log('S6: przegrany wyścig o psa, potem kolejne akcje');
  const app = buildApp();
  app.seed({dogs:[dogFree()], tasks:[], today:'2026-07-08'});
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','G'); app.click('[data-act="confirm"]');
  app.respondNext({dog:dogReserved('Kasia')});   // wygrała Kasia
  check('pokazuje Kasię', app.state().dogs[0]==='reserved:Kasia', JSON.stringify(app.state()));
  check('kolejka pusta', drained(app));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- 7: mieszanka pies + zadania naraz ---------- */
(()=>{
  console.log('S7: pies i zadania przeplatane');
  const app = buildApp();
  app.seed({dogs:[dogFree()], tasks:[{id:9,text:'miski',date:'2026-07-08',done:false}], today:'2026-07-08'});
  app.click('[data-act="taskToggle"]');
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','G'); app.click('[data-act="confirm"]');
  app.click('[data-act="taskToggle"]');          // odznacz z powrotem
  app.respondNext({ok:true,id:9,done:true});
  app.respondNext({dog:dogReserved('G')});
  app.respondNext({ok:true,id:9,done:false});
  const s=app.state();
  check('task odznaczony', s.tasks[0]==='9:0', JSON.stringify(s));
  check('pies reserved', s.dogs[0]==='reserved:G');
  check('kolejka pusta', drained(app));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- 8: odświeżenie (interval) przychodzące ze STARYMI danymi po zakończeniu zapisów ---------- */
(()=>{
  console.log('S8: spóźniony getData z odświeżania nadpisuje stan?');
  const app = buildApp({});
  app.seed({dogs:[dogFree()], tasks:[], today:'2026-07-08'});
  // symulujemy: interval odpalił refresh PRZED akcjami usera
  app.window.eval('refresh()');
  // teraz user rezerwuje
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','G'); app.click('[data-act="confirm"]');
  // odp. na reserve przychodzi pierwsza. Celujemy w nią po nazwie: respondNext bierze pierwsze
  // w kolejce, czyli getData — i przez lata ten test odpowiadał odwrotnie, niż opisuje, więc
  // wyścigu nie sprawdzał (przegląd 1.2: stary odczyt cofał rezerwację na ekranie, S113)
  const at = fn => app.pending.findIndex(p => p.fn===fn);
  const r = app.pending.splice(at('reserve'), 1)[0]; r.ok({dog:dogReserved('G')});
  const fn2 = app.respondNext({dogs:[dogFree()],tasks:[],today:'2026-07-08'});
  check('kolejność: reserve, potem spóźniony ' + fn2, fn2==='getData');
  check('stan NIE cofnął się do free', app.state().dogs[0]==='reserved:G', JSON.stringify(app.state()));
  check('...a stan dociąga się od nowa (nowy getData)', app.pending.some(p => p.fn==='getData'), app.shipped.join(','));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

process.exit(failures ? 1 : 0);

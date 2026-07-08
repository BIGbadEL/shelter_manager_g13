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
  const before = app.shipped.length;
  const w = app.window.document.querySelector('[data-act="walk"], [data-act="free"], [data-act="reserve"]');
  if(!w) return false;
  w.dispatchEvent(new app.window.Event('click',{bubbles:true}));
  if(w.dataset.act === 'reserve'){
    const id = w.dataset.id;
    app.type(`[data-input="${id}"]`,'Test');
    app.click(`[data-act="confirm"][data-id="${id}"]`);
  }
  return app.shipped.length > before;
}
function tap(app){ // dotknięcie ekranu — uruchamia checkStuck
  app.window.document.dispatchEvent(new app.window.Event('pointerdown'));
}

/* ---------- S9: ZAGINIONY callback + ratunek jednym tapnięciem ---------- */
(()=>{
  console.log('S9: callback zaginął, tapnięcie ratuje (retry)');
  const app = buildApp();
  app.seed({dogs:[dogReserved('G')], tasks:[], today:'2026-07-08'});
  app.click('[data-act="walk"]');
  // serwer NIGDY nie odpowiada; udajemy upływ czasu i tapnięcie
  app.window.__force(); tap(app);
  check('retry wysłany', app.shipped.filter(f=>f==='markWalked').length===2, app.shipped.join(','));
  app.pending.shift();                                  // porzucony oryginał (nigdy nie odpowie)
  app.respondNext({dog: dogWalked('G','15:30')});       // retry dostaje odpowiedź
  check('stan walked', app.state().dogs[0]==='walked:G', JSON.stringify(app.state()));
  check('kolejka pusta', drained(app));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S10: zaginął i oryginał, i retry -> pełna resynchronizacja ---------- */
(()=>{
  console.log('S10: dwa zaginięcia z rzędu -> failsafe getData');
  const app = buildApp();
  app.seed({dogs:[dogReserved('G')], tasks:[], today:'2026-07-08'});
  app.click('[data-act="walk"]');
  app.window.__force(); tap(app);          // gubimy oryginał -> retry
  app.window.__force(); tap(app);          // gubimy retry -> definitywna porażka + needRefresh
  check('poszło ratunkowe getData', app.shipped[app.shipped.length-1]==='getData', app.shipped.join(','));
  app.pending.splice(0,2);                 // dwa porzucone markWalked
  app.respondNext({dogs:[dogWalked('G','15:30')], tasks:[], today:'2026-07-08'});
  check('prawda z serwera przywrócona', app.state().dogs[0]==='walked:G', JSON.stringify(app.state()));
  check('kolejka pusta', drained(app));
  check('UI żywe', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S11: wyjątek w reconcile nie zabija kolejki ---------- */
(()=>{
  console.log('S11: reconcile rzuca wyjątkiem');
  const app = buildApp();
  app.seed({dogs:[dogFree()], tasks:[], today:'2026-07-08'});
  app.window.eval("__enqueue('setFree',[1],{key:__keyDog(1),reconcile:()=>{throw new Error('boom')}})");
  app.respondNext({dog:dogFree()});
  check('kolejka przeżyła', app.state().sending===false, JSON.stringify(app.state()));
  // needRefresh -> przy opróżnionej kolejce poszło getData
  check('dosynchronizowanie po wyjątku', app.shipped[app.shipped.length-1]==='getData', app.shipped.join(','));
  app.respondNext({dogs:[dogFree()],tasks:[],today:'2026-07-08'});
  check('UI żywe', alive(app));
})();

/* ---------- S12: DOKŁADNY scenariusz użytkownika + zaginiona odpowiedź setFree ---------- */
(()=>{
  console.log('S12: wyprowadzony -> Cofnij (odp. ginie) -> Zarezerwuj -> tap ratuje');
  const app = buildApp();
  app.seed({dogs:[dogWalked('G')], tasks:[], today:'2026-07-08'});
  app.click('[data-act="free"]');                                       // odpowiedź NIGDY nie przyjdzie
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','Grzesiek'); app.click('[data-act="confirm"]');
  check('DOM pokazuje reserved (optymistycznie)', /zarezerwowany/.test(app.html()));
  // użytkownik klika dalej / dotyka ekranu — checkStuck ratuje
  app.window.__force(); tap(app);
  check('retry setFree wysłany', app.shipped.filter(f=>f==='setFree').length===2, app.shipped.join(','));
  app.pending.shift();                                                  // porzucony oryginał setFree
  app.respondNext({dog:dogFree()});                                     // retry setFree ok
  app.respondNext({dog:dogReserved('Grzesiek')});                       // reserve ok
  check('finalnie reserved', app.state().dogs[0]==='reserved:Grzesiek', JSON.stringify(app.state()));
  check('kolejka pusta', drained(app));
  check('UI żywe — Wyprowadzony działa', alive(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S13: awaria renderu nie zamraża interfejsu ---------- */
(()=>{
  console.log('S13: render pada -> komunikat + samonaprawa');
  const app = buildApp();
  app.seed({dogs:[dogFree()], tasks:[], today:'2026-07-08'});
  app.window.eval('__state.dogs = null;');            // celowo psujemy stan
  app.window.eval('render()');
  check('pokazał komunikat zamiast zamrożenia', /odświeżam dane/.test(app.html()), app.html().slice(0,80));
  check('poszło ratunkowe getData', app.shipped[app.shipped.length-1]==='getData', app.shipped.join(','));
  app.respondNext({dogs:[dogFree()],tasks:[],today:'2026-07-08'});
  check('wyzdrowiał', /Zarezerwuj/.test(app.html()));
  check('UI żywe', alive(app));
})();

/* ---------- S14: sekwencja użytkownika x20 z losowym gubieniem odpowiedzi ---------- */
(()=>{
  console.log('S14: fuzz — losowe akcje + losowo gubione/opóźniane odpowiedzi');
  let bad = 0;
  for(let seed=0; seed<20; seed++){
    let rnd = seed*2654435761 % 4294967296;
    const rand = () => (rnd = (rnd*1103515245+12345) % 2147483648) / 2147483648;
    const app = buildApp();
    app.seed({dogs:[dogFree(), dogFree({id:2,name:'Luna'})], tasks:[{id:9,text:'miski',date:'2026-07-08',done:false}], today:'2026-07-08'});
    for(let step=0; step<30; step++){
      const doc = app.window.document;
      const btns = [...doc.querySelectorAll('[data-act="walk"],[data-act="free"],[data-act="reserve"],[data-act="taskToggle"]')];
      if(btns.length && rand()<0.6){
        const b = btns[Math.floor(rand()*btns.length)];
        b.dispatchEvent(new app.window.Event('click',{bubbles:true}));
        if(b.dataset.act==='reserve'){
          const id=b.dataset.id;
          const inp=doc.querySelector(`[data-input="${id}"]`);
          if(inp){ inp.value='F'+step; const ok=doc.querySelector(`[data-act="confirm"][data-id="${id}"]`); if(ok) ok.dispatchEvent(new app.window.Event('click',{bubbles:true})); }
        }
      }
      if(app.pending.length && rand()<0.5){
        const j=app.pending[0]; const r=rand();
        if(r<0.15){ app.pending.shift(); app.window.__force(); tap(app); }      // odpowiedź ginie -> ratunek
        else if(r<0.3){ app.failNext('los'); }                                   // błąd serwera
        else {
          // odpowiedz sensownie wg typu
          if(j.fn==='getData') app.respondNext({dogs:[dogFree(),dogFree({id:2,name:'Luna'})],tasks:[{id:9,text:'miski',date:'2026-07-08',done:false}],today:'2026-07-08'});
          else if(j.fn==='setTaskDone') app.respondNext({ok:true,id:9,done:true});
          else if(j.fn==='reserve') app.respondNext({dog:dogReserved('X')});
          else if(j.fn==='markWalked') app.respondNext({dog:dogWalked('X','12:00')});
          else app.respondNext({dog:dogFree()});
        }
      }
    }
    // dolej odpowiedzi do końca
    let guard=0;
    while((app.pending.length || !drained(app)) && guard++<200){
      if(!app.pending.length){ app.window.__force(); tap(app); continue; }
      const j=app.pending[0];
      if(j.fn==='getData') app.respondNext({dogs:[dogFree(),dogFree({id:2,name:'Luna'})],tasks:[{id:9,text:'miski',date:'2026-07-08',done:false}],today:'2026-07-08'});
      else if(j.fn==='setTaskDone') app.respondNext({ok:true,id:9,done:true});
      else if(j.fn==='reserve') app.respondNext({dog:dogReserved('X')});
      else if(j.fn==='markWalked') app.respondNext({dog:dogWalked('X','12:00')});
      else app.respondNext({dog:dogFree()});
    }
    const okDrained = drained(app);
    const okAlive = alive(app);
    const okErr = app.errors.length===0;
    if(!(okDrained && okAlive && okErr)){ bad++; console.log('  seed',seed,'drained:',okDrained,'alive:',okAlive,'errors:',app.errors.slice(0,3)); }
  }
  check('20/20 przebiegów fuzz przeszło', bad===0, bad+' złych');
})();

process.exit(failures ? 1 : 0);

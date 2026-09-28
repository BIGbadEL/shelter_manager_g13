// S19-S24: równoległa kolejka zapisów (różne psy naraz) + podpowiadanie imienia.
// Regresja na zgłoszenie: "rezerwuję parę psów pod rząd i po drugim się zawiesza".
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }

const pack = (n)=>({
  dogs: Array.from({length:n}, (_,i)=>dogFree({id:i+1, name:'Pies'+(i+1)})),
  tasks: [], today: '2026-08-04',
});
function reserveDog(app, id, who){
  app.click(`[data-act="reserve"][data-id="${id}"]`);
  app.type(`[data-input="${id}"]`, who);
  app.click(`[data-act="confirm"][data-id="${id}"]`);
}
const okReserve = (id, who)=>({dog: dogFree({id, name:'Pies'+id, status:'reserved', who})});

/* ---------- S19: trzy psy pod rząd lecą RÓWNOLEGLE ---------- */
(()=>{
  console.log('S19: rezerwacja trzech psów pod rząd bez czekania');
  const app = buildApp();
  app.seed(pack(3));

  reserveDog(app, 1, 'Ala');
  reserveDog(app, 2, 'Ala');
  reserveDog(app, 3, 'Ala');

  const shipped = app.shipped.filter(f=>f==='reserve');
  check('wszystkie 3 zapisy ruszyły od razu', shipped.length===3, 'wysłane: '+app.shipped.join(','));
  check('nic nie czeka w kolejce', app.state().queueLen===0, JSON.stringify(app.state()));
  check('wszystkie 3 psy zajęte w UI', app.state().dogs.every(d=>d.startsWith('reserved')), JSON.stringify(app.state().dogs));

  // odpowiedzi wracają w innej kolejności niż poszły — tak bywa naprawdę
  app.pending.reverse();
  app.respondNext(okReserve(3,'Ala'));
  app.respondNext(okReserve(2,'Ala'));
  app.respondNext(okReserve(1,'Ala'));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('UI żywe', /data-act="walk"/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S20: ten sam pies nadal po kolei ---------- */
(()=>{
  console.log('S20: dwie akcje na TYM SAMYM psie zachowują kolejność');
  const app = buildApp();
  app.seed(pack(2));

  reserveDog(app, 1, 'Ala');
  app.click('[data-act="free"][data-id="1"]');   // od razu zwolnij tego samego psa

  const reserves = app.shipped.filter(f=>f==='reserve').length;
  const frees    = app.shipped.filter(f=>f==='setFree').length;
  check('drugi zapis TEGO psa czeka na pierwszy', reserves===1 && frees===0, app.shipped.join(','));
  check('jeden zapis w kolejce', app.state().queueLen===1, JSON.stringify(app.state()));

  app.respondNext(okReserve(1,'Ala'));
  check('dopiero teraz poszedł setFree', app.shipped.filter(f=>f==='setFree').length===1, app.shipped.join(','));
  app.respondNext({dog: dogFree({id:1,name:'Pies1'})});
  check('finalnie wolny', app.state().dogs[0]==='free:', JSON.stringify(app.state().dogs));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S21: zawieszony pies NIE blokuje pozostałych ---------- */
(()=>{
  console.log('S21: zaginiona odpowiedź dla psa 1 nie blokuje psa 2 i 3');
  const app = buildApp();
  app.seed(pack(3));

  reserveDog(app, 1, 'Ala');
  const lost = app.pending.shift();            // odpowiedź dla psa 1 przepada na zawsze
  check('zapis psa 1 wisi', app.state().sending===true);

  reserveDog(app, 2, 'Ala');
  reserveDog(app, 3, 'Ala');
  check('psy 2 i 3 poszły mimo wiszącego psa 1',
    app.shipped.filter(f=>f==='reserve').length===3, app.shipped.join(','));

  app.respondNext(okReserve(2,'Ala'));
  app.respondNext(okReserve(3,'Ala'));
  check('psy 2 i 3 rozliczone', app.state().pending.length===1, JSON.stringify(app.state().pending));
  check('UI żywe', /data-act="walk"/.test(app.html()));

  // ratunek dla psa 1: tapnięcie w ekran po przekroczeniu watchdoga
  app.window.__force();
  app.window.document.dispatchEvent(new app.window.Event('pointerdown',{bubbles:true}));
  check('pies 1 ponowiony', app.shipped.filter(f=>f==='reserve').length===4, app.shipped.join(','));
  app.respondNext(okReserve(1,'Ala'));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
  void lost;
})();

/* ---------- S22: sufit równoległości ---------- */
(()=>{
  console.log('S22: nie więcej niż 4 zapisy naraz');
  const app = buildApp();
  app.seed(pack(6));
  for(let i=1;i<=6;i++) reserveDog(app, i, 'Ala');

  check('w locie dokładnie 4', app.shipped.filter(f=>f==='reserve').length===4, app.shipped.join(','));
  check('reszta czeka w kolejce', app.state().queueLen===2, JSON.stringify(app.state()));
  check('ale UI pokazuje wszystkie 6 jako zajęte',
    app.state().dogs.every(d=>d.startsWith('reserved')), JSON.stringify(app.state().dogs));

  app.respondNext(okReserve(1,'Ala'));
  check('zwolniony tor wpuszcza kolejnego', app.shipped.filter(f=>f==='reserve').length===5);
  app.respondNext(okReserve(2,'Ala'));
  app.respondNext(okReserve(3,'Ala'));
  app.respondNext(okReserve(4,'Ala'));
  app.respondNext(okReserve(5,'Ala'));
  app.respondNext(okReserve(6,'Ala'));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S23: imię podpowiadane przy kolejnym psie ---------- */
(()=>{
  console.log('S23: imię pamiętane w obrębie sesji');
  const app = buildApp();
  app.seed(pack(2));

  reserveDog(app, 1, 'Grzesiek');
  app.respondNext(okReserve(1,'Grzesiek'));

  app.click('[data-act="reserve"][data-id="2"]');
  const input = app.window.document.querySelector('[data-input="2"]');
  check('pole przy drugim psie ma już imię', input && input.value==='Grzesiek', input ? input.value : '(brak pola)');

  app.click('[data-act="confirm"][data-id="2"]');
  check('potwierdzenie jednym kliknięciem działa',
    app.state().dogs[1]==='reserved:Grzesiek', JSON.stringify(app.state().dogs));
  app.respondNext(okReserve(2,'Grzesiek'));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/** Odpowiada zgodnie z tym, o co pytano: getData -> pełny stan, zapis -> {dog:null}. */
function answerNext(app){
  const fn = app.pending[0] && app.pending[0].fn;
  try{
    if(fn==='getData') app.respondNext(pack(5));
    else if(fn==='getHistory') app.respondNext({history:[]});
    else app.respondNext({dog:null});
  }catch(e){ /* callback rzucił — harness to zaloguje */ }
}

/* ---------- S24: fuzz na wielu psach z gubionymi odpowiedziami ---------- */
(()=>{
  console.log('S24: fuzz — 5 psów, losowe akcje, losowo gubione odpowiedzi');
  let bad = 0;
  for(let run=0; run<20; run++){
    const app = buildApp();
    app.seed(pack(5));
    const acts = ['reserve','walk','free'];
    for(let step=0; step<25; step++){
      const id = 1 + Math.floor(Math.random()*5);
      const act = acts[Math.floor(Math.random()*acts.length)];
      try{
        if(act==='reserve' && app.window.document.querySelector(`[data-act="reserve"][data-id="${id}"]`)){
          reserveDog(app, id, 'Ala');
        } else if(app.window.document.querySelector(`[data-act="${act}"][data-id="${id}"]`)){
          app.click(`[data-act="${act}"][data-id="${id}"]`);
        }
      }catch(e){ /* element zniknął między renderami — jak realny nietrafiony tap */ }

      // losowo: odpowiedz, zgub albo zignoruj
      if(app.pending.length && Math.random()<0.6){
        const roll = Math.random();
        if(roll < 0.25) app.pending.shift();                  // zguba
        else if(roll < 0.4) { try{ app.failNext('boom'); }catch(e){} }
        else answerNext(app);
      }
    }
    // ratunek: watchdog + tapnięcie, potem domknij wszystko co zostało
    for(let i=0;i<12;i++){
      app.window.__force();
      app.window.document.dispatchEvent(new app.window.Event('pointerdown',{bubbles:true}));
      while(app.pending.length) answerNext(app);
    }
    const s = app.state();
    const alive = /Zarezerwuj|data-act="walk"|Cofnij|odświeżam/.test(app.html());
    if(!(s.sending===false && s.queueLen===0 && alive && app.errors.length===0)){
      bad++;
      if(bad===1) console.log('    przebieg', run, JSON.stringify(s), app.errors.slice(0,2));
    }
  }
  check(`${20-bad}/20 przebiegów fuzz przeszło`, bad===0);
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(0);

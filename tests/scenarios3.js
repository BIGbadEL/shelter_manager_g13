const { buildApp, dogFree, dogReserved, dogWalked, ROOT } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }
const dog2 = (o)=>dogFree(Object.assign({walks:2},o));

/* ---------- S15: pełny cykl psa 2-spacerowego ---------- */
(()=>{
  console.log('S15: dwa spacery — pełny cykl');
  const app = buildApp();
  app.seed({dogs:[dog2()], tasks:[], today:'2026-07-08'});
  check('pokazuje 0/2', /spacery 0\/2/.test(app.html()), app.html().slice(0,300));

  // pierwszy spacer
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','Ania'); app.click('[data-act="confirm"]');
  app.respondNext({dog: dog2({status:'reserved',who:'Ania'})});
  app.click('[data-act="walk"]');
  check('po 1. spacerze pies znów WOLNY', /Zarezerwuj/.test(app.html()) && /spacery 1\/2/.test(app.html()));
  check('widać kto odbył 1. spacer', /1\. spacer: Ania/.test(app.html()));
  app.respondNext({dog: dog2({who1:'Ania',time1:'10:15'})});

  // drugi spacer — inna osoba
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','Bartek'); app.click('[data-act="confirm"]');
  app.respondNext({dog: dog2({status:'reserved',who:'Bartek',who1:'Ania',time1:'10:15'})});
  app.click('[data-act="walk"]');
  check('po 2. spacerze status walked + 2/2', /spacery 2\/2/.test(app.html()) && /✓ Bartek/.test(app.html()));
  app.respondNext({dog: dog2({status:'walked',who:'Bartek',time:'15:40',who1:'Ania',time1:'10:15'})});

  // Cofnij drugi spacer -> wraca do 1/2, pierwszy zachowany
  app.click('[data-act="free"]');
  check('Cofnij: znów wolny z 1/2', /spacery 1\/2/.test(app.html()) && /1\. spacer: Ania/.test(app.html()));
  app.respondNext({dog: dog2({who1:'Ania',time1:'10:15'})});

  // Cofnij 1. spacer (pomyłka) -> 0/2
  app.click('[data-act="undoFirst"]');
  check('Cofnij 1. spacer: 0/2', /spacery 0\/2/.test(app.html()) && !/1\. spacer/.test(app.html()));
  app.respondNext({dog: dog2()});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S16: notatka jednodniowa — edycja i wyświetlanie ---------- */
(()=>{
  console.log('S16: notatka przy psie');
  const app = buildApp();
  app.seed({dogs:[dogFree({note:'Zdjęcia o 12:00 w parku'})], tasks:[], today:'2026-07-08'});
  check('notatka na kafelku', /📌 Zdjęcia o 12:00 w parku/.test(app.html()), app.html().slice(0,300));

  // wejście w tryb edycji i zmiana notatki + przełączenie na 2 spacery
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"]');
  check('pole notatki w edycji', !!app.window.document.querySelector('[data-ef="note"]'));
  app.type('[data-ef="note"]','Wyjazd na AW');
  app.window.document.querySelector('[data-ef="walks"]').value='2';
  app.click('[data-act="editSave"]');
  // tryb edycji to katalog: widać USTAWIENIE psa, nie postęp dnia
  check('optymistycznie w katalogu: nowa notatka + 2 spacery dziennie',
    /📌 Wyjazd na AW/.test(app.html()) && /2 spacery dziennie/.test(app.html()), app.html().slice(0,400));
  app.respondNext({dogs:[dogFree({note:'Wyjazd na AW',walks:2})],tasks:[],today:'2026-07-08'});
  check('po serwerze bez zmian wizualnych', /📌 Wyjazd na AW/.test(app.html()) && /2 spacery dziennie/.test(app.html()));
  app.window.document.getElementById('gear').dispatchEvent(new app.window.Event('click',{bubbles:true}));
  check('po wyjściu z edycji lista dnia pokazuje postęp 0/2',
    /spacery 0\/2/.test(app.html()) && /📌 Wyjazd na AW/.test(app.html()), app.html().slice(0,400));
  check('kolejka pusta', drained(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S17: 2-spacerowy pies + zaginiona odpowiedź po 1. spacerze ---------- */
(()=>{
  console.log('S17: dwa spacery + samoleczenie');
  const app = buildApp();
  app.seed({dogs:[dog2({status:'reserved',who:'Ania'})], tasks:[], today:'2026-07-08'});
  app.click('[data-act="walk"]');                    // 1. spacer — odpowiedź zginie
  app.window.__force();
  app.window.document.dispatchEvent(new app.window.Event('pointerdown'));
  check('retry markWalked', app.shipped.filter(f=>f==='markWalked').length===2, app.shipped.join(','));
  app.pending.shift();
  app.respondNext({dog: dog2({who1:'Ania',time1:'10:15'})});
  check('1/2 po ratunku', /spacery 1\/2/.test(app.html()));
  check('kolejka pusta', drained(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S18: porządki UI ---------- */
(()=>{
  console.log('S18: nazewnictwo, bez opisu na dole strony');
  const fs=require('fs'), path=require('path');
  const idx=fs.readFileSync(path.join(ROOT,'Index.html'),'utf8');
  const scr=fs.readFileSync(path.join(ROOT,'Script.html'),'utf8');
  const sty=fs.readFileSync(path.join(ROOT,'Styles.html'),'utf8');
  check('brak "prowadzącej" w Index', !/prowadząc/i.test(idx));
  check('brak "PROWADZĄCEJ" w Script (UI)', !/PROWADZĄCEJ/.test(scr));
  check('placeholder to samo "PIN"', /placeholder="PIN"/.test(idx));
  // opis na dole i tak nikt nie czytał (zgłoszenie z terenu) — nie wraca
  check('brak stopki z opisem', !/<footer/i.test(idx) && !/resetNoteFoot/.test(idx + scr));
  check('brak stylów stopki', !/(^|\s)footer\s*\{/m.test(sty));
})();

/* ---------- S39: klient mówi serwerowi, KTÓRY to spacer ---------- */
(()=>{
  console.log('S39: markWalked niesie numer spaceru');
  const app = buildApp();
  app.seed({dogs:[dog2({status:'reserved',who:'Ania'})], tasks:[], today:'2026-07-08'});

  app.click('[data-act="walk"]');                       // pierwszy z dwóch
  check('slot 1 przy pierwszym spacerze',
    app.pending[0].fn==='markWalked' && app.pending[0].args[2]===1, JSON.stringify(app.pending[0].args));

  // odpowiedź ginie -> ponowienie MUSI nieść ten sam slot, inaczej serwer zrobi 2/2
  app.window.__force();
  app.window.document.dispatchEvent(new app.window.Event('pointerdown'));
  const retry = app.pending[app.pending.length-1];
  check('ponowienie z tym samym slotem',
    retry.fn==='markWalked' && retry.args[2]===1, JSON.stringify(retry.args));
  app.pending.shift();                                  // pierwsza odpowiedź już nie wróci
  app.respondNext({dog: dog2({who1:'Ania',time1:'10:15'})});

  // drugi spacer — inna osoba
  app.click('[data-act="reserve"]'); app.type('[data-input="1"]','Bartek'); app.click('[data-act="confirm"]');
  app.respondNext({dog: dog2({status:'reserved',who:'Bartek',who1:'Ania',time1:'10:15'})});
  app.click('[data-act="walk"]');
  check('slot 2 przy drugim spacerze',
    app.pending[0].fn==='markWalked' && app.pending[0].args[2]===2, JSON.stringify(app.pending[0].args));
  app.respondNext({dog: dog2({status:'walked',who:'Bartek',time:'15:40',who1:'Ania',time1:'10:15'})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));

  // pies 1-spacerowy zawsze odhacza ostatni spacer
  const solo = buildApp();
  solo.seed({dogs:[dogReserved('Ala')], tasks:[], today:'2026-07-08'});
  solo.click('[data-act="walk"]');
  check('pies 1-spacerowy: slot 2', solo.pending[0].args[2]===2, JSON.stringify(solo.pending[0].args));
  solo.respondNext({dog: dogWalked('Ala','14:00')});
  check('1-spacerowy bez błędów', solo.errors.length===0, solo.errors.join('; '));
})();

process.exit(failures ? 1 : 0);

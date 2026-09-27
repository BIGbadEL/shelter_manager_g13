const { buildApp, dogFree, dogReserved, dogWalked, ROOT } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }
const dog2 = (o)=>dogFree(Object.assign({walks:2},o));
/** Odpowiedź serwera na akcję na spacerze (nowy kształt: {slot}). */
const slotRes = (n, o)=>({slot: Object.assign({slot:n, status:'free', who:'', time:'', group:0}, o)});
const field = (app, n) => app.window.document.querySelector(`.slot[data-slot="${n}"]`);
const txt = el => el ? el.textContent.replace(/\s+/g,' ').trim() : '(brak)';

/* ---------- S15: pełny cykl psa 2-spacerowego ---------- */
(()=>{
  console.log('S15: dwa spacery — dwa osobne pola, każde z własnym przyciskiem');
  const app = buildApp();
  app.seed({dogs:[dog2()], tasks:[], today:'2026-07-08'});
  check('dwa pola: 1/2 i 2/2, oba do rezerwacji', /1\/2/.test(txt(field(app,1))) && /2\/2/.test(txt(field(app,2)))
    && !!field(app,1).querySelector('[data-act="reserve"]') && !!field(app,2).querySelector('[data-act="reserve"]'),
    app.html().slice(0,500));
  check('jeden kafelek psa, bez postępu „spacery 0/2"', app.window.document.querySelectorAll('li.dog').length===1
    && !/spacery \d\/2/.test(app.html()));

  // popołudnie zarezerwowane, zanim ktokolwiek wyszedł rano
  app.click('[data-act="reserve"][data-slot="2"]'); app.type('[data-input="1"][data-slot="2"]','Bartek');
  app.click('[data-act="confirm"][data-slot="2"]');
  const r2 = app.pending[app.pending.length-1];
  check('rezerwacja 2/2 niesie numer spaceru', r2.fn==='reserve' && r2.args[1]==='Bartek' && r2.args[3]===2, JSON.stringify(r2.args));
  check('1/2 dalej wolny', !!field(app,1).querySelector('[data-act="reserve"]') && /Bartek/.test(txt(field(app,2))));
  app.respondNext(slotRes(2, {status:'reserved', who:'Bartek'}));

  app.click('[data-act="reserve"][data-slot="1"]'); app.type('[data-input="1"][data-slot="1"]','Ania');
  app.click('[data-act="confirm"][data-slot="1"]');
  app.respondNext(slotRes(1, {status:'reserved', who:'Ania'}));
  check('dwie osoby przy jednym psie', /Ania/.test(txt(field(app,1))) && /Bartek/.test(txt(field(app,2))));

  app.click('[data-act="walk"][data-slot="1"]');
  check('markWalked spaceru 1', app.pending[0].fn==='markWalked' && app.pending[0].args[2]===1, JSON.stringify(app.pending[0].args));
  check('1/2 odbyty, 2/2 dalej zarezerwowany', /✓ Ania/.test(txt(field(app,1))) && /Bartek/.test(txt(field(app,2)))
    && !!field(app,2).querySelector('[data-act="walk"]'));
  app.respondNext(slotRes(1, {status:'walked', who:'Ania', time:'10:15'}));

  app.click('[data-act="walk"][data-slot="2"]');
  check('po 2. spacerze cały kafelek odbyty', /✓ Bartek/.test(txt(field(app,2)))
    && app.window.document.querySelector('li.dog').classList.contains('walked'));
  app.respondNext(slotRes(2, {status:'walked', who:'Bartek', time:'15:40'}));

  app.click('[data-act="free"][data-slot="2"]');     // „Cofnij" drugiego
  const f = app.pending[0];
  check('Cofnij 2/2 — setFree z numerem i widzianym stanem', f.fn==='setFree' && f.args[3]===2
    && JSON.stringify(f.args[2])==='{"status":"walked","who":"Bartek"}', JSON.stringify(f.args));
  check('2/2 znów wolny, 1/2 zachowany', !!field(app,2).querySelector('[data-act="reserve"]') && /✓ Ania/.test(txt(field(app,1))));
  app.respondNext(slotRes(2, {}));

  app.click('[data-act="free"][data-slot="1"]');     // „Cofnij" pierwszego (pomyłka)
  check('Cofnij 1/2 — oba wolne', !!field(app,1).querySelector('[data-act="reserve"]') && !!field(app,2).querySelector('[data-act="reserve"]'));
  check('nie ma już osobnego „Cofnij 1. spacer"', !/undoFirst/.test(app.html()));
  app.respondNext(slotRes(1, {}));
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
  check('po wyjściu z edycji lista dnia pokazuje pola 1/2 i 2/2',
    !!field(app,1) && !!field(app,2) && /📌 Wyjazd na AW/.test(app.html()), app.html().slice(0,400));
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
  app.respondNext({dog: dog2({who1:'Ania',time1:'10:15'})});     // serwer sprzed spacerów: {dog} w starym kształcie
  check('1/2 odbyty po ratunku, 2/2 wolny', /✓ Ania/.test(txt(field(app,1))) && !!field(app,2).querySelector('[data-act="reserve"]'));
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
  app.respondNext(slotRes(1, {status:'walked', who:'Ania', time:'10:15'}));

  // drugi spacer — inna osoba
  app.click('[data-act="reserve"][data-slot="2"]'); app.type('[data-input="1"][data-slot="2"]','Bartek');
  app.click('[data-act="confirm"][data-slot="2"]');
  app.respondNext(slotRes(2, {status:'reserved', who:'Bartek'}));
  app.click('[data-act="walk"][data-slot="2"]');
  check('slot 2 przy drugim spacerze',
    app.pending[0].fn==='markWalked' && app.pending[0].args[2]===2, JSON.stringify(app.pending[0].args));
  app.respondNext(slotRes(2, {status:'walked', who:'Bartek', time:'15:40'}));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));

  // pies 1-spacerowy: jego jedyny spacer to spacer 1 (serwer przyjmuje też stare „2")
  const solo = buildApp();
  solo.seed({dogs:[dogReserved('Ala')], tasks:[], today:'2026-07-08'});
  solo.click('[data-act="walk"]');
  check('pies 1-spacerowy: slot 1', solo.pending[0].args[2]===1, JSON.stringify(solo.pending[0].args));
  solo.respondNext({dog: dogWalked('Ala','14:00')});
  check('1-spacerowy bez błędów', solo.errors.length===0, solo.errors.join('; '));
})();

process.exit(failures ? 1 : 0);

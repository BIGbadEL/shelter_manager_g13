// S143: stan startowy z pamięci podręcznej serwera (1.4, `cached` — bootState_ w WebApp.gs). Lista rysuje się
// od razu, a świeży stan z arkusza idzie zaraz za nią: ręczna edycja arkusza mogła pamięci jeszcze nie dogonić.
// Serwer (znaczniki pokolenia, wyścigi, awarie pamięci) sprawdza backend.js — B71, B72.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const D = '2026-10-09';
const DATA = { dogs: [dogFree({id:1, name:'Azor'}), dogFree({id:2, name:'Bari'})], slots: [], tasks: [],
  today: D, businessDate: D, resetHour: 18, env: 'prod' };
const reads = app => app.pending.filter(p => p.fn === 'getData').length;

function S143(){
  console.log('S143: stan startowy z pamięci serwera — lista od razu, świeży odczyt zaraz za nią; bez „cached" jak dotąd');
  const a = buildApp({ boot: Object.assign({ cached: true }, DATA) });
  check('stan z pamięci: lista narysowana od razu, bez czekania na serwer', a.window.__order().length === 2, JSON.stringify(a.window.__order()));
  check('...i od razu idzie świeży odczyt (getData)', reads(a) === 1, reads(a));
  const i = a.pending.findIndex(p => p.fn === 'getData');
  a.pending.splice(i, 1)[0].ok(Object.assign({}, DATA, { dogs: DATA.dogs.concat([dogFree({id:3, name:'Cezar'})]),
    slots: [{date: D, dogId: 1, slot: 1, status: 'reserved', who: 'Ola', time: '', group: 0}] }));
  const s = a.window.__state;
  check('...a jego odpowiedź zastępuje stan z pamięci (nowy pies, rezerwacja z arkusza)', s.dogs.length === 3
    && s.slots[D + '|1|1'] && s.slots[D + '|1|1'].status === 'reserved', JSON.stringify(s.slots));

  const b = buildApp({ boot: DATA });
  check('stan z arkusza (bez „cached"): bez dodatkowego odczytu na starcie — jak przed 1.4', reads(b) === 0, reads(b));
  check('bez błędów skryptu', a.errors.length === 0 && b.errors.length === 0, a.errors.concat(b.errors).join(' | '));
}

S143();
console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

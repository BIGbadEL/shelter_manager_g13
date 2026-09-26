// Backend na atrapie arkusza. Stan psa KONKRETNEGO DNIA żyje w zakładce Spacery
// (wiersz na parę dzień+pies), a zegar jest zamrożony, ale przestawialny
// (env.setNow) — dzięki temu da się przejść przez godzinę resetu w jednym scenariuszu.
//
// B1-B4 notatki, B5 archiwizacja pod datą dnia, B6 godzina resetu, B7-B8 idempotencja
// markWalked, B9 PIN, B10 Historia, B11-B12 setAllWalks, B13-B14 pełny dzień
// dwóch spacerów, B15 środowisko, B16 dzień rezerwacyjny, B17 rezerwacje na daty,
// B18 przejście przez godzinę resetu, B19 domykanie zaległych dni, B20 podgląd
// minionych dni, B21 jednorazowe przeniesienie starego stanu, B22 usuwanie psa,
// B23 zagnieżdżona blokada.
const { makeContext } = require('./backend-harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const DOG_HEADERS = ['id','imie','identyfikator','boks','trudnosc','status','kto','godzina',
  'ostatni_spacer','notatka','spacery','kto1','godzina1','notatka_do'];
const WALK_HEADERS = ['data','pies_id','status','kto','godzina','kto1','godzina1'];
const HIST_HEADERS = ['data','pies','kto','godzina'];
const TASK_HEADERS = ['id','tresc','data','status'];

/** PIN nie jest już w kodzie — każdy test podstawia własny przez właściwości skryptu. */
const TEST_PIN = '4321';

/** Wiersz katalogu Psy. Kolumny stanu dnia (status, kto…) to stary model — tylko dla testów importu. */
function dogRow(o){
  return [o.id, o.name||'', o.ident||'', o.box||'', o.dif||'easy', o.status||'',
          o.who||'', o.time||'', o.lastWalk||'', o.note||'', o.walks||1,
          o.who1||'', o.time1||'', o.noteUntil||''];
}
/** Wiersz zakładki Spacery. */
function walkRow(o){
  return [o.date, o.dogId||1, o.status||'free', o.who||'', o.time||'', o.who1||'', o.time1||''];
}

/**
 * Domyślnie: 4 sierpnia 2026, 10:00 — w środku dnia, reset o 22:00, więc
 * bieżący dzień rezerwacyjny to 2026-08-04. Stan dnia podajemy wprost (`walks`),
 * a jednorazowy import ze starych kolumn Psy jest wyłączony, chyba że test
 * sprawdza właśnie jego (`legacy: true`).
 */
function build(dogs, opts){
  opts = opts || {};
  const sheets = opts.sheets || [
    { name:'Psy',      rows: [DOG_HEADERS, ...dogs.map(dogRow)] },
    { name:'Historia', rows: [HIST_HEADERS] },
    { name:'Zadania',  rows: [TASK_HEADERS] },
  ];
  if(opts.walks) sheets.push({ name:'Spacery', rows: [WALK_HEADERS, ...opts.walks.map(walkRow)] });
  return makeContext(Object.assign({}, opts, {
    now: opts.now || '2026-08-04T10:00:00+02:00',
    sheets,
    props: Object.assign({ pin: TEST_PIN }, opts.legacy ? {} : { walksImported: '2026-01-01' }, opts.props),
  }));
}

const noteOf   = (env,i) => env.sheets['Psy']._data[i][9];
const untilOf  = (env,i) => env.sheets['Psy']._data[i][13];
const hist     = env => env.sheets['Historia']._data.slice(1).filter(r => r[0]);
const openRows = env => (env.sheets['Spacery'] ? env.sheets['Spacery']._data.slice(1) : []).filter(r => r[0]);
/** Pies w stanie BIEŻĄCEGO dnia rezerwacyjnego. */
const dogNow   = (env, id) => env.api.readDogs_().filter(d => d.id === (id || 1))[0];
const throws   = fn => { try{ fn(); return false; }catch(e){ return true; } };

/* ---------- B1: notatka bez terminu znika, jak dotąd ---------- */
(()=>{
  console.log('B1: notatka bez terminu znika przy czyszczeniu');
  const env = build([{id:1, name:'Borys', note:'Zdjęcia o 12:00'}]);
  env.api.endOfDay();
  check('notatka wyczyszczona', noteOf(env,1)==='', JSON.stringify(noteOf(env,1)));
})();

/* ---------- B2: notatka z terminem w przyszłości przeżywa ---------- */
(()=>{
  console.log('B2: notatka z terminem przeżywa czyszczenie');
  // środa 2026-08-05, notatka do niedzieli 2026-08-09
  const env = build([{id:1, name:'Borys', note:'Spacer zapoznawczy', noteUntil:'2026-08-09'}],
                    {now:'2026-08-05T22:10:00+02:00'});
  env.api.endOfDay();
  check('notatka została', noteOf(env,1)==='Spacer zapoznawczy', JSON.stringify(noteOf(env,1)));
  check('termin został', untilOf(env,1)==='2026-08-09', JSON.stringify(untilOf(env,1)));

  // ...i przeżywa kolejne noce aż do soboty włącznie
  ['2026-08-06','2026-08-07','2026-08-08'].forEach(d=>{
    const e = build([{id:1, name:'Borys', note:'Spacer zapoznawczy', noteUntil:'2026-08-09'}],
                    {now:d+'T22:10:00+02:00'});
    e.api.endOfDay();
    check('żyje po nocy '+d, noteOf(e,1)==='Spacer zapoznawczy');
  });
})();

/* ---------- B3: znika po dniu, na który była wystawiona ---------- */
(()=>{
  console.log('B3: notatka znika dopiero po swoim dniu');
  const env = build([{id:1, name:'Borys', note:'Spacer zapoznawczy', noteUntil:'2026-08-09'}],
                    {now:'2026-08-09T22:10:00+02:00'});   // wieczór niedzieli
  env.api.endOfDay();
  check('po niedzieli wyczyszczona', noteOf(env,1)==='', JSON.stringify(noteOf(env,1)));
  check('termin też wyczyszczony', untilOf(env,1)==='', JSON.stringify(untilOf(env,1)));
})();

/* ---------- B4: termin z przeszłości nie zostaje zapisany ---------- */
(()=>{
  console.log('B4: walidacja terminu przy zapisie psa');
  const env = build([{id:1, name:'Borys'}], {now:'2026-08-05T10:00:00+02:00'});
  const PIN = TEST_PIN;

  env.api.updateDog(1, {name:'Borys', note:'Coś', noteUntil:'2026-08-01', dif:'easy', walks:1}, PIN);
  check('data z przeszłości odrzucona', untilOf(env,1)==='', JSON.stringify(untilOf(env,1)));

  env.api.updateDog(1, {name:'Borys', note:'', noteUntil:'2026-08-20', dif:'easy', walks:1}, PIN);
  check('data bez notatki odrzucona', untilOf(env,1)==='', JSON.stringify(untilOf(env,1)));

  env.api.updateDog(1, {name:'Borys', note:'Spacer', noteUntil:'2026-08-20', dif:'easy', walks:1}, PIN);
  check('poprawna data zapisana', untilOf(env,1)==='2026-08-20', JSON.stringify(untilOf(env,1)));
  check('notatka trafiła do getData',
    env.api.readDogs_()[0].noteUntil==='2026-08-20', JSON.stringify(env.api.readDogs_()[0]));

  check('zły PIN odrzucony', throws(()=>env.api.updateDog(1, {name:'X'}, PIN + 'x')));
})();

/* ---------- B5: dzień trafia do Historii pod SWOJĄ datą ---------- */
(()=>{
  console.log('B5: archiwizacja pod datą dnia, nie zegara — także przy resecie nad ranem');
  // reset wieczorny 22:00: spacer w ciągu dnia, czyszczenie tuż po 22
  const late = build([{id:1, name:'Borys'}], {now:'2026-08-05T10:00:00+02:00'});
  late.api.reserve(1, 'Ala');
  late.api.markWalked(1, '', 2);
  late.setNow('2026-08-05T22:10:00+02:00');
  late.api.endOfDay();
  check('reset o 22:00 -> data dnia spaceru', hist(late).length===1 && hist(late)[0][0]==='2026-08-05',
    JSON.stringify(hist(late)));

  // reset poranny 3:00: spacer wieczorem, czyszczenie nad ranem kolejnego dnia kalendarzowego
  const early = build([{id:1, name:'Borys'}],
                      {now:'2026-08-05T21:00:00+02:00', props:{resetHour:'3'}});
  early.api.reserve(1, 'Ala');
  early.api.markWalked(1, '', 2);
  early.setNow('2026-08-06T03:10:00+02:00');
  early.api.endOfDay();
  check('reset o 3:00 -> data wczorajsza', hist(early).length===1 && hist(early)[0][0]==='2026-08-05',
    JSON.stringify(hist(early)));
  check('ostatni_spacer też wczorajszy', early.sheets['Psy']._data[1][8]==='2026-08-05',
    JSON.stringify(early.sheets['Psy']._data[1][8]));
  check('zamknięty dzień zniknął z zakładki Spacery', openRows(early).length===0,
    JSON.stringify(openRows(early)));
})();

/* ---------- B6: godzina czyszczenia i wyzwalacz ---------- */
(()=>{
  console.log('B6: setResetHour przekłada wyzwalacz');
  const env = build([{id:1, name:'Borys'}]);
  const PIN = TEST_PIN;
  check('domyślnie 22', env.api.resetHour_()===22, String(env.api.resetHour_()));

  env.api.installTriggers();
  check('wyzwalacz na 22', env.triggers.length===1 && env.triggers[0]._hour===22,
    JSON.stringify(env.triggers.map(t=>t._hour)));

  env.api.setResetHour(6, PIN);
  check('godzina zapisana', env.api.resetHour_()===6, String(env.api.resetHour_()));
  check('dokładnie jeden wyzwalacz', env.triggers.length===1, JSON.stringify(env.triggers.map(t=>t._hour)));
  check('przełożony na 6', env.triggers[0]._hour===6, String(env.triggers[0]._hour));
  check('getData niesie godzinę', env.api.getData().resetHour===6);

  [-1, 24, 'abc', 2.5].forEach(bad=>{
    check('odrzucona godzina '+bad, throws(()=>env.api.setResetHour(bad, PIN)));
  });
  check('po odrzuceniach nadal 6', env.api.resetHour_()===6);
  check('bez PIN-u ani rusz', throws(()=>env.api.setResetHour(8, PIN + 'x')) && env.api.resetHour_()===6);
})();

/* ---------- B7: powtórzony markWalked (zaginiona odpowiedź + auto-retry) ---------- */
(()=>{
  console.log('B7: powtórzony markWalked nie psuje psa 2-spacerowego');
  const env = build([{id:1, name:'Borys', walks:2}],
                    {walks:[{date:'2026-08-04', dogId:1, status:'reserved', who:'Ania'}]});
  env.api.markWalked(1, '', 1);                 // pierwszy z dwóch spacerów
  let d = dogNow(env);
  check('1. spacer zapisany', d.who1==='Ania' && d.status==='free', JSON.stringify(d));

  // odpowiedź zginęła po drodze -> klient ponawia DOKŁADNIE to samo wywołanie
  const again = env.api.markWalked(1, '', 1);
  d = dogNow(env);
  check('powtórka nie robi z psa wyprowadzonego', d.status==='free', d.status);
  check('powtórka nie gubi 1. spacerowicza', d.who1==='Ania', d.who1);
  check('powtórka nie wpisuje pustego "kto"', d.who==='', JSON.stringify(d.who));
  check('powtórka oddaje prawdziwy stan', again.dog.status==='free' && again.dog.who1==='Ania',
    JSON.stringify(again.dog));

  // drugi spacer bierze kto inny — i jego odpowiedź też ginie
  env.api.reserve(1, 'Bartek');
  env.api.markWalked(1, '', 2);
  d = dogNow(env);
  check('2. spacer -> wyprowadzony', d.status==='walked' && d.who==='Bartek', JSON.stringify(d));
  env.api.markWalked(1, '', 2);
  d = dogNow(env);
  check('powtórka 2. spaceru nic nie zmienia', d.status==='walked' && d.who==='Bartek', JSON.stringify(d));

  // w Historii mają wylądować dokładnie dwa spacery, oba z osobą
  env.setNow('2026-08-04T22:10:00+02:00');
  env.api.endOfDay();
  check('dwa wpisy w Historii', hist(env).length===2, JSON.stringify(hist(env)));
  check('oba z osobą', hist(env).every(r => String(r[2]) !== ''), JSON.stringify(hist(env)));
})();

/* ---------- B8: pies 1-spacerowy i wywołanie bez slotu ---------- */
(()=>{
  console.log('B8: slot 2 na psie 1-spacerowym + zgodność ze starym klientem');
  const env = build([{id:1, name:'Borys'}],
                    {walks:[{date:'2026-08-04', dogId:1, status:'reserved', who:'Ala'}]});
  env.api.markWalked(1, '', 2);
  const time = dogNow(env).time;
  env.setNow('2026-08-04T10:25:00+02:00');       // ponowienie przychodzi kwadrans później
  env.api.markWalked(1, '', 2);
  const d = dogNow(env);
  check('1-spacerowy: powtórka zachowuje osobę i godzinę',
    d.status==='walked' && d.who==='Ala' && d.time===time, JSON.stringify(d) + ' / ' + time);

  // karta otwarta jeszcze przed tym wdrożeniem wysyła wywołanie bez slotu i bez daty
  const old = build([{id:1, name:'Luna', walks:2}],
                    {walks:[{date:'2026-08-04', dogId:1, status:'reserved', who:'Ania'}]});
  old.api.markWalked(1, '');
  const o = dogNow(old);
  check('bez slotu i daty: 1. spacer jak dotąd', o.who1==='Ania' && o.status==='free', JSON.stringify(o));
})();

/* ---------- B9: PIN mieszka we właściwościach skryptu, nie w kodzie ---------- */
(()=>{
  console.log('B9: PIN z właściwości skryptu');
  const env = build([{id:1, name:'Borys'}]);
  check('dobry PIN przechodzi', env.api.checkPin(TEST_PIN)===true);
  check('zły PIN odrzucony', env.api.checkPin('0000')===false);
  check('pusty PIN odrzucony', env.api.checkPin('')===false);
  check('stare 1234 to już zwykły zły PIN', env.api.checkPin('1234')===false);

  // bez ustawionej właściwości tryb edycji jest po prostu zamknięty
  const bare = makeContext({ sheets: [
    { name:'Psy',      rows:[DOG_HEADERS] },
    { name:'Historia', rows:[HIST_HEADERS] },
    { name:'Zadania',  rows:[TASK_HEADERS] },
  ]});
  check('brak właściwości: pin_() puste', bare.api.pin_()==='');
  check('brak właściwości: checkPin zawsze false',
    bare.api.checkPin('')===false && bare.api.checkPin('1234')===false);
  check('brak właściwości: akcja edycyjna rzuca', throws(()=>bare.api.addDog({name:'X'}, '1234')));
  check('brak właściwości: setup() nie wywala się', !throws(()=>bare.api.setup()));
  check('setup() zakłada zakładkę Spacery', !!bare.sheets['Spacery']);

  // ...i żeby nikt tego nie cofnął przez przypadek: w źródłach nie ma PIN-u
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..');
  const src = ['Config.gs','Utils.gs','Settings.gs','WebApp.gs','Setup.gs']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  check('brak stałej PIN w kodzie', !/const\s+PIN\s*=/.test(src));
  check('żaden plik nie zaszywa PIN-u', !/PIN\s*=\s*['"][0-9]+['"]/.test(src));
})();

/* ---------- B10: Historia oddaje tylko ostatnie dni ---------- */
(()=>{
  console.log('B10: Historia ograniczona do ostatnich dni');
  const DAYS = 20;                       // dwadzieścia dni po dwa spacery
  const rows = [HIST_HEADERS];
  for(let d = 1; d <= DAYS; d++){
    const date = '2026-07-' + String(d).padStart(2,'0');
    rows.push([date, 'Borys', 'Ala', '10:00']);
    rows.push([date, 'Luna',  'Ola', '17:00']);
  }
  const histSheets = h => [
    { name:'Psy',      rows:[DOG_HEADERS] },
    { name:'Historia', rows:h },
    { name:'Zadania',  rows:[TASK_HEADERS] },
  ];

  const env = build([], { sheets: histSheets(rows) });
  const limit = env.conf.HISTORY_DAYS;
  const h = env.api.readHistory_();
  const dni = h.map(e => e.date).filter((d,i,a) => a.indexOf(d) === i);

  check('dokładnie tyle dni, ile limit', dni.length===limit, JSON.stringify(dni));
  check('najnowszy dzień na górze', h[0].date==='2026-07-20', h[0] && h[0].date);
  check('najstarszy pokazany zgadza się z limitem',
    dni[dni.length-1]==='2026-07-'+String(DAYS-limit+1).padStart(2,'0'), JSON.stringify(dni));
  check('dzień sprzed okna odcięty', dni.indexOf('2026-07-01')<0, JSON.stringify(dni));
  check('komplet wpisów z okna', h.length===limit*2, String(h.length));
  check('getHistory niesie limit dla interfejsu', env.api.getHistory().days===limit);
  check('panel liczy KOMPLET z arkusza, nie wycinek',
    env.api.histCount_()===DAYS*2, String(env.api.histCount_()));
  check('diagnostyka pokazuje komplet',
    env.api.getDiagnostics(TEST_PIN).histCount===DAYS*2);

  // dni mniej niż limit — widać wszystko, nic się nie gubi
  const small = build([], { sheets: histSheets([HIST_HEADERS,
    ['2026-07-01','Borys','Ala','10:00'], ['2026-07-02','Luna','Ola','11:00']]) });
  check('mało dni: wszystko widoczne', small.api.readHistory_().length===2,
    JSON.stringify(small.api.readHistory_()));

  const empty = build([], { sheets: histSheets([HIST_HEADERS]) });
  check('pusta historia: pusta lista', empty.api.readHistory_().length===0);
  check('pusta historia: licznik zero', empty.api.histCount_()===0);
})();

/* ---------- B11: włączenie dwóch spacerów dla wszystkich ---------- */
(()=>{
  console.log('B11: setAllWalks(2) dla całej listy');
  const env = build([
    {id:1, name:'Borys'},
    {id:2, name:'Luna'},
    {id:3, name:'Rex'},
    {id:4, name:'Cyra', walks:2},
  ], {walks:[
    {date:'2026-08-04', dogId:2, status:'walked',   who:'Ala', time:'11:00'},          // już wyprowadzony
    {date:'2026-08-04', dogId:3, status:'reserved', who:'Ola'},                        // ktoś go właśnie prowadzi
    {date:'2026-08-04', dogId:4, status:'walked',   who:'Ela', time:'17:00',
                        who1:'Iza', time1:'09:00'},                                    // ma już oba spacery
    {date:'2026-08-06', dogId:1, status:'reserved', who:'Zosia'},                      // rezerwacja na czwartek
  ]});
  env.api.setAllWalks(2, TEST_PIN);
  const dogs = env.api.readDogs_();
  const byId = id => dogs.filter(d => d.id === id)[0];

  check('wszystkie psy po 2 spacery', dogs.every(d => d.walks === 2),
    JSON.stringify(dogs.map(d => d.walks)));
  check('wolny zostaje wolny', byId(1).status==='free' && byId(1).who1==='', JSON.stringify(byId(1)));
  check('wyprowadzony wraca na wolny z pierwszym spacerem',
    byId(2).status==='free' && byId(2).who1==='Ala' && byId(2).time1==='11:00' && byId(2).who==='',
    JSON.stringify(byId(2)));
  check('zarezerwowanego nie ruszamy', byId(3).status==='reserved' && byId(3).who==='Ola',
    JSON.stringify(byId(3)));
  check('psa po obu spacerach nie ruszamy',
    byId(4).status==='walked' && byId(4).who==='Ela' && byId(4).who1==='Iza', JSON.stringify(byId(4)));
  const thu = env.api.getData().walks.filter(w => w.date==='2026-08-06')[0];
  check('rezerwacji na inny dzień nie ruszamy', thu && thu.status==='reserved' && thu.who==='Zosia',
    JSON.stringify(thu));

  // zapis jest ponawiany po zaginionej odpowiedzi — powtórka nie ma prawa nic zmienić
  const before = JSON.stringify(env.api.getData().walks) + JSON.stringify(env.api.readDogs_());
  env.api.setAllWalks(2, TEST_PIN);
  check('powtórka niczego nie rusza',
    JSON.stringify(env.api.getData().walks) + JSON.stringify(env.api.readDogs_()) === before);

  check('bez PIN-u ani rusz', throws(()=>env.api.setAllWalks(2, 'zly-pin')));
  [0, 3, 'abc', null].forEach(bad => {
    check('odrzucona wartość ' + JSON.stringify(bad), throws(()=>env.api.setAllWalks(bad, TEST_PIN)));
  });
})();

/* ---------- B12: powrót do jednego spaceru ---------- */
(()=>{
  console.log('B12: setAllWalks(1) i Historia po powrocie');
  const env = build([
    {id:1, name:'Borys', walks:2},
    {id:2, name:'Luna',  walks:2},
    {id:3, name:'Rex',   walks:2},
  ], {walks:[
    {date:'2026-08-04', dogId:1, status:'free',     who1:'Ala', time1:'08:00'},       // wolny po 1. z dwóch
    {date:'2026-08-04', dogId:2, status:'reserved', who:'Ola', who1:'Iza', time1:'08:30'},
    {date:'2026-08-04', dogId:3, status:'walked',   who:'Ela', time:'17:00', who1:'Zu', time1:'09:00'},
  ]});
  env.api.setAllWalks(1, TEST_PIN);
  const dogs = env.api.readDogs_();
  const byId = id => dogs.filter(d => d.id === id)[0];

  check('wszystkie psy po 1 spacerze', dogs.every(d => d.walks === 1));
  check('po pierwszym z dwóch staje się wyprowadzony',
    byId(1).status==='walked' && byId(1).who==='Ala' && byId(1).time==='08:00' && byId(1).who1==='',
    JSON.stringify(byId(1)));
  check('zarezerwowanego nie ruszamy', byId(2).status==='reserved' && byId(2).who==='Ola' && byId(2).who1==='Iza',
    JSON.stringify(byId(2)));
  check('pies po obu spacerach zachowuje oba', byId(3).who==='Ela' && byId(3).who1==='Zu',
    JSON.stringify(byId(3)));

  // najważniejsze: przełączenie trybu nie może zgubić odbytego spaceru
  env.setNow('2026-08-04T22:10:00+02:00');
  env.api.endOfDay();
  const h = hist(env);
  check('cztery wpisy w Historii', h.length===4, JSON.stringify(h));
  check('spacer Ali zachowany', h.some(r => r[2]==='Ala' && r[3]==='08:00'), JSON.stringify(h));
  check('pierwszy spacer Luny zachowany', h.some(r => r[2]==='Iza'), JSON.stringify(h));
  check('oba spacery Rexa', h.filter(r => r[1]==='Rex').length===2, JSON.stringify(h));
})();

/* ---------- B13: pełny dzień psa 2-spacerowego ---------- */
(()=>{
  console.log('B13: dwa spacery — pełny dzień i archiwizacja');
  const env = build([{id:1, name:'Borys', walks:2}]);
  env.api.reserve(1, 'Ania');
  check('zarezerwowany', dogNow(env).status==='reserved');

  env.api.markWalked(1, '', 1);
  let d = dogNow(env);
  check('po 1. spacerze znów wolny, spacer zapisany',
    d.status==='free' && d.who==='' && d.who1==='Ania', JSON.stringify(d));

  env.api.reserve(1, 'Bartek');
  d = dogNow(env);
  check('druga rezerwacja obok pierwszego spaceru',
    d.status==='reserved' && d.who==='Bartek' && d.who1==='Ania', JSON.stringify(d));

  env.api.markWalked(1, '', 2);
  d = dogNow(env);
  check('po 2. spacerze wyprowadzony', d.status==='walked' && d.who==='Bartek' && d.who1==='Ania',
    JSON.stringify(d));

  env.setNow('2026-08-04T22:10:00+02:00');
  env.api.endOfDay();
  const h = hist(env);
  check('oba spacery w Historii, osobno i z osobami',
    h.length===2 && h[0][2]==='Ania' && h[1][2]==='Bartek', JSON.stringify(h));
  const after = dogNow(env);
  check('nowy dzień: wolny i czysty',
    after.status==='free' && after.who==='' && after.who1==='' && after.time1==='', JSON.stringify(after));
  check('data ostatniego spaceru zapisana', after.lastWalk==='2026-08-04', String(after.lastWalk));
  check('tryb dwóch spacerów przeżywa noc', after.walks===2);
})();

/* ---------- B14: pomyłki w trybie dwóch spacerów ---------- */
(()=>{
  console.log('B14: cofanie przy dwóch spacerach');
  const env = build([{id:1, name:'Borys', walks:2}]);
  env.api.reserve(1, 'Ania');
  env.api.markWalked(1, '', 1);
  env.api.undoFirstWalk(1);
  const d = dogNow(env);
  check('cofnięty 1. spacer znika bez śladu',
    d.who1==='' && d.time1==='' && d.status==='free', JSON.stringify(d));

  // dzień, w którym pies dostał tylko pierwszy spacer
  env.api.reserve(1, 'Ola');
  env.api.markWalked(1, '', 1);
  env.setNow('2026-08-04T22:10:00+02:00');
  env.api.endOfDay();
  const h = hist(env);
  check('sam pierwszy spacer trafia do Historii', h.length===1 && h[0][2]==='Ola', JSON.stringify(h));

  // zwolnienie DRUGIEJ rezerwacji nie może skasować pierwszego spaceru
  const env2 = build([{id:1, name:'Luna', walks:2}]);
  env2.api.reserve(1, 'Ania');
  env2.api.markWalked(1, '', 1);
  env2.api.reserve(1, 'Bartek');
  env2.api.setFree(1);
  const d2 = dogNow(env2);
  check('po zwolnieniu 2. rezerwacji pierwszy spacer żyje',
    d2.status==='free' && d2.who==='' && d2.who1==='Ania', JSON.stringify(d2));
})();

/* ---------- B15: oznaczenie środowiska ---------- */
(()=>{
  console.log('B15: env z właściwości skryptu');
  const plain = build([{id:1, name:'Borys'}]);
  check('bez właściwości: env puste', plain.api.env_()==='', JSON.stringify(plain.api.env_()));
  check('bez właściwości: getData mówi, że to nie prod', plain.api.getData().env !== 'prod',
    JSON.stringify(plain.api.getData().env));

  const prod = build([{id:1, name:'Borys'}], {props:{env:'prod'}});
  check('prod: env=prod', prod.api.getData().env==='prod');

  const test = build([{id:1, name:'Borys'}], {props:{env:'test'}});
  check('test: env=test', test.api.getData().env==='test');

  check('diagnostyka nazywa brak oznaczenia',
    /traktowane jak test/.test(plain.api.getDiagnostics(TEST_PIN).env),
    plain.api.getDiagnostics(TEST_PIN).env);
  check('diagnostyka na produkcji', prod.api.getDiagnostics(TEST_PIN).env==='prod');
})();

/* ---------- B16: dzień rezerwacyjny liczony od godziny resetu ---------- */
(()=>{
  console.log('B16: dzień rezerwacyjny — granicą jest reset, nie północ');
  const at = (iso, hour) => {
    const e = build([], {now: iso, props: hour == null ? {} : {resetHour: String(hour)}});
    return e.api.businessDate_();
  };
  // reset wieczorny — dokładnie reguła ze zgłoszenia
  check('20:00, o 19:59 -> dziś',  at('2026-09-24T19:59:00+02:00', 20)==='2026-09-24');
  check('20:00, o 20:00 -> jutro', at('2026-09-24T20:00:00+02:00', 20)==='2026-09-25');
  check('20:00, o 23:59 -> jutro', at('2026-09-24T23:59:00+02:00', 20)==='2026-09-25');
  check('20:00, po północy -> nadal ten sam dzień', at('2026-09-25T00:30:00+02:00', 20)==='2026-09-25');
  check('domyślne 22:00, o 21:59 -> dziś', at('2026-09-24T21:59:00+02:00')==='2026-09-24');
  // reset poranny — tu reguła „po resecie jutro" byłaby błędna
  check('6:00, o 5:59 -> wczoraj', at('2026-09-24T05:59:00+02:00', 6)==='2026-09-23');
  check('6:00, o 10:00 -> dziś, nie jutro', at('2026-09-24T10:00:00+02:00', 6)==='2026-09-24');
  check('północ, o 0:00 -> dziś', at('2026-09-24T00:00:00+02:00', 0)==='2026-09-24');

  const env = build([]);
  const add = env.api.addDays_;
  check('addDays_: przełom roku', add('2026-12-31', 1)==='2027-01-01');
  check('addDays_: wstecz przez koniec lutego', add('2026-03-01', -1)==='2026-02-28');
  check('addDays_: rok przestępny', add('2028-02-28', 1)==='2028-02-29');
  check('addDays_: przez zmianę czasu', add('2026-03-28', 2)==='2026-03-30' && add('2026-10-24', 2)==='2026-10-26');
})();

/* ---------- B17: rezerwacje na konkretne dni ---------- */
(()=>{
  console.log('B17: rezerwacje z wyprzedzeniem i granice dni');
  const env = build([{id:1, name:'Borys'}, {id:2, name:'Luna'}]);   // bieżący dzień: 2026-08-04

  const r = env.api.reserve(1, 'Zosia', '2026-08-07');
  check('rezerwacja na piątek przechodzi', r.dog.status==='reserved' && r.dog.who==='Zosia', JSON.stringify(r.dog));
  check('...i odpowiedź mówi, którego dnia dotyczy', r.dog.date==='2026-08-07');
  check('bieżący dzień nietknięty', dogNow(env, 1).status==='free', JSON.stringify(dogNow(env, 1)));
  const fri = env.api.getData().walks.filter(w => w.date==='2026-08-07');
  check('getData niesie rezerwację na piątek', fri.length===1 && fri[0].dogId===1 && fri[0].who==='Zosia',
    JSON.stringify(fri));

  env.api.reserve(1, 'Ala');                          // bez daty = bieżący dzień (stare karty)
  check('ten sam pies dziś — niezależnie od piątku',
    dogNow(env, 1).status==='reserved' && dogNow(env, 1).who==='Ala');
  const clash = env.api.reserve(1, 'Kasia', '2026-08-07');
  check('drugi chętny na piątek przegrywa, jak dziś', clash.dog.who==='Zosia', JSON.stringify(clash.dog));

  check('miniony dzień: rezerwacja odrzucona', throws(()=>env.api.reserve(2, 'Ala', '2026-08-03')));
  check('miniony dzień: zwolnienie odrzucone', throws(()=>env.api.setFree(1, '2026-08-03')));
  check('przyszły dzień: nie da się odhaczyć spaceru', throws(()=>env.api.markWalked(1, '', 2, '2026-08-07')));
  check('przyszły dzień: nie da się cofać spaceru', throws(()=>env.api.undoFirstWalk(1, '2026-08-07')));
  check('śmieci zamiast daty odrzucone', throws(()=>env.api.reserve(2, 'Ala', 'jutro')));

  env.api.setFree(1, '2026-08-07');
  check('rezerwację na przyszłość można zwolnić',
    !env.api.getData().walks.some(w => w.date==='2026-08-07'), JSON.stringify(env.api.getData().walks));
})();

/* ---------- B18: przejście przez godzinę resetu ---------- */
(()=>{
  console.log('B18: o godzinie resetu lista od razu pracuje na nowym dniu');
  const env = build([{id:1, name:'Borys'}, {id:2, name:'Luna'}],
                    {now:'2026-08-04T21:55:00+02:00'});
  env.api.reserve(1, 'Ala');
  env.api.markWalked(1, '', 2);
  env.api.reserve(2, 'Ola', '2026-08-05');               // na jutro, z wyprzedzeniem
  check('przed 22:00 bieżący dzień to dziś', env.api.getData().businessDate==='2026-08-04');

  env.setNow('2026-08-04T22:00:00+02:00');               // wyzwalacz jeszcze nie ruszył
  const g = env.api.getData();
  check('o 22:00 bieżący dzień to już jutro', g.businessDate==='2026-08-05', g.businessDate);
  check('Borys na nowym dniu wolny', dogNow(env, 1).status==='free', JSON.stringify(dogNow(env, 1)));
  check('jutrzejsza rezerwacja Luny od razu widoczna',
    dogNow(env, 2).status==='reserved' && dogNow(env, 2).who==='Ola', JSON.stringify(dogNow(env, 2)));
  check('wczorajszy dzień zamknięty dla zmian', throws(()=>env.api.setFree(1, '2026-08-04')));

  env.api.endOfDay();
  const h = hist(env);
  check('czyszczenie domyka dzień: spacer w Historii pod 08-04',
    h.length===1 && h[0][0]==='2026-08-04' && h[0][2]==='Ala', JSON.stringify(h));
  check('...a rezerwacja na nowy dzień zostaje', dogNow(env, 2).status==='reserved');
})();

/* ---------- B19: czyszczenie domyka zaległe dni i nie rusza bieżącego ---------- */
(()=>{
  console.log('B19: zaległe dni domknięte po kolei, bieżący nietknięty');
  const env = build([{id:1, name:'Borys'}, {id:2, name:'Luna'}], {walks:[
    {date:'2026-08-02', dogId:1, status:'walked',   who:'Ala', time:'10:00'},
    {date:'2026-08-01', dogId:2, status:'walked',   who:'Ola', time:'11:00'},
    {date:'2026-08-03', dogId:2, status:'reserved', who:'Iza'},                // nic z tego nie wyszło
    {date:'2026-08-04', dogId:1, status:'walked',   who:'Ela', time:'09:00'},  // bieżący dzień
    {date:'2026-08-09', dogId:2, status:'reserved', who:'Zu'},                 // przyszłość
  ]});
  env.api.endOfDay();                                    // ręcznie, w środku dnia
  const h = hist(env);
  check('dwa zamknięte spacery w Historii', h.length===2, JSON.stringify(h));
  check('w kolejności dat', h[0][0]==='2026-08-01' && h[1][0]==='2026-08-02', JSON.stringify(h));
  check('bieżący dzień nietknięty', dogNow(env, 1).status==='walked' && dogNow(env, 1).who==='Ela');
  check('przyszła rezerwacja nietknięta',
    env.api.getData().walks.some(w => w.date==='2026-08-09' && w.who==='Zu'));
  check('zostały tylko dni otwarte', openRows(env).length===2, JSON.stringify(openRows(env)));
  check('ostatni_spacer = ostatni zamknięty dzień',
    env.sheets['Psy']._data[1][8]==='2026-08-02' && env.sheets['Psy']._data[2][8]==='2026-08-01');

  env.api.endOfDay();
  check('drugie uruchomienie niczego nie dubluje', hist(env).length===2, JSON.stringify(hist(env)));
})();

/* ---------- B20: podgląd minionych dni ---------- */
(()=>{
  console.log('B20: getHistoryDays — Historia + dni jeszcze niezamknięte');
  const env = build([{id:1, name:'Borys'}], {
    sheets: [
      { name:'Psy',      rows:[DOG_HEADERS, dogRow({id:1, name:'Borys'})] },
      { name:'Historia', rows:[HIST_HEADERS,
        ['2026-07-30','Luna','Ola','10:00'],
        ['2026-08-01','Borys','Ala','09:00'],
        ['2026-08-02','Borys','Ela','18:00']] },
      { name:'Zadania',  rows:[TASK_HEADERS] },
      { name:'Spacery',  rows:[WALK_HEADERS,
        walkRow({date:'2026-08-03', dogId:1, status:'walked', who:'Iza', time:'12:00'}),     // niezamknięty
        walkRow({date:'2026-08-04', dogId:1, status:'reserved', who:'Zu'})] },                // bieżący
    ],
  });
  const got = env.api.getHistoryDays('2026-08-01', '2026-08-03').history;
  const days = got.map(e => e.date + ':' + e.who).sort();
  check('dni z zakresu, z Historii i niezamknięte',
    JSON.stringify(days)===JSON.stringify(['2026-08-01:Ala','2026-08-02:Ela','2026-08-03:Iza']),
    JSON.stringify(days));
  check('niezamknięty dzień dostaje imię psa z katalogu', got.some(e => e.who==='Iza' && e.name==='Borys'));

  const clamp = env.api.getHistoryDays('2026-08-02', '2026-08-20').history;
  check('zakres przycięty do dni zamkniętych — bez bieżącego i przyszłych',
    !clamp.some(e => e.date >= '2026-08-04'), JSON.stringify(clamp));
  check('śmieci zamiast dat odrzucone', throws(()=>env.api.getHistoryDays('wczoraj', '2026-08-03')));
})();

/* ---------- B21: jednorazowe przeniesienie stanu ze starego modelu ---------- */
(()=>{
  console.log('B21: stan dnia ze starych kolumn Psy przenosi się sam — i tylko raz');
  const env = build([
    {id:1, name:'Borys', status:'reserved', who:'Ala'},
    {id:2, name:'Luna',  status:'walked',   who:'Ola', time:'11:00'},
    {id:3, name:'Rex',   status:'free', walks:2, who1:'Iza', time1:'08:00'},
    {id:4, name:'Cyra',  status:'free'},
  ], {legacy: true});

  check('przed pierwszym dostępem nie ma zakładki Spacery', !env.sheets['Spacery']);
  const g = env.api.getData();
  const byId = id => g.dogs.filter(d => d.id === id)[0];
  check('zakładka założona przy pierwszym dostępie', !!env.sheets['Spacery']);
  check('rezerwacja przeniesiona', byId(1).status==='reserved' && byId(1).who==='Ala', JSON.stringify(byId(1)));
  check('spacer przeniesiony z godziną', byId(2).status==='walked' && byId(2).time==='11:00', JSON.stringify(byId(2)));
  check('pierwszy z dwóch przeniesiony', byId(3).who1==='Iza' && byId(3).status==='free', JSON.stringify(byId(3)));
  check('pod bieżący dzień rezerwacyjny', openRows(env).every(r => r[0]==='2026-08-04'), JSON.stringify(openRows(env)));
  check('wolnego psa nie przenosimy — brak wiersza to „wolny"', openRows(env).length===3);
  check('stare kolumny zostają na wypadek cofnięcia wdrożenia', env.sheets['Psy']._data[1][5]==='reserved');
  check('zapamiętane, że przeniesienie się odbyło', env.props.walksImported==='2026-08-04');

  // ktoś kiedyś skasuje zakładkę — stary stan z Psy NIE może wrócić jako dzisiejszy
  delete env.sheets['Spacery'];
  env.setNow('2026-08-11T10:00:00+02:00');
  const later = env.api.getData();
  check('ponowne założenie zakładki bez wskrzeszania starego stanu',
    !!env.sheets['Spacery'] && later.dogs.every(d => d.status==='free'), JSON.stringify(later.dogs.map(d=>d.status)));
})();

/* ---------- B22: usunięcie psa ---------- */
(()=>{
  console.log('B22: usunięty pies zostawia w Historii dzisiejszy spacer pod imieniem');
  const env = build([{id:1, name:'Borys'}, {id:2, name:'Luna'}], {walks:[
    {date:'2026-08-04', dogId:1, status:'walked',   who:'Ala', time:'09:00'},
    {date:'2026-08-06', dogId:1, status:'reserved', who:'Ola'},
    {date:'2026-08-04', dogId:2, status:'reserved', who:'Iza'},
  ]});
  env.api.removeDog(1, TEST_PIN);
  const h = hist(env);
  check('dzisiejszy spacer w Historii pod imieniem', h.length===1 && h[0][1]==='Borys' && h[0][2]==='Ala',
    JSON.stringify(h));
  check('przyszła rezerwacja usuniętego psa przepada', !openRows(env).some(r => r[1]===1), JSON.stringify(openRows(env)));
  check('innych psów nie ruszamy', dogNow(env, 2).status==='reserved' && dogNow(env, 2).who==='Iza');
  check('pies zniknął z katalogu', !env.api.readDogs_().some(d => d.id===1));
})();

/* ---------- B23: zagnieżdżona blokada ---------- */
(()=>{
  console.log('B23: blokada bezpieczna na zagnieżdżenie');
  const env = build([{id:1, name:'Borys'}]);
  check('withLock_ w withLock_ nie wiesza i zwraca wynik', env.api.withLock_(() => env.api.withLock_(() => 7))===7);
  // akcja edycyjna jako PIERWSZA po wdrożeniu: getData spod blokady zakłada brakującą zakładkę
  check('addDog na arkuszu bez zakładki Spacery', !throws(()=>env.api.addDog({name:'Rex'}, TEST_PIN))
    && !!env.sheets['Spacery']);
})();

/* ---------- B24: zadania na konkretny dzień ---------- */
(()=>{
  console.log('B24: addTask z datą');
  const env = build([{id:1, name:'Borys'}]);                  // bieżący dzień: 2026-08-04
  const tasks = () => env.api.readTasks_();

  env.api.addTask('Umyć miski', TEST_PIN);                     // bez daty — jak stare karty
  check('bez daty: bieżący dzień', tasks()[0].date==='2026-08-04', JSON.stringify(tasks()));
  env.api.addTask('Kąpiel Borysa', TEST_PIN, '2026-08-08');
  check('z datą: zaplanowane na ten dzień', tasks()[1].date==='2026-08-08', JSON.stringify(tasks()));
  check('dzień, który minął — odrzucony', throws(()=>env.api.addTask('X', TEST_PIN, '2026-08-03')));
  check('śmieci zamiast daty — odrzucone', throws(()=>env.api.addTask('X', TEST_PIN, 'sobota')));
  check('bez PIN-u ani rusz', throws(()=>env.api.addTask('X', 'zly', '2026-08-08')));
  check('nic z odrzuconych nie trafiło do arkusza', tasks().length===2, JSON.stringify(tasks()));

  // po resecie domyślny dzień zadania to już jutro — dodane o 22:30 nie może być od razu „od wczoraj"
  env.setNow('2026-08-04T22:30:00+02:00');
  check('po resecie: zadanie bez daty przechodzi', !throws(()=>env.api.addTask('Wieczorne', TEST_PIN)));
  check('po resecie: domyślnie dzień, na którym pracuje lista', tasks()[2] && tasks()[2].date==='2026-08-05',
    JSON.stringify(tasks()[2]));
})();

/* ---------- B25: zadanie z przyszłości odhacza się w jego dniu ---------- */
(()=>{
  console.log('B25: setTaskDone pilnuje dnia zadania');
  const env = build([{id:1, name:'Borys'}]);
  env.api.addTask('Dziś', TEST_PIN);
  env.api.addTask('Sobota', TEST_PIN, '2026-08-08');
  const [today, sat] = env.api.readTasks_();
  check('bieżące da się odhaczyć', !throws(()=>env.api.setTaskDone(today.id, true))
    && env.api.readTasks_()[0].done===true);
  check('zaplanowanego na sobotę — nie (np. ze starej karty)', throws(()=>env.api.setTaskDone(sat.id, true))
    && env.api.readTasks_()[1].done===false);
  env.setNow('2026-08-08T10:00:00+02:00');
  check('w sobotę już tak', !throws(()=>env.api.setTaskDone(sat.id, true)) && env.api.readTasks_()[1].done===true);
})();

/* ---------- B26: notatka „nigdy" ---------- */
(()=>{
  console.log('B26: notatka, która nie znika');
  const env = build([{id:1, name:'Borys'}]);
  env.api.updateDog(1, {name:'Borys', note:'Nie wypuszczać bez kagańca', noteUntil:'nigdy', dif:'easy', walks:1}, TEST_PIN);
  check('zapisana z terminem „nigdy"', untilOf(env,1)==='nigdy', JSON.stringify(untilOf(env,1)));
  check('getData oddaje ją interfejsowi', env.api.getData().dogs[0].noteUntil==='nigdy');

  ['2026-08-04T22:10:00+02:00', '2026-09-30T22:10:00+02:00', '2027-06-01T22:10:00+02:00'].forEach(iso=>{
    env.setNow(iso);
    env.api.endOfDay();
    check('przeżywa czyszczenie ' + iso.slice(0,10), noteOf(env,1)==='Nie wypuszczać bez kagańca');
  });

  env.api.updateDog(1, {name:'Borys', note:'', noteUntil:'nigdy', dif:'easy', walks:1}, TEST_PIN);
  check('„nigdy" bez notatki nic nie znaczy — czyszczone', untilOf(env,1)==='', JSON.stringify(untilOf(env,1)));
})();

/* ---------- B27: stan wpisany w stronę ---------- */
(()=>{
  console.log('B27: bootJson_ — stan startowy bez drugiego przelotu');
  const env = build([{id:1, name:'</script><b>Borys'}], {walks:[{date:'2026-08-04', dogId:1, status:'reserved', who:'Ala'}]});
  const raw = env.api.bootJson_();
  check('ani jednego „<" — nic nie zamknie znacznika <script>', raw.indexOf('<')<0, raw.slice(0,120));
  let parsed = null;
  try{ parsed = JSON.parse(raw); }catch(e){}
  check('poprawny JSON z tym samym stanem co getData',
    parsed && parsed.dogs[0].name==='</script><b>Borys' && parsed.dogs[0].who==='Ala' && parsed.businessDate==='2026-08-04',
    raw.slice(0,200));

  const broken = makeContext({ sheets: [{ name:'Historia', rows:[HIST_HEADERS] }] });   // brak zakładki Psy
  check('błąd odczytu nie blokuje strony — null', broken.api.bootJson_()==='null');
})();

/* ---------- B28: grupy na dzień ---------- */
(()=>{
  console.log('B28: setGroup — skład, numeracja, przenoszenie, rozwiązywanie');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna'},{id:3,name:'Rex'},{id:4,name:'Cyra'},{id:5,name:'Fado'}],
    {walks:[{date:D, dogId:3, status:'reserved', who:'Ola'}, {date:D, dogId:5, status:'walked', who:'Iza', time:'9:00'}]});
  const dog = id => env.api.readDogs_().filter(d => d.id === id)[0];
  const g = id => dog(id).group;

  const r1 = env.api.setGroup(D, [1,2,3], 0);
  check('nowa grupa dostaje numer 1', r1.group===1 && g(1)===1 && g(2)===1 && g(3)===1, JSON.stringify(r1));
  check('wolny pies w grupie ma swój wiersz — plan to już stan',
    env.api.getData().walks.some(w => w.dogId===1 && w.group===1 && w.status==='free'));
  check('rezerwacja nietknięta', dog(3).status==='reserved' && dog(3).who==='Ola', JSON.stringify(dog(3)));
  check('odpowiedź niesie wiersze dnia', r1.walks.filter(w => w.group===1).length===3, JSON.stringify(r1.walks));

  const r2 = env.api.setGroup(D, [4,1], 0);            // Borys przechodzi do nowej grupy
  check('kolejna grupa: numer 2', r2.group===2 && g(4)===2 && g(1)===2);
  check('stara grupa bez Borysa, dalej dwa psy', g(2)===1 && g(3)===1);

  env.api.setGroup(D, [2,4], 0);                       // Luna i Cyra razem — obie stare grupy zostają z jednym psem
  check('nowa grupa 3', g(2)===3 && g(4)===3);
  check('grupa z jednym psem przestaje być grupą', g(1)===0 && g(3)===0, JSON.stringify([g(1), g(3)]));

  const r4 = env.api.setGroup(D, [5,3], 0);
  check('pies po spacerze nie dołącza — za mało psów, nic nie powstaje', r4.group===0 && g(5)===0 && g(3)===0);

  env.api.setGroup(D, [2,4,1], 3);
  check('zmiana składu dokłada psa', g(1)===3);
  env.api.setGroup(D, [2,4], 3);
  check('zmiana składu zdejmuje psa', g(1)===0 && g(2)===3 && g(4)===3);
  env.api.setGroup(D, [], 3);
  check('rozwiązanie grupy', g(2)===0 && g(4)===0);

  const fut = env.api.setGroup('2026-08-07', [1,2], 0);
  check('przyszły dzień ma własne grupy', fut.group===1 && g(1)===0);
  check('miniony dzień odrzucony', throws(()=>env.api.setGroup('2026-08-03', [1,2], 0)));

  env.api.setGroup(D, [1,2], 0);
  const gid = g(1);
  env.api.reserve(1, 'Ala');
  env.api.setFree(1);
  env.api.reserve(2, 'Ola');
  env.api.markWalked(2, '', 2);
  check('grupa przeżywa rezerwację, zwolnienie i spacer', g(1)===gid && g(2)===gid && dog(2).status==='walked');

  env.setNow('2026-08-04T22:10:00+02:00');
  env.api.endOfDay();
  check('po zamknięciu dnia spacer w Historii', hist(env).some(r => r[1]==='Luna' && r[2]==='Ola'), JSON.stringify(hist(env)));
  check('...a grupy zamkniętego dnia znikają razem z nim', !openRows(env).some(r => r[0]===D), JSON.stringify(openRows(env)));
})();

/* ---------- B29: zakładka Spacery sprzed grup ---------- */
(()=>{
  console.log('B29: stara zakładka Spacery dostaje kolumnę „grupa" sama');
  const OLD = ['data','pies_id','status','kto','godzina','kto1','godzina1'];
  const env = build([], { sheets: [
    { name:'Psy',      rows:[DOG_HEADERS, dogRow({id:1,name:'Borys'}), dogRow({id:2,name:'Luna'})] },
    { name:'Historia', rows:[HIST_HEADERS] },
    { name:'Zadania',  rows:[TASK_HEADERS] },
    { name:'Spacery',  rows:[OLD, ['2026-08-04', 1, 'reserved', 'Ala', '', '', '']] },
  ]});
  check('przed: siedem kolumn', env.sheets['Spacery'].getMaxColumns()===7);
  const d = env.api.getData();
  check('dane nietknięte', d.dogs[0].status==='reserved' && d.dogs[0].who==='Ala', JSON.stringify(d.dogs[0]));
  check('kolumna dołożona z nagłówkiem', env.sheets['Spacery']._data[0][7]==='grupa', JSON.stringify(env.sheets['Spacery']._data[0]));
  check('grupowanie działa od razu', env.api.setGroup('2026-08-04', [1,2], 0).group===1);
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

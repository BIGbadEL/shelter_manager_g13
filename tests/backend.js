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
/** Pies w stanie BIEŻĄCEGO dnia rezerwacyjnego (stary kształt: status/kto/kto1 — tak widzą go stare karty). */
const dogNow   = (env, id) => env.api.readDogs_().filter(d => d.id === (id || 1))[0];
/** Spacery dnia z getData (tylko te ze stanem) i jeden spacer psa — brak wiersza = wolny bez grupy. */
const slotsOn  = (env, date) => env.api.getData().slots.filter(s => !date || s.date === date);
const slotAt   = (env, id, date, n) => slotsOn(env, date).filter(s => s.dogId === id && s.slot === (n || 1))[0]
                                       || {status:'free', who:'', group:0, slot:n || 1};
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
  check('data z przeszłości = do końca bieżącego dnia', untilOf(env,1)==='2026-08-05', JSON.stringify(untilOf(env,1)));

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
  const thu = slotsOn(env, '2026-08-06')[0];
  check('rezerwacji na inny dzień nie ruszamy', thu && thu.status==='reserved' && thu.who==='Zosia',
    JSON.stringify(thu));
  check('spacer 2/2 wolny — do wzięcia, bez przestawiania czegokolwiek w arkuszu',
    slotAt(env, 2, '2026-08-04', 1).status==='walked' && slotAt(env, 2, '2026-08-04', 2).status==='free');

  // zapis jest ponawiany po zaginionej odpowiedzi — powtórka nie ma prawa nic zmienić
  const before = JSON.stringify(slotsOn(env)) + JSON.stringify(env.api.readDogs_());
  env.api.setAllWalks(2, TEST_PIN);
  check('powtórka niczego nie rusza',
    JSON.stringify(slotsOn(env)) + JSON.stringify(env.api.readDogs_()) === before);

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
  const fri = slotsOn(env, '2026-08-07');
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
    !slotsOn(env, '2026-08-07').length, JSON.stringify(slotsOn(env)));
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
    slotsOn(env, '2026-08-09').some(s => s.who==='Zu'));
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
  // wewnętrzne wywołanie bezpośrednio — env.api udaje NOWE wykonanie, a tu chodzi o to samo
  check('withLock_ w withLock_ nie wiesza i zwraca wynik',
    env.api.withLock_(() => env.ctx.__api.withLock_(() => 7))===7);
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
  check('wolny spacer w grupie ma swój wiersz — plan to już stan',
    slotsOn(env, D).some(s => s.dogId===1 && s.slot===1 && s.group===1 && s.status==='free'));
  check('rezerwacja nietknięta', dog(3).status==='reserved' && dog(3).who==='Ola', JSON.stringify(dog(3)));
  check('odpowiedź niesie spacery dnia', r1.slots.filter(s => s.group===1).length===3, JSON.stringify(r1.slots));

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
  console.log('B29: zakładka Spacery sprzed grup przepisuje się sama na układ ze spacerami');
  const OLD = ['data','pies_id','status','kto','godzina','kto1','godzina1'];
  const env = build([], { sheets: [
    { name:'Psy',      rows:[DOG_HEADERS, dogRow({id:1,name:'Borys'}), dogRow({id:2,name:'Luna'})] },
    { name:'Historia', rows:[HIST_HEADERS] },
    { name:'Zadania',  rows:[TASK_HEADERS] },
    { name:'Spacery',  rows:[OLD, ['2026-08-04', 1, 'reserved', 'Ala', '', '', '']] },
  ]});
  check('przed: siedem kolumn, bez numeru spaceru', env.sheets['Spacery'].getMaxColumns()===7);
  const d = env.api.getData();
  check('dane nietknięte', d.dogs[0].status==='reserved' && d.dogs[0].who==='Ala', JSON.stringify(d.dogs[0]));
  check('nowy układ z nagłówkami', JSON.stringify(env.sheets['Spacery']._data[0].slice(0, 7))===JSON.stringify(env.conf.WALK_HEADERS),
    JSON.stringify(env.sheets['Spacery']._data[0]));
  check('grupowanie działa od razu', env.api.setGroup('2026-08-04', [1,2], 0).group===1);
})();

/** Spacer psa danego dnia (domyślnie pierwszy) z getData — brak wiersza = wolny bez grupy. */
const walkIn = (env, id, date, n) => slotAt(env, id, date, n);

/* ---------- B30: „Zwolnij" zostawia w grupie, „Cofnij" wyprowadza ---------- */
(()=>{
  console.log('B30: setFree — zwolniony zostaje w grupie, cofnięty spacer wyprowadza z grupy');
  const D = '2026-08-04', T = '2026-08-05';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna'},{id:3,name:'Rex'},{id:4,name:'Cyra'},{id:5,name:'Fado'}]);
  const walk = (id, date) => walkIn(env, id, date || D);
  const g = (id, date) => walk(id, date).group || 0;

  env.api.setGroup(D, [1,2,3], 0);                     // grupa 1: Borys, Luna, Rex
  env.api.setGroup(T, [1,2], 0);                       // jutro też grupa 1 — numery są na dzień
  env.api.reserve(1, 'Ala'); env.api.reserve(2, 'Ola'); env.api.reserve(3, 'Ewa');
  const r = env.api.setFree(2);                        // Ola rezygnuje z Luny
  check('zwolniona Luna zostaje w grupie, wolna', g(2)===1 && walk(2).status==='free' && walk(2).who==='',
    JSON.stringify(walk(2)));
  check('odpowiedź mówi to samo', r.dog.group===1 && r.dog.status==='free', JSON.stringify(r.dog));

  env.api.reserve(2, 'Iza');
  [1,2,3].forEach(id => env.api.markWalked(id, '', 2));
  const r2 = env.api.setFree(2);                       // „Cofnij" u Luny
  check('cofnięta Luna wychodzi z grupy', g(2)===0 && walk(2).status==='free' && r2.dog.group===0,
    JSON.stringify(walk(2)));
  check('Borys i Rex dalej razem, wyprowadzeni', g(1)===1 && g(3)===1
    && walk(1).status==='walked' && walk(3).status==='walked');

  const before = JSON.stringify(openRows(env));
  env.api.setFree(2);                                  // powtórka po zaginionej odpowiedzi (RETRIABLE)
  check('powtórka niczego nie rusza', JSON.stringify(openRows(env))===before);

  env.api.setFree(1);                                  // „Cofnij" u Borysa — zostaje sam Rex
  check('grupa z jednym psem przestaje być grupą', g(1)===0 && g(3)===0, JSON.stringify([g(1), g(3)]));
  check('Rex dalej wyprowadzony', walk(3).status==='walked');
  check('jutrzejsza grupa o tym samym numerze nietknięta', g(1, T)===1 && g(2, T)===1, JSON.stringify([g(1,T), g(2,T)]));

  env.api.setGroup(D, [4,5], 0);                       // zaplanowana grupa wolnych psów
  const gid = g(4);
  env.api.setFree(4);                                  // wolnego nie ma skąd zwalniać
  check('wolny pies w zaplanowanej grupie zostaje', gid>0 && g(4)===gid && g(5)===gid, JSON.stringify([gid, g(4), g(5)]));

  env.api.setGroup(T, [3,4], 0);
  env.api.reserve(3, 'Ewa', T);
  env.api.setFree(3, T);                               // zwolnienie rezerwacji z wyprzedzeniem
  check('zwolnienie na przyszły dzień też zostawia w grupie', g(3, T)>0 && g(3, T)===g(4, T),
    JSON.stringify([g(3,T), g(4,T)]));
})();

/* ---------- B31: grupa to jeden spacer — spacery psa dwuspacerowego grupują się osobno ---------- */
(()=>{
  console.log('B31: spacery 1/2 i 2/2 to osobne spacery — każdy z własną rezerwacją i grupą');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna',walks:2},{id:3,name:'Rex'},
                     {id:4,name:'Cyra',walks:2},{id:5,name:'Fado'},{id:6,name:'Kora',walks:2}]);
  const at = (id, n) => walkIn(env, id, D, n);

  env.api.setGroup(D, ['1:1','2:1','3:1'], 0);         // poranna grupa: Borys, Luna 1/2, Rex
  env.api.reserve(1, 'Ala', D, 1); env.api.reserve(2, 'Ola', D, 1); env.api.reserve(3, 'Ewa', D, 1);
  check('popołudnie Luny da się zarezerwować, zanim rano ktoś z nią wyszedł',
    env.api.reserve(2, 'Jan', D, 2).slot.status==='reserved' && at(2,2).who==='Jan' && at(2,1).who==='Ola');
  env.api.markWalked(1, '', 1); const r = env.api.markWalked(2, '', 1, D); env.api.markWalked(3, '', 1);
  check('Luna 1/2 wyprowadzona i dalej w porannej grupie — ten spacer odbyli razem',
    at(2,1).status==='walked' && at(2,1).group===1 && r.slot.slot===1, JSON.stringify(at(2,1)));
  check('Luna 2/2 nietknięta: zarezerwowana, bez grupy', at(2,2).status==='reserved' && at(2,2).group===0);
  check('odpowiedź dla starej karty: pierwszy z dwóch odbyty (kto1), bieżący to drugi',
    r.dog.who1==='Ola' && r.dog.status==='reserved' && r.dog.who==='Jan', JSON.stringify(r.dog));

  const before = JSON.stringify(openRows(env));
  env.api.markWalked(2, '', 1, D);                     // powtórka po zaginionej odpowiedzi
  check('powtórka niczego nie rusza', JSON.stringify(openRows(env))===before);

  // zgłoszenie z terenu: drugi spacer Luny z Fado nie może wyglądać, jakby szli z nimi Borys i Rex
  const r2 = env.api.setGroup(D, ['2:2','5:1'], 0);
  check('drugi spacer to nowa grupa — bez Borysa i Rexa', r2.group===2 && at(2,2).group===2 && at(5,1).group===2);
  check('poranna grupa nietknięta — Luna jest w dwóch grupach, każdym spacerem w jednej',
    at(1,1).group===1 && at(2,1).group===1 && at(3,1).group===1);

  env.api.setGroup(D, ['4:1','6:1','4:2'], 0);         // Cyra dwa razy w jednej grupie? Nie — jedno wyjście
  check('jeden pies w grupie najwyżej jednym spacerem (ostatni wskazany)',
    at(4,2).group===3 && at(4,1).group===0 && at(6,1).group===3, JSON.stringify([at(4,1), at(4,2), at(6,1)]));
  env.api.setGroup(D, [6, 5], 3, ['4:2','6:1']);       // karta sprzed spacerów: sam numer psa = jego bieżący spacer
  check('sam numer psa = pierwszy nieodbyty spacer', at(6,1).group===3 && at(5,1).group===3 && at(4,2).group===0,
    JSON.stringify([at(4,2), at(5,1), at(6,1)]));
  check('Fado przeniesiony z grupy Luny — tam został sam spacer, więc to już nie grupa', at(2,2).group===0);
  check('nieistniejący spacer odrzucony', throws(()=>env.api.reserve(1, 'Ala', D, 2)));
  // Y dokłada Cyrę 1/2 do grupy 3; Z, który tego nie widział, dokłada Cyrę 2/2 — pies idzie jednym spacerem
  env.api.setGroup(D, ['6:1','5:1','4:1'], 3, ['6:1','5:1']);
  env.api.setGroup(D, ['6:1','5:1','4:2'], 3, ['6:1','5:1']);
  check('drugi spacer tego samego psa wypycha pierwszy z grupy, nawet niewidziany', at(4,2).group===3 && at(4,1).group===0,
    JSON.stringify([at(4,1), at(4,2)]));
})();

/* ---------- B32: przestawienie wszystkich psów a grupy ---------- */
(()=>{
  console.log('B32: setAllWalks — odbyty spacer zostaje w swojej grupie, drugi planuje się osobno');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna'},{id:3,name:'Rex'}]);
  const at = (id, n) => walkIn(env, id, D, n);
  env.api.setGroup(D, [1,2], 0);
  env.api.reserve(1, 'Ala'); env.api.reserve(2, 'Ola');
  env.api.markWalked(1, '', 2); env.api.markWalked(2, '', 2);
  env.api.setAllWalks(2, TEST_PIN);                    // upał: wszystkim drugi spacer
  check('odbyty spacer to teraz 1/2 — w grupie, z którą szedł', at(1,1).status==='walked' && at(1,1).group===1);
  check('2/2 wolny i bez grupy', at(1,2).status==='free' && at(1,2).group===0 && at(2,2).group===0);
  check('stara karta widzi to jak dawniej: kto1 i wolny', dogNow(env, 1).who1==='Ala' && dogNow(env, 1).status==='free');
  const before = JSON.stringify(openRows(env));
  env.api.setAllWalks(2, TEST_PIN);
  check('drugie wywołanie niczego nie rusza', JSON.stringify(openRows(env))===before);

  env.api.setGroup(D, ['1:2','3:2'], 0);               // Borys 2/2 zaplanowany z Rexem 2/2
  env.api.reserve(3, 'Iza', D, 1);
  env.api.setAllWalks(1, TEST_PIN);                    // jednak jeden spacer
  check('wolny 2/2 znika z planu — grupa z Rexem rozwiązana', at(1,2).group===0 && at(3,2).group===0,
    JSON.stringify([at(1,2), at(3,2)]));
  check('odbyty 1/2 Borysa nietknięty', at(1,1).status==='walked' && at(1,1).group===1);
  check('rezerwacja Rexa nietknięta', at(3,1).status==='reserved' && at(3,1).who==='Iza');

  env.api.setAllWalks(2, TEST_PIN);
  env.api.reserve(3, 'Zu', D, 2);                      // popołudnie Rexa zarezerwowane...
  env.api.setAllWalks(1, TEST_PIN);                    // ...a prowadząca wraca do jednego spaceru
  check('cudzej rezerwacji 2/2 nie chowamy — spacer zostaje', at(3,2).status==='reserved' && at(3,2).who==='Zu');
})();

/* ---------- B33: przeniesienie starego stanu dopiero w godzinie czyszczenia ---------- */
(()=>{
  console.log('B33: pierwszy dostęp to wyzwalacz o 20:15 — dzisiejsze spacery idą do Historii');
  // wdrożenie o 15:00, nikt nie otwiera linku; pierwszym dostępem jest wyzwalacz endOfDay
  const env = build([{id:1, name:'Borys', status:'walked', who:'Ania', time:'10:15'},
                     {id:2, name:'Luna', status:'reserved', who:'Ola'}],
                    {legacy:true, now:'2026-09-24T20:15:00+02:00', props:{resetHour:'20'}});
  env.api.endOfDay();
  check('spacer Borysa w Historii pod dniem, który się skończył',
    hist(env).some(r => r[0]==='2026-09-24' && r[1]==='Borys' && r[2]==='Ania'), JSON.stringify(hist(env)));
  check('na jutrzejszej liście Borys wolny', dogNow(env, 1).status==='free', JSON.stringify(dogNow(env, 1)));
  check('...i Luna też — rezerwacja była na dzień, który minął', dogNow(env, 2).status==='free');
  check('w Spacery nic nie zostaje', openRows(env).length===0, JSON.stringify(openRows(env)));

  const early = build([{id:1, name:'Borys', status:'walked', who:'Ania', time:'10:15'}],
                      {legacy:true, now:'2026-09-24T15:00:00+02:00', props:{resetHour:'20'}});
  early.api.getData();                                 // wdrożenie otwiera link od razu
  check('przed godziną czyszczenia stan zostaje na bieżącym dniu', dogNow(early, 1).status==='walked'
    && openRows(early)[0][0]==='2026-09-24', JSON.stringify(openRows(early)));
})();

/* ---------- B34: numer grupy tylko całkowity ---------- */
(()=>{
  console.log('B34: numer grupy 1.5 nie przechodzi ani z przeglądarki, ani z arkusza');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna'},{id:3,name:'Rex'}]);
  check('setGroup z gid 1.5 odrzucony', throws(() => env.api.setGroup(D, [1,2], 1.5)));
  check('...i z ujemnym', throws(() => env.api.setGroup(D, [1,2], -2)));
  env.api.setGroup(D, [1, 2.5, 2], 0);
  check('niecałkowity pies w składzie pominięty', slotsOn(env, D).filter(s => s.group===1).length===2);
  env.sheets['Spacery']._data[1][env.conf.WALK.GROUP - 1] = 2.5;   // ktoś wpisał ręcznie w arkuszu
  const w = slotsOn(env, D).filter(x => x.dogId===env.sheets['Spacery']._data[1][1])[0];
  check('z arkusza 2.5 czytane jako brak grupy (wolny bez grupy = brak wiersza)', !w || w.group===0, JSON.stringify(w));
  check('...i żaden numer niecałkowity nie jedzie do telefonów',
    slotsOn(env).every(x => Number.isInteger(x.group)), JSON.stringify(slotsOn(env)));
  check('posInt_', env.api.posInt_(3)===3 && env.api.posInt_('4')===4 && env.api.posInt_(1.5)===0
    && env.api.posInt_(-1)===0 && env.api.posInt_('x')===0);
})();

/* ---------- B35: notatka „bez terminu" żyje do końca swojego dnia ---------- */
(()=>{
  console.log('B35: notatka dodana po przełomie dnia nie znika przy czyszczeniu tego samego wieczoru');
  const PIN = TEST_PIN;
  const env = build([{id:1, name:'Borys'}], {now:'2026-09-24T20:10:00+02:00', props:{resetHour:'20'}});
  env.api.updateDog(1, {name:'Borys', note:'Zdjęcia o 12:00', noteUntil:'', dif:'easy', walks:1}, PIN);
  check('termin = bieżący dzień rezerwacyjny (jutro)', untilOf(env,1)==='2026-09-25', JSON.stringify(untilOf(env,1)));
  env.setNow('2026-09-24T20:30:00+02:00');
  env.api.endOfDay();
  check('czyszczenie o 20:30 jej nie rusza', noteOf(env,1)==='Zdjęcia o 12:00', JSON.stringify(noteOf(env,1)));
  env.setNow('2026-09-25T10:00:00+02:00');
  env.api.endOfDay(); env.api.endOfDay();              // ręczne uruchomienia w ciągu dnia
  check('dodatkowe uruchomienia w jej dniu też nie', noteOf(env,1)==='Zdjęcia o 12:00');
  env.setNow('2026-09-25T20:20:00+02:00');
  env.api.endOfDay();
  check('znika przy czyszczeniu kończącym jej dzień', noteOf(env,1)==='' && untilOf(env,1)==='');
})();

/* ---------- B36: równoległa zmiana składu grupy ---------- */
(()=>{
  console.log('B36: setGroup z widzianym składem — cudze zmiany nie giną');
  const D = '2026-08-04';
  const env = build([1,2,3,4,5,6,7].map(id => ({id, name:'Pies'+id})));
  const g = id => slotAt(env, id, D).group;

  env.api.setGroup(D, [1,2], 0);                       // grupa 1: A, B
  env.api.setGroup(D, [1,2,3], 1, [1,2]);              // Y dokłada C
  env.api.setGroup(D, [1,2,5], 1, [1,2]);              // Z widział tylko A, B — dokłada E
  check('C dołożony przez Y zostaje', g(3)===1, JSON.stringify([1,2,3,5].map(g)));
  check('E dołożony przez Z też', g(5)===1 && g(1)===1 && g(2)===1);
  env.api.setGroup(D, [1,3,5], 1, [1,2,3,5]);          // ktoś, kto widział wszystkich, zdejmuje B
  check('widziany i odznaczony pies wypada', g(2)===0 && g(1)===1);

  env.api.setGroup(D, [], 1, [1,3,5]);                 // rozwiązanie
  env.api.setGroup(D, [6,7], 0);                       // ktoś zakłada nową — znów numer 1
  check('numer wrócił do obiegu', g(6)===1 && g(7)===1);
  const r = env.api.setGroup(D, [1,3,4], 1, [1,3,5]);  // Z z nieaktualnym gid 1
  check('cudza grupa pod tym numerem nietknięta', g(6)===1 && g(7)===1, JSON.stringify([6,7].map(g)));
  check('zmiana Z idzie jako nowa grupa', r.group===2 && g(1)===2 && g(3)===2 && g(4)===2, JSON.stringify(r));

  env.api.setGroup(D, [1,3,4,5], 2, [1,3,4]);          // Y dokłada E do grupy 2
  env.api.setGroup(D, [], 2, [1,3,4]);                 // Z (bez E na ekranie) rozwiązuje
  check('po rozwiązaniu sam E nie jest grupą', g(5)===0 && g(1)===0, JSON.stringify([1,3,4,5].map(g)));

  env.api.setGroup(D, [1,2], 0);
  env.api.setGroup(D, [1,2,3], 3);
  env.api.setGroup(D, [1,3], 3);                       // karta sprzed zmiany: bez `seen`
  check('stara karta: jak dotąd, wypadają wszyscy spoza składu', g(2)===0 && g(1)===3 && g(3)===3);
})();

/* ---------- B37: usunięcie psa z grupy ---------- */
(()=>{
  console.log('B37: removeDog — grupa z jednym psem przestaje istnieć');
  const D = '2026-08-04', T = '2026-08-05';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna'},{id:3,name:'Rex'},{id:4,name:'Cyra'}]);
  const g = (id, date) => slotAt(env, id, date || D).group;
  env.api.setGroup(D, [1,2], 0);
  env.api.setGroup(D, [3,4], 0);
  env.api.setGroup(T, [1,3,4], 0);
  env.api.removeDog(1, TEST_PIN);
  check('Luna zostaje sama — bez grupy', g(2)===0);
  check('inna grupa tego dnia nietknięta', g(3)===2 && g(4)===2);
  check('jutro zostały dwa psy — dalej grupa', g(3, T)===1 && g(4, T)===1);
})();

/* ---------- B38: zmiana godziny czyszczenia nie cofa dnia ---------- */
(()=>{
  console.log('B38: setResetHour odrzuca zmianę, która otworzyłaby dzień już zamknięty');
  const env = build([{id:1,name:'Borys'}], {now:'2026-09-24T21:00:00+02:00', props:{resetHour:'20'}});
  check('start: po 20:00 lista na jutrze', env.api.businessDate_()==='2026-09-25');
  let msg = '';
  try{ env.api.setResetHour(8, TEST_PIN); }catch(e){ msg = e.message; }
  check('20 -> 8 o 21:00 odrzucone', /cofnęłaby/.test(msg) && /08:00/.test(msg), msg);
  check('godzina bez zmian', env.api.resetHour_()===20 && env.api.businessDate_()==='2026-09-25');
  env.setNow('2026-09-25T09:00:00+02:00');
  env.api.setResetHour(8, TEST_PIN);
  check('po 8:00 ta sama zmiana przechodzi, dzień stoi', env.api.resetHour_()===8 && env.api.businessDate_()==='2026-09-25');
  env.api.setResetHour(6, TEST_PIN);
  check('przeskok w przód albo w miejscu — dozwolony', env.api.resetHour_()===6);
})();

/* ---------- B39: daty akcji ---------- */
(()=>{
  console.log('B39: nieistniejąca data i daleka przyszłość odrzucone');
  const env = build([{id:1,name:'Borys'}]);
  check('2026-13-45 to nie data', !env.api.isDate_('2026-13-45') && !env.api.isDate_('2026-02-30'));
  check('2028-02-29 to data', env.api.isDate_('2028-02-29') && env.api.isDate_('2026-08-04'));
  check('rezerwacja na 2026-13-45 odrzucona', throws(() => env.api.reserve(1, 'Ala', '2026-13-45')));
  check('rok 9999 odrzucony', throws(() => env.api.reserve(1, 'Ala', '9999-01-01')));
  const max = env.api.addDays_('2026-08-04', env.conf.MAX_DAYS_AHEAD);
  check('rok do przodu jeszcze można', !throws(() => env.api.reserve(1, 'Ala', max)));
  check('dzień dalej już nie', throws(() => env.api.reserve(1, 'Ala', env.api.addDays_(max, 1))));
  check('grupy tak samo', throws(() => env.api.setGroup('9999-01-01', [1], 0)));
})();

/* ---------- B40: powtórka „Zwolnij" nie zwalnia cudzej rezerwacji ---------- */
(()=>{
  console.log('B40: setFree z widzianym stanem — powtórka po zaginionej odpowiedzi');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'}]);
  env.api.reserve(1, 'Ola');
  env.api.setFree(1, D, {status:'reserved', who:'Ola'});   // doszło, odpowiedź zginęła
  env.api.reserve(1, 'Ala');                               // Ala bierze psa, zanim przyjdzie powtórka
  const r = env.api.setFree(1, D, {status:'reserved', who:'Ola'});
  check('rezerwacja Ali nietknięta', dogNow(env, 1).status==='reserved' && dogNow(env, 1).who==='Ala',
    JSON.stringify(dogNow(env, 1)));
  check('odpowiedź pokazuje stan Ali', r.dog.who==='Ala');
  env.api.markWalked(1, '', 2, D);
  env.api.setFree(1, D, {status:'reserved', who:'Ala'});   // ktoś z nieaktualnym ekranem „zwalnia" już wyprowadzonego
  check('spacer nie cofnięty przez nieaktualny ekran', dogNow(env, 1).status==='walked');
  env.api.setFree(1, D, {status:'walked', who:'Ala'});
  check('„Cofnij" z właściwym stanem działa', dogNow(env, 1).status==='free');
  env.api.reserve(1, 'Iza');
  env.api.setFree(1);
  check('stara karta bez `seen`: jak dotąd', dogNow(env, 1).status==='free');
})();

/* ---------- B41: układ zakładki Spacery sprawdzany raz, właściwości czytane raz ---------- */
(()=>{
  console.log('B41: układ Spacery zapamiętany, a getData czyta właściwości jednym wywołaniem');
  const env = build([{id:1,name:'Borys'}], {walks:[]});
  env.api.getData();
  check('zapamiętane we właściwości — razem z id zakładki', env.props.walksLayout==='2:' + env.sheets['Spacery'].getSheetId(),
    JSON.stringify(env.props));
  const sh = env.sheets['Spacery'];
  let heads = 0;
  const orig = sh.getRange;
  sh.getRange = function(r, c){ if(r===1 && c===env.conf.WALK.SLOT) heads++; return orig.apply(this, arguments); };
  const reads = env.propReads();
  env.api.getData();                                   // nowe żądanie z telefonu (env.api = nowe wykonanie)
  check('nowe wykonanie nie sprawdza układu od nowa', heads===0, 'nagłówek czytany x' + heads);
  check('jedno wywołanie usługi właściwości na getData', env.propReads() - reads===1, String(env.propReads() - reads));
})();

/* ---------- B42: stary układ Spacery (wiersz na psa) -> spacery ---------- */
(()=>{
  console.log('B42: przepisanie starego układu — drugi spacer z kto1 staje się osobnym wierszem');
  const D = '2026-08-04';
  const OLD = ['data','pies_id','status','kto','godzina','kto1','godzina1','grupa'];   // układ z grupami
  const e = makeContext({ now:'2026-08-04T10:00:00+02:00', props:{ pin: TEST_PIN, walksImported:'2026-01-01' }, sheets: [
    { name:'Psy',      rows:[DOG_HEADERS, dogRow({id:1,name:'Borys'}), dogRow({id:2,name:'Luna',walks:2}), dogRow({id:3,name:'Rex',walks:2})] },
    { name:'Historia', rows:[HIST_HEADERS] },
    { name:'Zadania',  rows:[TASK_HEADERS] },
    { name:'Spacery',  rows:[OLD,
      [D, 1, 'reserved', 'Ala', '', '', '', 1],
      [D, 2, 'reserved', 'Ola', '', 'Iza', '9:15', 1],          // 1/2 odbyty (Iza), 2/2 zarezerwowany w grupie
      [D, 3, 'free', '', '', 'Zu', '8:00', ''],                 // 1/2 odbyty, 2/2 wolny
      ['2026-08-06', 1, 'reserved', 'Ewa', '', '', '', '']] },
  ]});
  const at = (id, n, date) => e.api.getData().slots.filter(s => s.dogId===id && s.slot===n && s.date===(date||D))[0];
  check('Borys: spacer 1 zarezerwowany, w grupie', at(1,1) && at(1,1).who==='Ala' && at(1,1).group===1, JSON.stringify(at(1,1)));
  check('Luna: 1/2 odbyty przez Izę o 9:15', at(2,1) && at(2,1).status==='walked' && at(2,1).who==='Iza' && at(2,1).time==='9:15');
  check('Luna: 2/2 zarezerwowany przez Olę, w grupie', at(2,2) && at(2,2).who==='Ola' && at(2,2).group===1);
  check('Rex: 1/2 odbyty, 2/2 bez wiersza (wolny)', at(3,1).status==='walked' && !at(3,2));
  check('przyszły dzień nietknięty', at(1,1,'2026-08-06') && at(1,1,'2026-08-06').who==='Ewa');
  const sh = e.sheets['Spacery'];
  check('nagłówki nowego układu', JSON.stringify(sh._data[0].slice(0,7))===JSON.stringify(e.conf.WALK_HEADERS));
  check('godzina w nowej kolumnie jako tekst (bug z datą 1899)', sh._formats[e.conf.WALK.TIME]==='@' && sh._formats[e.conf.WALK.DATE]==='@',
    JSON.stringify(sh._formats));
  check('nie zostają resztki starej ósmej kolumny', sh._data.slice(1).every(r => r[7]==='' || r[7]===undefined), JSON.stringify(sh._data));
  check('imiona dostały kolory dnia', Object.keys(e.api.getData().volunteers[D] || {}).length===4,
    JSON.stringify(e.api.getData().volunteers));
  const once = JSON.stringify(sh._data);
  e.api.getData();
  check('przepisanie raz — kolejne dostępy niczego nie ruszają', JSON.stringify(sh._data)===once);
  e.setNow('2026-08-04T22:10:00+02:00');
  e.api.endOfDay();
  check('odbyte spacery w Historii, niezrealizowana rezerwacja 2/2 przepada',
    JSON.stringify(hist(e).filter(r => r[1]==='Luna').map(r => r[2]))==='["Iza"]'
    && hist(e).some(r => r[1]==='Rex' && r[2]==='Zu'), JSON.stringify(hist(e)));
})();

/* ---------- B43: kolory wolontariuszy ---------- */
(()=>{
  console.log('B43: kolor wolontariusza — przydział na dzień, bez powtórek, stały do końca dnia');
  const D = '2026-08-04', T = '2026-08-05';
  const env = build([1,2,3,4,5,6].map(id => ({id, name:'Pies'+id, walks: id===6 ? 2 : 1})));
  const colors = date => env.api.getData().volunteers[date] || {};
  const r = env.api.reserve(1, 'Ania', D);
  check('odpowiedź rezerwacji niesie kolory dnia', r.volunteers && r.volunteers[D] && 'ania' in r.volunteers[D],
    JSON.stringify(r.volunteers));
  env.api.reserve(2, ' ania ', D);                     // ta sama osoba, inaczej wpisana
  env.api.reserve(3, 'Ánia', D);
  check('„Ania", „ ania " i „Ánia" to jedna osoba — jeden kolor', Object.keys(colors(D)).length===1, JSON.stringify(colors(D)));
  ['Ola','Iza','Zu','Ewa'].forEach((n, i) => env.api.reserve(4 + (i % 2), n, D) );
  env.api.reserve(6, 'Ola', D, 1); env.api.reserve(6, 'Łucja', D, 2);
  const c = colors(D);
  const idx = Object.keys(c).map(k => c[k]);
  check('różne osoby — różne kolory (póki starczy palety)', new Set(idx).size===idx.length, JSON.stringify(c));
  check('numery z palety', idx.every(i => Number.isInteger(i) && i >= 0 && i < env.conf.VOLUNTEER_COLORS));
  const ania = c['ania'];
  env.api.setFree(1, D); env.api.setFree(2, D); env.api.setFree(3, D);   // Ania zwalnia wszystko
  env.api.reserve(1, 'Kasia', D);
  check('kolor raz dany zostaje do końca dnia — nowa osoba nie przejmuje koloru Ani',
    colors(D)['ania']===ania && colors(D)['kasia']!==ania, JSON.stringify(colors(D)));
  env.api.reserve(1, 'Ania', T);
  check('każdy dzień ma własny przydział', Object.keys(colors(T)).length===1);
  check('wolontariusz odhaczający spacer bez rezerwacji też dostaje kolor',
    (env.api.markWalked(2, 'Bartek', 1, D), 'bartek' in colors(D)));

  const map = {};
  for(let i = 0; i < 12; i++) env.api.volAssign_(map, 'osoba' + i, env.conf.VOLUNTEER_COLORS, env.conf.VOLUNTEER_MAX);
  const used = Object.keys(map).map(k => map[k]);
  check('po wyczerpaniu palety kolory się powtarzają, ale pierwsze 10 osób — bez powtórek',
    new Set(used.slice(0, 10)).size===10, JSON.stringify(map));
  check('volNorm_', env.api.volNorm_('  Łucja  Kowal ')==='lucja kowal' && env.api.volNorm_('ÁNIA')==='ania');

  env.setNow('2026-08-04T22:10:00+02:00');
  env.api.endOfDay();
  check('nocne czyszczenie zapomina kolory zamkniętego dnia', !('vol:' + D in env.props) && ('vol:' + T in env.props),
    JSON.stringify(Object.keys(env.props)));
})();

/* ---------- B44: akcje na spacerach i karty sprzed spacerów ---------- */
(()=>{
  console.log('B44: każdy spacer osobno; stare wywołania bez numeru trafiają w „bieżący"');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys',walks:2},{id:2,name:'Luna'},{id:3,name:'Rex',walks:2}]);
  const at = (id, n) => slotAt(env, id, D, n);

  env.api.reserve(1, 'Jan', D, 2);                     // popołudnie najpierw
  env.api.reserve(1, 'Ola');                           // stara karta: pierwszy wolny spacer
  check('bez numeru rezerwacja trafia w pierwszy wolny spacer', at(1,1).who==='Ola' && at(1,2).who==='Jan');
  check('stara karta widzi bieżący spacer 1/2 (Ola)', dogNow(env, 1).status==='reserved' && dogNow(env, 1).who==='Ola');
  env.api.markWalked(1, '', 2, D);                     // popołudnie odbyte przed porankiem — wolno
  check('spacer 2/2 odbyty niezależnie od 1/2', at(1,2).status==='walked' && at(1,1).status==='reserved');
  env.api.setFree(1, D, {status:'reserved', who:'Ola'}, 1);
  check('„Zwolnij" na 1/2 nie rusza odbytego 2/2', at(1,1).status==='free' && at(1,2).status==='walked');
  env.api.setFree(1, D, {status:'walked', who:'Jan'}, 2);
  check('„Cofnij" na 2/2', at(1,2).status==='free');

  env.api.reserve(3, 'Iza', D, 1); env.api.markWalked(3, '', 1, D); env.api.reserve(3, 'Zu', D, 2);
  env.api.setFree(3);                                  // stara karta: „Zwolnij" bieżącego — najdalszego zajętego
  check('stary setFree zwalnia 2/2, 1/2 odbyty zostaje', at(3,2).status==='free' && at(3,1).status==='walked');
  env.api.markWalked(2, '', 2);                        // stara karta: „2 = ostatni" u psa na jeden spacer
  check('stary markWalked(…, 2) u psa na jeden spacer to spacer 1', at(2,1).status==='walked');
  env.api.undoFirstWalk(3);                            // stara karta: „Cofnij 1. spacer"
  check('undoFirstWalk cofa 1/2', at(3,1).status==='free');
  check('numer spaceru spoza zakresu odrzucony', throws(()=>env.api.setFree(2, D, null, 3)) && throws(()=>env.api.reserve(2, 'X', D, 0)));
  const g = env.api.getData();
  check('getData: `slots` z numerami spacerów, bez starego `walks`', Array.isArray(g.slots) && g.walks===undefined
    && g.slots.every(s => s.slot >= 1), JSON.stringify(g.slots));
})();

/* ---------- B45: kopia starego układu Spacery i powrót po cofnięciu wdrożenia ---------- */
(()=>{
  console.log('B45: przepisanie zostawia kopię starego układu; przywrócona kopia przepisuje się od nowa');
  const D = '2026-08-04';
  const OLD = ['data','pies_id','status','kto','godzina','kto1','godzina1','grupa'];
  const oldRows = [OLD,
    [D, 1, 'reserved', 'Ala', '', '', '', ''],
    [D, 2, 'reserved', 'Ola', '', 'Iza', '9:15', ''],
    [D, 3, 'walked', 'Zu', '8:00', '', '', '']];
  const fresh = () => makeContext({ now:'2026-08-04T10:00:00+02:00', props:{ pin: TEST_PIN, walksImported:'2026-01-01' }, sheets: [
    { name:'Psy',      rows:[DOG_HEADERS, dogRow({id:1,name:'Borys'}), dogRow({id:2,name:'Luna',walks:2}), dogRow({id:3,name:'Rex'})] },
    { name:'Historia', rows:[HIST_HEADERS] },
    { name:'Zadania',  rows:[TASK_HEADERS] },
    { name:'Spacery',  rows: oldRows },
  ]});
  const e = fresh();
  const BACKUP = e.conf.WALKS_BACKUP;
  const at = (id, n) => e.api.getData().slots.filter(s => s.dogId===id && s.slot===n && s.date===D)[0] || {status:'free', who:''};
  e.api.getData();
  const bak = e.sheets[BACKUP];
  check('przed przepisaniem powstaje kopia starego układu', !!bak && JSON.stringify(bak._data)===JSON.stringify(oldRows),
    Object.keys(e.sheets).join(', '));
  check('kopia to osobna zakładka (inne id)', bak && bak.getSheetId()!==e.sheets['Spacery'].getSheetId());
  check('zakładka Spacery już w nowym układzie', e.sheets['Spacery']._data[0][2]==='spacer');

  // Cofnięcie wdrożenia (README): nowa zakładka odłożona, kopia wraca pod nazwę Spacery,
  // stara wersja kodu pracuje na niej dalej — tu: Luna 2/2 zwolniona, Rex bez zmian
  e.sheets['Spacery'].setName('Spacery (nowy układ)');
  bak.setName('Spacery');
  e.sheets['Spacery']._data[2] = [D, 2, 'free', '', '', 'Iza', '9:15', ''];
  // ktoś zatrzymał sobie jeszcze jedną kopię pod nazwą, której użyłaby migracja
  e.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet(BACKUP);

  // ponowne wdrożenie nowej wersji: właściwość mówi „sprawdzone", ale to INNA zakładka
  check('ponowne wdrożenie: przywrócony stary układ przepisany od nowa', at(2,1).status==='walked' && at(2,1).who==='Iza'
    && at(2,2).status==='free' && at(3,1).status==='walked' && at(1,1).who==='Ala',
    JSON.stringify(e.sheets['Spacery']._data.slice(0,4)));
  check('…znów z kopią — pod wolną nazwą', !!e.sheets[BACKUP + ' 2'] && e.sheets[BACKUP + ' 2']._data[0][2]==='status',
    Object.keys(e.sheets).join(', '));

  // kopia, która się nie uda (np. limit zakładek), nie może zatrzymać aplikacji
  const f = fresh();
  const orig = f.ctx.SpreadsheetApp.getActiveSpreadsheet;
  f.ctx.SpreadsheetApp.getActiveSpreadsheet = () => Object.assign(orig(), { insertSheet(){ throw new Error('limit zakładek'); } });
  let ok = true;
  try{ f.api.getData(); }catch(err){ ok = false; }
  f.ctx.SpreadsheetApp.getActiveSpreadsheet = orig;
  check('nieudana kopia: przepisanie i tak przechodzi, aplikacja działa',
    ok && f.sheets['Spacery']._data[0][2]==='spacer' && f.api.getData().slots.some(s => s.dogId===1 && s.who==='Ala'));
})();

/* ---------- B46: kolor wolontariusza nigdy nie blokuje rezerwacji ---------- */
(()=>{
  console.log('B46: przydział koloru — awaria właściwości i sufity nie zatrzymują zapisu');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna'},{id:3,name:'Rex'}]);
  const isVol = k => k.indexOf('vol:')===0;
  let r = null;

  env.failProps((k, op) => isVol(k) && op==='set');      // np. limit rozmiaru właściwości
  const ok = !throws(() => { r = env.api.reserve(1, 'Ala', D, 1); });
  check('limit właściwości: rezerwacja zapisana, bez błędu dla wolontariusza',
    ok && slotAt(env, 1, D).who==='Ala' && r && r.slot.status==='reserved', JSON.stringify(r));
  env.failProps(k => isVol(k));                           // odczyt też pada
  const ok2 = !throws(() => { r = env.api.markWalked(1, '', 1, D); });
  check('awaria odczytu: spacer zapisany, odpowiedź bez kolorów (telefon zostaje przy swoich)',
    ok2 && slotAt(env, 1, D).status==='walked' && r && r.volunteers===undefined, JSON.stringify(r));
  env.failProps(null);

  // rezerwuj -> zwolnij -> inne imię: przydział dnia nie rośnie bez końca
  const MAX = env.conf.VOLUNTEER_MAX;
  for(let i = 0; i < MAX + 5; i++){
    env.api.reserve(2, 'Osoba ' + i, D, 1);
    env.api.setFree(2, D, {status:'reserved', who:'Osoba ' + i}, 1);
  }
  const map = JSON.parse(env.props['vol:' + D] || '{}');
  check('przydział dnia zatrzymuje się na suficie', Object.keys(map).length===MAX, String(Object.keys(map).length));
  check('wartość daleko od limitu 9 KB na właściwość', (env.props['vol:' + D] || '').length < 4500,
    String((env.props['vol:' + D] || '').length));
  r = env.api.reserve(3, 'Ktoś Nowy', D, 1);
  check('osoba ponad sufit rezerwuje normalnie (kolor z imienia)', r.slot.who==='Ktoś Nowy' && slotAt(env, 3, D).who==='Ktoś Nowy');

  // rok rezerwacji naprzód: dni z przydziałem mają sufit
  const DAYS = env.conf.VOLUNTEER_DAYS;
  for(let i = 1; i <= DAYS + 3; i++) env.api.reserve(1, 'Ala', env.api.addDays_(D, i), 1);
  const days = Object.keys(env.props).filter(isVol).length;
  check('dni z przydziałem kolorów nie więcej niż sufit', days <= DAYS, String(days));
  check('rezerwacje na dalsze dni i tak zapisane', slotAt(env, 1, env.api.addDays_(D, DAYS + 3)).who==='Ala');
})();

/* ---------- B47: setGroup dla kart sprzed spacerów (wersja z datami, PR #1) ---------- */
(()=>{
  console.log('B47: odpowiedź setGroup niesie też stary `walks` — stara karta nie gubi grup');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna',walks:2},{id:3,name:'Rex',walks:2},{id:4,name:'Fado'}]);
  env.api.reserve(2, 'Iza', D, 1); env.api.markWalked(2, '', 1, D);     // Luna: 1/2 odbyty
  env.api.setGroup(D, ['3:1', '4:1'], 0);                              // Rex rano z Fado
  const r = env.api.setGroup(D, ['1:1', '2:2'], 0);                    // Borys z popołudniem Luny
  // dokładnie to, co robi applyGroups karty z PR #1: grupa psa z `walks`, reszta = 0
  const got = {};
  (r.walks || []).forEach(w => { if(w.date === D) got[w.dogId] = Number(w.group) || 0; });
  check('odpowiedź ma `walks` w starym kształcie', Array.isArray(r.walks) && r.walks.every(w => 'who1' in w && 'dogId' in w && !('slot' in w)),
    JSON.stringify(r.walks));
  check('stara karta widzi obie grupy dnia', got[1]===r.group && got[2]===r.group && got[3]>0 && got[3]===got[4] && got[3]!==r.group,
    JSON.stringify(got));
  const luna = (r.walks || []).filter(w => w.dogId===2)[0];
  check('Luna po 1/2 w starym kształcie: kto1 = Iza, bieżący 2/2 w grupie', luna && luna.who1==='Iza' && luna.status==='free');
  check('nowy klient dalej dostaje `slots`', Array.isArray(r.slots) && r.slots.some(s => s.dogId===2 && s.slot===2 && s.group===r.group));
})();

/* ---------- B48: trimSlots_ czyta zakładkę raz, a nie raz na każdy otwarty dzień ---------- */
(()=>{
  console.log('B48: przycinanie spacerów po zmianie psa — jeden odczyt Spacery, zmiany tylko tam, gdzie trzeba');
  const D = '2026-08-04';
  const env = build([{id:1,name:'Borys'},{id:2,name:'Luna',walks:2},{id:3,name:'Rex'}]);
  for(let i = 1; i <= 10; i++) env.api.reserve(1, 'Ala', env.api.addDays_(D, i), 1);   // rezerwacje na 10 dni
  const sh = () => env.sheets['Spacery'];
  const reads = fn => { const before = sh()._reads; env.api.withLock_(fn); return sh()._reads - before; };
  check('nic do przycięcia: jeden odczyt zakładki', reads(() => env.ctx.__api.trimSlots_(1))===1,
    String(reads(() => env.ctx.__api.trimSlots_(1))));
  const T = env.api.addDays_(D, 5);
  env.api.setGroup(T, ['2:2', '3:1'], 0);                                          // Luna po południu z Rexem
  env.sheets['Psy']._data[2][env.conf.DOG.WALKS - 1] = 1;                          // Luna wraca do jednego spaceru
  const n = reads(() => env.ctx.__api.trimSlots_(2));
  check('jest co przyciąć: odczyt całości + ten jeden dzień', n===2, String(n));
  check('wolny 2/2 Luny wyszedł z grupy, a Rex sam grupą nie jest', slotAt(env, 2, T, 2).group===0 && slotAt(env, 3, T, 1).group===0,
    JSON.stringify([slotAt(env, 2, T, 2), slotAt(env, 3, T, 1)]));
  check('rezerwacje na inne dni nietknięte', slotAt(env, 1, env.api.addDays_(D, 10), 1).who==='Ala');
})();

/* ---------- B49: Historia pamięta grupę spaceru ---------- */
(()=>{
  console.log('B49: grupa trafia do Historii i wraca w podglądzie minionego dnia — także z wąskiej, starej zakładki');
  // Historia sprzed tej zmiany ma 4 kolumny, a Apps Script rzuca błędem na zakres poza szerokością
  // zakładki (strictWidth). Stare wpisy są bez grupy i tak zostają.
  const D = '2026-08-04';
  const env = build([], {
    now: D + 'T10:00:00+02:00',
    sheets: [
      { name:'Psy', rows:[DOG_HEADERS, ...[{id:1,name:'Borys'},{id:2,name:'Luna'},{id:3,name:'Rex'},{id:4,name:'Azor'},{id:5,name:'Bari'}].map(dogRow)] },
      { name:'Historia', strictWidth: true, rows:[HIST_HEADERS, ['2026-08-01','Luna','Ola','10:00']] },
      { name:'Zadania',  rows:[TASK_HEADERS] },
    ],
  });
  check('stara karta (getHistory) czyta wąską Historię bez błędu', !throws(() => env.api.getHistory()));
  env.api.reserve(1, 'Ala', D, 1); env.api.reserve(2, 'Ola', D, 1); env.api.reserve(3, 'Ala', D, 1); env.api.reserve(4, 'Iza', D, 1);
  env.api.reserve(5, 'Ela', D, 1);
  env.api.setGroup(D, ['1:1', '2:1'], 0);                     // grupa 1: Borys i Luna
  env.api.setGroup(D, ['3:1', '4:1'], 0);                     // grupa 2: Rex i Azor — Azor w końcu nie wyszedł
  [1, 2, 3, 5].forEach(id => env.api.markWalked(id, '', 1, D));

  env.setNow('2026-08-05T10:00:00+02:00');                    // dzień minął, czyszczenie jeszcze nie ruszyło
  const open = env.api.getHistoryDays(D, D).history;
  const g = (list, name, day) => (list.filter(e => e.name === name && e.date === (day || D))[0] || {}).group;
  check('niezamknięty dzień: grupa ze Spacery', g(open, 'Borys') === 1 && g(open, 'Luna') === 1 && g(open, 'Rex') === 2 && g(open, 'Bari') === 0,
    JSON.stringify(open));

  check('nocne czyszczenie na wąskiej Historii bez błędu', !throws(() => env.api.endOfDay()));
  const H = env.sheets['Historia'];
  check('…dokłada kolumnę grupa z nagłówkiem', H._data[0][4] === 'grupa', JSON.stringify(H._data[0]));
  const rows = hist(env).filter(r => r[0] === D);
  const col = name => (rows.filter(r => r[1] === name)[0] || [])[4];
  check('…i zapisuje numer grupy przy spacerze (pusty bez grupy)', rows.length === 4 && col('Borys') === 1 && col('Luna') === 1
    && col('Rex') === 2 && col('Bari') === '', JSON.stringify(rows));
  check('Azor (rezerwacja bez spaceru) do Historii nie trafia — grupa 2 ma tam jeden spacer', !rows.some(r => r[1] === 'Azor'));

  const closed = env.api.getHistoryDays('2026-08-01', D).history;
  check('zamknięty dzień: grupa z Historii, ta sama co przed czyszczeniem',
    g(closed, 'Borys') === 1 && g(closed, 'Luna') === 1 && g(closed, 'Rex') === 2 && g(closed, 'Bari') === 0, JSON.stringify(closed));
  check('stary wpis (sprzed kolumny grupa) — bez grupy', g(closed, 'Luna', '2026-08-01') === 0,
    JSON.stringify(closed.filter(e => e.date === '2026-08-01')));
  check('stara karta dalej czyta Historię', !throws(() => env.api.getHistory()) && env.api.getHistory().history.length === 5);

  const m = build([{id:1, name:'Borys'}], {sheets: [
    { name:'Psy', rows:[DOG_HEADERS, dogRow({id:1, name:'Borys'})] },
    { name:'Historia', strictWidth: true, rows:[HIST_HEADERS, ['2026-08-01','Luna','Ola','10:00']] },
    { name:'Zadania',  rows:[TASK_HEADERS] }]});
  m.api.migrate();
  check('migrate() też dokłada kolumnę grupa, danych nie rusza', m.sheets['Historia']._data[0][4] === 'grupa'
    && m.sheets['Historia']._data[1].slice(0, 4).join() === '2026-08-01,Luna,Ola,10:00', JSON.stringify(m.sheets['Historia']._data));
})();

/* ---------- B50: numer psa (identyfikator) w historii ---------- */
(()=>{
  console.log('B50: minione dni niosą numer psa — zapisany przy czyszczeniu, a dla starych wpisów z katalogu');
  // Wymóg: zrzuty historii idą do władz schroniska. Numer zapisany przy czyszczeniu zostaje, choćby
  // psa potem przemianowano albo usunięto; stare wpisy (tylko imię) dostają numer z katalogu po imieniu —
  // ale tylko jednoznacznie: dwa psy o tym samym imieniu = brak numeru, nie zgadywanie.
  const D = '2026-08-04';
  const env = build([], {
    now: D + 'T10:00:00+02:00',
    sheets: [
      { name:'Psy', rows:[DOG_HEADERS, ...[{id:1,name:'Borys',ident:'101/26'},{id:2,name:'Luna',ident:'1/26'},{id:3,name:'Rex',ident:'303/26'},
        {id:4,name:'Kora',ident:'404/26'},{id:5,name:'Kora',ident:'505/26'},{id:6,name:'',ident:'2077'},{id:7,name:'Azor'}].map(dogRow)] },
      { name:'Historia', strictWidth: true, rows:[HIST_HEADERS,
        ['2026-08-01','Borys','Ola','10:00'], ['2026-08-01','Kora','Ala','11:00'],
        ['2026-08-01','Dawny','Ala','12:00'], ['2026-08-01','#2077','Iza','13:00']] },
      { name:'Zadania',  rows:[TASK_HEADERS] },
    ],
  });
  const nr = (list, name, day) => (list.filter(e => e.name === name && e.date === (day || D))[0] || {}).ident;
  const old = env.api.getHistoryDays('2026-08-01', '2026-08-01').history;
  check('stary wpis: numer z katalogu po imieniu', nr(old, 'Borys', '2026-08-01') === '101/26', JSON.stringify(old));
  check('…dwa psy o tym imieniu (Kora) — bez numeru, nie zgadujemy', nr(old, 'Kora', '2026-08-01') === '', JSON.stringify(old));
  check('…pies spoza katalogu — bez numeru', nr(old, 'Dawny', '2026-08-01') === '');
  check('…pies bez imienia (#2077) — jego numer', nr(old, '#2077', '2026-08-01') === '2077');

  [[1,'Ala'], [2,'Ola'], [4,'Zu'], [6,'Iza'], [7,'Ela']].forEach(([id, who]) => { env.api.reserve(id, who, D, 1); env.api.markWalked(id, '', 1, D); });
  env.setNow('2026-08-05T10:00:00+02:00');
  const open = env.api.getHistoryDays(D, D).history;
  check('dzień niezamknięty: numer z katalogu po psie, nie po imieniu (Kora 404/26)',
    nr(open, 'Borys') === '101/26' && nr(open, 'Kora') === '404/26' && nr(open, '#2077') === '2077' && nr(open, 'Azor') === '',
    JSON.stringify(open));

  check('czyszczenie na wąskiej Historii bez błędu', !throws(() => env.api.endOfDay()));
  const H = env.sheets['Historia'];
  check('…dokłada kolumnę identyfikator z nagłówkiem', H._data[0][5] === 'identyfikator', JSON.stringify(H._data[0]));
  check('…jako tekst (@) — „1/26" nie może zostać datą', H._formats[6] === '@', JSON.stringify(H._formats));
  const rows = hist(env).filter(r => r[0] === D), col = name => (rows.filter(r => r[1] === name)[0] || [])[5];
  check('…i zapisuje numer przy spacerze', col('Borys') === '101/26' && col('Luna') === '1/26' && col('Kora') === '404/26'
    && col('#2077') === '2077' && col('Azor') === '', JSON.stringify(rows));

  env.sheets['Psy']._data[1][1] = 'Borys II';                // pies przemianowany po spacerze
  env.sheets['Psy']._data.splice(4, 1);                       // a Kora 404/26 usunięta z katalogu
  const closed = env.api.getHistoryDays(D, D).history;
  check('zamknięty dzień: numer z Historii — przemianowanie i usunięcie psa go nie zmieniają',
    nr(closed, 'Borys') === '101/26' && nr(closed, 'Kora') === '404/26' && nr(closed, 'Luna') === '1/26', JSON.stringify(closed));
  check('stara karta dalej czyta Historię', !throws(() => env.api.getHistory()));
})();

/* ---------- B51: pełna Historia dostaje wiersze, nic nie znika ---------- */
(()=>{
  console.log('B51: nocne czyszczenie na pełnej Historii — dokłada wiersze zamiast stanąć, niczego nie kasuje');
  // Zakładka ma stałą liczbę wierszy (nowa: 1000), a getRange poza nią rzuca w Apps Script błędem:
  // nocne czyszczenie stawało, dni przestawały się zamykać. Decyzja właściciela (1.1.2): dokładać
  // wiersze, historii nie kasować. Tu zakładka ma 4 wiersze: nagłówek, dwa wpisy i jedno wolne miejsce.
  const D = '2026-08-04';
  const env = build([], {
    now: D + 'T10:00:00+02:00',
    sheets: [
      { name:'Psy', rows:[DOG_HEADERS, ...[{id:1,name:'Borys',ident:'1/26'},{id:2,name:'Luna'},{id:3,name:'Rex'}].map(dogRow)] },
      { name:'Historia', maxRows: 4, rows:[HIST_HEADERS, ['2026-08-01','Luna','Ola','10:00'], ['2026-08-02','Rex','Ala','11:00']] },
      { name:'Zadania',  rows:[TASK_HEADERS] },
    ],
  });
  const H = env.sheets['Historia'];
  const walk = (date, who) => [1, 2, 3].forEach(id => { env.api.reserve(id, who, date, 1); env.api.markWalked(id, '', 1, date); });
  walk(D, 'Ala');
  env.setNow('2026-08-05T10:00:00+02:00');
  check('pełna Historia: czyszczenie bez błędu', !throws(() => env.api.endOfDay()));
  const rows = () => hist(env).map(r => r[0] + ' ' + r[1]);
  check('…wszystkie trzy spacery zapisane, stare wpisy na miejscu', JSON.stringify(rows()) ===
    JSON.stringify(['2026-08-01 Luna', '2026-08-02 Rex', D + ' Borys', D + ' Luna', D + ' Rex']), JSON.stringify(rows()));
  check('…zakładka urosła dokładnie o brakujące wiersze', H.getMaxRows() === 6, String(H.getMaxRows()));
  const textOn = (c, r) => H._formatRanges.some(f => f.f === '@' && f.col <= c && c < f.col + f.cols && f.row <= r && r < f.row + f.rows);
  check('…nowe wiersze: data, godzina i numer psa jako tekst (bug nr 3, „1/26" nie zostaje datą)',
    [1, 4, 6].every(c => textOn(c, 5) && textOn(c, 6)), JSON.stringify(H._formatRanges));
  check('dzień czyta się w podglądzie', env.api.getHistoryDays(D, D).history.length === 3);
  check('Spacery bez zamkniętego dnia', !openRows(env).some(r => r[0] === D), JSON.stringify(openRows(env)));

  walk('2026-08-05', 'Ola');                                  // kolejna noc — znowu brak miejsca
  env.setNow('2026-08-06T10:00:00+02:00');
  check('kolejna noc: znowu dokłada, nic nie kasuje', !throws(() => env.api.endOfDay()) && hist(env).length === 8
    && H.getMaxRows() === 9 && env.api.histCount_() === 8, hist(env).length + ' / ' + H.getMaxRows());

  const roomy = build([{id:1, name:'Borys'}], {now: D + 'T10:00:00+02:00', sheets: [
    { name:'Psy', rows:[DOG_HEADERS, dogRow({id:1, name:'Borys'})] },
    { name:'Historia', maxRows: 50, rows:[HIST_HEADERS] },
    { name:'Zadania',  rows:[TASK_HEADERS] }]});
  roomy.api.reserve(1, 'Ala', D, 1); roomy.api.markWalked(1, '', 1, D);
  roomy.setNow('2026-08-05T10:00:00+02:00');
  roomy.api.endOfDay();
  check('jest miejsce: zakładka nie rośnie', roomy.sheets['Historia'].getMaxRows() === 50 && hist(roomy).length === 1);
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

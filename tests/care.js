// 1.6 — opieka nad psem po stronie serwera: wiele notatek przy psie i odkleszczanie (Dogs.gs, History.gs, Setup.gs).
// B91–B99 na atrapie arkusza z zamrożonym zegarem (backend-harness), jak backend.js.
const { makeContext } = require('./backend-harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
const TEST_PIN = '4321';
const OLD_HEADERS = ['id','imie','identyfikator','boks','trudnosc','status','kto','godzina',
  'ostatni_spacer','notatka','spacery','kto1','godzina1','notatka_do'];          // zakładka sprzed 1.3 (14 kolumn)
const TICK_HEADS = ['odkleszczanie','odkleszczanie_co','odkleszczanie_nastepne','odkleszczanie_ostatnio'];
const FULL_HEADERS = OLD_HEADERS.concat(['grupa_psa', 'notatki'], TICK_HEADS);   // 1.6 (20 kolumn)

/** Wiersz Psy: 14 kolumn, a z `more` — dalsze (grupa, notatki, odkleszczanie). */
function dogRow(o){
  const r = [o.id, o.name||'', o.ident||'', o.box||'', o.dif||'easy', '', '', '', o.lastWalk||'', o.note||'', o.walks||1,
             '', '', o.noteUntil||''];
  if(o.full) r.push(o.team||'', o.notes||'', o.tick||'', o.every||'', o.next||'', o.last||'');
  return r;
}
/** Domyślnie 4 sierpnia 2026, 10:00, reset o 22:00 — dzień rezerwacyjny 2026-08-04 (jak backend.js). */
function build(dogs, opts){
  opts = opts || {};
  const head = opts.head || OLD_HEADERS;
  const sheets = [
    Object.assign({ name:'Psy', rows: [head, ...dogs.map(d => dogRow(Object.assign({ full: head.length > 14 }, d)))] }, opts.psy || {}),
    { name:'Historia', rows: [['data','pies','kto','godzina']] },
    { name:'Zadania',  rows: [['id','tresc','data','status']] },
  ];
  return makeContext(Object.assign({}, opts, {
    now: opts.now || '2026-08-04T10:00:00+02:00', sheets,
    props: Object.assign({ pin: TEST_PIN, walksImported: '2026-01-01' }, opts.props),
  }));
}
const P = env => env.sheets['Psy'];
const cellOf = (env, row, col) => P(env)._data[row][col - 1];
const dogOf = (env, id) => env.api.getData().dogs.filter(d => d.id === id)[0];
const throws = fn => { try{ fn(); return false; }catch(e){ return e.message || String(e); } };
const save = (env, id, data) => env.api.updateDog(id, Object.assign({ name: 'Borys' }, data), TEST_PIN);
const J = s => JSON.stringify(s);

/* ---------- B91: kilka notatek przy psie ---------- */
(()=>{
  console.log('B91: kilka notatek przy psie — pierwsza tam, gdzie zawsze, dalsze w kolumnie „notatki"');
  const env = build([{id:1, name:'Borys'}]);
  save(env, 1, { notes: [
    { text:'Uważać na ręce', until:'nigdy' }, { text:'Ćwiczyć kaganiec', until:'nigdy' },
    { text:'Zapoznawczy', until:'2026-08-11' }, { text:'RTG', until:'' }, { text:'   ', until:'nigdy' } ] });
  check('pierwsza w notatka / notatka_do', cellOf(env, 1, 10) === 'Uważać na ręce' && cellOf(env, 1, 14) === 'nigdy');
  check('kolumna „notatki" dołożona: nagłówek i format tekstowy przed zapisem', P(env)._data[0][15] === 'notatki'
    && P(env)._formatRanges.some(f => f.col === 16 && f.row === 1 && f.f === '@'), J(P(env)._data[0]));
  check('dalsze w liniach „termin|treść"; bez terminu = do najbliższego czyszczenia (dzień rezerwacyjny); pusta odpada',
    cellOf(env, 1, 16) === 'nigdy|Ćwiczyć kaganiec\n2026-08-11|Zapoznawczy\n2026-08-04|RTG', J(cellOf(env, 1, 16)));
  check('kolumn odkleszczania nie trzeba było dokładać', P(env).getMaxColumns() === 16, P(env).getMaxColumns());
  const d = dogOf(env, 1);
  check('getData: wszystkie notatki po kolei, pierwsza też jako note / noteUntil (karty sprzed 1.6)',
    J(d.notes) === J([{text:'Uważać na ręce',until:'nigdy'},{text:'Ćwiczyć kaganiec',until:'nigdy'},
                      {text:'Zapoznawczy',until:'2026-08-11'},{text:'RTG',until:'2026-08-04'}])
    && d.note === 'Uważać na ręce' && d.noteUntil === 'nigdy', J(d.notes));
  check('termin z przeszłości = do najbliższego czyszczenia (jak jedyna notatka dotąd)',
    J(env.api.notesOf_({ notes:[{ text:'x', until:'2026-08-01' }] })) === J([{ text:'x', until:'2026-08-04' }]));
  check('notatka w jednej linii (kolumna trzyma notatkę w linii)', env.api.noteText_('a\nb\r\nc') === 'a b c');
  check('za dużo notatek — błąd', /najwyżej 6 notatek/.test(String(throws(() => save(env, 1, { notes:
    [1,2,3,4,5,6,7].map(i => ({ text:'n' + i, until:'nigdy' })) })))));
  check('...i nic nie zapisane', cellOf(env, 1, 10) === 'Uważać na ręce' && cellOf(env, 1, 16).split('\n').length === 3);
  save(env, 1, { notes: [] });
  check('pusta lista z karty 1.6 — wszystkie notatki znikają', cellOf(env, 1, 10) === '' && cellOf(env, 1, 14) === ''
    && cellOf(env, 1, 16) === '' && J(dogOf(env, 1).notes) === '[]');
  // ręcznie w arkuszu: linia bez terminu, „|" w treści, śmieci przed „|"
  check('odczyt kolumny wpisanej ręcznie', J(env.api.parseNotes_('kaganiec\n2026-08-09|RTG | ważne\nabc|def\n|bez\n\n')) === J([
    {text:'kaganiec',until:''}, {text:'RTG | ważne',until:'2026-08-09'}, {text:'abc|def',until:''}, {text:'bez',until:''}]));
})();

/* ---------- B92: nocne czyszczenie każdej notatki osobno ---------- */
(()=>{
  console.log('B92: nocne czyszczenie — każda notatka po swoim terminie, następna wchodzi na miejsce pierwszej');
  const env = build([
    {id:1, name:'Borys', note:'A', noteUntil:'2026-08-04', notes:'nigdy|B\n2026-08-06|C\n2026-08-03|D\nbez terminu', full:true},
    {id:2, name:'Luna', note:'Zostaje', noteUntil:'nigdy', full:true},
    {id:3, name:'Rex', note:'Znika', noteUntil:'2026-08-04', notes:'2026-08-01|też znika', full:true},
  ], { head: FULL_HEADERS, now: '2026-08-04T22:10:00+02:00' });       // po resecie: bieżący 2026-08-05
  env.api.endOfDay();
  check('pierwsza po terminie znika, „nigdy" wchodzi na jej miejsce', cellOf(env, 1, 10) === 'B' && cellOf(env, 1, 14) === 'nigdy',
    J([cellOf(env, 1, 10), cellOf(env, 1, 14)]));
  check('dalsze: zostaje tylko ta z terminem w przyszłości', cellOf(env, 1, 16) === '2026-08-06|C', J(cellOf(env, 1, 16)));
  check('pies z jedną notatką „nigdy" — bez zmian', cellOf(env, 2, 10) === 'Zostaje' && cellOf(env, 2, 16) === '');
  check('wszystkie po terminie — pusto', cellOf(env, 3, 10) === '' && cellOf(env, 3, 14) === '' && cellOf(env, 3, 16) === '');
  env.setNow('2026-08-06T22:10:00+02:00');
  env.api.endOfDay();
  check('kolejne noce: C dożywa swojego dnia, potem znika', cellOf(env, 1, 10) === 'B' && cellOf(env, 1, 16) === '', J(cellOf(env, 1, 16)));

  // czyjaś kolumna P (inny nagłówek) — czyszczenie jej nie dotyka, notatka / notatka_do jak dotąd
  const own = build([{id:1, name:'Borys', note:'A', noteUntil:'2026-08-04', notes:'cudze dane', full:true}],
    { head: OLD_HEADERS.concat(['grupa_psa', 'kaganiec']).concat(TICK_HEADS), now: '2026-08-04T22:10:00+02:00' });
  own.api.endOfDay();
  check('czyjaś kolumna w miejscu „notatki": nietknięta', cellOf(own, 1, 16) === 'cudze dane' && cellOf(own, 1, 10) === '');
  check('...i nie czyta się jako notatki', J(dogOf(own, 1).notes) === '[]');
})();

/* ---------- B93: karta sprzed 1.6 i zakładka bez kolumny ---------- */
(()=>{
  console.log('B93: karta sprzed 1.6 przysyła jedną notatkę — dalsze zostają; zakładka sprzed 1.6 działa jak dotąd');
  const env = build([{id:1, name:'Borys', note:'A', noteUntil:'nigdy', notes:'nigdy|B\n2026-08-09|C', full:true}], { head: FULL_HEADERS });
  save(env, 1, { note:'A2', noteUntil:'' });
  check('pierwsza poprawiona, dalsze bez zmian', cellOf(env, 1, 10) === 'A2' && cellOf(env, 1, 14) === '2026-08-04'
    && cellOf(env, 1, 16) === 'nigdy|B\n2026-08-09|C', J(P(env)._data[1]));
  check('getData: A2, B, C', J(dogOf(env, 1).notes.map(n => n.text)) === J(['A2','B','C']));
  save(env, 1, { note:'', noteUntil:'' });
  check('karta sprzed 1.6 kasuje pierwszą — dalsze zostają i są widoczne', cellOf(env, 1, 10) === ''
    && J(dogOf(env, 1).notes.map(n => n.text)) === J(['B','C']));

  // zakładka sprzed 1.3 (14 kolumn, getRange poza szerokość rzuca): odczyt i zapis jednej notatki bez dokładania kolumn
  const old = build([{id:1, name:'Borys', note:'Stara', noteUntil:'nigdy'}], { psy: { strictWidth: true } });
  check('getData na wąskiej zakładce: jedna notatka, bez odkleszczania', J(dogOf(old, 1).notes) === J([{text:'Stara',until:'nigdy'}])
    && dogOf(old, 1).tick === null);
  save(old, 1, { notes: [{ text:'Nowa', until:'nigdy' }], tick: { method:'' } });
  check('jedna notatka i puste odkleszczanie — bez dokładania kolumn', P(old).getMaxColumns() === 14 && cellOf(old, 1, 10) === 'Nowa',
    P(old).getMaxColumns());
  old.setNow('2026-08-04T22:10:00+02:00');
  old.api.endOfDay();
  check('nocne czyszczenie na wąskiej zakładce działa', cellOf(old, 1, 10) === 'Nowa');
})();

/* ---------- B94: czyjaś kolumna w miejscu „notatki" ---------- */
(()=>{
  console.log('B94: kolumna P zajęta przez czyjeś dane — wyraźny błąd przed zapisem, jedna notatka idzie');
  const head = OLD_HEADERS.concat(['grupa_psa', 'kaganiec']);
  const env = build([{id:1, name:'Borys', note:'A', noteUntil:'nigdy', notes:'cudze', full:true}], { head });
  const err = throws(() => save(env, 1, { name:'Borysek', notes: [{text:'A',until:'nigdy'},{text:'B',until:'nigdy'}] }));
  check('kilka notatek — błąd z numerem kolumny', /Kolumna 16 \(P\).*zajęta.*dalszych notatek nie zapisano/.test(String(err)), err);
  check('...zanim cokolwiek się zapisało (imię bez zmian), cudza kolumna nietknięta',
    cellOf(env, 1, 2) === 'Borys' && cellOf(env, 1, 16) === 'cudze' && P(env)._data[0][15] === 'kaganiec');
  save(env, 1, { name:'Borysek', notes: [{text:'Jedna',until:'nigdy'}] });
  check('jedna notatka — zapis idzie, cudza kolumna nietknięta', cellOf(env, 1, 2) === 'Borysek' && cellOf(env, 1, 10) === 'Jedna'
    && cellOf(env, 1, 16) === 'cudze');
  // bez nagłówka, ale z wpisami pod nim — też czyjaś
  const bare = build([{id:1, name:'Borys', notes:'kaganiec', full:true}], { head: OLD_HEADERS.concat(['grupa_psa', '']) });
  check('kolumna bez nagłówka z wpisami — też czyjaś', /Kolumna 16/.test(String(throws(() =>
    save(bare, 1, { notes: [{text:'A',until:'nigdy'},{text:'B',until:'nigdy'}] })))) && P(bare)._data[0][15] === '');
})();

/* ---------- B95: odkleszczanie — zapis z panelu ---------- */
(()=>{
  console.log('B95: odkleszczanie w edycji psa — metoda, okres, termin następnego');
  const env = build([{id:1, name:'Borys'}, {id:2, name:'Luna'}, {id:3, name:'Rex'}]);
  save(env, 1, { tick: { method:'Bravecto', n:3, u:'m', next:'2026-08-20' } });
  check('cztery kolumny z nagłówkami, format tekstowy przed zapisem', TICK_HEADS.every((h, i) => P(env)._data[0][16 + i] === h)
    && [17,18,19,20].every(c => P(env)._formatRanges.some(f => f.col === c && f.row === 1 && f.f === '@')), J(P(env)._data[0]));
  check('wiersz: metoda, „3m", termin, bez „ostatnio"', J(P(env)._data[1].slice(16, 20)) === J(['Bravecto','3m','2026-08-20','']),
    J(P(env)._data[1]));
  check('getData: tick', J(dogOf(env, 1).tick) === J({method:'Bravecto', n:3, u:'m', next:'2026-08-20', last:''}), J(dogOf(env, 1).tick));
  save(env, 2, { name:'Luna', tick: { method:'  bra  vecto ', n:12, u:'t', next:'' } });
  check('metoda w pisowni już używanej; pusty termin = dziś + okres (12 tyg.)', J(P(env)._data[2].slice(16, 20))
    === J(['Bravecto','12t','2026-10-27','']), J(P(env)._data[2].slice(16, 20)));
  save(env, 3, { name:'Rex', tick: { method:'Seresto', n:8, u:'m', next:'' } });
  check('miesiące: ten sam dzień miesiąca', P(env)._data[3][18] === '2027-04-04', P(env)._data[3][18]);
  [ [{ method:'X', n:0, u:'m' }, /od 1 do 12 miesięcy/], [{ method:'X', n:13, u:'m' }, /od 1 do 12 miesięcy/],
    [{ method:'X', n:53, u:'t' }, /od 1 do 52 tygodni/], [{ method:'X', n:2.5, u:'t' }, /od 1 do 52/],
    [{ method:'X', n:3, u:'d' }, /tygodnie albo miesiące/], [{ method:'X', n:3, u:'m', next:'2026-13-01' }, /Nieprawidłowa data/],
    [{ method:'X', n:3, u:'m', next:'2028-09-01' }, /dwa lata naprzód/], [{ method:'X', n:3, u:'m', next:'2025-07-01' }, /rok wstecz/],
  ].forEach(([t, re]) => {
    const e = throws(() => save(env, 1, { name:'Zmieniony', tick: t }));
    check('błąd: ' + J(t), re.test(String(e)) && cellOf(env, 1, 2) === 'Borys' && cellOf(env, 1, 17) === 'Bravecto', e);
  });
  check('miesiąc bez takiego dnia: ostatni dzień', env.api.addPeriod_('2026-01-31', 1, 'm') === '2026-02-28'
    && env.api.addPeriod_('2028-01-31', 1, 'm') === '2028-02-29' && env.api.addPeriod_('2026-11-30', 3, 'm') === '2027-02-28'
    && env.api.addPeriod_('2026-12-15', 1, 'm') === '2027-01-15');
  check('okres z arkusza: „3m", „12 T", śmieci', J(env.api.tickEvery_('3m')) === J({n:3,u:'m'}) && J(env.api.tickEvery_('12 T')) === J({n:12,u:'t'})
    && env.api.tickEvery_('3x') === null && env.api.tickEvery_('0m') === null && env.api.tickEvery_('13m') === null);
  // ręcznie popsute komórki — pies bez odkleszczania (bez przypomnień), aplikacja działa
  P(env)._data[1][17] = 'co kwartał';
  check('popsuty okres w arkuszu — tick null', dogOf(env, 1).tick === null);
})();

/* ---------- B96: odhaczenie zadania ---------- */
(()=>{
  console.log('B96: odhaczenie zadania „Odkleszczanie" — od dnia odhaczenia, raz, z cofnięciem tego samego dnia');
  const env = build([{id:1, name:'Borys', tick:'Bravecto', every:'3m', next:'2026-08-20'},
                     {id:2, name:'Luna', tick:'Advantix', every:'4t', next:'2026-08-02', last:'2026-07-05'}], { head: FULL_HEADERS });
  const row = id => J(P(env)._data[id].slice(16, 20));
  env.api.setTickDone(1, true, '2026-08-20');
  check('jeszcze nie termin — nic', row(1) === J(['Bravecto','3m','2026-08-20','']), row(1));
  const r = env.api.setTickDone(2, true, '2026-08-02');
  check('zaległe o 2 dni: termin od dnia odhaczenia (dziś + 4 tyg.), „ostatnio" = dziś', row(2) === J(['Advantix','4t','2026-09-01','2026-08-04']), row(2));
  check('odpowiedź: pies po zmianie', r.id === 2 && J(r.tick) === J({method:'Advantix', n:4, u:'t', next:'2026-09-01', last:'2026-08-04'}), J(r));
  env.api.setTickDone(2, true, '2026-08-02');
  check('powtórka (zaginiona odpowiedź) — niczego nie przesuwa drugi raz', row(2) === J(['Advantix','4t','2026-09-01','2026-08-04']), row(2));
  env.api.setTickDone(2, false, '2026-08-04');
  check('cofnięcie tego samego dnia — zadanie wraca jako dzisiejsze', row(2) === J(['Advantix','4t','2026-08-04','']), row(2));
  env.api.setTickDone(2, false, '2026-08-04');
  check('powtórka cofnięcia — nic', row(2) === J(['Advantix','4t','2026-08-04','']), row(2));
  env.api.setTickDone(2, true, '2026-08-01');
  check('termin z ekranu inny niż obecny (ktoś zmienił) — nic', row(2) === J(['Advantix','4t','2026-08-04','']), row(2));
  env.api.setTickDone(2, true);
  check('bez terminu z ekranu — odhacza (stara karta)', row(2) === J(['Advantix','4t','2026-09-01','2026-08-04']), row(2));
  env.setNow('2026-08-04T22:10:00+02:00');                          // po resecie: bieżący dzień 2026-08-05
  env.api.setTickDone(2, false, '2026-08-04');
  check('cofnięcie następnego dnia — nic (jak odhaczone zadanie po czyszczeniu)', row(2) === J(['Advantix','4t','2026-09-01','2026-08-04']), row(2));
  check('pies bez odkleszczania / nieistniejący — tick null, bez błędu', env.api.setTickDone(99, true).tick === null);
  // każde odhaczenie zmienia katalog psów — znacznik katalogu w pamięci podręcznej nowy (akcje nie wezmą starego)
  const gen = () => (env.cache.store[env.conf.CACHE_PREFIX + env.conf.CACHE_KEY.DOGS_GEN] || {}).v;
  env.api.getData();
  const g0 = gen();
  env.setNow('2026-09-01T10:00:00+02:00');
  env.api.setTickDone(2, true, '2026-09-01');
  check('odhaczenie unieważnia katalog w pamięci podręcznej', gen() && gen() !== g0, g0 + ' → ' + gen());
})();

/* ---------- B97: zmiana metody, wyczyszczenie, karta sprzed 1.6 ---------- */
(()=>{
  console.log('B97: zmiana metody nie zostawia niczego starego');
  const env = build([{id:1, name:'Borys', tick:'Bravecto', every:'3m', next:'2026-08-04', last:''},
                     {id:2, name:'Luna', tick:'Advantix', every:'4t', next:'2026-09-01', last:'2026-08-04'}], { head: FULL_HEADERS });
  const row = id => J(P(env)._data[id].slice(16, 20));
  save(env, 1, { tick: { method:'Simparica', n:1, u:'m', next:'2026-08-30' } });
  check('nowa metoda: wszystko nowe, termin z panelu', row(1) === J(['Simparica','1m','2026-08-30','']), row(1));
  save(env, 2, { name:'Luna', tick: { method:'Advantix', n:4, u:'t', next:'2026-09-10' } });
  check('ta sama metoda, poprawiony termin — „ostatnio" zostaje', row(2) === J(['Advantix','4t','2026-09-10','2026-08-04']), row(2));
  save(env, 2, { name:'Luna', tick: { method:'Advantix', n:5, u:'t', next:'2026-09-10' } });
  check('inny okres — nowy cykl, bez „ostatnio"', row(2) === J(['Advantix','5t','2026-09-10','']), row(2));
  save(env, 2, { name:'Luna', note:'x' });
  check('karta sprzed 1.6 (bez tick) — odkleszczanie bez zmian', row(2) === J(['Advantix','5t','2026-09-10','']), row(2));
  save(env, 2, { name:'Luna', tick: { method:'' } });
  check('bez metody — cztery puste komórki, tick null', row(2) === J(['','','','']) && dogOf(env, 2).tick === null, row(2));
  check('odhaczenie psa bez metody — nic', env.api.setTickDone(2, true).tick === null && row(2) === J(['','','','']));
  env.api.removeDog(1, TEST_PIN);
  check('usunięty pies — znika razem z wierszem', env.api.getData().dogs.every(d => d.id !== 1));
  // addDog z odkleszczaniem i notatkami (formularz ich nie ma, wywołanie — tak)
  env.api.addDog({ name:'Tosia', tick:{ method:'Simparica', n:1, u:'m', next:'' },
                   notes:[{text:'a',until:'nigdy'},{text:'b',until:'nigdy'}] }, TEST_PIN, 'dcare000001');
  const t = env.api.getData().dogs.filter(d => d.name === 'Tosia')[0];
  check('addDog: metoda w pisowni katalogu, termin = dziś + okres, notatki', t && J(t.tick) === J({method:'Simparica', n:1, u:'m', next:'2026-09-04', last:''})
    && J(t.notes.map(n => n.text)) === J(['a','b']), J(t));
})();

/* ---------- B98: czyjeś kolumny odkleszczania, zakładka bez nich ---------- */
(()=>{
  console.log('B98: kolumny Q–T zajęte albo ich brak');
  const head = OLD_HEADERS.concat(['grupa_psa', 'notatki', 'odkleszczanie', 'moje', '', '']);
  const env = build([{id:1, name:'Borys', tick:'x', every:'y', full:true}], { head });
  check('nie wszystkie nasze — pies bez odkleszczania', dogOf(env, 1).tick === null);
  // trzy nasze i czytelne, czwarta czyjaś — dalej nie nasze (cztery kolumny liczą się tylko razem)
  const three = build([{id:1, name:'Borys', tick:'Bravecto', every:'3m', next:'2026-08-20', last:'cudze', full:true}],
    { head: OLD_HEADERS.concat(['grupa_psa', 'notatki'], TICK_HEADS.slice(0, 3), ['moje']) });
  check('trzy kolumny nasze, czwarta czyjaś — bez odkleszczania', dogOf(three, 1).tick === null, J(dogOf(three, 1).tick));
  const err = throws(() => save(env, 1, { name:'Borysek', tick: { method:'Bravecto', n:3, u:'m', next:'' } }));
  check('zapis metody — błąd z kolumnami, przed zapisem', /Kolumny 17–20 \(Q–T\).*zajęte.*odkleszczania nie zapisano/.test(String(err))
    && cellOf(env, 1, 2) === 'Borys' && P(env)._data[0][17] === 'moje' && P(env)._data[0][18] === '', err);
  save(env, 1, { name:'Borysek', tick: { method:'' } });
  check('bez metody — cudzych komórek nie rusza', cellOf(env, 1, 2) === 'Borysek' && cellOf(env, 1, 17) === 'x' && cellOf(env, 1, 18) === 'y');
  check('odhaczenie — tick null, bez zapisu', env.api.setTickDone(1, true).tick === null && cellOf(env, 1, 17) === 'x');
  // migrate(): dokłada nasze, czyjejś nie nadpisuje
  const fresh = build([{id:1, name:'Borys'}]);
  fresh.api.migrate();
  check('migrate(): nagłówki P–T i format tekstowy', J(P(fresh)._data[0].slice(14, 20)) === J(['grupa_psa','notatki'].concat(TICK_HEADS))
    && [15,16,17,18,19,20].every(c => P(fresh)._formats[c] === '@'), J(P(fresh)._data[0]));
  const busy = build([{id:1, name:'Borys', tick:'x', every:'y', full:true}], { head });
  busy.api.migrate();
  check('migrate() przy zajętych Q–T — nagłówki bez zmian', P(busy)._data[0][17] === 'moje' && P(busy)._data[0][16] === 'odkleszczanie'
    && P(busy)._data[0][18] === '', J(P(busy)._data[0]));
  const set = makeContext({ props: { pin: TEST_PIN } });
  set.api.setup();
  check('setup(): pełny nagłówek, psy bez notatek i odkleszczania', J(set.sheets['Psy']._data[0].slice(15)) === J(['notatki'].concat(TICK_HEADS))
    && set.api.getData().dogs.every(d => d.tick === null && J(d.notes) === '[]'));
})();

/* ---------- B99: notatki i odkleszczanie w stanie startowym strony ---------- */
(()=>{
  console.log('B99: stan startowy i odczyt listy niosą notatki i odkleszczanie');
  const env = build([{id:1, name:'Borys', note:'A', noteUntil:'nigdy', notes:'nigdy|B', tick:'Bravecto', every:'3m', next:'2026-08-09'}],
    { head: FULL_HEADERS });
  const boot = JSON.parse(env.api.bootJson_());
  const d = boot.dogs.filter(x => x.id === 1)[0];
  check('bootJson_: notatki i tick', d && J(d.notes.map(n => n.text)) === J(['A','B']) && d.tick && d.tick.next === '2026-08-09', J(d));
  check('nowy prefiks pamięci podręcznej (kształt wpisów)', env.conf.CACHE_PREFIX === 'g13c2:');
})();

if(failures){ console.log('\n' + failures + ' FAIL'); process.exit(1); }
console.log('\nWszystko zielone.');
process.exit(0);

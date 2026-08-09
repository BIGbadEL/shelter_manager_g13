// B1-B6: backend na atrapie arkusza — czyszczenie notatek z terminem,
// data archiwizacji przy dowolnej godzinie resetu, ustawianie godziny.
const { makeContext } = require('./backend-harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const DOG_HEADERS = ['id','imie','identyfikator','boks','trudnosc','status','kto','godzina',
  'ostatni_spacer','notatka','spacery','kto1','godzina1','notatka_do'];
const HIST_HEADERS = ['data','pies','kto','godzina'];
const TASK_HEADERS = ['id','tresc','data','status'];

/** [id, imie, ..., notatka, spacery, kto1, godzina1, notatka_do] */
function dogRow(o){
  return [o.id, o.name||'', o.ident||'', o.box||'', o.dif||'easy', o.status||'free',
          o.who||'', o.time||'', o.lastWalk||'', o.note||'', o.walks||1,
          o.who1||'', o.time1||'', o.noteUntil||''];
}
function build(dogs, opts){
  return makeContext(Object.assign({
    sheets: [
      { name:'Psy',      rows: [DOG_HEADERS, ...dogs.map(dogRow)] },
      { name:'Historia', rows: [HIST_HEADERS] },
      { name:'Zadania',  rows: [TASK_HEADERS] },
    ],
  }, opts||{}));
}
const noteOf = (env,i)=>env.sheets['Psy']._data[i][9];
const untilOf = (env,i)=>env.sheets['Psy']._data[i][13];

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
  const env = build([{id:1, name:'Borys'}], {props:{}, now:'2026-08-05T10:00:00+02:00'});
  const PIN = env.conf.PIN;   // z Config.gs — testy przeżywają zmianę PIN-u przed wdrożeniem

  env.api.updateDog(1, {name:'Borys', note:'Coś', noteUntil:'2026-08-01', dif:'easy', walks:1}, PIN);
  check('data z przeszłości odrzucona', untilOf(env,1)==='', JSON.stringify(untilOf(env,1)));

  env.api.updateDog(1, {name:'Borys', note:'', noteUntil:'2026-08-20', dif:'easy', walks:1}, PIN);
  check('data bez notatki odrzucona', untilOf(env,1)==='', JSON.stringify(untilOf(env,1)));

  env.api.updateDog(1, {name:'Borys', note:'Spacer', noteUntil:'2026-08-20', dif:'easy', walks:1}, PIN);
  check('poprawna data zapisana', untilOf(env,1)==='2026-08-20', JSON.stringify(untilOf(env,1)));
  check('notatka trafiła do getData',
    env.api.readDogs_()[0].noteUntil==='2026-08-20', JSON.stringify(env.api.readDogs_()[0]));

  let threw = false;
  try{ env.api.updateDog(1, {name:'X'}, PIN + 'x'); }catch(e){ threw = true; }
  check('zły PIN odrzucony', threw);
})();

/* ---------- B5: data archiwizacji przy resecie nad ranem ---------- */
(()=>{
  console.log('B5: reset przed południem zamyka dzień poprzedni');
  const late = build([{id:1, name:'Borys', status:'walked', who:'Ala', time:'18:00'}],
                     {now:'2026-08-05T22:10:00+02:00'});
  late.api.endOfDay();
  check('reset o 22:00 -> data dzisiejsza',
    late.sheets['Historia']._data[1][0]==='2026-08-05', JSON.stringify(late.sheets['Historia']._data[1]));

  const early = build([{id:1, name:'Borys', status:'walked', who:'Ala', time:'18:00'}],
                      {now:'2026-08-06T03:00:00+02:00'});
  early.api.endOfDay();
  check('reset o 3:00 -> data wczorajsza',
    early.sheets['Historia']._data[1][0]==='2026-08-05', JSON.stringify(early.sheets['Historia']._data[1]));
  check('ostatni_spacer też wczorajszy',
    early.sheets['Psy']._data[1][8]==='2026-08-05', JSON.stringify(early.sheets['Psy']._data[1][8]));
})();

/* ---------- B6: godzina czyszczenia i wyzwalacz ---------- */
(()=>{
  console.log('B6: setResetHour przekłada wyzwalacz');
  const env = build([{id:1, name:'Borys'}]);
  const PIN = env.conf.PIN;
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
    let threw=false;
    try{ env.api.setResetHour(bad, PIN); }catch(e){ threw=true; }
    check('odrzucona godzina '+bad, threw);
  });
  check('po odrzuceniach nadal 6', env.api.resetHour_()===6);

  let threw=false;
  try{ env.api.setResetHour(8, PIN + 'x'); }catch(e){ threw=true; }
  check('bez PIN-u ani rusz', threw && env.api.resetHour_()===6);
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

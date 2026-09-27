// S32-S38: opcjonalny termin ważności notatki przy psie.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }

const TODAY = '2026-08-05';                    // środa
const seed = (dogs)=>({dogs, tasks:[], today:TODAY, resetHour:22});
const withNote = (o)=>dogFree(Object.assign({id:1,name:'Borys'}, o));

/* ---------- S32: odznaka terminu na kafelku ---------- */
(()=>{
  console.log('S32: notatka z terminem i bez');
  const app = buildApp();
  app.seed(seed([withNote({note:'Zdjęcia o 12:00'})]));
  check('notatka widoczna', /📌 Zdjęcia o 12:00/.test(app.html()));
  check('bez terminu brak odznaki', !/class="until"/.test(app.html()), app.html().match(/<div class="note">.*?<\/div>/s));

  const app2 = buildApp();
  app2.seed(seed([withNote({note:'Spacer zapoznawczy', noteUntil:'2026-08-09'})]));
  check('z terminem jest odznaka', /class="until"/.test(app2.html()));
  check('odznaka mówi "do niedzieli"', /do niedzieli/.test(app2.html()),
    (app2.html().match(/class="until">([^<]*)/)||[])[1]);
  check('bez błędów', app.errors.length===0 && app2.errors.length===0);
})();

/* ---------- S33: etykiety terminu ---------- */
(()=>{
  console.log('S33: skróty terminów');
  const cases = [
    // termin = bieżący dzień to dokładnie notatka „bez terminu" (serwer tak ją zapisuje,
    // patrz noteUntil_) — znika przy dzisiejszym czyszczeniu, więc bez odznaki
    ['2026-08-05',undefined],
    ['2026-08-06','do jutra'],
    ['2026-08-08','do soboty'],
    ['2026-08-09','do niedzieli'],
    ['2026-08-20','do 20.08'],
    ['2026-12-01','do 01.12'],
  ];
  cases.forEach(([iso, want])=>{
    const app = buildApp();
    app.seed(seed([withNote({note:'X', noteUntil:iso})]));
    const got = (app.html().match(/class="until">([^<]*)/)||[])[1];
    check(`${iso} -> "${want}"`, got===want, 'dostałem: '+got);
  });
})();

/* ---------- S34: pole daty w formularzu edycji ---------- */
(()=>{
  console.log('S34: pole terminu w edycji');
  const app = buildApp();
  app.seed(seed([withNote({note:'Spacer zapoznawczy', noteUntil:'2026-08-09'})]));
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="1"]');

  const el = app.window.document.querySelector('[data-ef="noteUntil"]');
  check('pole istnieje', !!el);
  check('typ date', el && el.getAttribute('type')==='date', el && el.getAttribute('type'));
  check('wypełnione aktualnym terminem', el && el.value==='2026-08-09', el && el.value);
  check('min = dzisiaj', el && el.getAttribute('min')===TODAY, el && el.getAttribute('min'));
  check('jest podpowiedź o domyślnym zachowaniu', /znika przy najbliższym czyszczeniu/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S35: zapis notatki z terminem ---------- */
(()=>{
  console.log('S35: zapis wysyła termin');
  const app = buildApp();
  app.seed(seed([withNote({})]));
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="1"]');
  app.type('[data-ef="note"]', 'Spacer zapoznawczy');
  app.type('[data-ef="noteUntil"]', '2026-08-09');
  app.click('[data-act="editSave"][data-id="1"]');

  check('poszedł updateDog', app.shipped.includes('updateDog'), app.shipped.join(','));
  const args = app.pending[0].args;
  check('termin w polach', args[0]===1 && args[1].noteUntil==='2026-08-09', JSON.stringify(args[1]));
  check('notatka w polach', args[1].note==='Spacer zapoznawczy');
  check('optymistycznie widać odznakę', /do niedzieli/.test(app.html()), app.html().slice(0,200));

  app.respondNext(seed([withNote({note:'Spacer zapoznawczy', noteUntil:'2026-08-09'})]));
  check('po serwerze bez zmian', /do niedzieli/.test(app.html()));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S36: data z przeszłości blokowana ---------- */
(()=>{
  console.log('S36: data z przeszłości nie przechodzi');
  const app = buildApp();
  app.seed(seed([withNote({})]));
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="1"]');
  app.type('[data-ef="note"]', 'Coś');
  app.type('[data-ef="noteUntil"]', '2026-08-01');
  app.click('[data-act="editSave"][data-id="1"]');

  check('nic nie wysłano', !app.shipped.includes('updateDog'), app.shipped.join(','));
  check('pokazany komunikat', /przeszłości/.test(app.window.document.getElementById('toast').textContent),
    app.window.document.getElementById('toast').textContent);
  check('formularz nadal otwarty', !!app.window.document.querySelector('[data-ef="noteUntil"]'));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S37: data bez notatki jest odrzucana po cichu ---------- */
(()=>{
  console.log('S37: data bez notatki nic nie znaczy');
  const app = buildApp();
  app.seed(seed([withNote({})]));
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="1"]');
  app.type('[data-ef="note"]', '');
  app.type('[data-ef="noteUntil"]', '2026-08-20');
  app.click('[data-act="editSave"][data-id="1"]');

  check('zapis przeszedł', app.shipped.includes('updateDog'), app.shipped.join(','));
  check('termin wyzerowany', app.pending[0].args[1].noteUntil==='', JSON.stringify(app.pending[0].args[1]));
  app.respondNext(seed([withNote({})]));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

/* ---------- S38: czyszczenie notatki usuwa też termin ---------- */
(()=>{
  console.log('S38: skasowanie notatki kasuje termin');
  const app = buildApp();
  app.seed(seed([withNote({note:'Spacer zapoznawczy', noteUntil:'2026-08-09'})]));
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="1"]');
  app.type('[data-ef="note"]', '');
  app.click('[data-act="editSave"][data-id="1"]');

  check('termin poszedł pusty', app.pending[0].args[1].noteUntil==='', JSON.stringify(app.pending[0].args[1]));
  app.respondNext(seed([withNote({})]));
  check('odznaka zniknęła', !/class="until"/.test(app.html()));
  check('bez błędów', app.errors.length===0, app.errors.join(' | '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

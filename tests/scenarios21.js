// S144: trudność psa (1.4, decyzja właściciela) — żółty „Wymaga wprowadzenia", czerwony „Tylko wyznaczone osoby"
// jako pasek pod numerem na pełnym kafelku (jak notatka, w kolorze trudności), zielony — sam kolor kafelka z lewej.
// Dawnej plakietki „● wymagający" w linijce imienia ani legendy kolorów nad listą nie ma. Te same nazwy
// w formularzach trybu edycji.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const D = '2026-10-13';
const DATA = {
  dogs: [
    dogFree({id:1, name:'Azor', dif:'easy'}),
    dogFree({id:2, name:'Bari', dif:'med', walks:2}),
    dogFree({id:3, name:'Cezar', dif:'hard', note:'Tylko w kagańcu', noteUntil:'nigdy'}),
    dogFree({id:4, name:'Dino', dif:'med', team:'G7'}),
  ],
  // Bari 2/2 w grupie z Azorem — kafelek odłączony Bariego
  slots: [
    {date:D, dogId:1, slot:1, status:'reserved', who:'Ola', time:'', group:1},
    {date:D, dogId:2, slot:2, status:'reserved', who:'Ola', time:'', group:1},
  ],
  tasks: [], today: D, businessDate: D, resetHour: 19, env: 'prod',
};
const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

function S144(){
  console.log('S144: trudność — pasek „Wymaga wprowadzenia" / „Tylko wyznaczone osoby", zielony bez napisu');
  const app = buildApp();
  app.seed(DATA);
  const doc = app.window.document;
  const full = id => doc.querySelector(`li.dog[data-dog="${id}"]:not(.detached)`);
  const notes = li => li ? [...li.querySelectorAll('.difnote')] : [];

  check('dawnej plakietki trudności („● wymagający") nie ma nigdzie', !doc.querySelector('#view .dif'));
  check('łatwy (zielony): bez napisu, tylko kolor kafelka z lewej', notes(full(1)).length === 0
    && /#3f9e57/.test(full(1).getAttribute('style')), full(1) && full(1).getAttribute('style'));
  check('żółty: „Wymaga wprowadzenia" — raz na kafelku psa na dwa spacery', notes(full(2)).length === 1
    && txt(notes(full(2))[0]) === 'Wymaga wprowadzenia', txt(full(2)));
  check('czerwony: „Tylko wyznaczone osoby"', notes(full(3)).length === 1 && txt(notes(full(3))[0]) === 'Tylko wyznaczone osoby', txt(full(3)));
  const kids = [...full(3).children].map(c => c.className);
  check('pasek trudności nad notatką', kids.indexOf('difnote') >= 0 && kids.indexOf('difnote') < kids.indexOf('note'), kids.join(' '));
  check('napis w ciemniejszym odcieniu koloru trudności, tło blade', /color:#a8321f/.test(notes(full(3))[0].getAttribute('style'))
    && /background:#cf4a3a1f/.test(notes(full(3))[0].getAttribute('style')), notes(full(3))[0].getAttribute('style'));
  const det = doc.querySelector('li.dog.detached[data-dog="2"]');
  check('kafelek odłączony (spacer w grupie, jeden wiersz) — bez paska, jak bez numeru i notatki', !!det && notes(det).length === 0,
    det ? det.outerHTML.slice(0, 200) : '(brak kafelka odłączonego)');
  const dino = doc.querySelector('ul.others-list li.dog[data-dog="4"]');
  check('lista innych grup — ten sam pasek', !!dino && txt(notes(dino)[0]) === 'Wymaga wprowadzenia', txt(dino));
  check('nad listą bez legendy kolorów — mówią paski (decyzja właściciela)', !doc.querySelector('.diflegend')
    && !/wymagający/.test(doc.getElementById('view').textContent));

  app.window.__setAdmin('1234');
  const cat = id => doc.querySelector(`ul[data-catalog] li.dog[data-dog="${id}"]`);
  check('katalog: pasek przy żółtym i czerwonym, przy zielonym nic', notes(cat(1)).length === 0
    && txt(notes(cat(2))[0]) === 'Wymaga wprowadzenia' && txt(notes(cat(3))[0]) === 'Tylko wyznaczone osoby');
  check('katalog: bez dawnej plakietki', !doc.querySelector('ul[data-catalog] .dif'));
  const opts = sel => [...doc.querySelectorAll(sel + ' option')].map(o => o.value + ':' + txt(o)).join('|');
  const want = 'easy:łatwy|med:wymaga wprowadzenia|hard:tylko wyznaczone osoby';
  check('„Dodaj psa": te same nazwy trudności', opts('#newDif') === want, opts('#newDif'));
  app.click('[data-act="edit"][data-id="3"]');
  check('edycja psa: te same nazwy, wybrana jego trudność', opts('[data-ef="dif"]') === want
    && doc.querySelector('[data-ef="dif"]').value === 'hard', opts('[data-ef="dif"]'));
  check('bez błędów skryptu', app.errors.length === 0, app.errors.join(' | '));
}

S144();
console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

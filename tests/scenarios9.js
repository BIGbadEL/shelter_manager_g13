// S49-S52: pasek „środowisko testowe". Najważniejszy jest KIERUNEK flagi:
// pasek gaśnie wyłącznie wtedy, gdy serwer wyraźnie powie `prod`.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const bar     = app => app.window.document.getElementById('envbar');
const visible = app => !bar(app).classList.contains('hidden');
const data    = env => Object.assign({dogs:[dogFree()], tasks:[], today:'2026-09-22'},
                                     env === undefined ? {} : {env});

/* ---------- S49: produkcja bez paska ---------- */
(()=>{
  console.log('S49: produkcja wygląda normalnie');
  const app = buildApp();
  app.seed(data('prod'));
  check('pasek schowany', !visible(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S50: środowisko testowe z paskiem ---------- */
(()=>{
  console.log('S50: środowisko testowe jest oznaczone');
  const app = buildApp();
  app.seed(data('test'));
  check('pasek widoczny', visible(app));
  check('mówi, że to test', /Środowisko testowe/i.test(bar(app).textContent), bar(app).textContent);
  check('mówi, co z tego wynika', /nie dotyczą prawdziwych psów/i.test(bar(app).textContent));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S51: brak deklaracji = nie produkcja ---------- */
(()=>{
  console.log('S51: nieoznaczony projekt traktujemy jak testowy');
  // świeża kopia arkusza nie ma własnych właściwości skryptu — i to jest
  // dokładnie ten przypadek, w którym pomyłka byłaby najgroźniejsza
  const app = buildApp();
  app.seed(data(''));
  check('pusta wartość: pasek widoczny', visible(app));

  const old = buildApp();
  old.seed(data(undefined));          // starszy serwer, bez pola env w odpowiedzi
  check('brak pola env: pasek widoczny', visible(old));

  const other = buildApp();
  other.seed(data('staging'));
  check('inna wartość niż prod: pasek widoczny', visible(other));
  check('bez błędów', app.errors.length===0 && old.errors.length===0, app.errors.join('; '));
})();

/* ---------- S52: żadnego mignięcia na produkcji ---------- */
(()=>{
  console.log('S52: pasek nie miga przed pierwszą odpowiedzią serwera');
  const app = buildApp();
  check('przed danymi pasek schowany', !visible(app));     // gdyby migał, na produkcji przestano by go widzieć
  app.seed(data('prod'));
  check('po danych z produkcji nadal schowany', !visible(app));

  // ...a kolejne odświeżenia nie mogą go zapalić
  app.window.document.dispatchEvent(new app.window.Event('visibilitychange'));
  const job = app.pending[app.pending.length-1];
  check('poszło odświeżenie', job && job.fn==='getData', app.pending.map(p=>p.fn).join(','));
  app.respondNext(data('prod'));
  check('po odświeżeniu nadal schowany', !visible(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

// S141-S142: „Co nowego" (1.3.1). Numer wersji przy „Spacery" to przycisk do listy zmian (najnowsza na górze,
// po ludzku, także zmiany w panelu prowadzącej); po aktualizacji raz na telefon pasek „Nowa wersja".
// Kolejność wpisów i wersję z package.json sprawdza też tooling.js (T5, T6) — bez przeglądarki.
const { buildApp, dogFree, ROOT } = require('./harness');
const fs = require('fs'), path = require('path');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const D = '2026-10-09';
const DATA = { dogs: [dogFree({id:1, name:'Azor'}), dogFree({id:2, name:'Bari'})], slots: [], tasks: [],
  today: D, businessDate: D, resetHour: 18, env: 'prod' };
const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version.replace(/\.0$/, '');
const URL = 'https://g13.test/';
const doc    = app => app.window.document;
const hidden = (app, id) => doc(app).getElementById(id).classList.contains('hidden');
const txt    = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '(brak)';
const seen   = app => app.window.localStorage.getItem('g13seen');
/** Nagłówek wersji jak go widać: „Wersja 1.3 9 października 2026" (części stoją obok siebie w osobnych elementach). */
const head   = h => [...h.childNodes].map(n => n.textContent.trim()).filter(Boolean).join(' ');
function start(opts){ const app = buildApp(opts); app.seed(DATA); return app; }

/* ---------- S141: przycisk przy „Spacery" i lista zmian ---------- */
function S141(){
  console.log('S141: „v' + VER + ' · Co nowego?" otwiera listę zmian — najnowsza na górze, z panelem prowadzącej; „Zamknij"');
  const app = start();
  const order = JSON.stringify(app.window.__order());
  check('przycisk przy nazwie: numer wersji z package.json i „Co nowego?"', txt(doc(app).getElementById('verBtn')) === 'v' + VER + ' · Co nowego?',
    txt(doc(app).getElementById('verBtn')));
  check('lista zmian zamknięta na starcie', hidden(app, 'whatsNew'));
  const calls = app.shipped.length;
  app.click('#verBtn');
  check('stuknięcie otwiera listę na cały ekran (strona pod spodem się nie przewija)', !hidden(app, 'whatsNew')
    && doc(app).body.classList.contains('wn-open'));
  const vers = [...doc(app).querySelectorAll('#wnList .wn-ver h3')].map(head);
  check('najnowsza na górze, oznaczona „nowa": ' + vers[0], vers[0] === 'Wersja ' + VER + ' nowa', vers[0]);
  check('...potem starsze, aż do 1.0', vers.length >= 7 && /^Wersja 1\.3 9 października 2026$/.test(vers[1]) && /^Wersja 1\.0 /.test(vers[vers.length - 1]),
    JSON.stringify(vers));
  check('tylko najnowsza ma „nowa"', doc(app).querySelectorAll('#wnList .wn-new').length === 1);
  const sec = v => [...doc(app).querySelectorAll('#wnList .wn-ver')].filter(s => head(s.querySelector('h3')).startsWith('Wersja ' + v + ' '))[0];
  check('zmiany w panelu prowadzącej osobno, pod „W panelu prowadzącej" (1.3)', txt(sec('1.3').querySelector('.wn-admin')) === 'W panelu prowadzącej'
    && sec('1.3').querySelectorAll('ul').length === 2 && /grupę/.test(txt(sec('1.3').querySelectorAll('ul')[1])));
  check('wersja bez zmian w panelu — bez tej linijki (1.1.1)', !sec('1.1.1').querySelector('.wn-admin') && sec('1.1.1').querySelectorAll('li').length === 3);
  check('otwarcie nie pyta serwera i nie rusza listy dnia', app.shipped.length === calls && JSON.stringify(app.window.__order()) === order);

  // odświeżenie co 15 s pod spodem nie zamyka listy zmian
  app.window.eval('refresh()');
  const i = app.pending.findIndex(p => p.fn === 'getData');
  app.pending.splice(i, 1)[0].ok(Object.assign({}, DATA, { dogs: DATA.dogs.concat([dogFree({id:3, name:'Cezar'})]) }));
  check('odświeżenie listy pod spodem nie zamyka „Co nowego"', !hidden(app, 'whatsNew') && app.window.__order().length === 3);
  app.click('#wnClose');
  check('„Zamknij" — z powrotem lista, strona znowu się przewija', hidden(app, 'whatsNew') && !doc(app).body.classList.contains('wn-open'));
  app.click('#verBtn');
  check('drugie otwarcie — ta sama lista od góry', !hidden(app, 'whatsNew') && doc(app).querySelectorAll('#wnList .wn-ver').length === vers.length);
  check('bez błędów skryptu', app.errors.length === 0, app.errors.join(' | '));
}

/* ---------- S142: pasek „Nowa wersja" raz na telefon ---------- */
function S142(){
  console.log('S142: pasek „Nowa wersja" — raz na telefon, do „Zobacz" albo ✕; bez pamięci przeglądarki go nie ma');
  const a = start({ url: URL });
  check('telefon, który tej wersji nie widział: pasek „Nowa wersja ' + VER + '"', !hidden(a, 'wnBanner')
    && txt(doc(a).getElementById('wnBanner')).startsWith('✨ Nowa wersja ' + VER + ' — zobacz, co się zmieniło'), txt(doc(a).getElementById('wnBanner')));
  a.click('#wnDismiss');
  check('✕ chowa pasek, listy nie otwiera, telefon zapamiętuje wersję', hidden(a, 'wnBanner') && hidden(a, 'whatsNew') && seen(a) === VER, seen(a));

  const b = start({ url: URL, storage: { g13seen: seen(a) } });
  check('ponowne otwarcie aplikacji po ✕ — bez paska', hidden(b, 'wnBanner'));
  b.click('#verBtn');
  check('...a lista zmian dalej pod przyciskiem', !hidden(b, 'whatsNew'));

  const c = start({ url: URL, storage: { g13seen: '1.3' } });
  check('telefon, który widział poprzednią wersję — pasek wraca', !hidden(c, 'wnBanner'));
  c.click('#wnSee');
  check('„Zobacz" otwiera listę zmian i chowa pasek na dobre', !hidden(c, 'whatsNew') && hidden(c, 'wnBanner') && seen(c) === VER, seen(c));

  const d = start({ url: URL });
  d.click('#verBtn');
  check('otwarcie listy przyciskiem przy nazwie też chowa pasek', hidden(d, 'wnBanner') && seen(d) === VER);

  // bez pamięci przeglądarki (tryb prywatny, zablokowane dane strony) pasek wisiałby przy każdym otwarciu
  const e = start();
  check('bez pamięci przeglądarki — bez paska', hidden(e, 'wnBanner'));
  e.click('#verBtn');
  check('...a przycisk działa', !hidden(e, 'whatsNew'));
  check('bez błędów skryptu', [a, b, c, d, e].every(x => x.errors.length === 0), [a, b, c, d, e].map(x => x.errors.join(',')).join(' | '));
}

S141();
S142();
console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

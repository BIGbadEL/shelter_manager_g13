// T1-T3: konfiguracja wdrożeń. Najgroźniejsza pomyłka, jaką da się tu zrobić,
// to wysłanie czegoś na złe środowisko — np. zapomniany `-P .clasp.test.json`
// w jednej z dwóch części komendy testowej. Pilnujemy, żeby komendy testowe
// nie miały jak dotknąć produkcji, a produkcyjne testu.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;

let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

/** Wszystkie wywołania clasp w komendzie złożonej z `a && b && c`. */
const claspCalls = cmd => String(cmd || '').split('&&').map(s => s.trim()).filter(s => /^clasp\b/.test(s));
const redeployId = cmd => { const m = String(cmd || '').match(/redeploy\s+(\S+)/); return m ? m[1] : null; };
const toTest     = call => /\s-P \.clasp\.test\.json(\s|$)/.test(call);

/* ---------- T1: komendy testowe nie dotykają produkcji ---------- */
console.log('T1: każda komenda :test idzie wyłącznie do projektu testowego');
Object.keys(S).filter(k => k.endsWith(':test') && k !== 'perf:test').forEach(k => {   // perf:test bez clasp — T7
  const calls = claspCalls(S[k]);
  check(k + ': woła clasp', calls.length > 0, S[k]);
  check(k + ': KAŻDE wywołanie clasp ma -P .clasp.test.json', calls.every(toTest), S[k]);
});

/* ---------- T2: komendy produkcyjne nie dotykają testu ---------- */
console.log('T2: komendy bez :test idą wyłącznie do produkcji');
Object.keys(S).filter(k => !k.endsWith(':test') && claspCalls(S[k]).length).forEach(k => {
  check(k + ': bez przełącznika projektu', claspCalls(S[k]).every(c => !/\s-P\s/.test(c)), S[k]);
});

/* ---------- T3: same wdrożenia ---------- */
console.log('T3: wdrożenia — jawne środowisko, testy przed wysyłką, różne cele');
check('jest deploy:prod', !!S['deploy:prod']);
check('jest deploy:test', !!S['deploy:test']);
check('nie ma dwuznacznego „deploy" bez nazwy środowiska', !S.deploy, S.deploy);
['deploy:prod', 'deploy:test'].forEach(k => {
  check(k + ': najpierw testy, dopiero potem wysyłka', /^npm test\s*&&/.test(S[k] || ''), S[k]);
  check(k + ': identyfikator wdrożenia wpisany na stałe', /^AKfyc/.test(redeployId(S[k]) || ''), S[k]);
});
check('produkcja i test to dwa różne wdrożenia',
  redeployId(S['deploy:prod']) !== redeployId(S['deploy:test']));

/* ---------- T4: wdrożenie od razu otwiera aplikację ---------- */
// Pierwsze otwarcie wersji z datami przenosi stan dnia ze starych kolumn i datuje go
// dniem, który wtedy trwa — ma się to stać w chwili wdrożenia, nie przy nocnym czyszczeniu.
console.log('T4: po wdrożeniu aplikacja otwiera się sama — to samo wdrożenie, które właśnie wysłano');
const warmupId = cmd => { const m = String(cmd || '').match(/warmup\.js\s+(\S+)/); return m ? m[1] : null; };
['deploy:prod', 'deploy:test'].forEach(k => {
  const steps = String(S[k] || '').split('&&').map(s => s.trim());
  check(k + ': ostatni krok to otwarcie aplikacji', /^node scripts\/warmup\.js\s/.test(steps[steps.length-1] || ''), S[k]);
  check(k + ': otwiera to samo wdrożenie', !!warmupId(S[k]) && warmupId(S[k])===redeployId(S[k]), S[k]);
});
check('skrypt otwierający istnieje', fs.existsSync(path.join(ROOT, 'scripts', 'warmup.js')));
check('...i nie jedzie do Apps Script', !/scripts/.test(fs.readFileSync(path.join(ROOT, '.claspignore'), 'utf8')
  .split('\n').filter(l => l.startsWith('!')).join('\n')));

/* ---------- T5: numer wersji przy nazwie aplikacji ---------- */
console.log('T5: numer wersji przy „Spacery" (Index.html) = version w package.json (1.3.0 → v1.3, 1.2.1 → v1.2.1)');
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const verShown = String(ver).replace(/\.0$/, '');
const shown = (fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8').match(/<span class="vernum">v([^<]*)<\/span>/) || [])[1];
check('wersja na stronie = package.json', !!shown && shown === verShown, shown + ' / ' + ver);

/* ---------- T6: „Co nowego" (1.4) ---------- */
console.log('T6: „Co nowego" (WHATS_NEW w Script.html) — najnowsza na górze, pierwsza = package.json, każda wydana z datą');
const wnBlock = (fs.readFileSync(path.join(ROOT, 'Script.html'), 'utf8').match(/const WHATS_NEW = \[([\s\S]*?)\r?\n  \];/) || [])[1] || '';
const wn = [...wnBlock.matchAll(/\{ v: '([^']*)', date: '([^']*)', items: \[/g)].map(m => ({ v: m[1], date: m[2] }));
const verKey = v => v.split('.').concat(['0', '0']).slice(0, 3).map(n => String(Number(n)).padStart(4, '0')).join('.');
check('wpisy są (każdy: v, date, items)', wn.length >= 7, wn.length);
check('pierwszy wpis = wersja z package.json', !!wn[0] && wn[0].v === verShown, (wn[0] || {}).v + ' / ' + verShown);
check('najnowsza na górze, bez powtórek', wn.every((n, i) => i === 0 || verKey(wn[i - 1].v) > verKey(n.v)), wn.map(n => n.v).join(' '));
check('każda wersja poza najnowszą ma datę', wn.slice(1).every(n => n.date), wn.filter(n => !n.date).map(n => n.v).join(' '));

/* ---------- T7: pomiar otwierania strony (test wydania, RELEASE.md) ---------- */
// Sonda otwiera stronę 120 razy — na produkcji to ruch na koncie wolontariuszy i szum w jej Wykonaniach.
console.log('T7: perf:test mierzy wyłącznie test; sonda czyta stan startowy ze strony Apps Script');
const perfId = cmd => { const m = String(cmd || '').match(/perf\.js\s+(\S+)/); return m ? m[1] : null; };
check('jest perf:test', !!S['perf:test']);
check('perf:test mierzy wdrożenie testowe', !!perfId(S['perf:test']) && perfId(S['perf:test']) === redeployId(S['deploy:test']), S['perf:test']);
check('żadna komenda nie mierzy produkcji', Object.keys(S).every(k => perfId(S[k]) !== redeployId(S['deploy:prod'])));
check('skrypt pomiaru istnieje', fs.existsSync(path.join(ROOT, 'scripts', 'perf.js')));
const perf = require(path.join(ROOT, 'scripts', 'perf.js'));
// Kawałki prawdziwej strony testu (13.10.2026): nasz HTML siedzi w napisie JS zapisanym dwa razy.
const pageOf = boot => String.raw`<html>...\x3cspan class\x3d\\\x22vernum\\\x22\x3ev1.4\x3c\\\/span\x3e · Co nowego?\x3c\\\/button\x3e` +
  String.raw`\x3cscript type\x3d\\\x22application\/json\\\x22 id\x3d\\\x22boot\\\x22\x3e` + boot + String.raw`\x3c\\\/script\x3e\\n\\n` +
  String.raw`\x3cscript type\x3d\\\x22application\/json\\\x22 id\x3d\\\x22served\\\x22\x3e1791903724116\x3c\\\/script\x3e\\n\\n\x3cscript\x3e`;
const pCached = perf.parsePage(pageOf(String.raw`\x7b\\\x22businessDate\\\x22:\\\x222026-10-13\\\x22,\\\x22mailSubject\\\x22:\\\x22Lista spacerowa G13 z \x5bDATA\x5d\\\x22,\\\x22cached\\\x22:true\x7d`));
check('strona aplikacji rozpoznana', pCached.app);
check('stan startowy z pamięci: cached', !!pCached.boot && pCached.boot.cached === true && pCached.boot.mailSubject === 'Lista spacerowa G13 z [DATA]', JSON.stringify(pCached.boot));
check('served z serwera', pCached.served === 1791903724116, pCached.served);
const pSheet = perf.parsePage(pageOf(String.raw`\x7b\\\x22businessDate\\\x22:\\\x222026-10-13\\\x22\x7d`));
check('stan startowy z arkusza: bez cached', !!pSheet.boot && !pSheet.boot.cached && pSheet.boot.businessDate === '2026-10-13', JSON.stringify(pSheet.boot));
check('stan startowy nie wyszedł (null)', perf.parsePage(pageOf('null')).boot === null);
check('strona logowania Google to nie aplikacja', !perf.parsePage('<html><title>Logowanie</title></html>').app);
const sum = perf.summary([1200, 900, 3100, 5200, 1000, 1100, 1300, 1250, 1150, 1050].map((t, i) => ({ ttfb: t, boot: i ? 'cached' : 'sheet' }))
  .concat([{ err: 'HTTP 500' }]));
check('podsumowanie: mediana, 90%, najdłużej, progi, błędy, pamięć',
  sum.med === 1200 && sum.p90 === 5200 && sum.max === 5200 && sum.over3 === 2 && sum.over5 === 1 && sum.errors === 1 && sum.cached === 9 && sum.sheet === 1,
  JSON.stringify(sum));

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

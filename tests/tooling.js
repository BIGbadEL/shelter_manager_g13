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
Object.keys(S).filter(k => k.endsWith(':test')).forEach(k => {
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

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

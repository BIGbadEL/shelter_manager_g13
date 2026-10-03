// S40-S42, S105: miniony dzień (strzałka wstecz) — zastępuje dawną zakładkę Historia.
// Tylko podgląd, dociągany blokami po dwa tygodnie; ekran nigdy nie może utknąć
// na „Wczytuję…".
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

const base = o => Object.assign({
  dogs: [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna'})],
  walks: [], tasks: [], today: '2026-09-24', businessDate: '2026-09-24', resetHour: 20, env: 'prod',
}, o || {});
const sentPast = app => app.shipped.filter(f => f === 'getHistoryDays').length;
const dayRel   = app => app.window.document.getElementById('dayRel').textContent;
const back     = (app, n) => { for(let i=0; i<(n||1); i++) app.click('#prevDay'); };

/* ---------- S40: podgląd minionego dnia ---------- */
(()=>{
  console.log('S40: wczoraj — tylko podgląd');
  const app = buildApp();
  app.seed(base());
  back(app);
  check('zanim dojdą dane: „Wczytuję…", nie pusta lista', /Wczytuję/.test(app.html()), app.html());
  const job = app.pending[app.pending.length-1];
  check('pyta o blok dwóch tygodni kończący się wczoraj',
    job.fn==='getHistoryDays' && job.args[0]==='2026-09-10' && job.args[1]==='2026-09-23', JSON.stringify(job.args));

  app.respondNext({history:[
    {date:'2026-09-23', name:'Luna',  who:'Ola', time:'17:00'},
    {date:'2026-09-23', name:'Borys', who:'Ala', time:'9:05'},
    {date:'2026-09-23', name:'Rex',   who:'Ela', time:'10:30'},
    {date:'2026-09-20', name:'Borys', who:'Iza', time:'11:00'},
  ]});
  const html = app.html();
  check('mówi, że to podgląd', /Miniony dzień — tylko podgląd/.test(html));
  check('liczba z poprawną odmianą', /3 spacery/.test(html), html);
  check('po wolontariuszu: Ala, Ela, Ola (kolejność z serwera inna — S105)',
    html.indexOf('Ala') < html.indexOf('Ela') && html.indexOf('Ela') < html.indexOf('Ola'), html);
  check('tylko ten dzień — bez wpisu z 20.09', !/Iza/.test(html));
  check('żadnego przycisku akcji', !/data-act=/.test(html), html);
  check('pasek dnia: wczoraj, z drogą powrotu', /wczoraj/.test(dayRel(app)) && /wróć/.test(dayRel(app)), dayRel(app));
  check('etykieta oznaczona jako przeszłość',
    app.window.document.getElementById('dayLabel').classList.contains('past'));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S41: strzałka w tył nie czeka na serwer w obrębie bloku ---------- */
(()=>{
  console.log('S41: kolejne dni wstecz z pamięci, dalszy blok dociągany sam');
  const app = buildApp();
  app.seed(base());
  back(app);
  app.respondNext({history:[{date:'2026-09-20', name:'Borys', who:'Iza', time:'11:00'}]});
  back(app, 3);                                        // 20 września — w tym samym bloku
  check('bez nowego pytania do serwera', sentPast(app)===1, app.shipped.join(','));
  check('widać wpis z 20.09 od razu', /Iza/.test(app.html()) && /1 spacer\b/.test(app.html()), app.html());
  back(app);                                           // 19 września — pusty dzień
  check('pusty dzień nazwany wprost', /nie zapisano żadnego spaceru/.test(app.html()), app.html());

  back(app, 10);                                       // 9 września — poza pierwszym blokiem
  check('dalszy blok dociągnięty', sentPast(app)===2, app.shipped.join(','));
  const job = app.pending[app.pending.length-1];
  check('...kończący się na wybranym dniu', job.args[1]==='2026-09-09' && job.args[0]==='2026-08-27',
    JSON.stringify(job.args));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S42: nic nie może zamrozić ekranu ---------- */
(()=>{
  console.log('S42: błąd, zguba odpowiedzi i strzałki w trakcie ładowania');
  const app = buildApp();
  app.seed(base());
  back(app);
  app.click('#nextDay');                               // wracamy, zanim cokolwiek doszło
  check('strzałka działa w trakcie ładowania', /Zarezerwuj/.test(app.html()), app.html().slice(0,200));

  app.failNext('boom');
  back(app);
  check('po błędzie jest nowa próba, a nie wieczne „Wczytuję…"', sentPast(app)===2, app.shipped.join(','));
  app.failNext('boom');
  check('komunikat zamiast zawieszenia', /Nie udało się wczytać/.test(app.html()), app.html());

  // odpowiedź zginęła po drodze: po czasie watchdoga wolno zapytać jeszcze raz
  app.click('#nextDay');
  back(app);
  check('zgubione pytanie trzyma się przez chwilę', sentPast(app)===3, app.shipped.join(','));
  app.pending.shift();                                 // odpowiedź nigdy nie przyjdzie
  app.click('#nextDay');
  back(app);
  check('...więc nie dublujemy od razu', sentPast(app)===3, app.shipped.join(','));
  app.window.eval('for (const k in __state.pastLoading) __state.pastLoading[k] = 0;');   // minął watchdog
  app.click('#nextDay');
  back(app);
  check('...ale po watchdogu pytamy znowu', sentPast(app)===4, app.shipped.join(','));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S105: miniony dzień po wolontariuszu (1.1.1) ---------- */
(()=>{
  console.log('S105: miniony dzień — po wolontariuszu (spacery jednej osoby razem), potem po godzinie');
  const app = buildApp();
  app.seed(base());
  back(app);
  // kolejność z serwera celowo ani po godzinie, ani po osobie
  const day = [
    {name:'Borys', who:'GRZESIEK', time:'13:00'},
    {name:'Kora',  who:'',         time:'8:00'},
    {name:'Luna',  who:'Ania',     time:'17:00'},
    {name:'Draco', who:'Grzesiek', time:'9:00'},
    {name:'Rex',   who:'Zuza',     time:'12:00'},
    {name:'Bysiu', who:' grzesiek',time:'11:00'},
    {name:'Łatka', who:'Łukasz',   time:'14:00'},
    {name:'Nero',  who:'Ania',     time:'10:00'},
  ];
  app.respondNext({history: day.map(e => Object.assign({date:'2026-09-23'}, e))});
  const doc = app.window.document;
  const rows = [...doc.querySelectorAll('.hist-item')].map(el => el.querySelector('b').textContent);
  const whoOf = n => day.find(e => e.name === n).who.trim().toLowerCase();
  check('wszystkie wpisy dnia', rows.length === day.length, rows.join(','));
  const runs = rows.map(whoOf).filter((w, i, a) => i === 0 || a[i-1] !== w);
  check('spacery jednej osoby stoją razem (wielkość liter i spacje bez znaczenia)',
    new Set(runs).size === runs.length, rows.join(','));
  check('osoby alfabetycznie, Łukasz jak „L", wpis bez osoby na końcu',
    JSON.stringify(runs) === JSON.stringify(['ania','grzesiek','łukasz','zuza','']), JSON.stringify(runs));
  // drugie kryterium (decyzja właściciela po review PR #3): godzina w obrębie osoby,
  // liczona jako czas — napisowo „11:00" < „9:00"
  check('w obrębie osoby po godzinie: Nero 10:00 przed Luną 17:00, Draco 9:00 przed Bysiem 11:00',
    rows.join(',') === 'Nero,Luna,Draco,Bysiu,Borys,Łatka,Rex,Kora', rows.join(','));
  check('godzina nadal widoczna przy wpisie', /9:00/.test(app.html()) && /17:00/.test(app.html()), app.html());
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S107: grupy w minionym dniu ---------- */
(()=>{
  console.log('S107: miniony dzień — wpisy z grupy w kolorze grupy, pod listą „Spacery grupowe"');
  const app = buildApp();
  app.seed(base());
  back(app);
  const Y = '2026-09-23';
  app.respondNext({history:[
    {date:Y, name:'Luna',     who:'Ola',      time:'17:10'},             // bez pola group (stary serwer / stary wpis)
    {date:Y, name:'Draco',    who:'Grzesiek', time:'10:20', group:1},
    {date:Y, name:'Kora',     who:'Ania',     time:'9:00',  group:2},
    {date:Y, name:'Rex',      who:'Ela',      time:'12:00', group:3},    // reszta grupy nie wyszła — szedł sam
    {date:Y, name:'Fado',     who:'Ola',      time:'10:20', group:1},
    {date:Y, name:'Lego',     who:'grzesiek', time:'10:20', group:1},    // ta sama osoba, inaczej wpisana
    {date:Y, name:'Witkacy',  who:'Zuza',     time:'9:00',  group:2},
    {date:Y, name:'Bysiu',    who:'Grzesiek', time:'14:00', group:0},
    {date:Y, name:'Nero <i>', who:'',         time:'9:00',  group:2},    // bez osoby; nazwa do ucieczki HTML
    {date:'2026-09-22', name:'Borys', who:'Iza', time:'11:00'},
  ]});
  const w = app.window, doc = w.document;
  const list = doc.querySelector('.hist-day');
  const items = list ? [...list.querySelectorAll('.hist-item')] : [];
  const name = el => el.querySelector('b').textContent;
  check('kolejność listy bez zmian: wolontariusz, potem godzina (grupy jej nie ruszają)',
    items.map(name).join() === 'Kora,Rex,Draco,Lego,Bysiu,Fado,Luna,Witkacy,Nero <i>', items.map(name).join());
  const marked = items.filter(el => el.classList.contains('hg')).map(name);
  check('w kolorze grupy wpisy z grup co najmniej dwóch spacerów', marked.join() === 'Kora,Draco,Lego,Fado,Witkacy,Nero <i>', marked.join());
  check('…Rex (jedyny spacer swojej grupy) jak spacer bez grupy', !!items[1] && name(items[1]) === 'Rex'
    && !items[1].classList.contains('hg') && !items[1].getAttribute('style'));
  const gOf = { Kora:2, Draco:1, Lego:1, Fado:1, Witkacy:2, 'Nero <i>':2 };
  const bad = items.filter(el => el.classList.contains('hg')).filter(el => { const c = w.eval(`groupColor(${gOf[name(el)]})`);
    return el.style.getPropertyValue('--gc') !== c.ink || el.style.getPropertyValue('--gbg') !== c.bg; });
  check('…tło i pasek z koloru tej grupy, jak na liście dnia', !bad.length, bad.map(el => el.outerHTML).join(' ; '));

  const sec = [...doc.querySelectorAll('.hist-day')].filter(d => /Spacery grupowe/.test(d.querySelector('.hist-date').textContent))[0];
  const sum = sec ? [...sec.querySelectorAll('.hist-gsum')] : [];
  const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
  check('pod listą sekcja „Spacery grupowe", po jednej linijce na grupę', !!sec && sum.length === 2, sec ? sec.outerHTML : app.html());
  check('…po kolei w ciągu dnia (grupa 2 o 9:00 przed grupą 1 o 10:20)', sum.length === 2 && /^9:00/.test(txt(sum[0])) && /^10:20/.test(txt(sum[1])),
    sum.map(txt).join(' | '));
  check('…kto z kim: psy jednej osoby razem, osoby jak na liście, bez osoby na końcu',
    sum.length === 2 && txt(sum[1]) === '10:20 Draco, Lego (Grzesiek) · Fado (Ola)' && txt(sum[0]) === '9:00 Kora (Ania) · Witkacy (Zuza) · Nero <i>',
    sum.map(txt).join(' | '));
  check('…w kolorach swoich grup', sum.length === 2 && sum[0].style.getPropertyValue('--gc') === w.eval('groupColor(2).ink')
    && sum[1].style.getPropertyValue('--gc') === w.eval('groupColor(1).ink'));
  check('nazwy z arkusza nie są HTML-em', !doc.querySelector('#view i'), app.html().slice(0, 300));

  back(app);                                                       // 22.09 — dzień bez grup
  check('dzień bez grup: bez sekcji i bez kolorów', /Borys/.test(app.html()) && !/Spacery grupowe/.test(app.html()) && !doc.querySelector('.hist-item.hg'),
    app.html());
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S108: numer psa w minionym dniu ---------- */
(()=>{
  console.log('S108: miniony dzień — przy każdym psie jego numer (zrzuty idą do władz schroniska)');
  const app = buildApp();
  app.seed(base());
  back(app);
  const Y = '2026-09-23';
  app.respondNext({history:[
    {date:Y, name:'Borys',   who:'Ala', time:'9:00',  ident:'101/26'},
    {date:Y, name:'Luna',    who:'Ola', time:'10:00', ident:'1/26', group:1},
    {date:Y, name:'Rex',     who:'Ola', time:'10:00', ident:'', group:1},        // numer nieznany (stary wpis, dwa psy o tym imieniu)
    {date:Y, name:'#2077',   who:'Iza', time:'11:00', ident:'2077'},             // pies bez imienia — numer już jest w nazwie
    {date:Y, name:'Azor',    who:'Zu',  time:'12:00'},                           // stary serwer: bez pola ident
    {date:Y, name:'Kot',     who:'Zu',  time:'13:00', ident:'7<i>7'},
  ]});
  const doc = app.window.document;
  const row = n => [...doc.querySelector('.hist-day').querySelectorAll('.hist-item')].filter(el => el.querySelector('b').textContent === n)[0];
  const nrOf = n => { const el = row(n) && row(n).querySelector('.nr'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  check('numer przy psie: „Borys nr 101/26"', nrOf('Borys') === 'nr 101/26', row('Borys') ? row('Borys').outerHTML : app.html());
  check('…zaraz po imieniu, przed osobą', !!row('Borys') && /^Borys\s*nr 101\/26\s*— Ala/.test(row('Borys').textContent.replace(/\s+/g, ' ').trim()),
    row('Borys') && row('Borys').textContent);
  check('…także na wpisie ze spaceru grupowego', nrOf('Luna') === 'nr 1/26' && row('Luna').classList.contains('hg'));
  check('bez numeru — bez „nr" (nie zgadujemy)', !nrOf('Rex') && !nrOf('Azor') && !/nr\s*—/.test(app.html()));
  check('pies bez imienia: numer raz, nie „#2077 nr 2077"', !nrOf('#2077'), row('#2077') && row('#2077').outerHTML);
  check('numer z arkusza nie jest HTML-em', nrOf('Kot') === 'nr 7<i>7' && !doc.querySelector('#view i'));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

/* ---------- S109: e-mail z listą psów dla schroniska ---------- */
const later = [];   // testy czekające na obietnicę (schowek przeglądarki) — koniec pliku na nie czeka
const TPL = 'Dzień dobry,\nPrzesyłam listę spacerową z [DATA] z grupy G13.\n[LISTA]\nPozdrawiam,\n';
const DAY = [
  {date:'2026-09-23', name:'Rex',         who:'Ola', time:'17:00', ident:'303/26'},
  {date:'2026-09-23', name:'Borys, mały', who:'Ala', time:'9:00',  ident:'101/26'},
  {date:'2026-09-23', name:'Witkacy',     who:'Ala', time:'9:30',  ident:'258/26'},
  {date:'2026-09-23', name:'Witkacy',     who:'Zu',  time:'16:00', ident:'258/26', group:1},   // drugi spacer tego dnia
  {date:'2026-09-23', name:'Azor',        who:'Ela', time:'12:00', ident:''},
  {date:'2026-09-23', name:'#2077',       who:'Iza', time:'11:00', ident:'2077'},
];
const MAIL = 'Dzień dobry,\nPrzesyłam listę spacerową z 23.09.2026 z grupy G13.\n'
  + 'data,pies,numer\n23.09.2026,#2077,2077\n23.09.2026,Azor,\n23.09.2026,"Borys, mały",101/26\n'
  + '23.09.2026,Rex,303/26\n23.09.2026,Witkacy,258/26\nPozdrawiam,\n';
/** Aplikacja na wczorajszym dniu z DAY; `copy` — co robi document.execCommand('copy'). */
function mailApp(o){
  const app = buildApp();
  app.seed(base(Object.assign({mailTemplate: TPL}, o && o.data)));
  const doc = app.window.document;
  app.copied = null;
  doc.execCommand = cmd => {
    if(cmd !== 'copy' || (o && o.copy === false)) return false;
    const ta = doc.querySelector('textarea[data-copy]');
    app.copied = ta ? ta.value : null;
    return !!ta;
  };
  back(app);
  app.respondNext({history: DAY});
  return app;
}
(()=>{
  console.log('S109: miniony dzień — przycisk kopiuje gotowy e-mail z listą psów (CSV: data, pies, numer)');
  const app = mailApp();
  const doc = app.window.document;
  const btn = doc.querySelector('[data-act="copyMail"]');
  check('na minionym dniu jest przycisk kopiowania maila', !!btn, app.html().slice(0, 300));
  check('…i dalej żadnej akcji na spacerach', !/data-act="(reserve|walk|free|confirm)"/.test(app.html()));
  app.click('[data-act="copyMail"]');
  check('do schowka idzie gotowy mail: [DATA] i [LISTA] podstawione', app.copied === MAIL, JSON.stringify(app.copied));
  check('…pies raz, choć szedł dwa razy (Witkacy)', app.copied && app.copied.split('Witkacy').length === 2);
  check('…pole z przecinkiem w cudzysłowie (CSV)', app.copied && app.copied.includes('"Borys, mały"'));
  check('…pies bez numeru z pustą kolumną, nie „undefined"', app.copied && app.copied.includes('23.09.2026,Azor,\n') && !/undefined/.test(app.copied));
  check('…po „Pozdrawiam," wolna linia na podpis', app.copied && /Pozdrawiam,\n$/.test(app.copied));
  check('pomocnicze pole schowka sprzątnięte', !doc.querySelector('textarea[data-copy]'));
  check('komunikat: skopiowano', /Skopiowano/.test(doc.getElementById('toast').textContent), doc.getElementById('toast').textContent);
  back(app);                                                   // 22.09 — pusty dzień
  check('pusty dzień: bez przycisku (nie ma czego wysłać)', /nie zapisano żadnego spaceru/.test(app.html()) && !doc.querySelector('[data-act="copyMail"]'));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));

  const old = mailApp({data: {mailTemplate: undefined}});
  check('serwer bez treści maila (starsza wersja): bez przycisku, bez błędu',
    !old.window.document.querySelector('[data-act="copyMail"]') && old.errors.length===0);
})();
(()=>{
  console.log('S109b: schowek nie działa (iframe Apps Script) — tekst do ręcznego skopiowania, nigdy cisza');
  const app = mailApp({copy: false});
  const doc = app.window.document;
  app.click('[data-act="copyMail"]');
  const box = doc.querySelector('textarea.mailbox');
  check('bez execCommand i bez schowka: pole z gotowym mailem na ekranie', !!box && box.value === MAIL, box ? JSON.stringify(box.value) : app.html());
  check('…z komunikatem, co zrobić', /skopiuj/i.test(doc.getElementById('toast').textContent), doc.getElementById('toast').textContent);
  check('bez błędów', app.errors.length===0, app.errors.join('; '));

  const viaApi = mailApp({copy: false});
  let written = null;
  Object.defineProperty(viaApi.window.navigator, 'clipboard', {value: {writeText: t => { written = t; return Promise.resolve(); }}, configurable: true});
  viaApi.click('[data-act="copyMail"]');
  later.push(Promise.resolve().then(() => new Promise(r => setTimeout(r, 0))).then(() => {
    const d = viaApi.window.document;
    check('S109b: execCommand nie działa, ale schowek przeglądarki tak — mail w schowku', written === MAIL, JSON.stringify(written));
    check('S109b: …bez pola awaryjnego, z komunikatem „Skopiowano"', !d.querySelector('textarea.mailbox') && /Skopiowano/.test(d.getElementById('toast').textContent));
  }));
})();

/* ---------- S110: treść maila w panelu prowadzącej ---------- */
(()=>{
  console.log('S110: panel — treść maila do ustawienia, zapis z PIN-em, przycisk używa nowej treści');
  const app = mailApp();
  const w = app.window, doc = w.document;
  app.click('#nextDay');                                       // z powrotem na bieżący dzień
  w.__setAdmin('4321');
  app.click('[data-tab="diag"]');
  const ta = doc.getElementById('mailTemplate');
  check('w panelu pole z obecną treścią maila', !!ta && ta.value === TPL, ta ? JSON.stringify(ta.value) : app.html().slice(0, 300));
  check('…z opisem [DATA] i [LISTA]', /\[DATA\]/.test(app.html()) && /\[LISTA\]/.test(app.html()));
  const mine = 'Witam,\nlista G13 z [DATA]:\n[LISTA]\nPozdrawiam,\n';
  ta.value = mine; ta.dispatchEvent(new w.Event('input', {bubbles:true}));
  // odświeżenie co 15 s nie może zjeść pisanego tekstu; inna godzina zmienia HTML panelu, więc pole
  // naprawdę rysuje się od nowa (przy tym samym HTML render nie dotyka DOM i test niczego by nie dowodził)
  w.__state.resetHour = 8; w.eval('safeRender()');
  check('pisana treść przeżywa przerysowanie panelu', doc.getElementById('mailTemplate') !== ta && doc.getElementById('mailTemplate').value === mine,
    doc.getElementById('mailTemplate') === ta ? 'pole nie przerysowane' : JSON.stringify(doc.getElementById('mailTemplate').value));
  const typing = doc.getElementById('mailTemplate');
  typing.focus();
  w.__state.resetHour = 7; w.eval('safeRender()');             // coś w panelu się zmieniło, a ona pisze
  check('…a gdy pole ma fokus, nie jest podmieniane (kursor zostaje)', doc.getElementById('mailTemplate') === typing);
  typing.blur();
  app.click('[data-act="saveMail"]');
  const job = app.pending.filter(j => j.fn === 'setMailTemplate')[0];
  check('zapis idzie na serwer z treścią i PIN-em', !!job && job.args[0] === mine && job.args[1] === '4321', job && JSON.stringify(job.args));
  app.pending.splice(app.pending.indexOf(job), 1); job.ok({mailTemplate: mine});
  check('po zapisie: komunikat', /zapisan/i.test(doc.getElementById('toast').textContent), doc.getElementById('toast').textContent);
  app.click('#gear');                                          // tryb edycji to katalog — dzień widać po wyjściu z niego
  back(app);
  app.click('[data-act="copyMail"]');
  check('przycisk używa nowej treści', !!app.copied && app.copied.startsWith('Witam,\nlista G13 z 23.09.2026:\ndata,pies,numer\n'), JSON.stringify(app.copied));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
})();

Promise.all(later).catch(e => { failures++; console.log('  FAIL wyjątek | ' + (e && e.stack || e)); }).then(() => {
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
});

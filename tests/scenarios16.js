// S116-S119: ankieta tygodniowa na WhatsAppie (1.2) — panel prowadzącej. Serwer (Poll.gs) sprawdza
// backend.js (B56-B59); tu: formularz, szkic, sprawdzanie przed wysłaniem, „Pobierz grupy", „Wyślij teraz".
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }

const D = '2026-10-07';
const base = o => Object.assign({dogs:[dogFree({id:1, name:'Borys'})], slots:[], tasks:[], today:D, businessDate:D, resetHour:18, env:'prod'}, o || {});
const DAYS = ['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela','Nie mogę'];
const PANEL = (o, s) => Object.assign({
  settings: Object.assign({question:'Grafik [TYDZIEŃ]', options:DAYS.slice(), multi:true, day:0, hour:12, enabled:false, chatId:'', chatName:''}, s),
  configured: true, state: {code:'authorized', text:'połączone'}, last: null,
  next: {day:'2026-10-11', label:'12-18.10'}, now: {label:'12-18.10', question:'Grafik 12-18.10'},
}, o);
const DIAG = poll => ({env:'prod', triggerInstalled:true, triggerCount:1, resetHour:18, serverDate:D, serverTime:'10:00',
  businessDate:D, timezone:'Europe/Warsaw', dogCount:1, taskCount:0, histCount:0, poll});
const GRAFIK = '120363000000000001@g.us';

const doc     = app => app.window.document;
const el      = (app, id) => doc(app).getElementById(id);
const toastOf = app => el(app, 'toast').textContent;
const calls   = (app, fn) => app.pending.filter(p => p.fn===fn);
const shipped = (app, fn) => app.shipped.filter(f => f===fn).length;
function respondTo(app, fn, res){
  const i = app.pending.findIndex(p => p.fn===fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].ok(res);
}
function failTo(app, fn, msg){
  const i = app.pending.findIndex(p => p.fn===fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].fail(new Error(msg));
}
/** Pole jak człowiek: wartość (albo zaznaczenie) + zdarzenie. */
function set(app, id, v){
  const e = el(app, id);
  if(e.type === 'checkbox') e.checked = !!v; else e.value = v;
  e.dispatchEvent(new app.window.Event(e.tagName==='SELECT' || e.type==='checkbox' ? 'change' : 'input', {bubbles:true}));
}
/** Tryb edycji, zakładka Panel, odpowiedź getDiagnostics z ankietą. */
function panel(poll){
  const app = buildApp();
  app.seed(base());
  app.window.__setAdmin('1234');
  app.click('.tab[data-tab="diag"]');
  respondTo(app, 'getDiagnostics', DIAG(poll === undefined ? PANEL() : poll));
  return app;
}

/* ---------- S116: ustawienia ankiety ---------- */
function S116(){
  console.log('S116: panel — ankieta tygodniowa: domyślnie jak ręczne ankiety, grupa z bramki, zapis jednym przyciskiem');
  const app = panel();
  const html = app.html();
  check('sekcja w panelu, konto bota połączone', /Ankieta tygodniowa na WhatsAppie/.test(html) && /Konto WhatsApp bota: połączone/.test(html));
  check('pytanie i odpowiedzi jak w ręcznych ankietach', el(app, 'pollQuestion').value === 'Grafik [TYDZIEŃ]'
    && el(app, 'pollOptions').value === DAYS.join('\n') && el(app, 'pollMulti').checked && !el(app, 'pollEnabled').checked);
  check('podgląd z tygodniem: „Grafik 12-18.10"', /Podgląd: <span data-poll-preview="">„Grafik 12-18\.10"/.test(html), html.match(/Podgląd[^<]*<span[^>]*>[^<]*/));
  check('bez grupy: „— wybierz grupę —", wysyłanie wyłączone', /— wybierz grupę —/.test(html) && /Wysyłanie co tydzień jest wyłączone/.test(html));

  app.click('[data-act="pollChats"]');
  check('„Pobierz grupy" pyta serwer z PIN-em, przycisk „Pobieram…"', calls(app, 'getPollChats').length===1
    && calls(app, 'getPollChats')[0].args[0]==='1234' && /Pobieram…/.test(app.html()));
  respondTo(app, 'getPollChats', [{id:'120363000000000002@g.us', name:'Bieganie'}, {id:GRAFIK, name:'Grafik'}]);
  const names = [...el(app, 'pollChat').options].map(o => o.textContent);
  check('lista grup z bramki', JSON.stringify(names) === '["— wybierz grupę —","Bieganie","Grafik"]', JSON.stringify(names));
  set(app, 'pollChat', GRAFIK);
  set(app, 'pollDay', '0');
  set(app, 'pollHour', '18');
  set(app, 'pollEnabled', true);
  check('niezapisane zmiany oznaczone', !doc(app).querySelector('.polldirty').classList.contains('hidden')
    && !doc(app).querySelector('[data-act="pollReset"]').classList.contains('hidden'));
  app.click('[data-act="pollSave"]');
  const job = calls(app, 'setPollSettings')[0];
  check('zapis: grupa z nazwą, niedziela 18, odpowiedzi jako lista, kilka odpowiedzi, włączona, PIN', !!job
    && JSON.stringify(job.args[0]) === JSON.stringify({chatId:GRAFIK, chatName:'Grafik', day:0, hour:18, question:'Grafik [TYDZIEŃ]',
                                                        options:DAYS, multi:true, enabled:true}) && job.args[1]==='1234',
    job && JSON.stringify(job.args));
  respondTo(app, 'setPollSettings', PANEL({state:null}, {chatId:GRAFIK, chatName:'Grafik', day:0, hour:18, enabled:true}));
  const after = app.html();
  check('po zapisie: komunikat, bez „niezapisane"', /wysyłka co tydzień włączona/.test(toastOf(app)) && doc(app).querySelector('.polldirty').classList.contains('hidden'), toastOf(app));
  check('następna ankieta: dzień, okno godzin, pytanie z tygodniem, grupa',
    /Następna: niedziela 11\.10 między 18:00 a 18:30 —\s+„Grafik 12-18\.10" do grupy Grafik\./.test(after), (after.match(/Następna[^<]*/) || [''])[0]);
  check('stan konta bota został (odpowiedź zapisu go nie niesie)', /Konto WhatsApp bota: połączone/.test(after));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));

  const bare = panel(PANEL({configured:false, state:null}));
  check('bez bramki: co ustawić we właściwościach skryptu', /greenApiUrl/.test(bare.html()) && /greenApiInstance/.test(bare.html()) && /greenApiToken/.test(bare.html()));
  const old = panel(null);
  check('serwer bez ankiety (panel bez `poll`) — bez sekcji, bez błędów', !/Ankieta tygodniowa/.test(old.html()) && old.errors.length===0);
  check('bez błędów', app.errors.length===0 && bare.errors.length===0, app.errors.concat(bare.errors).join('; '));
}

/* ---------- S117: te same reguły co serwer ---------- */
function S117(){
  console.log('S117: panel — złe ustawienia ankiety nie idą na serwer, komunikat od razu (te same reguły i limity)');
  const app = panel();
  const save = () => { app.click('[data-act="pollSave"]'); return shipped(app, 'setPollSettings'); };
  set(app, 'pollOptions', 'Tak');
  check('jedna odpowiedź', save()===0 && /co najmniej 2/.test(toastOf(app)), toastOf(app));
  set(app, 'pollOptions', Array.from({length:13}, (_, i) => 'O' + i).join('\n'));
  check('13 odpowiedzi', save()===0 && /Najwyżej 12/.test(toastOf(app)), toastOf(app));
  set(app, 'pollOptions', 'Środa\nśroda ');
  check('ta sama odpowiedź dwa razy', save()===0 && /dwa razy/.test(toastOf(app)), toastOf(app));
  set(app, 'pollOptions', 'A\n' + 'x'.repeat(101));
  check('za długa odpowiedź', save()===0 && /100 znaków/.test(toastOf(app)), toastOf(app));
  set(app, 'pollOptions', DAYS.join('\n'));
  el(app, 'pollQuestion').removeAttribute('maxlength');
  set(app, 'pollQuestion', 'x'.repeat(201));
  check('za długie pytanie', save()===0 && /200 znaków/.test(toastOf(app)), toastOf(app));
  set(app, 'pollQuestion', '  ');
  check('puste pytanie', save()===0 && /Wpisz pytanie/.test(toastOf(app)), toastOf(app));
  set(app, 'pollQuestion', 'Grafik [TYDZIEŃ]');
  set(app, 'pollEnabled', true);
  check('włączona bez grupy', save()===0 && /Wybierz grupę/.test(toastOf(app)), toastOf(app));
  const bare = panel(PANEL({configured:false, state:null}, {chatId:GRAFIK, chatName:'Grafik'}));
  set(bare, 'pollEnabled', true);
  bare.click('[data-act="pollSave"]');
  check('włączona bez bramki', shipped(bare, 'setPollSettings')===0 && /Bramka WhatsAppa nie jest ustawiona/.test(toastOf(bare)), toastOf(bare));
  set(app, 'pollEnabled', false);
  set(app, 'pollOptions', '  Poniedziałek \n\nWtorek\n');
  check('puste linie i spacje to nie błąd — idzie przycięte', save()===1
    && JSON.stringify(calls(app, 'setPollSettings')[0].args[0].options) === '["Poniedziałek","Wtorek"]');
  const fs = require('fs'), path = require('path');
  const cfg = fs.readFileSync(path.join(__dirname, '..', 'Config.gs'), 'utf8');
  const scr = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');
  const num = (src, re) => Number((src.match(re) || [])[1]);
  check('limity te same w przeglądarce i na serwerze (POLL_LIMITS)',
    num(cfg, /QUESTION:\s*(\d+)/) === num(scr, /const POLL_Q_MAX = (\d+)/) && num(cfg, /OPTION:\s*(\d+)/) === num(scr, /const POLL_OPT_MAX = (\d+)/)
    && num(cfg, /OPTIONS_MIN:\s*(\d+)/) === num(scr, /const POLL_OPTS_MIN = (\d+)/) && num(cfg, /OPTIONS_MAX:\s*(\d+)/) === num(scr, /const POLL_OPTS_MAX = (\d+)/)
    && num(scr, /const POLL_Q_MAX = (\d+)/) > 0);
  check('bez błędów', app.errors.length===0 && bare.errors.length===0, app.errors.concat(bare.errors).join('; '));
}

/* ---------- S118: szkic przeżywa przerysowanie ---------- */
function S118(){
  console.log('S118: panel — ankieta pisana, ale niezapisana, przeżywa przerysowanie; podgląd w trakcie pisania; „Przywróć zapisane"');
  const app = panel();
  set(app, 'pollQuestion', 'Spacery [TYDZIEŃ]');
  check('podgląd idzie za pisaniem', doc(app).querySelector('[data-poll-preview]').textContent === '„Spacery 12-18.10"',
    doc(app).querySelector('[data-poll-preview]').textContent);
  set(app, 'pollOptions', 'Rano\nWieczorem');
  set(app, 'pollMulti', false);
  app.window.eval('render("data")');                  // panel przerysowuje się po każdym wywołaniu serwera (dziennik)
  check('po przerysowaniu: pytanie, odpowiedzi i „kilka odpowiedzi" zostały', el(app, 'pollQuestion').value === 'Spacery [TYDZIEŃ]'
    && el(app, 'pollOptions').value === 'Rano\nWieczorem' && !el(app, 'pollMulti').checked);
  check('...i napis „niezapisane"', !doc(app).querySelector('.polldirty').classList.contains('hidden'));
  app.click('[data-act="pollReset"]');
  check('„Przywróć zapisane" wraca do zapisanych', el(app, 'pollQuestion').value === 'Grafik [TYDZIEŃ]' && el(app, 'pollMulti').checked
    && doc(app).querySelector('.polldirty').classList.contains('hidden'));
  set(app, 'pollOptions', DAYS.join('\n') + '\n');
  check('pusta linijka na końcu to nie zmiana', doc(app).querySelector('.polldirty').classList.contains('hidden'));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S119: „Wyślij teraz" ---------- */
function S119(){
  console.log('S119: panel — „Wyślij teraz": tylko zapisane ustawienia, z potwierdzeniem; wynik i błąd widać w panelu');
  const app = panel(PANEL({}, {chatId:GRAFIK, chatName:'Grafik', day:0, hour:18, enabled:true}));
  let asked = null;
  app.window.confirm = m => { asked = m; return false; };
  set(app, 'pollQuestion', 'Inne [TYDZIEŃ]');
  app.click('[data-act="pollSend"]');
  check('niezapisane zmiany — najpierw zapis', asked===null && shipped(app, 'sendPollNow')===0 && /Najpierw zapisz/.test(toastOf(app)), toastOf(app));
  app.click('[data-act="pollReset"]');
  app.click('[data-act="pollSend"]');
  check('pyta, co i dokąd: „Grafik 12-18.10" do grupy Grafik', /„Grafik 12-18\.10"/.test(asked) && /grupy Grafik/.test(asked), asked);
  check('„Nie" — nic nie idzie', shipped(app, 'sendPollNow')===0);
  app.window.confirm = () => true;
  app.click('[data-act="pollSend"]');
  const job = calls(app, 'sendPollNow')[0];
  check('„Tak" — sendPollNow z PIN-em', !!job && job.args[0]==='1234');
  respondTo(app, 'sendPollNow', {sent:{week:'2026-10-12', question:'Grafik 12-18.10', at:'2026-10-07 10:01'},
    panel: PANEL({state:null, last:{at:'2026-10-07 10:01', ok:true, question:'Grafik 12-18.10', chatName:'Grafik', manual:true}},
                 {chatId:GRAFIK, chatName:'Grafik', day:0, hour:18, enabled:true})});
  check('komunikat i ostatnia ankieta w panelu', /Ankieta wysłana: „Grafik 12-18\.10"/.test(toastOf(app))
    && /Ostatnia: 2026-10-07 10:01 — wysłana „Grafik 12-18\.10" do grupy Grafik \(ręcznie\)/.test(app.html()), toastOf(app));
  app.click('[data-act="pollSend"]');
  failTo(app, 'sendPollNow', 'Ankieta na ten tydzień już poszła do tej grupy (2026-10-07 10:01)');
  check('nie wyszła — komunikat serwera, bez powtórki (nie w RETRIABLE)', /już poszła/.test(toastOf(app)) && shipped(app, 'sendPollNow')===2, toastOf(app));
  check('...a panel dociąga stan (ostatnia próba)', calls(app, 'getDiagnostics').length===1);
  respondTo(app, 'getDiagnostics', DIAG(PANEL({last:{at:'2026-10-07 10:05', ok:false, msg:'Bramka WhatsAppa: błąd 466'}},
                                                {chatId:GRAFIK, chatName:'Grafik', day:0, hour:18, enabled:true})));
  check('panel: ostatnia próba NIE WYSZŁA, z powodem', /NIE WYSZŁA: Bramka WhatsAppa: błąd 466/.test(app.html()));
  const none = panel();
  none.click('[data-act="pollSend"]');
  check('bez zapisanej grupy — komunikat, nic nie idzie', shipped(none, 'sendPollNow')===0 && /wybierz i zapisz grupę/.test(toastOf(none)), toastOf(none));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0 && none.errors.length===0, app.errors.concat(none.errors).join('; '));
}

for(const s of [S116, S117, S118, S119]){
  try{ s(); }
  catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
}
console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

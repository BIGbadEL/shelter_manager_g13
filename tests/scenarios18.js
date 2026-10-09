// S130-S136: psy innych grup (1.3). Pomagamy wyprowadzać psy innych grup wolontariuszy; stoją w naszym
// katalogu z grupą (`team`). Lista dnia: nasza bez zmian, pod nią osobna lista innych grup — każda
// sortowana osobno. Serwer (kolumna grupa_psa) sprawdza backend.js (B65-B66).
const { buildApp, dogFree, ROOT } = require('./harness');
const { makeContext } = require('./backend-harness');
const fs = require('fs'), path = require('path');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }

const D = '2026-10-08';
const base = o => Object.assign({dogs: [], slots: [], tasks: [], today: D, businessDate: D, resetHour: 18, env: 'prod'}, o || {});
const d1 = (id, name, team) => dogFree({id, name, team: team || ''});
const d2 = (id, name, team) => dogFree({id, name, walks:2, team: team || ''});
const sl = (id, n, o) => Object.assign({date:D, dogId:id, slot:n, status:'free', who:'', time:'', group:0}, o);
const doc   = app => app.window.document;
const S     = app => app.window.__state;
const ord   = app => JSON.stringify(app.window.__order());
const tiles = app => JSON.stringify(app.window.__tiles());
const tile  = (app, id) => doc(app).querySelector(`li[data-tile="${id}"]`);
const txt   = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '(brak)';
const toastOf = app => doc(app).getElementById('toast').textContent;
const calls   = (app, fn) => app.pending.filter(p => p.fn===fn);
const lastCall = (app, fn) => calls(app, fn).slice(-1)[0];
/** Kafelki listy: nasza (pierwsza <ul>) albo innych grup (ul.others-list) — po identyfikatorach psów. */
const listOf = (app, other) => {
  const ul = other ? doc(app).querySelector('ul.others-list') : doc(app).querySelector('#view > ul:not(.others-list)');
  return ul ? JSON.stringify([...ul.querySelectorAll('li.dog')].map(li => Number(li.dataset.dog))) : '(brak)';
};
const countOf = (app, list) => txt(doc(app).querySelector(`.count[data-list="${list}"]`));
function respondTo(app, fn, res){
  const i = app.pending.findIndex(p => p.fn===fn);
  if(i < 0) throw new Error('brak oczekującego ' + fn);
  app.pending.splice(i, 1)[0].ok(res);
}
/** Pole jak człowiek: wartość + zdarzenie (lista wyboru — 'change'). */
function fill(app, fields){
  Object.keys(fields).forEach(sel => {
    const el = doc(app).querySelector(sel);
    if(!el) throw new Error('brak pola ' + sel);
    el.value = fields[sel];
    el.dispatchEvent(new app.window.Event(el.tagName==='SELECT' ? 'change' : 'input', {bubbles:true}));
  });
}
const hidden = (app, sel) => { const el = doc(app).querySelector(sel); return !el || el.classList.contains('hidden'); };
const opts = (app, sel) => [...doc(app).querySelector(sel).options].map(o => o.value + '=' + o.textContent).join('|');

/* ---------- S130: dwie listy, każda sortowana osobno ---------- */
function S130(){
  console.log('S130: psy innych grup — osobna lista pod naszą, sortowana osobno (nasze odbyte nad ich wolnymi)');
  const app = buildApp();
  app.seed(base({
    dogs: [d1(1,'Azor'), d1(2,'Bari'), d1(3,'Tosia','G7'), d2(4,'Bella','G7'), d1(5,'Luna','G9'), d1(6,'Cezar'), d1(7,'Max','G7')],
    slots: [
      sl(1,1,{status:'walked', who:'Ola'}),                 // nasz odbyty
      sl(2,1,{status:'reserved', who:'Ola'}),               // nasz zarezerwowany
      sl(5,1,{status:'walked', who:'Iza'}),                 // ich odbyty
      sl(6,1,{status:'walked', who:'Iza'}),                 // nasz odbyty
      sl(7,1,{status:'reserved', who:'Ola'}),               // ich zarezerwowany
    ]}));
  check('nasza lista: tylko nasze psy, po naszych regułach (zarezerwowany nad odbytymi)', listOf(app, false)==='[2,1,6]', listOf(app, false));
  check('lista innych grup: tylko ich psy, po tych samych regułach (dwuspacerowa Bella pierwsza, odbyta Luna na dole)',
    listOf(app, true)==='[4,3,7,5]', listOf(app, true));
  check('cała lista: nasze — nawet odbyte — nad ich wolnymi', ord(app)==='[2,1,6,4,3,7,5]', ord(app));
  const box = doc(app).querySelector('.others');
  check('nagłówek „Psy innych grup" między listami', !!box && /Psy innych grup/.test(txt(box.querySelector('h2')))
    && box.previousElementSibling.tagName === 'UL' && box.nextElementSibling.matches('ul.others-list'));
  check('każda lista liczy swoje spacery', countOf(app, 'home')==='1 zarezerwowane · 2 wyprowadzone · 0 wolne'
    && countOf(app, 'other')==='1 zarezerwowane · 1 wyprowadzone · 3 wolne', countOf(app, 'home') + ' / ' + countOf(app, 'other'));

  // opiekun (kryterium 5) liczony w obrębie jednej listy: Ola ma psa 1. w arkuszu na naszej liście,
  // a na liście innych grup jej pies (3. w arkuszu) nie przeskakuje psa Izy (2. w arkuszu)
  const o = buildApp();
  o.seed(base({dogs: [d1(1,'Azor'), d1(2,'Tosia','G7'), d1(3,'Max','G7')],
    slots: [sl(1,1,{status:'reserved', who:'Ola'}), sl(2,1,{status:'reserved', who:'Iza'}), sl(3,1,{status:'reserved', who:'Ola'})]}));
  check('opiekun nie łączy psów ponad granicą list', listOf(o, true)==='[2,3]', listOf(o, true));

  // tylko nasze psy (albo serwer sprzed 1.3 bez pola `team`) — lista jak dotąd: bez nagłówka, jedno podsumowanie
  const n = buildApp();
  const old = [dogFree({id:1, name:'Azor'}), dogFree({id:2, name:'Bari'})];
  delete old[0].team; delete old[1].team;
  n.seed(base({dogs: old.concat([d1(3,'Cezar','g13'), d1(4,'Dino',' G 13 ')])}));
  check('bez psów innych grup: bez nagłówka i drugiej listy, jedno podsumowanie', !doc(n).querySelector('.others')
    && !doc(n).querySelector('ul.others-list') && doc(n).querySelectorAll('.count').length===1 && ord(n)==='[1,2,3,4]', ord(n));
  check('„g13", „ G 13 " i brak pola to nasza grupa', listOf(n, false)==='[1,2,3,4]');
  check('bez błędów', app.errors.length===0 && o.errors.length===0 && n.errors.length===0, app.errors.concat(o.errors, n.errors).join('; '));
}

/* ---------- S131: grupa spacerowa z psami z obu list ---------- */
function S131(){
  console.log('S131: grupa spacerowa z psami z obu list — dwa bloki w kolorze grupy, „Wrócił ✓" odhacza całą grupę');
  const app = buildApp();
  app.seed(base({dogs: [d1(1,'Fado'), d1(2,'Tosia','G7'), d1(3,'Bari'), d1(4,'Reksio','G7')],
    slots: [sl(1,1,{status:'reserved', who:'Kasia', group:1}), sl(2,1,{status:'reserved', who:'Kasia', group:1})]}));
  check('nasza część grupy na naszej liście, ich — na ich (Bari wolny nad grupą, Reksio wolny nad Tosią)',
    listOf(app, false)==='[3,1]' && listOf(app, true)==='[4,2]', listOf(app, false) + ' ' + listOf(app, true));
  const a = tile(app, 's1.1'), b = tile(app, 's2.1');
  const color = el => (el.getAttribute('style').match(/background:[^;]+;--gc:[^;]+/) || [''])[0];
  check('obie części w kolorze grupy (tło i pasek GRUPA tego samego koloru)', a.classList.contains('grouped') && b.classList.contains('grouped')
    && !!color(a) && color(a) === color(b), color(a) + ' | ' + color(b));
  a.querySelector('[data-act="walk"]').dispatchEvent(new app.window.Event('click', {bubbles:true}));
  const walked = calls(app, 'markWalked').map(p => p.args[0]).sort();
  check('„Wrócił ✓" na naszej części odhacza też psa z listy innych grup', JSON.stringify(walked)==='[1,2]', JSON.stringify(walked));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S132: zamrożona lista a zmiana grupy psa ---------- */
function S132(){
  console.log('S132: zamrożona lista — pies przeniesiony do innej grupy przechodzi na drugą listę od razu, nowe psy na koniec swojej listy');
  const app = buildApp();
  app.seed(base({dogs: [d1(1,'Azor'), d1(2,'Bari'), d1(3,'Tosia','G7')]}));
  check('start', ord(app)==='[1,2,3]' && listOf(app, true)==='[3]', ord(app));
  doc(app).body.dispatchEvent(new app.window.Event('pointerdown', {bubbles:true}));   // ktoś dotyka ekranu — lista zamrożona
  app.window.eval('refresh()');
  // prowadząca przeniosła Bariego do G7, doszli Dino (nasz) i Luna (G9), Tosię ktoś zarezerwował
  respondTo(app, 'getData', base({dogs: [d1(1,'Azor'), d1(2,'Bari','G7'), d1(3,'Tosia','G7'), d1(4,'Dino'), d1(5,'Luna','G9')],
    slots: [sl(3,1,{status:'reserved', who:'Ola'})]}));
  check('Bari od razu na liście innych grup, Dino na końcu naszej', listOf(app, false)==='[1,4]', listOf(app, false));
  check('...w obrębie listy kolejność zamrożona (Tosia zarezerwowana stoi, gdzie stała), Luna na końcu', listOf(app, true)==='[2,3,5]',
    listOf(app, true));
  app.window.__settle();
  check('po ciszy lista innych grup układa się po swoich regułach (wolna Luna nad zarezerwowaną Tosią)',
    listOf(app, true)==='[2,5,3]' && listOf(app, false)==='[1,4]', ord(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S133: grupa przy dodawaniu psa ---------- */
function S133(){
  console.log('S133: „Dodaj psa" — grupa: domyślnie G13, grupy z katalogu do wyboru, „Inna grupa…" z polem; szkic przeżywa przerysowanie');
  const DOGS = () => [d1(1,'Borys'), d1(2,'Tosia','G7'), d1(3,'Max','G10'), d1(4,'Luna','G9'), d1(5,'Bella','g7')];
  const app = buildApp();
  app.seed(base({dogs: DOGS()}));
  app.window.__setAdmin('1234');
  check('lista grup: nasza (domyślna), grupy z katalogu po kolei i bez powtórek, „Inna grupa…"',
    opts(app, '#newTeam')==='=G13 (nasza)|G7=G7|G9=G9|G10=G10|__new=Inna grupa…' && doc(app).getElementById('newTeam').value==='',
    opts(app, '#newTeam'));
  check('pole na nazwę ukryte', hidden(app, '#newTeamName'));
  fill(app, {'#newName':'Rex'});
  app.click('[data-act="add"]');
  check('bez zmiany — pies naszej grupy (team "")', lastCall(app, 'addDog').args[0].team==='', JSON.stringify(lastCall(app, 'addDog').args[0]));
  respondTo(app, 'addDog', base({dogs: DOGS().concat([d1(6,'Rex')])}));

  fill(app, {'#newName':'Kora', '#newTeam':'__new'});
  check('„Inna grupa…" — pole na nazwę od razu', !hidden(app, '#newTeamName'));
  app.click('[data-act="add"]');
  check('pusta nazwa grupy — komunikat, nic nie idzie', /Wpisz nazwę grupy/.test(toastOf(app)) && calls(app, 'addDog').length===0, toastOf(app));
  fill(app, {'#newTeamName':' g 7'});
  app.click('[data-act="add"]');
  check('„ g 7" przy istniejącej „G7" — ta sama grupa, ta sama pisownia', lastCall(app, 'addDog').args[0].team==='G7',
    JSON.stringify(lastCall(app, 'addDog').args[0]));
  check('po „Dodaj" formularz wraca do naszej grupy', doc(app).getElementById('newTeam').value==='' && hidden(app, '#newTeamName'));
  respondTo(app, 'addDog', base({dogs: DOGS().concat([d1(6,'Rex'), d1(7,'Kora','G7')])}));

  fill(app, {'#newName':'Psotka', '#newTeam':'__new', '#newTeamName':'G21'});
  app.window.eval('refresh()');                         // ktoś inny coś zmienił — katalog się przerysowuje
  respondTo(app, 'getData', base({dogs: DOGS().concat([d1(6,'Rex'), d1(7,'Kora','G7'), d1(8,'Od kogoś')])}));
  check('przerysowane (nowy pies widać)', !!doc(app).querySelector('li.dog[data-dog="8"]'));
  check('szkic grupy przeżył: „Inna grupa…" i wpisana nazwa', doc(app).getElementById('newTeam').value==='__new'
    && !hidden(app, '#newTeamName') && doc(app).getElementById('newTeamName').value==='G21');
  fill(app, {'#newTeam':'G9'});
  check('wybór grupy z listy chowa pole na nazwę', hidden(app, '#newTeamName'));
  app.click('[data-act="add"]');
  const tok = lastCall(app, 'addDog').args[2];
  check('grupa z listy', lastCall(app, 'addDog').args[0].team==='G9');
  app.pending.splice(app.pending.indexOf(lastCall(app, 'addDog')), 1)[0].fail(new Error('x'));
  app.pending.splice(app.pending.indexOf(lastCall(app, 'addDog')), 1)[0].fail(new Error('x'));
  check('nieudany zapis — dane wracają razem z grupą', doc(app).getElementById('newName').value==='Psotka'
    && doc(app).getElementById('newTeam').value==='G9', doc(app).getElementById('newTeam').value);
  fill(app, {'#newTeam':''});
  app.click('[data-act="add"]');
  check('inna grupa = inny pies: nowy token', lastCall(app, 'addDog').args[2] !== tok && lastCall(app, 'addDog').args[0].team==='');
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S134: grupa przy edycji psa ---------- */
function S134(){
  console.log('S134: edycja psa — bieżąca grupa wybrana, zmiana w obie strony, „Inna grupa…"; zapis zawsze niesie grupę');
  const DOGS = () => [d1(1,'Borys'), d1(2,'Tosia','G7')];
  const app = buildApp();
  app.seed(base({dogs: DOGS()}));
  app.window.__setAdmin('1234');
  app.click('[data-act="edit"][data-id="2"]');
  check('pies G7 — w edycji wybrana G7', doc(app).querySelector('[data-ef="team"]').value==='G7' && hidden(app, '[data-ef="teamNew"]'));
  fill(app, {'[data-ef="team"]':''});
  app.click('[data-act="editSave"][data-id="2"]');
  check('zmiana na naszą grupę — team ""', lastCall(app, 'updateDog').args[1].team==='', JSON.stringify(lastCall(app, 'updateDog').args[1]));
  check('...od razu w stanie (optymistycznie)', S(app).dogs.filter(d => d.id===2)[0].team==='');
  respondTo(app, 'updateDog', base({dogs: [d1(1,'Borys'), d1(2,'Tosia')]}));

  app.click('[data-act="edit"][data-id="1"]');
  check('nasz pies — wybrana nasza grupa', doc(app).querySelector('[data-ef="team"]').value==='');
  app.click('[data-act="editSave"][data-id="1"]');
  check('zapis bez zmiany grupy niesie ją jawnie (team "", nie brak pola)', lastCall(app, 'updateDog').args[1].team==='');
  respondTo(app, 'updateDog', base({dogs: [d1(1,'Borys'), d1(2,'Tosia')]}));

  app.click('[data-act="edit"][data-id="1"]');
  fill(app, {'[data-ef="team"]':'__new'});
  check('„Inna grupa…" — pole na nazwę', !hidden(app, '[data-ef="teamNew"]'));
  app.click('[data-act="editSave"][data-id="1"]');
  check('pusta nazwa — komunikat, edycja otwarta, nic nie idzie', /Wpisz nazwę grupy/.test(toastOf(app)) && calls(app, 'updateDog').length===0
    && !!doc(app).querySelector('.editform'), toastOf(app));
  fill(app, {'[data-ef="teamNew"]':'G21'});
  app.click('[data-act="editSave"][data-id="1"]');
  check('nowa grupa', lastCall(app, 'updateDog').args[1].team==='G21');
  respondTo(app, 'updateDog', base({dogs: [d1(1,'Borys','G21'), d1(2,'Tosia')]}));
  S(app).admin = false; app.window.eval("render('nav')");
  check('na liście dnia Borys już na liście innych grup', listOf(app, false)==='[2]' && listOf(app, true)==='[1]', ord(app));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S135: plakietka grupy ---------- */
function S135(){
  console.log('S135: plakietka „grupa G7" w linijce z numerem — tylko na pełnym kafelku psa innej grupy i w katalogu (wersja D)');
  const app = buildApp();
  app.seed(base({dogs: [dogFree({id:1, name:'Borys', ident:'1/26', box:'3'}), dogFree({id:2, name:'Maksymilian', ident:'77/26', box:'12', team:'G9', dif:'hard'}),
                        dogFree({id:3, name:'Tosia', team:'<b>G7</b>', walks:2}), dogFree({id:4, name:'Reksio', team:'G7'})],
    slots: [sl(2,1,{status:'reserved', who:'Grzesiek'}), sl(3,1,{status:'reserved', who:'Ola', group:1}), sl(4,1,{status:'reserved', who:'Ola', group:1})]}));
  const m2 = tile(app, 'm2');
  const pill = m2.querySelector('.dogmeta .teampill');
  check('pełny kafelek psa innej grupy: plakietka w linijce z numerem', !!pill && pill.textContent==='grupa G9'
    && /grupa G9.*nr 77\/26 · boks 12/.test(txt(m2.querySelector('.dogmeta'))), txt(m2));
  check('...linijka imienia jak na naszej liście (bez grupy)', !m2.querySelector('.row .teampill') && !/G9/.test(txt(m2.querySelector('.row'))));
  check('nasza lista bez plakietek', !tile(app, 'm1').querySelector('.teampill'));
  check('kafelek odłączony (spacer w grupie, jeden wiersz) bez plakietki — jest na pełnym kafelku psa',
    !!tile(app, 's3.1') && !tile(app, 's3.1').querySelector('.teampill') && !!tile(app, 'm3').querySelector('.teampill'), tiles(app));
  check('nazwa grupy jako tekst, nie HTML', !tile(app, 'm3').querySelector('.teampill b') && /<b>G7<\/b>/.test(tile(app, 'm3').querySelector('.teampill').textContent));
  app.window.__setAdmin('1234');
  const cat = doc(app).querySelector('li.dog[data-dog="2"]');
  check('katalog: plakietka przy psie innej grupy, nie przy naszym', !!cat.querySelector('.dogmeta .teampill')
    && !doc(app).querySelector('li.dog[data-dog="1"] .teampill'), txt(cat));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S136: te same reguły co serwer ---------- */
function S136(){
  console.log('S136: grupa psa — przeglądarka i serwer liczą ją tak samo (HOME_TEAM, limit, pisownia)');
  const conf = src => (src.match(/const HOME_TEAM = '([^']*)'/) || [])[1];
  const gs = fs.readFileSync(path.join(ROOT, 'Config.gs'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'Script.html'), 'utf8');
  check('HOME_TEAM ten sam w Config.gs i Script.html', !!conf(gs) && conf(gs)===conf(html), conf(gs) + ' / ' + conf(html));
  check('TEAM_MAX = MAX_LEN.TEAM', (html.match(/const TEAM_MAX = (\d+)/) || [])[1] === (gs.match(/TEAM: (\d+) \}/) || [])[1]);
  const app = buildApp(), env = makeContext({});
  const cases = [['G7', []], [' g 7 ', ['G7']], ['g13', []], ['  G 13', []], ['', []], [null, []], ['G\u00077', []],
                 ['Grupa bardzo długa nazwa ponad limit', []], ['x'.repeat(19) + ' y', []], ['g10', ['G1', 'G10']], ['Ekipa  Ani', ['ekipa ani']]];
  const diff = cases.filter(([v, k]) => app.window.teamClean(v, k) !== env.ctx.__api.dogTeam_(v, k));
  check('teamClean = dogTeam_ dla ' + cases.length + ' przypadków', diff.length===0,
    JSON.stringify(diff.map(([v, k]) => [v, app.window.teamClean(v, k), env.ctx.__api.dogTeam_(v, k)])));
  check('...i to nie są same puste wyniki', app.window.teamClean(' g 7 ', ['G7'])==='G7' && app.window.teamClean('g13')===''
    && app.window.teamClean('Ekipa  Ani', ['ekipa ani'])==='ekipa ani');
}

/* ---------- S137: „Bierze G7" ---------- */
function S137(){
  console.log('S137: „Bierze G7" — psa wyprowadza jego grupa: przycisk przy wolnym spacerze, pies schodzi na dół, „Cofnij"');
  const app = buildApp();
  // Gapa (odbyta) stoi w arkuszu PRZED Reksiem — wzięty Reksio ma zejść pod nią, jak każdy załatwiony pies.
  // Tosia: wolny spacer w naszej grupie spacerowej (z Borysem) — ten spacer jest nasz
  app.seed(base({dogs: [d1(1,'Borys'), d1(6,'Gapa','G9'), dogFree({id:2, name:'Reksio', team:'G7', lastWalk:'2026-10-05'}),
                        d2(3,'Bella','G7'), d1(4,'Tosia','G7'), d1(5,'Luna','G9')],
    slots: [sl(1,1,{status:'reserved', who:'Kasia', group:1}), sl(4,1,{group:1}), sl(6,1,{status:'walked', who:'Ola'})]}));
  const btn = (id, n) => doc(app).querySelector(`[data-act="team"][data-id="${id}"][data-slot="${n || 1}"]`);
  check('przycisk „Bierze G7" obok „Zarezerwuj" przy psie innej grupy', !!btn(2) && txt(btn(2))==='Bierze G7'
    && btn(2).previousElementSibling.dataset.act==='reserve');
  check('pies dwuspacerowy: przy każdym wolnym spacerze', !!btn(3, 1) && !!btn(3, 2));
  check('nasz pies — bez przycisku', !doc(app).querySelector('li.dog[data-dog="1"] [data-act="team"]'));
  check('wolny spacer w naszej grupie spacerowej (Tosia z Borysem) — bez przycisku', !btn(4) && !!tile(app, 's4.1')
    && !!tile(app, 's4.1').querySelector('[data-act="reserve"]'));
  check('start: Reksio z odznaką „bez spaceru", na górze listy innych grup', /bez spaceru/.test(txt(tile(app, 'm2')))
    && listOf(app, true)==='[3,2,4,5,6]', listOf(app, true));

  btn(2).dispatchEvent(new app.window.MouseEvent('click', {bubbles:true}));
  const job = lastCall(app, 'markTeam');
  check('markTeam z dniem i numerem spaceru', !!job && JSON.stringify(job.args)===JSON.stringify([2, D, 1]), job && JSON.stringify(job.args));
  check('od razu: sam ptaszek z grupą („✓ G7", bez „bierze") i „Cofnij", kafelek wyblakły jak odbyty, bez odznaki „bez spaceru"',
    txt(tile(app, 'm2').querySelector('.teamdone'))==='✓ G7' && !/bierze/.test(txt(tile(app, 'm2'))) && !!tile(app, 'm2').querySelector('[data-act="free"]')
    && tile(app, 'm2').classList.contains('walked') && !/bez spaceru/.test(txt(tile(app, 'm2'))), txt(tile(app, 'm2')));
  check('w zamrożonej liście stoi w miejscu', listOf(app, true)==='[3,2,4,5,6]', listOf(app, true));
  check('podsumowanie listy innych grup: „1 u swojej grupy"', /1 u swojej grupy/.test(countOf(app, 'other')) && !/swojej/.test(countOf(app, 'home')),
    countOf(app, 'other'));
  respondTo(app, 'markTeam', {slot:{slot:1, status:'team', who:'G7', time:'', group:0}});
  app.window.__settle();
  check('po ciszy na dół listy innych grup, jak odbyty (pod odbytą Gapą, która stoi wcześniej w arkuszu)',
    listOf(app, true)==='[3,4,5,6,2]', listOf(app, true));
  app.window.startSelect('2:1');
  check('wzięty spacer nie zaczyna zaznaczania grupy', !S(app).select);

  tile(app, 'm2').querySelector('[data-act="free"]').dispatchEvent(new app.window.MouseEvent('click', {bubbles:true}));
  const free = lastCall(app, 'setFree');
  check('„Cofnij" zwalnia dokładnie widziany stan', JSON.stringify(free.args)===JSON.stringify([2, D, {status:'team', who:'G7'}, 1]),
    JSON.stringify(free.args));
  check('...i znów są oba przyciski', !!btn(2) && !!doc(app).querySelector('[data-act="reserve"][data-id="2"]'));
  respondTo(app, 'setFree', {slot:{slot:1, status:'free', who:'', time:'', group:0}});

  btn(2).dispatchEvent(new app.window.MouseEvent('click', {bubbles:true}));
  const sent = app.shipped.filter(f => f==='markTeam').length;
  app.window.__force(); app.window.eval('checkStuck()');           // odpowiedź zginęła — zapis idempotentny, idzie powtórka
  check('zaginiona odpowiedź: jedna powtórka markTeam (RETRIABLE)', app.shipped.filter(f => f==='markTeam').length === sent + 1,
    app.shipped.join(','));
  calls(app, 'markTeam').forEach(p => p.ok({slot:{slot:1, status:'team', who:'G7', time:'', group:0}}));
  app.pending.splice(0, app.pending.length, ...app.pending.filter(p => p.fn!=='markTeam'));

  btn(5).dispatchEvent(new app.window.MouseEvent('click', {bubbles:true}));
  respondTo(app, 'markTeam', {slot:{slot:1, status:'reserved', who:'Ola', time:'', group:0}});   // ktoś był szybszy
  check('ktoś zarezerwował wcześniej — komunikat i stan z serwera', /innego opiekuna/.test(toastOf(app))
    && S(app).slots[D+'|5|1'].status==='reserved', toastOf(app));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

/* ---------- S139: lista dnia do prowadzącej = „Skopiuj treść" ---------- */
function S139(){
  console.log('S139: lista dnia, którą bot wysyła prowadzącej, jest tą samą treścią co „📋 Skopiuj treść" (serwer = przeglądarka)');
  const TPL = 'Dzień dobry,\nlista z [DATA] (grupa G13):\n[LISTA]\n— [DATA] —\n';
  const app = buildApp();
  app.seed(base({mailTemplate: TPL, mailSubject: 'Lista [DATA]'}));
  const env = makeContext({ props: { mailTemplate: TPL } });
  const sets = [
    [{name:'Borys', ident:'1/26'}, {name:'Borys', ident:'1/26'}, {name:'#2077', ident:'2077'}, {name:'Luna, ta mała', ident:''}],
    [{name:'Łatka', ident:'5'}, {name:'Lusia', ident:'6'}, {name:'Ąda "Mała"', ident:'7'}, {name:'Żaba', ident:'8'}, {name:'Azor', ident:'9'}],
    [],
  ];
  const diff = sets.map(entries => {
    S(app).past['2026-10-07'] = entries.map(e => Object.assign({date:'2026-10-07', who:'Ola', time:'10:00', group:0}, e));
    const client = app.window.mailText('2026-10-07'), server = env.ctx.__api.dayReportText_('2026-10-07', S(app).past['2026-10-07']);
    return client === server ? '' : JSON.stringify([client, server]);
  }).filter(Boolean);
  check('3 zestawy wpisów: tekst serwera = tekst „Skopiuj"', diff.length === 0, diff.join(' | '));
  S(app).past['2026-10-07'] = sets[0].map(e => Object.assign({date:'2026-10-07'}, e));
  check('...i to nie jest pusty tekst', /lista z 07\.10\.2026/.test(app.window.mailText('2026-10-07'))
    && /07\.10\.2026,,2077/.test(app.window.mailText('2026-10-07')));
}

/* ---------- S140: panel — lista dnia do prowadzącej ---------- */
function S140(){
  console.log('S140: panel — kontakt prowadzącej z kontaktów bota, włącznik, zapis, „Wyślij listę" z potwierdzeniem');
  const ANIA = '48600100200@c.us';
  const REPORT = (o, s) => Object.assign({settings: Object.assign({enabled:false, chatId:'', chatName:''}, s), configured: true, last: null,
    day: {date:'2026-10-07', label:'07.10.2026', status:'', at:''}}, o);
  const POLL = {settings: {question:'Grafik [TYDZIEŃ]', options:['Pon','Wt'], multi:true, day:0, hour:12, enabled:false, chatId:'', chatName:''},
    configured: true, state: null, last: null, next: {day:'2026-10-11', label:'12-18.10'}, now: {label:'12-18.10', question:'Grafik 12-18.10', status:'', at:''}};
  const DIAG = r => ({env:'prod', triggerInstalled:true, triggerCount:1, resetHour:18, serverDate:D, serverTime:'10:00', businessDate:D,
    timezone:'Europe/Warsaw', dogCount:1, taskCount:0, histCount:3, poll: POLL, dayReport: r});
  const open = r => {
    const app = buildApp();
    app.seed(base({dogs:[d1(1,'Borys')]}));
    app.window.__setAdmin('1234');
    app.click('.tab[data-tab="diag"]');
    respondTo(app, 'getDiagnostics', DIAG(r));
    calls(app, 'getPollState').forEach(() => respondTo(app, 'getPollState', {code:'authorized', text:'połączone'}));
    return app;
  };
  const app = open(REPORT());
  check('sekcja w panelu, „Wyślij listę z 07.10.2026"', /Lista dnia do prowadzącej/.test(app.html())
    && /Wyślij listę z 07\.10\.2026/.test(txt(doc(app).querySelector('[data-act="reportSend"]'))));
  app.click('[data-act="reportContacts"]');
  respondTo(app, 'getDayReportContacts', [{id: ANIA, name:'Ania prowadząca', phone:'+48600100200'}, {id:'48500100100@c.us', name:'Basia', phone:'+48500100100'}]);
  check('kontakty z telefonu bota na liście, z numerem', opts(app, '#reportChat')
    === '=— wybierz kontakt —|48600100200@c.us=Ania prowadząca (+48600100200)|48500100100@c.us=Basia (+48500100100)', opts(app, '#reportChat'));
  const en = doc(app).getElementById('reportEnabled');
  en.checked = true; en.dispatchEvent(new app.window.Event('change', {bubbles:true}));
  app.click('[data-act="reportSave"]');
  check('włączenie bez kontaktu — komunikat, nic nie idzie', /Wybierz kontakt/.test(toastOf(app)) && !calls(app, 'setDayReportSettings').length, toastOf(app));
  fill(app, {'#reportChat': ANIA});
  check('„Niezapisane zmiany" przy liście, nie przy ankiecie', !hidden(app, '.reportdirty') && hidden(app, '.polldirty'));
  fill(app, {'#pollQuestion': 'Grafik na [TYDZIEŃ]'});
  fill(app, {'#pollQuestion': 'Grafik [TYDZIEŃ]'});    // ankieta wraca do zapisanej — jej napis znika
  check('ankieta bez zmian chowa SWÓJ napis, nie ten przy liście (osobne klasy)', !hidden(app, '.reportdirty') && hidden(app, '.polldirty'));
  app.window.eval('fetchDiag()');                       // panel się przerysowuje
  respondTo(app, 'getDiagnostics', DIAG(REPORT()));
  calls(app, 'getPollState').forEach(() => respondTo(app, 'getPollState', {code:'authorized', text:'połączone'}));
  check('szkic przeżył przerysowanie', doc(app).getElementById('reportChat').value === ANIA && doc(app).getElementById('reportEnabled').checked);
  app.click('[data-act="reportSave"]');
  const save = lastCall(app, 'setDayReportSettings');
  check('zapis: kontakt (nazwa bez numeru), włączone, PIN', !!save && JSON.stringify(save.args) ===
    JSON.stringify([{chatId: ANIA, chatName:'Ania prowadząca', enabled:true}, '1234']), save && JSON.stringify(save.args));
  respondTo(app, 'setDayReportSettings', REPORT({}, {enabled:true, chatId:ANIA, chatName:'Ania prowadząca'}));
  check('po zapisie: bez „Niezapisane", opis włączonego', hidden(app, '.reportdirty') && /Włączone/.test(app.html()));

  let asked = '';
  app.window.confirm = m => { asked = m; return true; };
  app.click('[data-act="reportSend"]');
  check('„Wyślij listę": pytanie, potem wysyłka bez force', /Wysłać teraz listę z 07\.10\.2026 do Ania prowadząca/.test(asked)
    && JSON.stringify(lastCall(app, 'sendDayReportNow').args) === JSON.stringify(['1234', '2026-10-07']), asked);
  respondTo(app, 'sendDayReportNow', {sent:{day:'2026-10-07', at:'2026-10-09 14:00'},
    panel: REPORT({last:{day:'2026-10-07', at:'2026-10-09 14:00', ok:true, manual:true, chatName:'Ania prowadząca'}, day:{date:'2026-10-07', label:'07.10.2026', status:'sent', at:'2026-10-09 14:00'}},
                  {enabled:true, chatId:ANIA, chatName:'Ania prowadząca'})});
  check('wynik w panelu: wysłana (ręcznie)', /wysłana 2026-10-09 14:00 do Ania prowadząca \(ręcznie\)/.test(txt(doc(app).getElementById('view'))));
  app.click('[data-act="reportSend"]');
  check('już poszła — pytanie „jeszcze raz", wysyłka z force', /już poszła/.test(asked)
    && JSON.stringify(lastCall(app, 'sendDayReportNow').args) === JSON.stringify(['1234', '2026-10-07', true]), asked);
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

for(const s of [S130, S131, S132, S133, S134, S135, S136, S137, S139, S140]){
  try{ s(); }
  catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
}
console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

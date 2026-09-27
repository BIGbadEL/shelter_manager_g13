// S90-S98: spacer jako jednostka (1/2, 2/2), nowe sortowanie, pies w dwóch miejscach,
// zaznaczanie konkretnego spaceru, osłona stuknięć, dymek „Zapisuję…/Aktualizuję…",
// kolory wolontariuszy. Czasy skrócone przez opts.timing — zestaw jest asynchroniczny.
const { buildApp, dogFree } = require('./harness');
const fs = require('fs'), path = require('path');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const D = '2026-09-24';
const TIMING = { quiet:120, announce:80, tapGuard:150, busyMin:40 };
const base = o => Object.assign({dogs: [], slots: [], tasks: [], today: D, businessDate: D, resetHour: 20, env: 'prod'}, o || {});
const d1 = (id, name) => dogFree({id, name});
const d2 = (id, name) => dogFree({id, name, walks:2});
const sl = (id, n, o) => Object.assign({date:D, dogId:id, slot:n, status:'free', who:'', time:'', group:0}, o);
const doc   = app => app.window.document;
const S     = app => app.window.__state;
const tiles = app => JSON.stringify(app.window.__tiles());
const ord   = app => JSON.stringify(app.window.__order());
const tile  = (app, id) => doc(app).querySelector(`li[data-tile="${id}"]`);
const txt   = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '(brak)';
const slotOf = (app, id, n) => S(app).slots[D+'|'+id+'|'+n] || {status:'free', group:0, who:''};
const ev    = (app, type, detail) => new app.window.MouseEvent(type, {bubbles:true, clientX:0, clientY:0, detail:detail||0});
/** Prawdziwe stuknięcie palcem: przyłożenie (pointerdown) i klik z licznikiem kliknięć. */
function tap(app, el, detail){ el.dispatchEvent(ev(app, 'pointerdown')); el.dispatchEvent(ev(app, 'click', detail || 1)); }
async function press(app, el){ el.dispatchEvent(ev(app, 'pointerdown')); await sleep(650); el.dispatchEvent(ev(app, 'pointerup')); }
const tapEl = (app, el) => el.dispatchEvent(new app.window.Event('click', {bubbles:true}));
const busy  = app => { const b = doc(app).getElementById('busy'); return b.classList.contains('hidden') ? '' : b.dataset.kind + ':' + b.textContent; };
const toastTxt = app => doc(app).getElementById('toast').textContent;

async function S90(){
  console.log('S90: kolejność — kto czeka na chętnego, psy dwuspacerowe wyżej, odbyte na dół');
  const app = buildApp();
  app.seed(base({
    dogs: [d1(1,'Azor'), d2(2,'Bari'), d2(3,'Cezar'), d1(4,'Dino'), d2(5,'Ela'), d2(6,'Fado'), d1(7,'Gapa'), d2(8,'Hera')],
    slots: [
      sl(3,1,{status:'walked', who:'Ala'}),                                  // Cezar: 1/2 odbyty, 2/2 wolny
      sl(4,1,{status:'reserved', who:'Ola'}),                                // Dino: zarezerwowany
      sl(5,1,{status:'reserved', who:'Iza'}),                                // Ela: 1/2 zarezerwowany, 2/2 wolny
      sl(6,1,{status:'walked', who:'Zu'}), sl(6,2,{status:'reserved', who:'Ewa'}),   // Fado: wszystko obsadzone
      sl(7,1,{status:'walked', who:'Ala'}),                                  // Gapa: odbyty
      sl(8,1,{status:'walked', who:'Ola'}), sl(8,2,{status:'walked', who:'Iza'}),   // Hera: komplet
    ]}));
  check('pełna kolejność', ord(app)==='[2,5,3,1,6,4,8,7]', ord(app));
  const at = id => app.window.__order().indexOf(id);
  check('psy dwuspacerowe czekające na chętnego nad jednospacerowym wolnym (Cezar nad Azorem)', at(3) < at(1));
  check('Ela (1/2 zarezerwowany, 2/2 wolny) wśród czekających na chętnego — jej popołudnie jest wolne', at(5) < at(1));
  check('mniej odbytych spacerów wyżej (Bari 0/2 nad Cezarem 1/2)', at(2) < at(3));
  check('wszystko obsadzone pod wolnymi, dwuspacerowy wyżej (Fado nad Dinem)', at(1) < at(6) && at(6) < at(4));
  check('odbyte na samym dole', at(8) >= 6 && at(7) >= 6);
  check('pies dwuspacerowy to jeden kafelek z dwoma polami', !!tile(app,'m2').querySelector('.slot[data-slot="1"]')
    && !!tile(app,'m2').querySelector('.slot[data-slot="2"]'));
  check('licznik liczy spacery', /<b>3<\/b> zarezerwowane · <b>5<\/b> wyprowadzone · <b>5<\/b> wolne/.test(app.html()),
    (app.html().match(/class="count">(.*?)<\/div>/)||[])[1]);

  // grupa stoi tam, gdzie jej najpilniejszy spacer — bez grupy kolejność byłaby Bari, Cezar, Dino, Azor
  const g = buildApp();
  g.seed(base({dogs:[d1(1,'Dino'), d1(2,'Bari'), d1(3,'Cezar'), d1(4,'Azor')],
    slots:[sl(1,1,{status:'reserved', who:'Ola'}), sl(3,1,{group:1}), sl(4,1,{status:'reserved', who:'Ala', group:1})]}));
  check('grupa w miejscu najpilniejszego spaceru (wolny Cezar), zarezerwowany Azor podciągnięty do niej nad Dina',
    ord(g)==='[2,3,4,1]', ord(g));
  check('bez błędów', app.errors.length===0 && g.errors.length===0, app.errors.concat(g.errors).join('; '));
}

async function S91(){
  console.log('S91: spacer wychodzi z grupy przy zamrożonej liście — kafelek zostaje w miejscu');
  const app = buildApp({timing:TIMING});
  app.seed(base({dogs:[d2(1,'Bari'), d1(2,'Cezar'), d1(3,'Dino')],
    slots:[sl(1,1,{status:'walked', who:'Ala', group:1}), sl(2,1,{status:'walked', who:'Ola', group:1})]}));
  check('start: Bari 2/2 na górze, poranna grupa niżej', tiles(app)==='["m1","m3","s1.1","s2.1"]', tiles(app));
  const cofnij = tile(app,'s1.1').querySelector('[data-act="free"]');
  tap(app, cofnij);                                      // „Cofnij" 1/2 Bariego — palcem, lista zamrożona
  check('1/2 wraca do kafelka głównego (pola 1/2 i 2/2), Cezar sam — już bez grupy',
    tiles(app)==='["m1","m3","m2"]' && !!tile(app,'m1').querySelector('.slot[data-slot="1"]'), tiles(app));
  check('Cezar stoi tam, gdzie stał jego spacer w grupie — nic nie skoczyło na koniec', app.window.__order().indexOf(2)===2);
  check('setFree 1/2 z widzianym stanem', app.pending[0].fn==='setFree' && app.pending[0].args[3]===1
    && JSON.stringify(app.pending[0].args[2])==='{"status":"walked","who":"Ala"}', JSON.stringify(app.pending[0].args));
  app.respondNext({slot:{slot:1, status:'free'}});
  await sleep(TIMING.quiet + TIMING.announce + 150);
  check('po ciszy i zapowiedzi lista się układa', ord(app)==='[1,3,2]', ord(app));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S92(){
  console.log('S92: zaznaczanie KONKRETNEGO spaceru — kółko przy każdym polu 1/2, 2/2');
  const app = buildApp();
  app.seed(base({dogs:[d2(1,'Bari'), d1(2,'Cezar'), d1(3,'Dino')]}));
  const f = n => tile(app,'m1').querySelector(`.slot[data-slot="${n}"]`);
  await press(app, f(2).querySelector('.slotno'));        // przytrzymanie na polu 2/2
  check('przytrzymanie pola 2/2 zaznacza spacer 2/2', S(app).select && S(app).select.anchor==='1:2', JSON.stringify(S(app).select));
  check('kółko przy każdym polu, zaznaczone to 2/2', !!f(1).querySelector('.pickbox') && f(2).classList.contains('picked')
    && !f(1).classList.contains('picked') && !tile(app,'m1').classList.contains('pick'));
  tapEl(app, tile(app,'m2'));
  tapEl(app, f(1));                                       // 1/2 tego samego psa, gdy przytrzymany jest 2/2
  check('przytrzymanego spaceru nie przenosi się na drugi', S(app).select.ids.indexOf('1:2')>=0 && S(app).select.ids.indexOf('1:1')<0,
    JSON.stringify(S(app).select.ids));
  tapEl(app, doc(app).getElementById('selCancel'));

  await press(app, tile(app,'m2'));                       // teraz od Cezara
  tapEl(app, f(1));
  check('stuknięcie pola 1/2 zaznacza 1/2', JSON.stringify(S(app).select.ids)==='["2:1","1:1"]', JSON.stringify(S(app).select.ids));
  tapEl(app, f(2));
  check('stuknięcie 2/2 tego samego psa przenosi zaznaczenie — pies idzie jednym spacerem',
    JSON.stringify(S(app).select.ids)==='["2:1","1:2"]' && f(2).classList.contains('picked') && !f(1).classList.contains('picked'),
    JSON.stringify(S(app).select.ids));
  tapEl(app, doc(app).getElementById('selGroup'));
  const job = app.pending[app.pending.length-1];
  check('setGroup z numerami spacerów', job.fn==='setGroup' && JSON.stringify(job.args[1])==='["2:1","1:2"]', JSON.stringify(job.args));
  check('2/2 w grupie z Cezarem, 1/2 w kafelku głównym z linijką „w grupie"',
    !!tile(app,'s1.2') && /2\/2\s*👥 grupa/.test(txt(tile(app,'m1'))) && !!tile(app,'m1').querySelector('[data-act="reserve"][data-slot="1"]'),
    tiles(app));
  app.respondNext({group:1, slots:[sl(1,2,{group:1}), sl(2,1,{group:1})]});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S93(){
  console.log('S93: osłona stuknięć — lista albo kafelek zmienione pod palcem');
  const app = buildApp({timing:TIMING});
  app.seed(base({dogs:[d1(1,'Azor'), d1(2,'Bari'), d1(3,'Cezar')]}));
  // Azor zarezerwowany na innym telefonie — odświeżenie zapowiada przestawienie, a po chwili je robi
  app.window.eval('refresh()');
  app.respondNext(base({dogs:[d1(1,'Azor'), d1(2,'Bari'), d1(3,'Cezar')], slots:[sl(1,1,{status:'reserved', who:'Ola'})]}));
  check('zmiana z innego telefonu: kafelek w miejscu, lista zapowiada ruch', ord(app)==='[1,2,3]' && /^sort:Aktualizuję/.test(busy(app)), busy(app));
  await sleep(TIMING.announce + 60);
  check('po zapowiedzi lista się przestawia', ord(app)==='[2,3,1]', ord(app));
  tap(app, doc(app).querySelector('li[data-tile="m2"] [data-act="reserve"]'));   // palec leciał w starą listę
  check('stuknięcie tuż po przestawieniu nie liczy się — z komunikatem',
    !doc(app).querySelector('[data-entry]:not(.hidden)') && /przesunęła/.test(toastTxt(app)), toastTxt(app));
  await sleep(TIMING.tapGuard + 30);
  tap(app, doc(app).querySelector('li[data-tile="m2"] [data-act="reserve"]'));
  check('chwilę później to samo stuknięcie działa', !!doc(app).querySelector('[data-entry="2"]:not(.hidden)'));

  const b = buildApp({timing:TIMING});                     // kafelek zmieniony cudzą ręką tuż przed stuknięciem
  b.seed(base({dogs:[d1(1,'Azor'), d1(2,'Bari')]}));
  b.window.eval('refresh()');
  b.respondNext(base({dogs:[d1(1,'Azor'), d1(2,'Bari')], slots:[sl(2,1,{status:'reserved', who:'Ola'})]}));
  tap(b, doc(b).querySelector('li[data-tile="m2"] [data-act="free"]'));
  check('„Zwolnij", które przed chwilą było „Zarezerwuj", nie liczy się — z komunikatem',
    !b.pending.some(p => p.fn==='setFree') && /zmienił/.test(toastTxt(b)), b.pending.map(p=>p.fn).join(','));

  const c = buildApp({timing:TIMING});                     // własne podwójne stuknięcie
  c.seed(base({dogs:[d1(1,'Azor')]}));
  c.click('[data-act="reserve"][data-id="1"]'); c.type('[data-input="1"]', 'Ala');
  tap(c, doc(c).querySelector('[data-act="confirm"][data-id="1"]'));
  tap(c, doc(c).querySelector('[data-act="free"][data-id="1"]'), 2);   // drugie stuknięcie trafia w „Zwolnij"
  check('podwójne stuknięcie: rezerwacja jest, zwolnienia nie ma — i bez komunikatu',
    c.pending.filter(p => p.fn==='reserve').length===1 && !c.pending.some(p => p.fn==='setFree') && toastTxt(c)==='',
    c.pending.map(p=>p.fn).join(',') + ' | ' + toastTxt(c));
  c.respondNext({slot:{slot:1, status:'reserved', who:'Ala'}});
  c.click('[data-act="walk"][data-id="1"]');            // klik z klawiatury/programu — bez osłony
  check('klik bez palca (Enter, program) idzie zawsze', c.pending.some(p => p.fn==='markWalked'));
  check('bez błędów', app.errors.length===0 && b.errors.length===0 && c.errors.length===0,
    app.errors.concat(b.errors, c.errors).join('; '));
}

async function S94(){
  console.log('S94: dymek „Zapisuję…" przy zapisie, „Aktualizuję…" do przestawienia listy');
  const app = buildApp({timing:TIMING});
  app.seed(base({dogs:[d1(1,'Azor'), d1(2,'Bari'), d1(3,'Cezar')]}));
  check('start: dymka nie ma', busy(app)==='');
  check('trzy kropki do animacji', doc(app).querySelectorAll('#busy .dots i').length===3);
  app.click('[data-act="reserve"][data-id="1"]'); app.type('[data-input="1"]', 'Ala'); app.click('[data-act="confirm"][data-id="1"]');
  check('od razu: „Zapisuję"', busy(app).startsWith('save:Zapisuję'), busy(app));
  check('stary napis w nagłówku zniknął', !doc(app).getElementById('sync'));
  app.respondNext({slot:{slot:1, status:'reserved', who:'Ala'}});
  check('zapis skończony, lista czeka na przestawienie: „Aktualizuję"', busy(app).startsWith('sort:Aktualizuję') && ord(app)==='[1,2,3]', busy(app));
  await sleep(TIMING.announce / 2);
  doc(app).body.dispatchEvent(ev(app, 'pointerdown'));   // ktoś dotyka ekranu w czasie zapowiedzi
  await sleep(TIMING.announce + 30);
  check('dotknięcie odwołuje zapowiedź — lista dalej stoi', ord(app)==='[1,2,3]' && busy(app).startsWith('sort:'), busy(app));
  await sleep(TIMING.quiet + 200 - TIMING.announce + 20);   // cisza minęła: przestawienie zapowiedziane OD NOWA
  check('po ciszy najpierw znów zapowiedź, nie ruch z zaskoczenia', ord(app)==='[1,2,3]' && busy(app).startsWith('sort:'), ord(app));
  await sleep(TIMING.announce + 60);
  check('po ciszy przestawiona', ord(app)==='[2,3,1]', ord(app));
  await sleep(TIMING.busyMin + 30);
  check('dymek znika', busy(app)==='', busy(app));

  // zapis kończy się, gdy ktoś właśnie pisze imię — lista nie przerysowuje się, ale dymek i tak gaśnie
  const b = buildApp({timing:TIMING});
  b.seed(base({dogs:[d1(1,'Azor'), d1(2,'Bari')]}));
  b.click('[data-act="reserve"][data-id="1"]'); b.type('[data-input="1"]', 'Ala'); b.click('[data-act="confirm"][data-id="1"]');
  b.click('[data-act="reserve"][data-id="2"]');         // pole „Twoje imię" przy Barim otwarte
  b.respondNext({slot:{slot:1, status:'reserved', who:'Ala'}});
  await sleep(TIMING.busyMin + 30);
  check('„Zapisuję" gaśnie po zapisie także wtedy, gdy ktoś pisze imię', busy(b)==='', busy(b));
  check('bez błędów', app.errors.length===0 && b.errors.length===0, app.errors.concat(b.errors).join('; '));
}

async function S95(){
  console.log('S95: kolor wolontariusza — ta sama osoba, ten sam kolor; inny niż kolory grup');
  const app = buildApp();
  app.seed(base({dogs:[d1(1,'Azor'), d2(2,'Bari'), d1(3,'Cezar'), d1(4,'Dino')],
    slots:[sl(1,1,{status:'reserved', who:'Ala'}), sl(2,1,{status:'walked', who:'Ala'}), sl(2,2,{status:'reserved', who:'Ola'}),
           sl(3,1,{status:'reserved', who:'Ola', group:1}), sl(4,1,{status:'free', group:1})],
    volunteers:{[D]:{'ala':2, 'ola':5}}}));
  const script = fs.readFileSync(path.join(__dirname, '..', 'Script.html'), 'utf8');
  const PALETTE = eval(script.match(/const VOL_COLORS = (\[[\s\S]*?\]);/)[1]);
  const vc = el => (el.getAttribute('style')||'').match(/--vc:(#[0-9a-f]+)/i)[1];
  const chips = [...doc(app).querySelectorAll('.vol')];
  const ala = chips.filter(c => /Ala/.test(c.textContent)), ola = chips.filter(c => /Ola/.test(c.textContent));
  check('Ala przy dwóch psach — ten sam kolor z przydziału dnia', ala.length===2 && ala.every(c => vc(c)===PALETTE[2]),
    ala.map(vc).join(','));
  check('Ola (2/2 Bariego i Cezar w grupie) — ten sam, inny niż Ali', ola.length===2 && ola.every(c => vc(c)===PALETTE[5]));
  check('imię zostaje tekstem', ala.every(c => /Ala/.test(c.textContent)) && /✓\s*Ala/.test(txt(tile(app,'m2'))));
  // imię, którego kolor „z imienia" to akurat kolor Ali — przydział dnia musi dać inny
  const fnv = s => { let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const who = ['Iza','Ewa','Zu','Kasia','Basia','Jan','Tomek','Ula','Ada','Olek','Wiki','Nina','Maks','Lena'].filter(x => fnv(x.toLowerCase()) % PALETTE.length===2)[0];
  check('(przygotowanie) jest imię z kolorem Ali „z imienia"', !!who);
  app.click('[data-act="reserve"][data-id="4"]'); app.type('[data-input="4"]', who); app.click('[data-act="confirm"][data-id="4"]');
  const iza = () => [...doc(app).querySelectorAll('.vol')].filter(c => c.textContent.indexOf(who)>=0)[0];
  check('nowa osoba od razu dostaje kolor, którego nikt dziś nie ma — także gdy „jej" kolor zajęty',
    !!iza() && vc(iza())!==PALETTE[2] && vc(iza())!==PALETTE[5], who + ' ' + (iza() && vc(iza())));
  app.respondNext({slot:{slot:1, status:'reserved', who, group:1}, volunteers:{[D]:{'ala':2, 'ola':5, [who.toLowerCase()]:7}}});
  check('kolor z przydziału serwera', vc(iza())===PALETTE[7], vc(iza()));

  const config = fs.readFileSync(path.join(__dirname, '..', 'Config.gs'), 'utf8');
  check('paleta tej samej długości co na serwerze', PALETTE.length===Number(config.match(/VOLUNTEER_COLORS = (\d+)/)[1]));
  const groups = script.match(/const GROUP_COLORS = \[[\s\S]*?\];/)[0].match(/#[0-9a-f]{6}/gi).map(x => x.toLowerCase());
  const difs = script.match(/const DIF = \{[\s\S]*?\};/)[0].match(/#[0-9a-f]{6}/gi).map(x => x.toLowerCase());
  check('kolory wolontariuszy nie powtarzają kolorów grup ani trudności',
    PALETTE.every(c => groups.indexOf(c.toLowerCase())<0 && difs.indexOf(c.toLowerCase())<0) && new Set(PALETTE).size===PALETTE.length);
  const sty = fs.readFileSync(path.join(__dirname, '..', 'Styles.html'), 'utf8');
  check('wolontariusz to kontur i kropka, nie tło kafelka jak grupa', /\.vol\{[^}]*border:2px solid var\(--vc/.test(sty)
    && !/\.vol\{[^}]*background:var\(--vc/.test(sty));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S96(){
  console.log('S96: kilka szybkich stuknięć w tego samego psa');
  const app = buildApp({timing:TIMING});
  app.seed(base({dogs:[d1(1,'Azor'), d1(2,'Bari')]}));
  tap(app, doc(app).querySelector('[data-act="reserve"][data-id="1"]'));
  app.type('[data-input="1"]', 'Ala');
  tap(app, doc(app).querySelector('[data-act="confirm"][data-id="1"]'));
  tap(app, doc(app).querySelector('[data-act="walk"][data-id="1"]'));   // od razu „Wyprowadzony" pod palcem
  check('trzecie stuknięcie zaraz po drugim nie przechodzi', !app.pending.some(p => p.fn==='markWalked'),
    app.pending.map(p=>p.fn).join(','));
  check('kafelek pokazuje rezerwację i kręciołek zapisu', /Ala/.test(txt(tile(app,'m1'))) && !!tile(app,'m1').querySelector('.saving'));
  check('…a dymek „Zapisuję"', busy(app).startsWith('save:'));
  await sleep(TIMING.tapGuard + 30);
  tap(app, doc(app).querySelector('[data-act="walk"][data-id="1"]'));
  const q = app.pending.map(p => p.fn + '@' + p.args[0]);
  check('po chwili „Wyprowadzony" przechodzi — po rezerwacji, na tym samym torze',
    JSON.stringify(q)==='["reserve@1"]' && app.state().queueLen===1, JSON.stringify(q) + ' kolejka=' + app.state().queueLen);
  app.respondNext({slot:{slot:1, status:'reserved', who:'Ala'}});
  check('markWalked rusza po rezerwacji', app.pending.length===1 && app.pending[0].fn==='markWalked');
  app.respondNext({slot:{slot:1, status:'walked', who:'Ala', time:'10:00'}});
  check('stan końcowy: wyprowadzony', slotOf(app,1,1).status==='walked' && /✓\s*Ala/.test(txt(tile(app,'m1'))));
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S97(){
  console.log('S97: 2/2 zarezerwowany, zanim ktoś wyszedł z psem rano; 1/2 w grupie, 2/2 czeka wysoko');
  const app = buildApp();
  app.seed(base({dogs:[d1(1,'Azor'), d2(2,'Bari'), d1(3,'Cezar')],
    slots:[sl(1,1,{status:'reserved', who:'Ala', group:1}), sl(2,1,{status:'reserved', who:'Ola', group:1})]}));
  check('Bari: 1/2 w grupie z Azorem, kafelek główny z 2/2 na samej górze', tiles(app)==='["m2","m3","s2.1","s1.1"]', tiles(app));
  app.click('[data-act="reserve"][data-id="2"][data-slot="2"]');
  app.type('[data-input="2"][data-slot="2"]', 'Jan');
  app.click('[data-act="confirm"][data-id="2"][data-slot="2"]');
  const r = app.pending[0];
  check('rezerwacja popołudnia — spacer 2', r.fn==='reserve' && r.args[3]===2, JSON.stringify(r.args));
  check('1/2 nietknięty w grupie', slotOf(app,2,1).who==='Ola' && slotOf(app,2,1).group===1 && slotOf(app,2,2).who==='Jan');
  check('pole 2/2 w kafelku głównym, a nie w grupie', /Jan/.test(txt(tile(app,'m2'))) && !/Jan/.test(txt(tile(app,'s2.1'))));
  app.respondNext({slot:{slot:2, status:'reserved', who:'Jan'}});
  app.click('li[data-tile="s1.1"] [data-act="walk"]');   // wspólny spacer porannej grupy
  const w = app.pending.filter(p => p.fn==='markWalked').map(p => p.args[0] + '/' + p.args[2]).sort();
  check('wspólny spacer odhacza Azora i 1/2 Bariego — nie 2/2', JSON.stringify(w)==='["1/1","2/1"]', JSON.stringify(w));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

(async ()=>{
  for(const s of [S90, S91, S92, S93, S94, S95, S96, S97]){
    try{ await s(); }
    catch(e){ failures++; console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e)); }
  }
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})();

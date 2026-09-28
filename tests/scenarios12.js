// S71-S82: spacery grupowe. Przytrzymanie kafelka jest mierzone prawdziwym
// zegarem (jak na telefonie), więc zestaw jest asynchroniczny.
const { buildApp, dogFree } = require('./harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function drained(app){ const s=app.state(); return s.sending===false && s.queueLen===0 && s.pending.length===0; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const D = '2026-09-24';
const DOGS = () => [
  dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna'}), dogFree({id:3, name:'Rex'}),
  dogFree({id:4, name:'Cyra'}),  dogFree({id:5, name:'Fado'}),
];
const base = o => Object.assign({dogs: DOGS(), walks: [], tasks: [], today: D, businessDate: D,
                                 resetHour: 20, env: 'prod'}, o || {});
const doc   = app => app.window.document;
const li    = (app, id) => doc(app).querySelector(`li.dog[data-dog="${id}"]`);
const S     = app => app.window.__state;
const ord   = app => JSON.stringify(app.window.__order());
const ev    = (app, type, x) => new app.window.MouseEvent(type, {bubbles:true, clientX:x||0, clientY:0});
const tapEl = (app, el) => el.dispatchEvent(new app.window.Event('click', {bubbles:true}));
async function press(app, id){                         // przytrzymanie palca na kafelku
  li(app, id).dispatchEvent(ev(app, 'pointerdown'));
  await sleep(650);
  const l = li(app, id);
  if(l) l.dispatchEvent(ev(app, 'pointerup'));
}
const bar      = app => doc(app).getElementById('selectBar');
const groupBtn = app => doc(app).getElementById('selGroup');
const bgOf     = (app, id) => (li(app, id).getAttribute('style') || '').match(/background:(#[0-9a-f]+)/i);
const lastJob  = app => app.pending[app.pending.length-1];

async function S71(){
  console.log('S71: przytrzymanie włącza zaznaczanie, krótkie stuknięcie nie');
  const app = buildApp();
  app.seed(base());
  li(app, 1).dispatchEvent(ev(app, 'pointerdown'));
  li(app, 1).dispatchEvent(ev(app, 'pointerup'));      // puszczone od razu
  await sleep(700);
  check('krótkie stuknięcie nie włącza zaznaczania', !S(app).select);

  li(app, 1).dispatchEvent(ev(app, 'pointerdown', 0));
  li(app, 1).dispatchEvent(ev(app, 'pointermove', 40)); // palec przewija listę
  await sleep(700);
  check('przewijanie listy nie włącza zaznaczania', !S(app).select);

  await press(app, 1);
  check('przytrzymanie włącza zaznaczanie', !!S(app).select && S(app).select.anchor==='1:1', JSON.stringify(S(app).select));
  check('pasek na dole widoczny', !bar(app).classList.contains('hidden'));
  check('przytrzymany pies zaznaczony', li(app, 1).classList.contains('picked'));
  check('„Grupa" wyszarzona, dopóki nie ma towarzysza', groupBtn(app).disabled===true);
  // przyciski zostają na miejscu (żeby nic nie skoczyło), ale stuknięcie w nie tylko zaznacza
  tapEl(app, li(app, 3).querySelector('[data-act="reserve"]'));
  check('„Zarezerwuj" w tym trybie nie rezerwuje, tylko zaznacza',
    li(app, 3).classList.contains('picked') && !doc(app).querySelector('[data-entry]:not(.hidden)')
    && S(app).slots[D+'|3|1'] === undefined, JSON.stringify(S(app).slots));
  tapEl(app, li(app, 3));

  tapEl(app, li(app, 2));
  check('stuknięcie zaznacza psa', li(app, 2).classList.contains('picked'));
  check('„Grupa" aktywna od pierwszego towarzysza', groupBtn(app).disabled===false);
  check('licznik', /Zaznaczone: 2 psy/.test(doc(app).getElementById('selInfo').textContent));
  tapEl(app, li(app, 1));
  check('przytrzymanego nie da się odznaczyć', li(app, 1).classList.contains('picked'));
  tapEl(app, li(app, 2));
  check('drugie stuknięcie odznacza', !li(app, 2).classList.contains('picked') && groupBtn(app).disabled===true);

  tapEl(app, doc(app).getElementById('selCancel'));
  check('Anuluj kończy tryb', !S(app).select && bar(app).classList.contains('hidden'));
  check('...i przyciski wracają', /data-act="reserve" data-id="1"/.test(app.html()));
  check('nic nie poleciało na serwer', !app.shipped.includes('setGroup') && !app.shipped.includes('reserve'),
    app.shipped.join(','));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S72(){
  console.log('S72: potwierdzenie — wspólny kolor, psy obok siebie, każda grupa w innym kolorze');
  const app = buildApp();
  app.seed(base());
  check('start: kolejność z arkusza', ord(app)==='[1,2,3,4,5]', ord(app));
  await press(app, 1);
  tapEl(app, li(app, 3));
  tapEl(app, li(app, 5));
  tapEl(app, groupBtn(app));
  const job = lastJob(app);
  check('setGroup(dzień, skład, 0 = nowa)', job.fn==='setGroup' && job.args[0]===D
    && JSON.stringify(job.args[1])==='["1:1","3:1","5:1"]' && job.args[2]===0, JSON.stringify(job.args));
  check('tryb zaznaczania zamknięty', !S(app).select && bar(app).classList.contains('hidden'));
  const c1 = bgOf(app, 1) && bgOf(app, 1)[1];
  check('ten sam kolor dla całej grupy', !!c1 && bgOf(app, 3)[1]===c1 && bgOf(app, 5)[1]===c1, c1);
  check('psy spoza grupy bez koloru', !bgOf(app, 2) && !bgOf(app, 4));
  check('bez napisu „grupa" na kafelku — grupę niesie kolor i blok (feedback z testów)', !/grupa/.test(li(app, 3).textContent));
  check('grupa od razu razem, w miejscu najpilniejszego psa', ord(app)==='[1,3,5,2,4]', ord(app));
  app.respondNext({group:1, walks:[1,3,5].map(id=>({date:D, dogId:id, status:'free', group:1}))});

  await press(app, 2);
  tapEl(app, li(app, 4));
  tapEl(app, groupBtn(app));
  const c2 = bgOf(app, 2) && bgOf(app, 2)[1];
  check('druga grupa w innym kolorze', !!c2 && c2!==c1 && bgOf(app, 4)[1]===c2, c1 + ' / ' + c2);
  app.respondNext({group:2, walks:[{date:D,dogId:1,group:1},{date:D,dogId:3,group:1},{date:D,dogId:5,group:1},
                                   {date:D,dogId:2,group:2},{date:D,dogId:4,group:2}]});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S73(){
  console.log('S73: „Wyprowadzony ✓" dopiero, gdy nikt z grupy nie jest wolny — i wtedy dla wszystkich');
  const app = buildApp();
  app.seed(base({walks:[
    {date:D, dogId:1, status:'reserved', who:'Ala', group:1},
    {date:D, dogId:2, status:'free', group:1},
  ]}));
  check('Borys: przycisk wyłączony', !/data-act="walk" data-id="1"/.test(li(app, 1).outerHTML) && /disabled/.test(li(app, 1).outerHTML));
  check('...z podpowiedzią, na kogo czekamy', /czeka na rezerwację: Luna/.test(li(app, 1).textContent), li(app, 1).textContent);

  app.click('[data-act="reserve"][data-id="2"]');
  app.type('[data-input="2"]', 'Ola');
  app.click('[data-act="confirm"][data-id="2"]');
  check('rezerwacja Luny odblokowuje przycisk u Borysa (kafelek towarzysza przerysowany)',
    /data-act="walk" data-id="1"/.test(li(app, 1).outerHTML), li(app, 1).outerHTML.slice(0,300));
  app.respondNext({dog: dogFree({id:2, name:'Luna', status:'reserved', who:'Ola', group:1})});

  app.click('[data-act="walk"][data-id="2"]');
  const walks = app.pending.filter(p => p.fn==='markWalked');
  check('jedno kliknięcie odhacza obu', walks.length===2
    && walks.map(w=>w.args[0]).sort().join()==='1,2', app.pending.map(p=>p.fn+JSON.stringify(p.args)).join(' '));
  check('każdy ze swoim numerem spaceru (psy na jeden spacer — spacer 1) i dniem',
    walks.every(w => w.args[2]===1 && w.args[3]===D), JSON.stringify(walks.map(w => w.args)));
  check('obaj od razu wyprowadzeni', li(app, 1).classList.contains('walked') && li(app, 2).classList.contains('walked'));
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'walked', who:'Ala', group:1})});
  app.respondNext({dog: dogFree({id:2, name:'Luna', status:'walked', who:'Ola', group:1})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
  return app;
}

async function S74(app){
  console.log('S74: cofnięcie cofa tylko jednego psa — i wyprowadza go z grupy');
  app.click('[data-act="free"][data-id="1"]');         // „Cofnij" u Borysa
  const frees = app.pending.filter(p => p.fn==='setFree');
  check('tylko Borys', frees.length===1 && frees[0].args[0]===1, app.pending.map(p=>p.fn).join(','));
  check('Luna dalej wyprowadzona', li(app, 2).classList.contains('walked'));
  check('Borys bez opiekuna wypada z grupy', !bgOf(app, 1)
    && S(app).slots[D+'|1|1'].group===0, JSON.stringify(S(app).slots[D+'|1|1']));
  check('grupa z samą Luną przestaje być grupą — także na ekranie',
    !bgOf(app, 2) && S(app).slots[D+'|2|1'].group===0, JSON.stringify(S(app).slots[D+'|2|1']));
  app.respondNext({dog: dogFree({id:1, name:'Borys'})});

  app.click('[data-act="reserve"][data-id="1"]');
  app.type('[data-input="1"]', 'Ala');
  app.click('[data-act="confirm"][data-id="1"]');
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'reserved', who:'Ala'})});
  check('po ponownej rezerwacji Borysa da się odhaczyć',
    /data-act="walk" data-id="1"/.test(li(app, 1).outerHTML), li(app, 1).outerHTML.slice(0,300));
  const before = app.shipped.filter(f => f==='markWalked').length;
  app.click('[data-act="walk"][data-id="1"]');
  const after = app.pending.filter(p => p.fn==='markWalked');
  check('odhacza tylko jego — Luny drugi raz nie', after.length===1 && after[0].args[0]===1
    && app.shipped.filter(f => f==='markWalked').length===before+1, JSON.stringify(after.map(p=>p.args)));
  app.respondNext({dog: dogFree({id:1, name:'Borys', status:'walked', who:'Ala'})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S75(){
  console.log('S75: przytrzymanie psa z grupy — zmiana składu i rozwiązanie');
  const app = buildApp();
  app.seed(base({walks:[1,2,3].map(id => ({date:D, dogId:id, status:'free', group:1}))}));
  await press(app, 2);
  check('otwiera istniejącą grupę', S(app).select && S(app).select.gid===1
    && [1,2,3].every(id => li(app, id).classList.contains('picked')), JSON.stringify(S(app).select));
  check('jest „Rozwiąż"', !doc(app).getElementById('selDissolve').classList.contains('hidden'));
  tapEl(app, li(app, 3));
  tapEl(app, groupBtn(app));
  const job = lastJob(app);
  check('zmiana składu tej samej grupy', job.fn==='setGroup' && JSON.stringify(job.args[1])==='["1:1","2:1"]' && job.args[2]===1,
    JSON.stringify(job.args));
  check('Rex bez koloru', !bgOf(app, 3) && !!bgOf(app, 1));
  app.respondNext({group:1, walks:[{date:D,dogId:1,group:1},{date:D,dogId:2,group:1},{date:D,dogId:3,group:0}]});

  await press(app, 1);
  tapEl(app, doc(app).getElementById('selDissolve'));
  const job2 = lastJob(app);
  check('rozwiązanie wysyła pusty skład', job2.fn==='setGroup' && JSON.stringify(job2.args[1])==='[]' && job2.args[2]===1,
    JSON.stringify(job2.args));
  check('kolory znikają', !bgOf(app, 1) && !bgOf(app, 2));
  app.respondNext({group:0, walks:[1,2,3].map(id => ({date:D, dogId:id, group:0}))});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S76(){
  console.log('S76: gdzie przytrzymanie nic nie robi, i co trzyma zaznaczanie w miejscu');
  const app = buildApp();
  app.seed(base({walks:[{date:D, dogId:5, status:'walked', who:'Iza'}]}));
  await press(app, 5);
  check('pies po spacerze bez grupy — nie ma czego planować', !S(app).select);

  app.click('#prevDay');
  app.respondNext({history:[]});
  await press(app, 1).catch(()=>{});
  check('miniony dzień — nic', !S(app).select);
  app.click('#dayLabel');

  app.window.__setAdmin('1234');
  const any = doc(app).querySelector('li.dog[data-dog]');
  any.dispatchEvent(ev(app, 'pointerdown'));
  await sleep(650);
  check('tryb edycji (katalog) — nic', !S(app).select);
  doc(app).getElementById('gear').dispatchEvent(new app.window.Event('click', {bubbles:true}));

  await press(app, 1);
  tapEl(app, li(app, 2));
  // najgorszy moment: odświeżenie przynosi reset (20:00) w trakcie zaznaczania —
  // bez ochrony dzień przeskoczyłby pod palcami, a grupa poszłaby na dzień zamknięty
  app.window.eval('refresh()');
  app.respondNext(base({businessDate:'2026-09-25', dogs: DOGS().concat([dogFree({id:6, name:'Nowy'})])}));
  check('zaznaczanie trwa po odświeżeniu', !!S(app).select && li(app, 2).classList.contains('picked'));
  check('dzień nie przeskakuje pod palcami w trakcie zaznaczania', S(app).date===D, S(app).date);
  app.click('#nextDay');
  check('zmiana dnia kończy zaznaczanie', !S(app).select && bar(app).classList.contains('hidden'));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S77(){
  console.log('S77: grupę można zaplanować na przyszły dzień');
  const app = buildApp();
  app.seed(base());
  app.click('#nextDay');
  await press(app, 1);
  tapEl(app, li(app, 2));
  tapEl(app, groupBtn(app));
  const job = lastJob(app);
  check('setGroup z datą jutra', job.fn==='setGroup' && job.args[0]==='2026-09-25', JSON.stringify(job.args));
  check('jutro razem i w kolorze', !!bgOf(app, 1) && bgOf(app, 1)[1]===bgOf(app, 2)[1]);
  app.click('#dayLabel');
  check('dziś bez grupy', !bgOf(app, 1) && !bgOf(app, 2));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S78(){
  console.log('S78: przytrzymanie nie zmienia układu — ten sam kafelek, kółko na wierzchu');
  const app = buildApp();
  app.seed(base({
    dogs: [dogFree({id:1, name:'Borys', note:'Zdjęcia o 12:00'}), dogFree({id:2, name:'Luna', walks:2}),
           dogFree({id:3, name:'Rex'}), dogFree({id:4, name:'Cyra'}), dogFree({id:5, name:'Fado'})],
    walks: [
      {date:D, dogId:2, status:'free', who1:'Ela', time1:'9:00'},
      {date:D, dogId:3, status:'reserved', who:'Ola', group:1},
      {date:D, dogId:4, status:'free', group:1},
      {date:D, dogId:5, status:'walked', who:'Iza', time:'9:30'},
    ],
  }));
  const ids = [1,2,3,4,5];
  const before = {};
  ids.forEach(id => { before[id] = li(app, id).outerHTML; });
  const order0 = ord(app);
  await press(app, 1);
  check('tryb zaznaczania włączony', !!S(app).select);
  // jedyne różnice wolno mieć w klasie i w kółku, które leży na wierzchu (position:absolute)
  const strip = h => h.replace(/<span class="pickbox">[^<]*<\/span>/, '').replace(/ (pick|picked|nopick)(?=[ "])/g, '');
  const diff = ids.filter(id => strip(li(app, id).outerHTML) !== before[id]);
  check('każdy kafelek ma tę samą treść co przed przytrzymaniem (notatka, przyciski, imiona)',
    diff.length===0, diff.map(id => id + ': ' + strip(li(app, id).outerHTML).slice(0, 200)).join(' || '));
  check('kolejność ta sama', ord(app)===order0, ord(app));
  check('kółko przy psach do zaznaczenia', [1,2,3,4].every(id => li(app, id).querySelector('.pickbox')));
  check('...a przy psie po spacerze bez grupy nie', !li(app, 5).querySelector('.pickbox')
    && li(app, 5).classList.contains('nopick'));
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'Styles.html'), 'utf8');
  check('kółko nie zajmuje miejsca w układzie', /\.pickbox\{position:absolute;/.test(css));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S79(){
  console.log('S79: „Zwolnij" zostawia psa w grupie — grupa znów czeka na jego rezerwację');
  const app = buildApp();
  app.seed(base({walks:[
    {date:D, dogId:1, status:'reserved', who:'Ala', group:1},
    {date:D, dogId:2, status:'reserved', who:'Ola', group:1},
  ]}));
  const c1 = bgOf(app, 1)[1];
  check('start: grupa gotowa do wyjścia', /data-act="walk" data-id="1"/.test(li(app, 1).outerHTML));

  app.click('[data-act="free"][data-id="2"]');         // Ola rezygnuje z Luny
  const job = lastJob(app);
  check('setFree(pies, dzień)', job.fn==='setFree' && job.args[0]===2 && job.args[1]===D, JSON.stringify(job.args));
  check('Luna dalej w grupie — kolor grupy', !!bgOf(app, 2) && bgOf(app, 2)[1]===c1);
  check('...także w stanie', S(app).slots[D+'|2|1'].group===1 && S(app).slots[D+'|2|1'].status==='free',
    JSON.stringify(S(app).slots[D+'|2|1']));
  check('Borys czeka na nową rezerwację Luny (kafelek towarzysza przerysowany)',
    !/data-act="walk" data-id="1"/.test(li(app, 1).outerHTML) && /czeka na rezerwację: Luna/.test(li(app, 1).textContent),
    li(app, 1).textContent.replace(/\s+/g, ' '));
  app.respondNext({dog: dogFree({id:2, name:'Luna', group:1})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S80(){
  console.log('S80: pies w dwóch miejscach — 1/2 w porannej grupie, kafelek główny z 2/2 wysoko');
  // zgłoszenie z terenu: Borys + Luna (2 spacery) razem, potem Luna na drugi spacer z Rexem —
  // wyglądało, jakby Borys szedł z Rexem. Grupa należy teraz do SPACERU, nie do psa.
  const app = buildApp();
  app.seed(base({
    dogs: [dogFree({id:1, name:'Borys'}), dogFree({id:2, name:'Luna', walks:2}), dogFree({id:3, name:'Rex'})],
    slots: [{date:D, dogId:1, slot:1, status:'reserved', who:'Ala', group:1},
            {date:D, dogId:2, slot:1, status:'reserved', who:'Ola', group:1}],
  }));
  const tiles = () => JSON.stringify(app.window.__tiles());
  const tile = id => doc(app).querySelector(`li[data-tile="${id}"]`);
  const bg = id => ((tile(id) && tile(id).getAttribute('style')) || '').match(/background:(#[0-9a-f]+)/i);
  check('Luna w dwóch miejscach: kafelek główny z 2/2 na górze, 1/2 w bloku grupy',
    tiles()==='["m2","m3","s2.1","s1.1"]', tiles());
  check('odłączony 1/2 mówi, którego spaceru dotyczy', tile('s2.1').classList.contains('detached')
    && /Luna\s*1\/2/.test(tile('s2.1').textContent) && /Ola/.test(tile('s2.1').textContent));
  check('kafelek główny: 2/2 do rezerwacji, bez linijki o 1/2 (ta stoi przy grupie)',
    !!tile('m2').querySelector('[data-act="reserve"][data-slot="2"]') && !/1\/2|Ola/.test(tile('m2').textContent),
    tile('m2').textContent.replace(/\s+/g,' '));

  app.click('[data-act="walk"][data-id="1"]');         // wspólny spacer porannej grupy
  const w1 = app.pending.filter(p => p.fn==='markWalked');
  check('odhacza Borysa i Lunę 1/2', w1.length===2 && w1.find(p => p.args[0]===2).args[2]===1, JSON.stringify(w1.map(p => p.args)));
  check('Luna 1/2 odbyta i DALEJ w porannej grupie — ten spacer odbyli razem',
    S(app).slots[D+'|2|1'].status==='walked' && S(app).slots[D+'|2|1'].group===1);
  check('Luna 2/2 nietknięta: wolna, bez grupy', slotOfApp(app, 2, 2).status==='free' && slotOfApp(app, 2, 2).group===0);
  app.respondNext({slot:{slot:1, status:'walked', who:'Ala', time:'10:00'}});
  app.respondNext({slot:{slot:1, status:'walked', who:'Ola', time:'10:00'}});

  await press(app, 2);                                 // drugi spacer Luny — z Rexem (przytrzymany kafelek główny)
  check('przytrzymanie kafelka głównego zaznacza 2/2 — NOWA grupa, nie poranna', !!S(app).select && S(app).select.gid===0
    && JSON.stringify(S(app).select.ids)==='["2:2"]', JSON.stringify(S(app).select));
  tapEl(app, li(app, 3));
  tapEl(app, groupBtn(app));
  const job = lastJob(app);
  check('setGroup: Luna 2/2 + Rex, nowa grupa', job.fn==='setGroup' && JSON.stringify(job.args[1])==='["2:2","3:1"]' && job.args[2]===0,
    JSON.stringify(job.args));
  check('Luna stoi w dwóch grupach, każdym spacerem w innej', !!bg('s2.1') && !!bg('s2.2') && bg('s2.1')[1]!==bg('s2.2')[1], tiles());
  check('Borys (z Luną rano) i Rex (z Luną po południu) w różnych kolorach',
    bg('s1.1')[1]===bg('s2.1')[1] && bg('s3.1')[1]===bg('s2.2')[1] && bg('s1.1')[1]!==bg('s3.1')[1]);
  app.respondNext({group:2, slots:[{date:D, dogId:1, slot:1, group:1, status:'walked', who:'Ala'},
    {date:D, dogId:2, slot:1, group:1, status:'walked', who:'Ola'},
    {date:D, dogId:2, slot:2, group:2, status:'free'}, {date:D, dogId:3, slot:1, group:2, status:'free'}]});
  check('odpowiedź serwera tego nie zmienia', bg('s2.2')[1]===bg('s3.1')[1] && bg('s2.1')[1]===bg('s1.1')[1]);
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}
const slotOfApp = (app, id, n) => app.window.__state.slots[D+'|'+id+'|'+n] || {status:'free', group:0};

async function S82(){
  console.log('S82: grupa z psem już wyprowadzonym — nic się nie blokuje');
  // Luna dołożona do składu po spacerze (albo stan z innego telefonu). Reguła „nikt z grupy
  // nie jest wolny", nie „wszyscy zarezerwowani": „Zwolnij" nie wyprowadza z grupy, więc
  // dosłowna reguła nie zostawiłaby Lunie żadnego wyjścia
  const app = buildApp();
  app.seed(base({walks:[
    {date:D, dogId:1, status:'walked', who:'Ala', time:'9:00', group:1},
    {date:D, dogId:2, status:'reserved', who:'Ola', group:1},
    {date:D, dogId:3, status:'walked', who:'Ewa', time:'9:00', group:1},
  ]}));
  check('Lunę da się odhaczyć', /data-act="walk" data-id="2"/.test(li(app, 2).outerHTML), li(app, 2).outerHTML.slice(0, 300));
  app.click('[data-act="walk"][data-id="2"]');
  const w = app.pending.filter(p => p.fn==='markWalked');
  check('odhacza tylko ją', w.length===1 && w[0].args[0]===2, JSON.stringify(w.map(p => p.args)));
  app.respondNext({dog: dogFree({id:2, name:'Luna', status:'walked', who:'Ola', time:'10:00', group:1})});

  const c1 = bgOf(app, 1)[1];
  app.click('[data-act="free"][data-id="1"]');         // „Cofnij" u Borysa
  check('cofnięty Borys wychodzi z grupy', !bgOf(app, 1) && S(app).slots[D+'|1|1'].group===0);
  check('Luna i Rex zostają grupą (dwa psy to grupa)', bgOf(app, 2)[1]===c1 && bgOf(app, 3)[1]===c1
    && S(app).slots[D+'|2|1'].group===1 && S(app).slots[D+'|3|1'].group===1);
  app.respondNext({dog: dogFree({id:1, name:'Borys'})});
  check('kolejka pusta', drained(app), JSON.stringify(app.state()));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

async function S81(){
  console.log('S81: przytrzymany pies nie chowa się pod paskiem na dole');
  const app = buildApp();
  app.seed(base());
  const W = app.window, scrolls = [];
  W.scrollBy = (x, y) => { scrolls.push(y); };
  const rect = (top, bottom) => ({top, bottom, left:0, right:0, x:0, y:top, width:0, height:bottom-top});
  // pasek zajmuje dół ekranu od 700 px; Fado stoi tuż nad krawędzią i wchodzi pod pasek
  W.HTMLElement.prototype.getBoundingClientRect = function(){
    if(this.id === 'selectBar') return rect(700, 784);
    if(this.dataset && this.dataset.dog === '5') return rect(660, 760);
    return rect(100, 200);
  };
  await press(app, 5);
  check('lista przesunięta dokładnie o tyle, ile trzeba', scrolls.length===1 && scrolls[0]===72, JSON.stringify(scrolls));
  tapEl(app, doc(app).getElementById('selCancel'));
  await press(app, 1);
  check('pies wyżej na ekranie — lista stoi', !!S(app).select && scrolls.length===1, JSON.stringify(scrolls));
  check('bez błędów', app.errors.length===0, app.errors.join('; '));
}

(async ()=>{
  try{
    await S71();
    await S72();
    const app = await S73();
    await S74(app);
    await S75();
    await S76();
    await S77();
    await S78();
    await S79();
    await S80();
    await S81();
    await S82();
  }catch(e){
    failures++;
    console.log('  FAIL wyjątek w teście | ' + (e && e.stack || e));
  }
  console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
  process.exit(failures ? 1 : 0);
})();

// B74–B80: pomocnik Grafiku (Helper.gs, 1.5 — faza testów; HELPER.md). Bramka Green API na niby: kolejka
// powiadomień jak prawdziwa (receiveNotification oddaje pierwsze, dopóki deleteNotification go nie zdejmie),
// wysyłka, skład grupy, ustawienia instancji, pogoda. Sytuacje wzięte z eksportu czatu „Grafik" (16.03–24.10.2026),
// imiona i numery zmyślone.
const { makeContext } = require('./backend-harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
const throws = fn => { try { fn(); return ''; } catch (e) { return String(e.message || e); } };

const TEST_PIN = '4321';
const GREEN = { greenApiUrl: 'https://7103.api.greenapi.com', greenApiInstance: '7103123456', greenApiToken: 'tok3n5ecret' };
const GRAFIK = '120363000000000001@g.us';
const OWNER = '48600111222@c.us';
const BOT = '48799000111@c.us';
const ANIA = '48601000001@c.us', BASIA = '48601000002@c.us', CELINA = '48601000003@c.us',
      DAWID = '48601000004@c.us', EWA = '48601000005@c.us', KASIA = '48601000006@c.us';
const OPTS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela', 'Nie mogę'];
const Q = 'Grafik 26.10-01.11';

const DOG_HEADERS = ['id','imie','identyfikator','boks','trudnosc','status','kto','godzina',
  'ostatni_spacer','notatka','spacery','kto1','godzina1','notatka_do'];
const HIST_HEADERS = ['data','pies','kto','godzina'];
const dogRow = o => [o.id, o.name || '', o.ident || '', '', o.dif || 'easy', '', '', '', o.lastWalk || '', '', o.walks || 1, '', '', ''];
const DOGS = [
  { id: 1, name: 'Draco', ident: '552/26', dif: 'hard', lastWalk: '2026-10-20' },
  { id: 2, name: 'Barwik', ident: '145/26', dif: 'med', lastWalk: '2026-10-22' },
  { id: 3, name: 'Hańcza', ident: '879/26', walks: 2, lastWalk: '2026-10-24' },
  { id: 4, name: 'Lego', ident: '558/25', lastWalk: '2026-10-24' },
];
const HIST = [['2026-10-09', 'Draco', 'Ilona', '10:00'], ['2026-10-12', 'Draco', 'Dawid', '11:00'], ['2026-10-12', 'Lego', 'Ania', '11:30'],
              ['2026-10-19', 'Lego', 'Ania', '10:10'], ['2026-10-19', 'Barwik', 'Basia', '10:20'], ['2026-10-21', 'Hańcza', 'Ania', '10:00']];

/** Wszystkie wiadomości wysłane we wszystkich scenariuszach — na końcu: każda do właściciela, żadna do grupy (B74). */
const ALL_SENT = [];

let seq = 0;
const ts = iso => Math.floor(Date.parse(iso) / 1000);
function build(o){
  o = o || {};
  const env = makeContext({
    now: o.now || '2026-10-25T10:20:00+02:00',
    sheets: [
      { name: 'Psy', rows: [DOG_HEADERS, ...(o.dogs || DOGS).map(dogRow)] },
      { name: 'Historia', rows: [HIST_HEADERS, ...(o.hist || HIST)] },
      { name: 'Zadania', rows: [['id','tresc','data','status']] },
    ],
    props: Object.assign({ pin: TEST_PIN, walksImported: '2026-01-01' }, o.gateway === false ? {} : GREEN, o.props),
  });
  const gw = { queue: [], receipt: 0, deleted: [], sent: [], received: 0, members: [ANIA, BASIA], weather: null, fail: null,
               history: [], historyCalls: [],
               settings: { incomingWebhook: 'yes', pollMessageWebhook: 'yes', outgoingAPIMessageWebhook: 'yes', outgoingMessageWebhook: 'yes', webhookUrl: '' } };
  env.http.handler = (url, opts) => {
    if(gw.fail){ const r = gw.fail(url, opts); if(r) return r; }
    if(/open-meteo/.test(url)) return gw.weather ? { code: 200, body: JSON.stringify(gw.weather) } : { code: 500, body: '' };
    if(/\/receiveNotification\//.test(url)){
      gw.received++;
      const head = gw.queue[0];
      return { code: 200, body: head ? JSON.stringify({ receiptId: head.receipt, body: head.body }) : 'null' };
    }
    if(/\/deleteNotification\//.test(url)){
      const id = Number(url.split('/').pop());
      gw.deleted.push({ id, method: opts.method });
      if(gw.queue[0] && gw.queue[0].receipt === id) gw.queue.shift();
      return { code: 200, body: '{"result":true}' };
    }
    if(/\/sendMessage\//.test(url)){
      const p = JSON.parse(opts.payload);
      gw.sent.push(p); ALL_SENT.push(p);
      return { code: 200, body: JSON.stringify({ idMessage: 'OUT' + gw.sent.length }) };
    }
    if(/\/getGroupData\//.test(url)) return { code: 200, body: JSON.stringify({ groupId: GRAFIK, participants: gw.members.map(id => ({ id })) }) };
    // historia czatu jak getChatHistory: od najnowszej, `count` ostatnich
    if(/\/getChatHistory\//.test(url)){
      gw.historyCalls.push(JSON.parse(opts.payload));
      return { code: 200, body: JSON.stringify(gw.history.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, JSON.parse(opts.payload).count)) };
    }
    if(/\/getSettings\//.test(url)) return { code: 200, body: JSON.stringify(gw.settings) };
    return { code: 404, body: '' };
  };
  env.gw = gw;
  env.push = (...bodies) => bodies.forEach(b => gw.queue.push({ receipt: ++gw.receipt + 1000, body: b }));
  env.tick = iso => { if(iso) env.setNow(iso); return env.api.helperTick(); };
  env.msgs = () => gw.sent.map(p => p.message);
  env.last = () => { const m = env.msgs(); return m[m.length - 1] || ''; };
  env.st = () => env.api.helperLoad_();
  return env;
}
function on(env, extra){
  return env.api.setHelperSettings(Object.assign({}, env.conf.DEFAULT_HELPER,
    { enabled: true, chatId: GRAFIK, chatName: 'Grafik', toId: OWNER, toName: 'Grzesiek', min: 3 }, extra), TEST_PIN);
}
function pollMsg(id, name, options, iso){
  return { typeWebhook: 'outgoingAPIMessageReceived', idMessage: id, timestamp: ts(iso),
    senderData: { chatId: GRAFIK, sender: BOT, chatName: 'Grafik' },
    messageData: { typeMessage: 'pollMessage', pollMessageData: { name, options: options.map(x => ({ optionName: x })), multipleAnswers: true } } };
}
/** Głos jednej osoby (tak opisuje go dokumentacja bramki): w odpowiedziach tylko ona. `voter` — numer w ankiecie, gdy inny niż nadawca. */
function vote(pollId, who, picked, iso, o){
  o = o || {};
  const v = o.voter || who, options = o.options || OPTS;
  return { typeWebhook: 'incomingMessageReceived', idMessage: 'V' + (++seq), timestamp: ts(iso),
    senderData: { chatId: GRAFIK, sender: who, chatName: 'Grafik', senderName: o.name || '' },
    messageData: { typeMessage: 'pollUpdateMessage', pollMessageData: { stanzaId: pollId, name: o.q || Q,
      votes: options.map(x => ({ optionName: x, optionVoters: picked.indexOf(x) >= 0 ? [v] : [] })), multipleAnswers: true } } };
}
function text(who, name, body, iso, chat, id){
  return { typeWebhook: 'incomingMessageReceived', idMessage: id || 'T' + (++seq), timestamp: ts(iso),
    senderData: { chatId: chat || GRAFIK, sender: who, senderName: name, chatName: 'Grafik' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: body } } };
}
const pollOf = (env, id) => env.st().polls.filter(p => p.id === id)[0];
const votersOn = (env, id, date) => { const p = pollOf(env, id); return Object.keys(p.v).filter(w => p.v[w].some(i => p.days[i].d === date && !p.days[i].x && !p.days[i].no)).sort(); };

/* ---------- B74: ustawienia, wyzwalacz, tylko prywatnie ---------- */
(()=>{
  console.log('B74: pomocnik — ustawienia z PIN-em, wyzwalacz co 10 min, na czas testów pisze TYLKO prywatnie');
  const env = build();
  const base = Object.assign({}, env.conf.DEFAULT_HELPER, { chatId: GRAFIK, toId: OWNER });
  check('zły PIN — odmowa', /PIN/.test(throws(() => env.api.setHelperSettings(base, '0000'))));
  check('odbiorca = grupa — odmowa (tylko prywatnie)', /tylko prywatnie/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { toId: GRAFIK }), TEST_PIN))));
  check('„Grafik" musi być grupą', /grupa/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { chatId: OWNER }), TEST_PIN))));
  check('włączenie bez grupy albo kontaktu — odmowa', /Wybierz grupę/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { enabled: true, chatId: '' }), TEST_PIN)))
    && /Wybierz kontakt/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { enabled: true, toId: '' }), TEST_PIN))));
  check('minimum osób 1–10, godziny 0–23, dni tygodnia 0–6', /Minimum/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { min: 0 }), TEST_PIN)))
    && /0–23/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { evening: 24 }), TEST_PIN)))
    && /dzień/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { weekDays: [7] }), TEST_PIN))));
  check('pole „fioletowi" z limitem', /Fioletowi/.test(throws(() => env.api.setHelperSettings(Object.assign({}, base, { purple: 'x'.repeat(env.conf.HELPER_LIMITS.NAMES + 1) }), TEST_PIN))));
  const noGw = build({ gateway: false });
  check('włączenie bez bramki — odmowa z opisem właściwości', /greenApiUrl/.test(throws(() => on(noGw))));

  const panel = on(env, { weekDays: [3, 0, 3], features: { weather: false } });
  const trig = env.triggers.filter(t => t._fn === 'helperTick');
  check('włączony: wyzwalacz helperTick co ' + env.conf.HELPER_TICK_MIN + ' min (jeden)', trig.length === 1 && trig[0]._everyMinutes === env.conf.HELPER_TICK_MIN, JSON.stringify(trig));
  check('zapis: dni posortowane bez powtórek, brakujące włączniki — domyślne', JSON.stringify(panel.settings.weekDays) === '[0,3]'
    && panel.settings.features.weather === false && panel.settings.features.evening === true, JSON.stringify(panel.settings));
  check('panel: włączony, wyzwalacz jest', panel.settings.enabled === true && panel.trigger === true);
  env.api.installTriggers();
  check('installTriggers() przywraca wyzwalacz pomocnika (jeden)', env.triggers.filter(t => t._fn === 'helperTick').length === 1);
  on(env, { enabled: false });
  check('wyłączony: wyzwalacza nie ma', env.triggers.filter(t => t._fn === 'helperTick').length === 0);

  // ręcznie zepsuta właściwość z adresem grupy jako odbiorcą — pomocnik się nie uruchamia i nie pisze do grupy
  const bad = build({ props: { helper: JSON.stringify(Object.assign({}, env.conf.DEFAULT_HELPER, { enabled: true, chatId: GRAFIK, toId: GRAFIK })) } });
  bad.push(text(ANIA, 'Ania', 'Będę jutro', '2026-10-25T10:00:00+02:00'));
  const r = bad.tick();
  check('właściwość z grupą jako odbiorcą: odbiorca wyzerowany, pomocnik wyłączony, nic nie wychodzi', bad.api.helperSettings_().toId === ''
    && bad.api.helperSettings_().enabled === false && r === null && bad.gw.received === 0 && bad.gw.sent.length === 0);
  check('helperPreview z wysyłką bez kontaktu — odmowa', /kontakt/.test(throws(() => bad.api.helperPreview(TEST_PIN, 'jutro', true))));
})();

/* ---------- B75: kolejka bramki ---------- */
(()=>{
  console.log('B75: pomocnik — kolejka: każde powiadomienie zdjęte (DELETE), powtórki raz, obce czaty i statusy pominięte, błąd bramki nie wychodzi z wyzwalacza');
  const env = build();
  on(env);
  env.push({ typeWebhook: 'outgoingMessageStatus', idMessage: 'S1', status: 'read' },
           { typeWebhook: 'quotaExceeded', timestamp: ts('2026-10-25T10:00:00+02:00') },
           text(ANIA, 'Ania', 'Będę jutro w innej grupie', '2026-10-25T10:00:00+02:00', '120363999999999999@g.us'),
           text(ANIA, 'Ania Kowalska Schronisko G13', 'Będę jutro 10-12', '2026-10-25T10:01:00+02:00', GRAFIK, 'DUP1'),
           text(ANIA, 'Ania', 'Będę jutro 10-12', '2026-10-25T10:01:00+02:00', GRAFIK, 'DUP1'));
  const run = env.tick();
  check('5 powiadomień przeczytanych, każde zdjęte metodą DELETE z własnym numerem', run.events === 5 && env.gw.deleted.length === 5
    && env.gw.deleted.every(d => d.method === 'delete') && env.gw.queue.length === 0, JSON.stringify(env.gw.deleted));
  const st = env.st();
  check('ta sama wiadomość dwa razy (powtórka po awarii) — jedna notatka', st.notes.length === 1 && st.notes[0].d.join() === '2026-10-26', JSON.stringify(st.notes));
  check('nazwa z WhatsAppa bez dopisku grupy', st.people[ANIA].n === 'Ania Kowalska', JSON.stringify(st.people));
  check('limit planu (quotaExceeded) — wpis w dzienniku', st.log.some(l => /limit planu/.test(l.m)));
  check('przebieg bez raportu nie czyta arkusza', !env.calls.bySheet['Psy'] && !env.calls.bySheet['Historia'], JSON.stringify(env.calls.bySheet));

  env.gw.fail = url => /receiveNotification/.test(url) ? { code: 500, body: 'awaria tok3n5ecret' } : null;
  const r2 = env.tick('2026-10-25T10:30:00+02:00');
  const helperProps = () => JSON.stringify(Object.keys(env.props).filter(k => /^helper/.test(k)).map(k => env.props[k]));
  check('błąd bramki: wyzwalacz nie rzuca, błąd w dzienniku pomocnika — bez tokenu', r2 && /500/.test(r2.err)
    && env.st().log.some(l => /kolejka bramki/.test(l.m)) && !/tok3n/.test(helperProps()), r2 && r2.err);
  env.gw.fail = null;

  env.props.helperBusy = String(env.now());                // drugi przebieg w tym samym czasie (wyzwalacz + „Sprawdź teraz")
  const before = env.gw.received;
  check('przebieg w toku: drugi nic nie robi', env.tick() === null && env.gw.received === before);
  check('„Sprawdź teraz" w tym czasie — komunikat', /właśnie pracuje/.test(throws(() => env.api.helperRunNow(TEST_PIN))));
  env.setNow('2026-10-25T10:45:00+02:00');                  // znacznik sprzed 15 minut — przebieg ubity w połowie
  check('znacznik „w toku" starszy niż ' + 8 + ' min — przebieg rusza', env.tick() !== null && env.gw.received > before && !env.props.helperBusy);

  env.gw.fail = url => /receiveNotification/.test(url) ? { code: 400, body: '{"message":"INVALID_PARAM webhookUrl"}' } : null;
  env.tick('2026-10-25T11:00:00+02:00');
  check('ustawiony adres webhooka (400) — opis w dzienniku', env.st().log.some(l => /400/.test(l.m)));
  env.gw.fail = null;
  const gate = env.api.getHelperGateway(TEST_PIN);
  check('„Sprawdź bramkę": wszystkie wymagane ustawienia w porządku', gate.length === 5 && gate.every(g => g.ok), JSON.stringify(gate));
  env.gw.settings.pollMessageWebhook = 'no'; env.gw.settings.webhookUrl = 'https://x.example/hook';
  const gate2 = env.api.getHelperGateway(TEST_PIN);
  check('...brak powiadomień o ankietach i adres webhooka — widać, czego brakuje', gate2.filter(g => !g.ok).map(g => g.key).join() === 'pollMessageWebhook,webhookUrl',
    JSON.stringify(gate2));
})();

/* ---------- B76: ankiety i głosy ---------- */
(()=>{
  console.log('B76: pomocnik — ankieta: daty z pytania i odpowiedzi, głosy jednej osoby, pełny stan, wycofanie, numer w innym formacie');
  const env = build();
  on(env);
  env.push(pollMsg('P1', Q, OPTS, '2026-10-25T10:13:00+02:00'),
           vote('P1', ANIA, ['Poniedziałek', 'Wtorek'], '2026-10-25T10:15:00+02:00', { name: 'Ania' }),
           vote('P1', BASIA, ['Wtorek'], '2026-10-25T10:16:00+02:00', { name: 'Basia' }),
           vote('P1', CELINA, ['Nie mogę'], '2026-10-25T10:17:00+02:00', { name: 'Celina' }));
  env.tick();
  const p = pollOf(env, 'P1');
  check('odpowiedzi → dni tygodnia 26.10–01.11, „Nie mogę" — żaden dzień', p.days[0].d === '2026-10-26' && p.days[6].d === '2026-11-01'
    && p.days[7].no === true && !p.partial && !p.wrong, JSON.stringify(p.days));
  check('wtorek: Ania i Basia; poniedziałek: Ania; „Nie mogę" nie liczy się nigdzie',
    votersOn(env, 'P1', '2026-10-27').join() === [ANIA, BASIA].join() && votersOn(env, 'P1', '2026-10-26').join() === ANIA, JSON.stringify(p.v));
  check('nowa ankieta → wiadomość do właściciela z przypomnieniem o przypięciu', /Nowa ankieta w Grafiku.*Grafik 26\.10-01\.11/.test(env.msgs()[0] || '')
    && /📌/.test(env.msgs()[0]) && !/nie pasują/.test(env.msgs()[0]), env.msgs()[0]);

  env.push(vote('P1', ANIA, ['Wtorek'], '2026-10-25T11:00:00+02:00'));
  env.tick('2026-10-25T11:05:00+02:00');
  check('Ania zostawia tylko wtorek: z poniedziałku znika, wypisanie zapamiętane', votersOn(env, 'P1', '2026-10-26').length === 0
    && env.st().gone.some(g => g.w === ANIA && g.d === '2026-10-26'));

  // pełny stan ankiety w jednym powiadomieniu (dwie osoby i więcej) — zastępuje wszystko
  env.push({ typeWebhook: 'incomingMessageReceived', idMessage: 'FULL1', timestamp: ts('2026-10-25T11:10:00+02:00'),
    senderData: { chatId: GRAFIK, sender: DAWID, senderName: 'Dawid' },
    messageData: { typeMessage: 'pollUpdateMessage', pollMessageData: { stanzaId: 'P1', name: Q, votes: OPTS.map(o => ({ optionName: o,
      optionVoters: o === 'Wtorek' ? [ANIA] : o === 'Środa' ? [DAWID, ANIA] : [] })) } } });
  env.tick('2026-10-25T11:15:00+02:00');
  check('pełny stan: Ania (wt, śr) i Dawid (śr), Basia i Celina zniknęły', JSON.stringify(Object.keys(pollOf(env, 'P1').v).sort()) === JSON.stringify([ANIA, DAWID])
    && votersOn(env, 'P1', '2026-10-28').join() === [ANIA, DAWID].join(), JSON.stringify(pollOf(env, 'P1').v));
  env.push(vote('P1', DAWID, [], '2026-10-25T11:20:00+02:00'));
  env.tick('2026-10-25T11:25:00+02:00');
  check('Dawid wycofuje wszystko (nikt w odpowiedziach) — znika', !pollOf(env, 'P1').v[DAWID]);

  const LID = '157000000000123@lid';
  env.push(vote('P1', EWA, ['Czwartek'], '2026-10-25T11:30:00+02:00', { voter: LID, name: 'Ewa' }));
  env.tick('2026-10-25T11:35:00+02:00');
  check('numer w ankiecie w innym formacie niż nadawca (@lid): głos pod nim, powiązanie zapamiętane',
    votersOn(env, 'P1', '2026-10-29').join() === LID && env.st().alias[EWA] === LID);
  env.push(vote('P1', EWA, [], '2026-10-25T11:40:00+02:00', { voter: LID }));
  env.tick('2026-10-25T11:45:00+02:00');
  check('...i jej wycofanie (nadawca @c.us) zdejmuje głos @lid', !pollOf(env, 'P1').v[LID]);

  // ankieta poznana dopiero z głosu, z tygodnia sprzed włączenia pomocnika — niepełna
  env.push(vote('OLD', ANIA, ['Piątek'], '2026-10-25T12:00:00+02:00', { q: 'Grafik 19-25.10' }));
  env.tick('2026-10-25T12:05:00+02:00');
  const old = pollOf(env, 'OLD');
  check('ankieta sprzed włączenia, poznana z głosu: zakres 19–25.10, oznaczona jako niepełna', old && old.from === '2026-10-19' && old.partial === true,
    JSON.stringify(old && { from: old.from, partial: old.partial }));

  // daty w pytaniu i odpowiedziach — przypadki z eksportu czatu
  const R = (q, ref) => env.api.helperRange_(q, ref);
  const r1 = R('Grafik 05-11.11', '2026-10-04');
  check('„Grafik 05-11.11" wysłane 4.10 — pomyłka: najbliższy tydzień 05–11.10 i ostrzeżenie', r1.from === '2026-10-05' && r1.to === '2026-10-11' && r1.wrong === true, JSON.stringify(r1));
  const r2 = R('Grafik 29.06-05.07', '2026-06-21');
  check('„Grafik 29.06-05.07" wysłane 21.06 (tydzień za późno) — daty z pytania, ostrzeżenie', r2.from === '2026-06-29' && r2.wrong === true, JSON.stringify(r2));
  const r3 = R('Grafik 27.04-03.03', '2026-04-26');
  check('„Grafik 27.04-03.03" (literówka) — najbliższy tydzień', r3.from === '2026-04-27' && r3.to === '2026-05-03' && r3.parsed === false, JSON.stringify(r3));
  check('„Grafik 28.12-03.01" — przez Nowy Rok', R('Grafik 28.12-03.01', '2026-12-27').to === '2027-01-03');
  check('„Grafik 28-03.01" — początek w poprzednim miesiącu', R('Grafik 28-03.01', '2026-12-27').from === '2026-12-28');
  const O = (o, q, ref) => env.api.helperOptDay_(o, R(q, ref), ref);
  check('„Niedziela - AW" — osobno, nie do składu dnia', O('Niedziela - AW', 'Grafik 18-24.05', '2026-05-17').x === 'Niedziela - AW'
    && O('Niedziela - AW', 'Grafik 18-24.05', '2026-05-17').d === '2026-05-24');
  check('„Środa rano" / „Środa wieczorem" — pora dnia', O('Środa rano', 'Nowy grafik 01-05.07', '2026-06-29').p === 'r'
    && O('Środa wieczorem', 'Nowy grafik 01-05.07', '2026-06-29').p === 'w' && O('Środa rano', 'Nowy grafik 01-05.07', '2026-06-29').d === '2026-07-01');
  check('„Niedziela 16.08": „Rano" i „Wieczór" to ten dzień', O('Rano', 'Niedziela 16.08', '2026-08-09').d === '2026-08-16' && O('Wieczór', 'Niedziela 16.08', '2026-08-09').p === 'w');
  check('„20.07 Monday" — data z odpowiedzi', O('20.07 Monday', '20.07 - 26.07 🐶 🐾', '2026-07-18').d === '2026-07-20');
  check('„Czwartek wieczór" w ankiecie „26.06 - 28.06" wysłanej w czwartek — ten czwartek', O('Czwartek wieczór', 'Grafik 26.06 - 28.06 z podziałem na rano/wieczór', '2026-06-25').d === '2026-06-25');
  check('„Warszawski dzień zwierząt" — bez dnia, osobno', O('Warszawski dzień zwierząt', 'Grafik 15-21.06', '2026-06-14').d === ''
    && O('Warszawski dzień zwierząt', 'Grafik 15-21.06', '2026-06-14').x !== '');
  check('bez dat w pytaniu („Weekend bez AW") — najbliższy tydzień', O('Sobota', 'Weekend bez AW', '2026-04-24').d === '2026-04-25');
})();

/* ---------- B77: czat ---------- */
(()=>{
  console.log('B77: pomocnik — czat: o które dni chodzi, rodzaj wiadomości, nieobecności z datami');
  const env = build();
  const D = (t, d, h) => env.api.helperDayRefs_(t, d, h == null ? 12 : h).join(',');
  check('„Będę jutro 10-12" (piątek) → sobota', D('Będę jutro 10-12', '2026-10-23') === '2026-10-24');
  check('„W czwartek będę koło 11" (poniedziałek) → ten czwartek', D('W czwartek będę koło 11', '2026-10-19') === '2026-10-22');
  check('„W środę" w środę → dziś', D('W środę potrzebna pomoc', '2026-10-21') === '2026-10-21');
  check('„koło 11.30", „o 10.30" — godzina, nie data', D('Hej ja jutro będę w schronie koło 11.30', '2026-04-22') === '2026-04-23' && D('będę o 10.10', '2026-10-01') === '');
  check('„Czy jest ktoś jutro do Evera?" o 0:31 — to już ten dzień', D('Czy jest ktos jutro do Evera?', '2026-04-23', 0) === '2026-04-23');
  check('„w weekend" → sobota i niedziela', D('ja w weekend też nie dam rady', '2026-10-18') === '2026-10-18,2026-10-24');
  check('„z jutra", „na piątek", „środowej grupy"', D('Muszę się wypisać z jutra', '2026-09-17') === '2026-09-18'
    && D('Kto może się dopisać na piątek?', '2026-10-21') === '2026-10-23' && D('wsparcia grupy środowej', '2026-10-13') === '2026-10-14');
  check('data „16.10"', D('Nie ma mnie w piątek 16.10. Proszę o wsparcie', '2026-10-12') === '2026-10-16');
  check('„środek", „środowisko" — to nie środa', D('w środku dnia, środowisko testowe', '2026-10-12') === '');
  const K = t => env.api.helperKind_(t);
  check('rodzaje: pytanie, nie będzie, będzie, nieobecność, inne', K('Kto dołączy jutro?') === 'ask' && K('Muszę się wypisać z jutra, rozchorowałam się') === 'out'
    && K('Będę jutro 10-12') === 'in' && K('Nie ma mnie 13-17 sierpnia') === 'abs' && K('Imbir o 14:30 jedzie sprawdzić czy lubi koty') === 'info'
    && K('Ja jutro niestety nie będę') === 'out' && K('Dopisałam się na sobotę') === 'in', [K('Kto dołączy jutro?'), K('Ja jutro niestety nie będę')].join());
  const A = (t, d) => JSON.stringify(env.api.helperAbsence_(t, d, 12));
  check('„Nie ma mnie 13-17 sierpnia"', A('Nie ma mnie 13-17 sierpnia', '2026-08-09') === '[["2026-08-13","2026-08-17"]]', A('Nie ma mnie 13-17 sierpnia', '2026-08-09'));
  check('„W dniach 30 kwietnia - 3 maja nie będzie mnie w Warszawie"', A('‼️\nW dniach 30 kwietnia - 3 maja nie będzie mnie w Warszawie.', '2026-04-22') === '[["2026-04-30","2026-05-03"]]',
    A('W dniach 30 kwietnia - 3 maja nie będzie mnie w Warszawie.', '2026-04-22'));
  check('„od 15 października do 1 listopada"', A('Przypominam, że będę nieobecny 26 września i 1 października, a także w okresie od 15 października do 1 listopada.', '2026-09-20')
    === '[["2026-09-26","2026-09-26"],["2026-10-01","2026-10-01"],["2026-10-15","2026-11-01"]]',
    A('Przypominam, że będę nieobecny 26 września i 1 października, a także w okresie od 15 października do 1 listopada.', '2026-09-20'));
  const list = env.api.helperAbsence_('*Chciałbym z wyprzedzeniem poinformować, że w poniższych terminach będę nieobecny:*\n29 sierpnia\n5 września\n1, 17, 22, 24, 29 i 31 października', '2026-08-20', 19);
  check('wyliczanka dat („29 sierpnia / 5 września / 1, 17, 22, 24, 29 i 31 października") — 8 dni', list.length === 8
    && list[0][0] === '2026-08-29' && list[7][0] === '2026-10-31' && list.every(x => x[0] === x[1]), JSON.stringify(list));
  check('„Nie ma mnie od dziś do 16 sierpnia" — od dziś', A('Nie ma mnie od dzis do 16 sierpnia i w zależności od sytuacji', '2026-08-02') === '[["2026-08-02","2026-08-16"]]',
    A('Nie ma mnie od dzis do 16 sierpnia', '2026-08-02'));
  check('„Od teraz podróżuję i wrócę 16 lipca" — do dnia przed powrotem', A('Od teraz podróżuję i wrócę 16 lipca.', '2026-06-25') === '[["2026-06-25","2026-07-15"]]',
    A('Od teraz podróżuję i wrócę 16 lipca.', '2026-06-25'));
  check('„nie ma mnie 10-22 sierpnia"', A('nie ma mnie 10-22 sierpnia', '2026-08-10') === '[["2026-08-10","2026-08-22"]]');
  check('bez dat — dni z wiadomości („ani w czwartek, ani w weekend")', A('Nie będzie mnie w przyszłym tygodniu, ani w czwartek, ani w weekend', '2026-05-15')
    === '[["2026-05-16","2026-05-16"],["2026-05-17","2026-05-17"],["2026-05-21","2026-05-21"]]', A('Nie będzie mnie w przyszłym tygodniu, ani w czwartek, ani w weekend', '2026-05-15'));

  on(env);
  env.push(text(ANIA, 'Ania', 'Super teraz ta ankieta jest czytelna!!!', '2026-10-25T10:00:00+02:00'),
           text(BASIA, 'Basia', 'Nie ma mnie 26-28 października', '2026-10-25T10:01:00+02:00'));
  env.tick();
  const st = env.st();
  check('wiadomość bez dnia — bez notatki; nieobecność — zapamiętana z przedziałem i przy każdym dniu', st.notes.length === 1 && st.notes[0].k === 'abs'
    && st.notes[0].d.join() === '2026-10-26,2026-10-27,2026-10-28' && JSON.stringify(st.abs[0].iv) === '[["2026-10-26","2026-10-28"]]', JSON.stringify(st.notes));
})();

/* ---------- B78: skład dnia — wieczorem, rano ---------- */
(()=>{
  console.log('B78: pomocnik — skład na jutro wieczorem (raz), dziś rano przy problemie, miniony tydzień w poniedziałek');
  const env = build({ now: '2026-10-25T10:20:00+02:00' });
  on(env, { min: 4, purple: 'Gosia, Janek', evening: 20, morning: 7, weekDays: [] });
  env.gw.weather = { daily: { time: ['2026-10-26'], temperature_2m_min: [4.2], temperature_2m_max: [11.4], precipitation_probability_max: [30] } };
  env.push(pollMsg('P1', Q, OPTS, '2026-10-25T10:13:00+02:00'),
           vote('P1', ANIA, ['Poniedziałek'], '2026-10-25T10:15:00+02:00', { name: 'Ania' }),
           vote('P1', DAWID, ['Poniedziałek', 'Środa'], '2026-10-25T10:16:00+02:00', { name: 'Dawid' }),
           vote('P1', BASIA, ['Poniedziałek'], '2026-10-25T10:17:00+02:00', { name: 'Basia' }),
           vote('P1', CELINA, ['Poniedziałek'], '2026-10-25T10:18:00+02:00', { name: 'Celina' }),
           vote('P1', CELINA, [], '2026-10-25T15:28:00+02:00', { name: 'Celina' }),
           text(KASIA, 'Kasia', 'Dopisałam się na poniedziałek, będę 10-12 — nie mogę zaznaczyć w grafiku', '2026-10-25T16:00:00+02:00'),
           text(BASIA, 'Basia', 'Muszę się wypisać z poniedziałku, nie dam rady', '2026-10-25T17:00:00+02:00'),
           text(EWA, 'Ewa', 'Kto dołączy w poniedziałek?', '2026-10-25T18:00:00+02:00'));
  env.tick();
  const before = env.msgs().length;
  env.tick('2026-10-25T20:05:00+02:00');
  const ev = env.msgs().slice(before).filter(m => /Jutro — poniedziałek 26\.10/.test(m))[0] || '';
  check('wieczorem: skład na jutro — 3 os. przy minimum 4 ⚠️, kto jest', /Jutro — poniedziałek 26\.10\*: 3 os\. ⚠️ \(minimum 4\)/.test(ev)
    && /👥 Ania, Dawid, Basia|👥 .*Ania.*Basia.*Dawid/.test(ev), ev);
  check('...wypisani: Celina (z godziną)', /➖ wypisali się: Celina \(nd 15:28\)/.test(ev), ev);
  check('...brak fioletowego (Gosia, Janek)', /🟣 brak fioletowego ⚠️/.test(ev));
  check('...z czatu: cytaty z godziną, pytanie z liczbą osób w chwili pytania', /Kasia \(nd 16:00\): „Dopisałam się na poniedziałek/.test(ev)
    && /❓ Ewa \(nd 18:00, wtedy 3 os\.\): „Kto dołączy w poniedziałek\?"/.test(ev), ev);
  check('...rozjazd: Kasia pisze, że będzie, a nie ma jej w ankiecie; Basia pisze, że nie da rady, a dalej jest',
    /pisze, że będzie, a nie ma w ankiecie: Kasia/.test(ev) && /pisze, że nie da rady, a dalej w ankiecie: Basia/.test(ev), ev);
  check('...psy: 4 naszych, 5 spacerów (Hańcza na dwa), najdłużej bez spaceru: Draco', /🐕 4 psów, 5 spacerów \(~2 na osobę\)/.test(ev)
    && /⏳ najdłużej bez spaceru: Draco 5 dni, Barwik 3 dni/.test(ev), ev);
  check('...Draco (tylko wyznaczone osoby): kto ostatnio z nim chodził — i że jest w składzie', /🔴 Draco \(tylko wyznaczone osoby\) — ostatnio: Dawid 12\.10, Ilona 09\.10 · w składzie: Dawid ✓/.test(ev), ev);
  check('...pogoda', /🌦 4–11°C, deszcz 30%/.test(ev), ev);
  check('...wiadomość tylko do właściciela, z nagłówkiem (test)', env.gw.sent.every(p => p.chatId === OWNER) && /^🧪 🤖 \*Pomocnik Grafiku\*/.test(ev), ev.slice(0, 40));
  const n1 = env.msgs().length;
  env.tick('2026-10-25T20:15:00+02:00');
  check('drugi przebieg tego wieczoru — skład nie idzie drugi raz', env.msgs().filter(m => /Jutro — poniedziałek/.test(m)).length === 1 && env.msgs().length === n1);

  env.tick('2026-10-26T07:10:00+02:00');
  const mo = env.msgs().filter(m => /Dziś — poniedziałek 26\.10/.test(m))[0] || '';
  check('rano: problem (za mało osób) — skład na dziś', /Dziś — poniedziałek 26\.10\*: 3 os\. ⚠️/.test(mo), mo);
  const lw = env.msgs().filter(m => /Miniony tydzień/.test(m))[0] || '';
  check('w poniedziałek rano: miniony tydzień z Historii (19.10: 2 os., 2 spacery), psy z najmniejszą liczbą spacerów',
    /pn 19\.10 — ankieta \? · wyszło 2 os\. · 2 spacerów/.test(lw) && /najmniej spacerów: Draco 0/.test(lw), lw);

  // wieczór poza oknem — za późno, nic nie idzie (wiadomość sprzed dwóch godzin nikomu się nie przyda)
  const late = build({ now: '2026-10-25T23:10:00+02:00' });
  on(late, { evening: 20 });
  late.tick();
  check('wieczorny skład po oknie (23:10 przy 20:00) — nic', late.msgs().length === 0, late.msgs().join(' | '));

  // niedziela wieczór bez ankiety na nowy tydzień
  const none = build({ now: '2026-10-25T20:10:00+02:00' });
  on(none, { weekDays: [] });
  none.tick();
  const nm = none.msgs()[0] || '';
  check('niedziela wieczór bez ankiety (także w historii czatu): „nie widzę jeszcze ankiety na nowy tydzień"', /Nie widzę jeszcze ankiety na nowy tydzień/.test(nm)
    && /nie widzę ankiety na ten dzień/.test(nm) && none.gw.historyCalls.length === 1, nm);

  // „tylko gdy problem": wszystko w porządku — skład nie idzie
  const calm = build({ now: '2026-10-25T10:20:00+02:00' });
  on(calm, { min: 1, eveningAlways: false, weekDays: [], features: { eveningAlways: false, newPoll: false, weather: false } });
  calm.push(pollMsg('P1', Q, OPTS, '2026-10-25T10:13:00+02:00'), vote('P1', ANIA, ['Poniedziałek'], '2026-10-25T10:15:00+02:00', { name: 'Ania' }));
  calm.tick();
  calm.tick('2026-10-25T20:05:00+02:00');
  check('„tylko gdy problem" i wszystko w porządku — bez składu', calm.msgs().filter(m => /Jutro/.test(m)).length === 0, calm.msgs().join(' | '));
  calm.tick('2026-10-26T07:05:00+02:00');
  check('rano bez problemu — nic', calm.msgs().filter(m => /Dziś/.test(m)).length === 0);
})();

/* ---------- B79: zmiany w ankiecie ---------- */
(()=>{
  console.log('B79: pomocnik — zmiany w ankiecie zbiorczo, netto, po 15 min ciszy; „nie dam rady" z czatu');
  const env = build({ now: '2026-10-26T12:00:00+02:00' });
  on(env, { weekDays: [], features: { newPoll: false, morning: false, evening: false, members: false, lastWeek: false } });
  env.push(pollMsg('P1', Q, OPTS, '2026-10-25T10:13:00+02:00'),
           vote('P1', ANIA, ['Wtorek'], '2026-10-25T10:15:00+02:00', { name: 'Ania' }),
           vote('P1', BASIA, ['Wtorek'], '2026-10-25T10:16:00+02:00', { name: 'Basia' }),
           vote('P1', CELINA, ['Wtorek'], '2026-10-25T10:17:00+02:00', { name: 'Celina' }));
  env.tick();
  check('pierwszy przebieg: punkt odniesienia, bez wiadomości', env.msgs().length === 0, env.msgs().join(' | '));
  env.push(vote('P1', BASIA, [], '2026-10-26T12:08:00+02:00'));
  env.tick('2026-10-26T12:10:00+02:00');
  env.tick('2026-10-26T12:20:00+02:00');
  check('wypisanie: przez kwadrans ciszy nic', env.msgs().length === 0);
  env.tick('2026-10-26T12:30:00+02:00');
  const m = env.last();
  check('po kwadransie: „➖ Basia — jutro — wtorek 27.10 ⏰ mniej niż dobę przed → 2 os. ⚠️"', /Zmiany w Grafiku/.test(m)
    && /➖ Basia — jutro — wtorek 27\.10 ⏰ mniej niż dobę przed → 2 os\. ⚠️/.test(m), m);
  env.tick('2026-10-26T13:00:00+02:00');
  check('ta sama zmiana nie idzie drugi raz', env.msgs().length === 1);

  env.push(vote('P1', CELINA, [], '2026-10-26T13:05:00+02:00'), vote('P1', CELINA, ['Wtorek'], '2026-10-26T13:06:00+02:00'));
  env.tick('2026-10-26T13:10:00+02:00');
  env.push(vote('P1', DAWID, ['Środa'], '2026-10-26T13:12:00+02:00', { name: 'Dawid' }), vote('P1', DAWID, [], '2026-10-26T13:20:00+02:00'));
  env.tick('2026-10-26T13:20:00+02:00');
  env.tick('2026-10-26T13:40:00+02:00');
  env.tick('2026-10-26T14:00:00+02:00');
  check('odkliknięcie i ponowne kliknięcie (netto zero) — bez wiadomości', env.msgs().length === 1, env.msgs().join(' | '));

  env.push(text(ANIA, 'Ania', 'Muszę się wypisać z jutra, rozchorowałam się', '2026-10-26T14:05:00+02:00'),
           vote('P1', KASIA, ['Wtorek'], '2026-10-26T14:06:00+02:00', { name: 'Kasia' }));
  env.tick('2026-10-26T14:10:00+02:00');
  env.tick('2026-10-26T14:30:00+02:00');
  const m2 = env.last();
  check('dopisanie i „wypisuję się z jutra" z czatu w jednej wiadomości', env.msgs().length === 2 && /➕ Kasia — jutro — wtorek 27\.10 → 3 os\./.test(m2)
    && /💬 Ania: „Muszę się wypisać z jutra/.test(m2), m2);
  env.tick('2026-10-26T15:00:00+02:00');
  check('...i nie wraca', env.msgs().length === 2);
})();

/* ---------- B80: przegląd tygodnia, skład grupy, pytania, sufity, panel ---------- */
(()=>{
  console.log('B80: pomocnik — przegląd tygodnia, nowe osoby, pytania w prywatnym czacie, sufity wysyłki, panel bez numerów');
  const env = build({ now: '2026-10-25T10:20:00+02:00' });
  on(env, { weekDays: [0], features: { weather: false } });
  env.push(pollMsg('P1', Q, OPTS, '2026-10-25T10:13:00+02:00'));
  // głos jednej osoby niesie WSZYSTKIE jej wybory: trzy osoby pn–pt i nd, trzy tylko nd; sobota pusta
  [ANIA, BASIA, CELINA].forEach(w => env.push(vote('P1', w, ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Niedziela'], '2026-10-25T10:15:00+02:00')));
  [DAWID, EWA, KASIA].forEach(w => env.push(vote('P1', w, ['Niedziela'], '2026-10-25T10:16:00+02:00')));
  env.tick();
  env.tick('2026-10-25T20:05:00+02:00');
  const wk = env.msgs().filter(m => /Przegląd tygodnia/.test(m))[0] || '';
  check('niedziela wieczór: przegląd tygodnia — sobota bez nikogo ⚠️, podpowiedź z niedzieli na sobotę', /sob 31\.10 — 0 os\. ⚠️/.test(wk)
    && /przepisze się na sob 31\.10 \(0\)/.test(wk) && /nd 01\.11 — 6 os\./.test(wk), wk);
  check('skład grupy pierwszy raz — tylko punkt odniesienia', !env.msgs().some(m => /skład grupy/.test(m)) && env.st().members.ids.length === 2);
  env.gw.members = [ANIA, BASIA, KASIA];
  env.push(text(KASIA, 'Kasia', 'Hej, jestem nowa', '2026-10-26T12:00:00+02:00'));
  env.tick('2026-10-26T20:05:00+02:00');
  const mem = env.msgs().filter(m => /skład grupy/.test(m))[0] || '';
  check('następny wieczór: nowa osoba — z przypomnieniem, że nie widzi ankiety', /👋 nowe osoby: Kasia — nie zobaczą ankiety/.test(mem), mem);

  const n0 = env.msgs().length;
  env.push(text(OWNER, 'Grzesiek', 'jutro', '2026-10-26T21:00:00+02:00', OWNER),
           text(OWNER, 'Grzesiek', 'Pomoc', '2026-10-26T21:00:10+02:00', OWNER),
           text('48600999999@c.us', 'Obcy', 'jutro', '2026-10-26T21:00:20+02:00', '48600999999@c.us'));
  env.tick('2026-10-26T21:05:00+02:00');
  const replies = env.msgs().slice(n0);
  check('pytania właściciela: „jutro" → skład na jutro, „pomoc" → lista pytań; obcy czat — nic', replies.length === 2
    && /Jutro — wtorek 27\.10/.test(replies[0]) && /\*tydzień\*/.test(replies[1]), replies.join(' | '));
  env.push(text(OWNER, 'Grzesiek', 'sobota', '2026-10-26T21:10:00+02:00', OWNER), text(OWNER, 'Grzesiek', '1.11', '2026-10-26T21:10:10+02:00', OWNER),
           text(OWNER, 'Grzesiek', 'nieaktywni', '2026-10-26T21:10:20+02:00', OWNER));
  env.tick('2026-10-26T21:15:00+02:00');
  const r2 = env.msgs().slice(n0 + 2);
  check('„sobota", „1.11", „nieaktywni"', /Sobota 31\.10|sobota 31\.10/.test(r2[0] || '') && /niedziela 01\.11|Niedziela 01\.11/.test(r2[1] || '')
    && /Bez głosu w ostatnich/.test(r2[2] || ''), r2.join(' | '));
  for(let i = 0; i < 6; i++) env.push(text(OWNER, 'Grzesiek', 'stan', '2026-10-26T21:20:0' + i + '+02:00', OWNER));
  const n1 = env.msgs().length;
  env.tick('2026-10-26T21:25:00+02:00');
  check('najwyżej ' + env.conf.HELPER_LIMITS.CMDS + ' odpowiedzi na przebieg', env.msgs().length - n1 === env.conf.HELPER_LIMITS.CMDS, String(env.msgs().length - n1));

  // sufit dzienny — ponad niego nic nie wychodzi, zostaje wpis w dzienniku
  const capped = build({ now: '2026-10-26T21:00:00+02:00' });
  on(capped);
  capped.props.helperState = JSON.stringify({ sent: { day: '2026-10-26', n: capped.conf.HELPER_DAY_MAX } });
  capped.push(text(OWNER, 'Grzesiek', 'jutro', '2026-10-26T20:59:00+02:00', OWNER));
  capped.tick();
  check('sufit dzienny (' + capped.conf.HELPER_DAY_MAX + '): nic nie wychodzi, wpis w dzienniku', capped.msgs().length === 0 && capped.st().log.some(l => /limit wiadomości/.test(l.m)));

  // pytania wyłączone
  const quiet = build({ now: '2026-10-26T21:00:00+02:00' });
  on(quiet, { features: { commands: false, evening: false, week: false, members: false } });
  quiet.push(text(OWNER, 'Grzesiek', 'jutro', '2026-10-26T20:59:00+02:00', OWNER));
  quiet.tick();
  check('pytania wyłączone — bez odpowiedzi', quiet.msgs().length === 0, quiet.msgs().join(' | '));

  // podgląd i panel
  const pv = env.api.helperPreview(TEST_PIN, 'tydzien');
  check('podgląd w panelu — tekst, bez wysyłki', /Przegląd tygodnia/.test(pv.text) && pv.sent === false);
  const n2 = env.msgs().length;
  env.api.helperPreview(TEST_PIN, 'jutro', true);
  check('„Wyślij mi" — jedna wiadomość do właściciela', env.msgs().length === n2 + 1 && /Jutro —/.test(env.last()));
  const diag = env.api.getDiagnostics(TEST_PIN);
  const h = diag.helper, json = JSON.stringify(h);
  check('panel (getDiagnostics): ustawienia, ostatni przebieg, ankiety, dziennik', h && h.settings.enabled && h.stat && h.polls.length === 1
    && /pn 26\.10 3/.test(h.polls[0].days) && h.log.length > 0, json.slice(0, 300));
  check('...bez numerów telefonów i bez tokenu', !/48601|48600111|tok3n/.test(json.replace(OWNER, '').replace(/"toId":"[^"]*"/, '')), json.match(/4860\d+/g));
  const nowRun = env.api.helperRunNow(TEST_PIN);
  check('„Sprawdź teraz": przebieg i panel', nowRun.run && nowRun.panel && nowRun.panel.stat);
  check('getData nie niesie niczego z pomocnika', !/helper|Grafik|48601/.test(JSON.stringify(env.api.getData())));
})();

/* ---------- B81: bramka bez powiadomień — pomocnik nic nie widzi ---------- */
(()=>{
  console.log('B81: pomocnik — w bramce wyłączone powiadomienia (test 24–25.10): zamiast „brak ankiety" jedno ostrzeżenie dziennie, bez składów');
  const env = build({ now: '2026-10-24T20:35:00+02:00' });
  ['incomingWebhook', 'pollMessageWebhook', 'outgoingAPIMessageWebhook', 'outgoingMessageWebhook'].forEach(k => { env.gw.settings[k] = 'no'; });
  on(env);
  env.tick();
  const m = env.msgs();
  check('wieczór, bramka bez powiadomień: jedno ostrzeżenie z listą wyłączonych, żadnego składu ani przeglądu',
    m.length === 1 && /Nie widzę „Grafiku"/.test(m[0]) && /powiadomienia o ankietach/.test(m[0]) && /wiadomościach przychodzących/.test(m[0])
    && !/Jutro|Przegląd|ankiety na ten dzień/.test(m.join('|')), m.join(' | '));
  const calls = () => env.http.calls.filter(c => /\/getSettings\//.test(c.url)).length;
  const c1 = calls();
  env.tick('2026-10-24T20:45:00+02:00');
  env.tick('2026-10-25T08:05:00+02:00');
  check('ostrzeżenie raz na dzień (drugi wieczorny przebieg nic), ustawienia sprawdzane co przebieg, dopóki czegoś brakuje',
    env.msgs().length === 2 && /Nie widzę „Grafiku"/.test(env.msgs()[1]) && calls() === c1 + 2, env.msgs().join(' | '));
  check('rano bez powiadomień — bez „Dziś — brak ankiety"', !env.msgs().some(x => /Dziś/.test(x)));
  check('panel: stan bramki z listą brakujących', env.api.helperPanel_().gate && env.api.helperPanel_().gate.ok === false
    && env.api.helperPanel_().gate.missing.length === 4);

  // ankieta bota z 10:13 i głosy od rana — bramka bez powiadomień nic z tego nie przekazała; właściciel włącza je o 14:30
  // (poza porami wiadomości — historię ściąga samo włączenie, nie brak ankiety przed raportem)
  env.gw.history.push({ type: 'outgoing', idMessage: 'P1', timestamp: ts('2026-10-25T10:13:00+02:00'), typeMessage: 'pollMessage', chatId: GRAFIK,
    pollMessageData: { name: Q, options: OPTS.map(o => ({ optionName: o })), multipleAnswers: true } });
  ['incomingWebhook', 'pollMessageWebhook', 'outgoingAPIMessageWebhook', 'outgoingMessageWebhook'].forEach(k => { env.gw.settings[k] = 'yes'; });
  env.tick('2026-10-25T14:30:00+02:00');
  const st = env.st(), p = pollOf(env, 'P1');
  check('po włączeniu: od razu historia czatu — ankieta z rana znaleziona, oznaczona jako niepełna', env.gw.historyCalls.length === 1 && !!p && p.partial === true
    && st.gate.ok && st.gate.from === Date.parse('2026-10-25T14:30:00+02:00'), JSON.stringify({ h: env.gw.historyCalls.length, p: p && p.partial, gate: st.gate }));
  check('...bez „Nowa ankieta" (wysłana rano, już przypięta)', !env.msgs().some(x => /Nowa ankieta/.test(x)), env.msgs().join(' | '));
  env.push(vote('P1', ANIA, ['Poniedziałek'], '2026-10-25T14:35:00+02:00', { name: 'Ania' }));
  env.tick('2026-10-25T14:40:00+02:00');
  check('kolejny przebieg poza porą wiadomości — bez drugiej historii', env.gw.historyCalls.length === 1);
  const pv = env.api.helperPreview(TEST_PIN, 'jutro').text;
  check('skład na jutro z ankiety niepełnej: „co najmniej 1 os." i od kiedy znam głosy', /Jutro — poniedziałek 26\.10\*: co najmniej 1 os\./.test(pv)
    && /sprzed włączenia powiadomień w bramce \(nd 14:30\)/.test(pv), pv);
  check('przegląd tygodnia: „≥" przy dniach z ankiety niepełnej', /pn 26\.10 — ≥ 1 os\./.test(env.api.helperPreview(TEST_PIN, 'tydzien').text));
  check('„stan": bramka włączona od nd 14:30', /bramka: powiadomienia włączone \(od nd 14:30\)/.test(env.api.helperPreview(TEST_PIN, 'stan').text));
  env.tick('2026-10-25T20:05:00+02:00');
  const ev = env.msgs().filter(x => /Jutro — poniedziałek/.test(x))[0] || '';
  check('wieczorem skład z ankietą (niepełną) — nie „nie widzę ankiety"', /co najmniej 1 os\./.test(ev) && !/nie widzę ankiety|Nie widzę jeszcze/.test(ev), ev);
  env.tick('2026-10-26T08:05:00+01:00');
  check('rano, ankieta niepełna z 1 osobą przy minimum 3 — bez alarmu „mało osób" (liczba to tylko dolna granica)',
    !env.msgs().some(x => /Dziś — poniedziałek/.test(x)), env.msgs().slice(-2).join(' | '));
})();

/* ---------- B82: historia czatu, głosy z czasem, 408 ---------- */
(()=>{
  console.log('B82: pomocnik — historia czatu (te same reguły co kolejka, powtarzalnie), starszy głos nie nadpisuje nowszego, 408 to pusta kolejka');
  const env = build({ now: '2026-10-26T12:00:00+02:00' });
  on(env, { weekDays: [], features: { newPoll: false, changes: false, members: false } });
  const H = (o) => Object.assign({ type: 'incoming', chatId: GRAFIK, typeMessage: 'pollUpdateMessage' }, o);
  const upd = (who, picked, iso, id) => H({ idMessage: id, timestamp: ts(iso), senderId: who, senderName: who === ANIA ? 'Ania' : 'Basia',
    pollMessageData: { stanzaId: 'P1', name: Q, votes: OPTS.map(o => ({ optionName: o, optionVoters: picked.indexOf(o) >= 0 ? [who] : [] })) } });
  env.gw.history.push({ type: 'outgoing', idMessage: 'P1', timestamp: ts('2026-10-25T10:13:00+02:00'), typeMessage: 'pollMessage', chatId: GRAFIK,
      pollMessageData: { name: Q, options: OPTS.map(o => ({ optionName: o })), multipleAnswers: true } },
    upd(ANIA, ['Wtorek'], '2026-10-25T11:00:00+02:00', 'H1'), upd(ANIA, ['Wtorek', 'Środa'], '2026-10-25T12:00:00+02:00', 'H2'),
    upd(BASIA, ['Wtorek'], '2026-10-25T13:00:00+02:00', 'H3'),
    H({ idMessage: 'H4', timestamp: ts('2026-10-25T14:00:00+02:00'), typeMessage: 'textMessage', senderId: BASIA, senderName: 'Basia', textMessage: 'Będę we wtorek 10-12' }));
  env.api.helperRunNow(TEST_PIN);                         // „Sprawdź teraz" — zawsze z historią
  const st1 = env.st();
  check('historia: ankieta, głosy w kolejności czasu (Ania: wt i śr), wiadomość z czatu', votersOn(env, 'P1', '2026-10-27').join() === [ANIA, BASIA].join()
    && votersOn(env, 'P1', '2026-10-28').join() === ANIA && st1.notes.length === 1, JSON.stringify(pollOf(env, 'P1').v));
  env.api.helperRunNow(TEST_PIN);
  check('druga historia — ten sam stan (bez podwójnych notatek)', env.st().notes.length === 1 && votersOn(env, 'P1', '2026-10-27').join() === [ANIA, BASIA].join());
  // kolejka podaje starszy głos Ani (z 11:00) po nowszym z historii — nie nadpisuje
  env.push(Object.assign(vote('P1', ANIA, ['Wtorek'], '2026-10-25T11:00:00+02:00'), { idMessage: 'H1' }));
  env.tick('2026-10-26T12:10:00+02:00');
  check('starszy głos po nowszym (inna kolejność kolejki i historii) — bez zmian', votersOn(env, 'P1', '2026-10-28').join() === ANIA, JSON.stringify(pollOf(env, 'P1').v));
  env.push(vote('P1', ANIA, [], '2026-10-26T12:15:00+02:00'));
  env.tick('2026-10-26T12:20:00+02:00');
  check('nowszy — wycofanie wszystkiego — zmienia', !pollOf(env, 'P1').v[ANIA]);
  env.api.helperRunNow(TEST_PIN);
  check('...a historia (starsze głosy Ani) go nie przywraca', !pollOf(env, 'P1').v[ANIA], JSON.stringify(pollOf(env, 'P1').v));

  env.gw.fail = url => /receiveNotification/.test(url) ? { code: 408, body: '' } : null;
  const r = env.tick('2026-10-26T12:30:00+02:00');
  check('408 z kolejki (bramka nie doczekała się powiadomienia) — pusta kolejka, bez błędu', r && !r.err && !env.st().log.some(l => /408/.test(l.m)), r && r.err);
  env.gw.fail = null;
  check('ankiety w dwóch właściwościach (stan rośnie z czasem głosów)', !!env.props.helperPolls && env.props.helperPolls2 !== undefined);
})();

/* ---------- B74 (ciąg dalszy): w żadnym scenariuszu nic nie poszło do grupy ---------- */
console.log('B74b: żadna wiadomość pomocnika nie poszła do grupy — każda do prywatnego czatu właściciela');
check('wszystkie wiadomości (' + ALL_SENT.length + ') — do ' + OWNER, ALL_SENT.length > 10 && ALL_SENT.every(p => p.chatId === OWNER),
  JSON.stringify(ALL_SENT.filter(p => p.chatId !== OWNER).map(p => p.chatId)));

console.log(failures ? `\n${failures} FAIL` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

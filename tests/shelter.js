// 1.6 — raport do schroniska po stronie serwera (Shelter.gs): link do formularza Microsoft Forms z panelu, odczyt
// i sprawdzenie definicji, odświeżanie (panel, nocne czyszczenie), pamięć „kto otwierał raport dnia".
// B101–B107 na atrapie arkusza (backend-harness) i atrapie Microsoft Forms (env.http). Numer formularza wymyślony —
// prawdziwy link nie trafia do repozytorium (każdy z nim może wysłać schronisku odpowiedź).
const { makeContext } = require('./backend-harness');
let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  OK  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
const TEST_PIN = '4321';
const J = s => JSON.stringify(s);
const throws = fn => { try{ fn(); return false; }catch(e){ return e.message || String(e); } };

const FORM_ID = 'TESTFORMaBcDeFgHiJkLmNoPq_RsTuV-0123456789.u';    // wymyślony, w kształcie prawdziwego
const LINK = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=' + FORM_ID;
const DATE_Q = 'r' + 'a1'.repeat(16), DOG_Q = 'r' + 'b2'.repeat(16);
// pozycje jak w formularzu schroniska: psy TTB z grupą w nazwie, część z tabulatorem, numery z zerami z przodu
const CHOICES = ['Bysiu(TTB) 0689/21', 'Marvel\t1075/24', 'Draco\t0552/26', 'Mała Mi 0893/26'];

/** Definicja formularza, jak oddaje ją ResponsePageStartup.ashx (tylko pola, których używa Shelter.gs, plus trochę szumu). */
function formBody(o){
  const choices = o.choices || CHOICES;
  const questions = o.questions || [
    { id: DATE_Q, type: 'Question.DateTime', title: o.dateTitle || 'Data spaceru', required: true, order: 1,
      questionInfo: J({ Date: true, Time: !!o.withTime }) },
    { id: DOG_Q, type: 'Question.Choice', title: 'Pies', required: true, order: 2,
      questionInfo: J({ Choices: choices.map(c => ({ Description: c, FormsProDisplayRTText: c })), ChoiceType: o.single ? 1 : 2,
                        AllowOtherAnswer: false }) },
  ].concat(o.more || []);
  return J({ data: { responses: null, form: { id: FORM_ID, title: o.title || 'Grupa G13', status: o.status || 'Active',
    settings: J({ RequiresUniqueResponse: false, IsAnonymous: true, AllowPrefill: o.prefill === undefined ? true : o.prefill }),
    questions } }, serverInfo: { contextParams: '' } });
}
/**
 * Atrapa Microsoft Forms: definicja pod FORM_ID (z `o` — zmienianego przez test w trakcie), inny numer — błąd 1001 jak
 * prawdziwy formularz; krótki link /e/SHORT1234 — 301 na stronę formularza. `o.fail` — awaria sieci (komunikat),
 * `o.code` — inny kod odpowiedzi, `o.raw` — dowolna treść.
 */
function msForms(env, o){
  env.http.handler = url => {
    if(/\/handlers\/ResponsePageStartup\.ashx\?id=/.test(url)){
      if(o.fail) throw new Error(o.fail);
      const id = decodeURIComponent(url.match(/id=([^&]+)/)[1]);
      if(id !== FORM_ID) return { code: 200, body: J({ data: { error: { code: '1001', message: 'invalid form id' } } }) };
      return { code: o.code || 200, body: o.raw !== undefined ? o.raw : formBody(o) };
    }
    if(/\/e\/SHORT1234$/.test(url)) return { code: 301, body: '',
      headers: { Location: 'https://forms.cloud.microsoft/pages/responsepage.aspx?id=' + FORM_ID + '&route=shorturl' } };
    if(/\/e\/LOOP12345$/.test(url)) return { code: 302, body: '', headers: { location: '/e/LOOP12345' } };
    if(/\/r\/ELSEWHERE1$/.test(url)) return { code: 302, body: '', headers: { Location: 'https://example.com/form?id=' + FORM_ID } };
    return { code: 404, body: '' };
  };
}
/** 4 sierpnia 2026, 10:00, reset 22:00 — dzień rezerwacyjny 2026-08-04 (jak backend.js). */
function build(opts){
  opts = opts || {};
  const sheets = [
    { name:'Psy', rows: [['id','imie','identyfikator','boks','trudnosc','status','kto','godzina','ostatni_spacer','notatka','spacery','kto1','godzina1','notatka_do'],
                        [1,'Draco','552/26','','easy','','','','','',1,'','','']] },
    { name:'Historia', rows: [['data','pies','kto','godzina']] },
    { name:'Zadania',  rows: [['id','tresc','data','status']] },
  ];
  return makeContext(Object.assign({}, opts, { now: opts.now || '2026-08-04T10:00:00+02:00', sheets,
    props: Object.assign({ pin: TEST_PIN, walksImported: '2026-01-01' }, opts.props) }));
}
const saved = env => JSON.parse(env.props[env.conf.PROP_SHELTER_FORM] || 'null');
const marks = env => JSON.parse(env.props[env.conf.PROP_SHELTER_OPENED] || '{}');
const CONSENT_ERR = 'You do not have permission to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request';

/* ---------- B101: link z panelu ---------- */
(()=>{
  console.log('B101: link do formularza — pełny (numer z adresu), krótki (numer z przekierowania), reszta odrzucona');
  const env = build();
  const L = s => { try{ return J(env.api.shelterLink_(s)); }catch(e){ return 'ERR: ' + e.message; } };
  check('pełny link → numer formularza', L(LINK) === J({ id: FORM_ID }), L(LINK));
  check('z innymi parametrami, mała pisownia ścieżki, spacje dookoła', L('  https://forms.cloud.microsoft/pages/responsepage.aspx?route=shorturl&id=' + FORM_ID + '&embed=true#x  ') === J({ id: FORM_ID }));
  check('numer zakodowany w adresie (%5F to „_") — odkodowany', L('https://forms.office.com/Pages/ResponsePage.aspx?id=' + FORM_ID.replace('_', '%5F')) === J({ id: FORM_ID }));
  check('forms.office.com i FORMS.CLOUD.MICROSOFT też', /"id"/.test(L('https://forms.office.com/Pages/ResponsePage.aspx?id=' + FORM_ID))
    && /"id"/.test(L('https://FORMS.CLOUD.MICROSOFT/Pages/ResponsePage.aspx?id=' + FORM_ID)));
  check('krótki link …/e/… i …/r/… → do rozwiązania przekierowaniem', L('https://forms.cloud.microsoft/e/prdk98PT49') === J({ short: 'https://forms.cloud.microsoft/e/prdk98PT49' })
    && L('https://forms.office.com/r/AbCd1234/') === J({ short: 'https://forms.office.com/r/AbCd1234' }), L('https://forms.office.com/r/AbCd1234/'));
  check('pusty → null (usunięcie formularza)', L('') === 'null' && L('   ') === 'null' && L(null) === 'null');
  [['http (bez s)', 'http://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=' + FORM_ID],
   ['inna strona', 'https://forms.cloud.microsoft.evil.com/Pages/ResponsePage.aspx?id=' + FORM_ID],
   ['inna strona z formularzem w ścieżce', 'https://example.com/forms.cloud.microsoft?id=' + FORM_ID],
   ['Google Forms', 'https://docs.google.com/forms/d/e/1FAIpQLSf/viewform'],
   ['bez numeru', 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx'],
   ['zły numer', 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=abc'],
   ['numer z niedozwolonym znakiem', 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=' + FORM_ID + '%22%3E'],
   ['zepsute kodowanie', 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=%E0%A4%A' + FORM_ID],
   ['za długi', LINK + '&x=' + 'a'.repeat(500)],
   ['zwykły tekst', 'formularz schroniska'],
   ['javascript:', 'javascript:alert(1)'],
  ].forEach(([what, s]) => check('odrzucony: ' + what, /^ERR: /.test(L(s)), L(s)));
})();

/* ---------- B102: zapis formularza z panelu ---------- */
(()=>{
  console.log('B102: setShelterForm — PIN, odczyt i sprawdzenie formularza, zapis dopiero po udanym; pusty link usuwa');
  const env = build(), o = {};
  msForms(env, o);
  check('bez PIN-u nic', /PIN/.test(String(throws(() => env.api.setShelterForm(LINK, '0000')))) && !env.http.calls.length);
  check('zły link: błąd od razu, bez pytania Microsoftu', /Microsoft Forms/.test(String(throws(() => env.api.setShelterForm('https://example.com/x', TEST_PIN))))
    && !env.http.calls.length);
  const res = env.api.setShelterForm(LINK, TEST_PIN);
  const call = env.http.calls[0];
  check('pyta o definicję: forms.cloud.microsoft/handlers/ResponsePageStartup.ashx z numerem formularza, GET',
    call && call.url === 'https://forms.cloud.microsoft/handlers/ResponsePageStartup.ashx?id=' + encodeURIComponent(FORM_ID) + '&mobile=false'
    && call.opts.method === 'get' && call.opts.muteHttpExceptions === true, call && J(call));
  const s = saved(env);
  check('zapisane: link, numer, pytania, pozycje dokładnie jak w formularzu (z tabulatorem), czas sprawdzenia',
    s && s.link === LINK && s.id === FORM_ID && s.dateQ === DATE_Q && s.dogQ === DOG_Q && J(s.choices) === J(CHOICES)
    && s.title === 'Grupa G13' && s.active === true && s.at === '2026-08-04 10:00' && !s.err && J(s.extra) === '[]', J(s));
  check('odpowiedź: panel i formularz dla listy', res.panel.link === LINK && res.panel.count === 4 && res.panel.title === 'Grupa G13'
    && res.form.id === FORM_ID && res.error === '', J(res.panel));
  const g = env.api.getData().shelterForm;
  check('getData: strona formularza, numery pytań, pozycje — bez linku z panelu i bez błędów',
    J(g) === J({ page: 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx', id: FORM_ID, title: 'Grupa G13', dateQ: DATE_Q, dogQ: DOG_Q,
                 choices: CHOICES, extra: [], active: true }), J(g));
  const d = env.api.getDiagnostics(TEST_PIN).shelter;
  check('panel (getDiagnostics): link, tytuł, ile pozycji, kiedy sprawdzony', d.link === LINK && d.count === 4 && d.at === '2026-08-04 10:00' && d.err === '', J(d));

  // krótki link: numer z przekierowania (bez podążania samemu — Location)
  env.http.calls.length = 0;
  env.api.setShelterForm('https://forms.cloud.microsoft/e/SHORT1234', TEST_PIN);
  check('krótki link: najpierw bez podążania za przekierowaniem, numer z Location; zapisany link jak wklejony',
    env.http.calls[0].opts.followRedirects === false && saved(env).id === FORM_ID && saved(env).link === 'https://forms.cloud.microsoft/e/SHORT1234',
    J(env.http.calls.map(c => c.url)));
  check('krótki link w kółko albo na obcą stronę — błąd, nic nie zmienione',
    /Krótki link nie prowadzi/.test(String(throws(() => env.api.setShelterForm('https://forms.cloud.microsoft/e/LOOP12345', TEST_PIN))))
    && /Krótki link nie prowadzi/.test(String(throws(() => env.api.setShelterForm('https://forms.office.com/r/ELSEWHERE1', TEST_PIN))))
    && saved(env).link === 'https://forms.cloud.microsoft/e/SHORT1234');
  check('nie ma takiego formularza (Microsoft: 200 z błędem 1001)',
    /Nie ma takiego formularza/.test(String(throws(() => env.api.setShelterForm('https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=INNYFORMULARZ123', TEST_PIN)))));

  // każdy powód odmowy — z komunikatem, a działający formularz zostaje
  const keep = env.props[env.conf.PROP_SHELTER_FORM];
  const refuse = (what, patch, re) => {
    Object.keys(o).forEach(k => delete o[k]); Object.assign(o, patch);
    const m = String(throws(() => env.api.setShelterForm(LINK, TEST_PIN)));
    check('odmowa: ' + what, re.test(m) && env.props[env.conf.PROP_SHELTER_FORM] === keep, m);
  };
  refuse('bez wstępnego wypełniania', { prefill: false }, /nie pozwala na wstępne wypełnienie/);
  refuse('lista psów z jednym wyborem', { single: true }, /tylko jednego psa/);
  refuse('pytanie o datę z godziną', { withTime: true }, /nie ma pytania o datę/);
  refuse('bez pytań', { questions: [] }, /nie ma pytania o datę/);
  refuse('dwie listy bez „pies" w tytule', { questions: [
    { id: DATE_Q, type: 'Question.DateTime', title: 'Data spaceru', required: true, questionInfo: J({ Date: true }) },
    { id: DOG_Q, type: 'Question.Choice', title: 'Lista A', required: true, questionInfo: J({ Choices: [{ Description: 'Draco 0552/26' }], ChoiceType: 2 }) },
    { id: 'r' + 'c3'.repeat(16), type: 'Question.Choice', title: 'Pora', questionInfo: J({ Choices: [{ Description: 'rano' }], ChoiceType: 2 }) }] },
    /kilka list wyboru/);
  refuse('dwa pytania o datę bez „data" w tytule', { questions: [
    { id: DATE_Q, type: 'Question.DateTime', title: 'Kiedy', required: true, questionInfo: J({ Date: true }) },
    { id: 'r' + 'e5'.repeat(16), type: 'Question.DateTime', title: 'Urodziny', questionInfo: J({ Date: true }) },
    { id: DOG_Q, type: 'Question.Choice', title: 'Pies', required: true, questionInfo: J({ Choices: [{ Description: 'Draco 0552/26' }], ChoiceType: 2 }) }] },
    /kilka pytań o datę/);
  refuse('pusta lista psów', { choices: [] }, /nie ma listy psów/);
  refuse('za dużo pozycji', { choices: Array.from({ length: 301 }, (_, i) => 'Pies ' + i + ' ' + i + '/26') }, /za dużo psów/);
  refuse('za długa pozycja', { choices: ['x'.repeat(201)] }, /Za długa pozycja/);
  refuse('pozycje razem ponad pamięć właściwości', { choices: Array.from({ length: 290 }, (_, i) => 'Pies o bardzo długim imieniu ' + i + ' 0' + i + '/26') }, /za długa, żeby ją zapamiętać/);
  refuse('dziwny numer pytania', { questions: [
    { id: 'r a"b', type: 'Question.DateTime', title: 'Data', required: true, questionInfo: J({ Date: true }) },
    { id: DOG_Q, type: 'Question.Choice', title: 'Pies', required: true, questionInfo: J({ Choices: [{ Description: 'A 1/26' }], ChoiceType: 2 }) }] }, /Nieznany układ/);
  refuse('nieczytelna odpowiedź (strona logowania zamiast definicji)', { raw: '<html>Zaloguj się</html>' }, /bez logowania/);
  refuse('Microsoft odpowiada błędem', { code: 503 }, /nie odpowiada \(błąd 503\)/);
  refuse('awaria sieci', { fail: 'Address unavailable: https://forms.cloud.microsoft/x' }, /Formularz nie odpowiada — spróbuj za chwilę/);
  refuse('brak zgody na połączenie (authorizeWhatsApp)', { fail: CONSENT_ERR }, /authorizeWhatsApp\(\)/);

  // dwie listy, ale jedna to „Pies" — po tytule; inne wymagane pytanie — do uzupełnienia ręcznie; formularz zamknięty
  Object.keys(o).forEach(k => delete o[k]);
  Object.assign(o, { status: 'Inactive', more: [
    { id: 'r' + 'c3'.repeat(16), type: 'Question.Choice', title: 'Pora', required: false, questionInfo: J({ Choices: [{ Description: 'rano' }], ChoiceType: 1 }) },
    { id: 'r' + 'd4'.repeat(16), type: 'Question.Text', title: 'Imię  wolontariusza', required: true, questionInfo: '{}' }] });
  env.api.setShelterForm(LINK, TEST_PIN);
  check('dwie listy — psy po tytule; inne wymagane pytanie w `extra`; zamknięty — active: false',
    saved(env).dogQ === DOG_Q && J(saved(env).extra) === J(['Imię wolontariusza']) && saved(env).active === false
    && env.api.getData().shelterForm.active === false, J(saved(env)));

  env.api.setShelterForm('', TEST_PIN);
  check('pusty link: formularz usunięty — getData bez raportu, panel „nie ustawiony"', !(env.conf.PROP_SHELTER_FORM in env.props)
    && env.api.getData().shelterForm === null && env.api.getDiagnostics(TEST_PIN).shelter.link === '');
  check('„Sprawdź" bez formularza — błąd z instrukcją', /wklej link/.test(String(throws(() => env.api.checkShelterForm(TEST_PIN)))));
})();

/* ---------- B103: pamięć „kto otwierał raport dnia" ---------- */
(()=>{
  console.log('B103: shelterReportOpened — bez PIN-u, wejście sprawdzane, psy sumują się, powtórka nic nie zmienia, stare wypadają');
  const env = build();
  const D = '2026-08-04';
  const r1 = env.api.shelterReportOpened(D, ['552/26', '1075/24']);
  check('zapisane: kiedy (czas serwera) i psy', J(r1) === J({ date: D, mark: { at: '2026-08-04 10:00', t: env.now(), keys: ['552/26', '1075/24'] } }), J(r1));
  env.setNow('2026-08-04T17:20:00+02:00');
  const r2 = env.api.shelterReportOpened(D, ['1075/24', '893/26']);
  check('drugie otwarcie: psy razem (bez powtórek), czas ostatniego', J(r2.mark.keys) === J(['552/26', '1075/24', '893/26']) && r2.mark.at === '2026-08-04 17:20', J(r2));
  const r3 = env.api.shelterReportOpened(D, ['1075/24', '893/26']);
  check('powtórka (np. ponowienie po zgubionej odpowiedzi) — te same psy', J(r3.mark.keys) === J(r2.mark.keys));
  check('w arkuszu nic — tylko właściwość, psy jednym napisem', J(marks(env)) === J({ [D]: { at: '2026-08-04 17:20', t: env.now(), k: '552/26,1075/24,893/26' } }), J(marks(env)));
  check('dzień miniony — można (ktoś zapomniał)', env.api.shelterReportOpened('2026-08-01', ['552/26']).date === '2026-08-01');
  check('dzień przyszły — nie', /trwa albo już minął/.test(String(throws(() => env.api.shelterReportOpened('2026-08-05', ['552/26'])))));
  check('data nieistniejąca i śmieci — nie', /trwa albo już minął/.test(String(throws(() => env.api.shelterReportOpened('2026-02-30', ['552/26']))))
    && /trwa albo już minął/.test(String(throws(() => env.api.shelterReportOpened({}, ['552/26'])))));
  const r4 = env.api.shelterReportOpened('2026-08-02', ['0552/26', '552/2026', ' 552/26', '552/26', 'x', '<b>', {}, null, '1234567/26', '12/345']);
  check('numery tylko w kształcie z przeglądarki („552/26"), bez powtórek; reszta odpada', J(r4.mark.keys) === J(['552/26']), J(r4));
  check('bez żadnego dobrego numeru — błąd', /bez psów|nie było psów/.test(String(throws(() => env.api.shelterReportOpened(D, ['x', '0552/26'])))));
  check('nie lista — błąd', !!throws(() => env.api.shelterReportOpened(D, '552/26')));
  check('najwyżej SHELTER_KEYS_MAX psów w jednym dniu', env.api.shelterReportOpened('2026-08-03',
    Array.from({ length: 300 }, (_, i) => (i + 1) + '/26')).mark.keys.length === env.conf.SHELTER_KEYS_MAX);
  // getData: ostatnie dni; minione — z getHistoryDays
  env.api.shelterReportOpened('2026-07-10', ['1/26']);
  const g = env.api.getData().shelterOpened;
  check('getData: dni od bieżącego wstecz o SHELTER_RECENT_DAYS — bez 10.07', J(Object.keys(g).sort()) === J(['2026-08-01', '2026-08-02', '2026-08-03', D])
    && J(g[D]) === J({ at: '2026-08-04 17:20', t: env.now(), keys: ['552/26', '1075/24', '893/26'] }), J(Object.keys(g)));
  const h = env.api.getHistoryDays('2026-07-01', '2026-07-14').shelterOpened;
  check('getHistoryDays: otwarcia dni z zakresu', J(Object.keys(h)) === J(['2026-07-10']), J(h));
  check('getHistoryDays bez dni zamkniętych — pusto', J(env.api.getHistoryDays('2026-08-10', '2026-08-12')) === J({ history: [], shelterOpened: {} }));
  // stare wypadają: dzień starszy niż SHELTER_KEEP_DAYS
  env.setNow('2026-09-10T10:00:00+02:00');
  env.api.shelterReportOpened('2026-09-10', ['552/26']);
  check('po SHELTER_KEEP_DAYS dniach wpis znika (10.07 — 62 dni przed 10.09 to 10.07: jeszcze jest; 11.09 — już nie)',
    '2026-07-10' in marks(env));
  env.setNow('2026-09-11T10:00:00+02:00');
  env.api.shelterReportOpened('2026-09-11', ['552/26']);
  check('...a dzień później już go nie ma', !('2026-07-10' in marks(env)) && '2026-08-01' in marks(env), J(Object.keys(marks(env))));
  // sufit bajtów — najstarsze wypadają, bieżący zostaje
  const big = build({ now: '2026-08-04T10:00:00+02:00' });
  for(let i = 0; i < 40; i++) big.api.shelterReportOpened(big.api.addDays_('2026-08-04', -i), Array.from({ length: 40 }, (_, k) => (k + 100) + '/26'));
  const kept = Object.keys(marks(big)).sort();
  check('wpisy ponad SHELTER_LIMITS.BYTES — najstarsze dni wypadają, najnowszy zostaje', Buffer.byteLength(big.props[big.conf.PROP_SHELTER_OPENED]) <= big.conf.SHELTER_LIMITS.BYTES
    && kept.length < 40 && kept[kept.length - 1] === '2026-08-04' && kept[0] > '2026-06-25', kept.length + ' ' + kept[0]);
})();

/* ---------- B104: odświeżanie definicji (panel i nocne czyszczenie) ---------- */
(()=>{
  console.log('B104: „Sprawdź formularz" i noc — nowa lista psów; nieudane zostawia ostatnią dobrą i błąd w panelu');
  const env = build(), o = {};
  msForms(env, o);
  env.api.setShelterForm(LINK, TEST_PIN);
  o.choices = CHOICES.concat(['Nowy\t0999/26']);
  env.setNow('2026-08-04T11:00:00+02:00');
  const r = env.api.checkShelterForm(TEST_PIN);
  check('„Sprawdź formularz": nowy pies na liście, czas sprawdzenia, bez błędu', r.error === '' && r.panel.count === 5 && r.panel.at === '2026-08-04 11:00'
    && r.form.choices.length === 5 && saved(env).link === LINK, J(r.panel));
  o.fail = 'Timeout: https://forms.cloud.microsoft/handlers/x';
  env.setNow('2026-08-04T12:00:00+02:00');
  const r2 = env.api.checkShelterForm(TEST_PIN);
  check('nieudane: bez wyjątku, błąd w odpowiedzi i w panelu, lista z ostatniego udanego', /nie odpowiada/.test(r2.error)
    && r2.panel.err === r2.error && r2.panel.errAt === '2026-08-04 12:00' && r2.panel.at === '2026-08-04 11:00'
    && env.api.getData().shelterForm.choices.length === 5, J(r2.panel));
  delete o.fail;
  check('kolejne udane czyści błąd', env.api.checkShelterForm(TEST_PIN).panel.err === '' && saved(env).err === '');
  check('„Sprawdź formularz" bez PIN-u — nic', /PIN/.test(String(throws(() => env.api.checkShelterForm('0000')))));

  // noc: tylko definicja starsza niż SHELTER_REFRESH_H
  env.http.calls.length = 0;
  env.setNow('2026-08-04T22:30:00+02:00');                 // 10,5 h po sprawdzeniu
  env.api.endOfDay();
  check('noc: świeża definicja (10 h) — bez pytania Microsoftu', env.http.calls.length === 0);
  o.choices = CHOICES.slice(1);                             // schronisko usunęło psa
  env.setNow('2026-08-05T22:30:00+02:00');                 // 34 h
  env.api.endOfDay();
  check('noc: starsza niż 20 h — od nowa (pies usunięty z formularza znika z listy)', env.http.calls.length === 1 && saved(env).choices.length === 3
    && saved(env).at === '2026-08-05 22:30');
  o.fail = CONSENT_ERR;
  env.setNow('2026-08-06T22:30:00+02:00');
  let threw = false;
  try { env.api.endOfDay(); } catch(e){ threw = e.message; }
  check('noc: brak zgody na połączenie — czyszczenie przechodzi, błąd z instrukcją w panelu, lista zostaje', threw === false
    && /authorizeWhatsApp/.test(saved(env).err) && saved(env).choices.length === 3, threw || saved(env).err);
  env.setNow('2026-08-07T22:30:00+02:00');
  env.api.endOfDay();
  check('...i próbuje znowu następnej nocy (czas ostatniego udanego się nie zmienił)', env.http.calls.length === 3);
  // bez formularza noc niczego nie pyta
  const bare = build();
  msForms(bare, {});
  bare.setNow('2026-08-05T22:30:00+02:00');
  bare.api.endOfDay();
  check('noc bez ustawionego formularza — bez pytania Microsoftu', bare.http.calls.length === 0);

  // odświeżenie nie nadpisuje formularza zmienionego w międzyczasie
  const race = build(), ro = {};
  msForms(race, ro);
  race.api.setShelterForm(LINK, TEST_PIN);
  race.http.handler = url => {
    // w trakcie odczytu (bez blokady) prowadząca usuwa formularz — zapis po odczycie nie może go przywrócić
    delete race.props[race.conf.PROP_SHELTER_FORM];
    return { code: 200, body: formBody({}) };
  };
  race.setNow('2026-08-06T10:00:00+02:00');
  race.api.shelterNightly_();
  check('odświeżenie: formularz usunięty w trakcie — nie wraca', !(race.conf.PROP_SHELTER_FORM in race.props));
  // ...albo w trakcie zapisano INNY formularz — zostaje nowy, nie stara lista psów pod nowym linkiem
  const race2 = build();
  msForms(race2, {});
  race2.api.setShelterForm(LINK, TEST_PIN);
  const OTHER = 'INNYFORMULARZ_0123456789';
  race2.http.handler = () => {
    race2.props[race2.conf.PROP_SHELTER_FORM] = J({ link: 'https://forms.office.com/Pages/ResponsePage.aspx?id=' + OTHER, id: OTHER,
      dateQ: DATE_Q, dogQ: DOG_Q, choices: ['Inny 1/26'], at: '2026-08-06 9:59', t: 1 });
    return { code: 200, body: formBody({}) };
  };
  race2.setNow('2026-08-06T10:00:00+02:00');
  race2.api.shelterNightly_();
  check('odświeżenie: w trakcie zapisano inny formularz — zostaje ten nowy', saved(race2).id === OTHER && J(saved(race2).choices) === J(['Inny 1/26']), J(saved(race2)));
})();

/* ---------- B105: odporność odczytu listy i pamięć podręczna ---------- */
(()=>{
  console.log('B105: zepsute wpisy nie psują getData; zapis formularza i otwarcie raportu unieważniają stan startowy w pamięci');
  const env = build({ props: { shelterForm: '{nie json', shelterOpened: '[1,2]' } });
  const g = env.api.getData();
  check('zepsuty formularz i pamięć otwarć — getData działa, bez raportu', g.shelterForm === null && J(g.shelterOpened) === '{}' && g.dogs.length === 1);
  env.props.shelterForm = J({ id: FORM_ID, dateQ: DATE_Q, dogQ: DOG_Q, choices: [] });
  check('formularz bez pozycji — jak nieustawiony', env.api.getData().shelterForm === null);
  env.props.shelterOpened = J({ '2026-08-04': { at: 1, t: 'x', k: '552/26,<b>,,1/2' }, 'nie-data': { k: '1/26' } });
  check('pamięć otwarć z śmieciami — tylko dobre numery i daty', J(env.api.getData().shelterOpened) === J({ '2026-08-04': { at: '1', t: 0, keys: ['552/26'] } }),
    J(env.api.getData().shelterOpened));
  // pamięć podręczna: stan startowy niesie formularz i otwarcia — zmiana musi go unieważnić
  const c = build(), co = {};
  msForms(c, co);
  c.api.getData();                                           // pierwszy dostęp przepisuje stary układ Spacery (zapis — nowy znacznik)
  c.api.getData();                                           // wkłada stan startowy do pamięci
  c.api.doGet();
  const boot1 = JSON.parse(c.html.evaluated.slice(-1)[0].boot);
  check('stan startowy z pamięci (przed zmianą)', boot1.cached === true && boot1.shelterForm === null);
  c.api.setShelterForm(LINK, TEST_PIN);
  c.api.doGet();
  const boot2 = JSON.parse(c.html.evaluated.slice(-1)[0].boot);
  check('po zapisie formularza: stan startowy z arkusza, z formularzem', !boot2.cached && boot2.shelterForm && boot2.shelterForm.id === FORM_ID);
  c.api.getData();
  const gen = k => (c.cache.store[c.conf.CACHE_PREFIX + c.conf.CACHE_KEY[k]] || {}).v;
  const g0 = gen('GEN'), d0 = gen('DOGS_GEN');
  c.api.shelterReportOpened('2026-08-04', ['552/26']);
  check('otwarcie raportu: nowy znacznik stanu, katalog psów w pamięci zostaje (psów nie rusza)', !!g0 && !!d0 && gen('GEN') !== g0 && gen('DOGS_GEN') === d0);
  c.api.doGet();
  const boot3 = JSON.parse(c.html.evaluated.slice(-1)[0].boot);
  check('po otwarciu raportu: stan startowy z arkusza, z otwarciem', !boot3.cached && J(boot3.shelterOpened['2026-08-04'].keys) === J(['552/26']));
})();

/* ---------- B106: stałe ---------- */
(()=>{
  console.log('B106: adres formularza, limity');
  const env = build();
  check('strona formularza na forms.cloud.microsoft (tam też definicja)', env.conf.SHELTER_HOST === 'https://forms.cloud.microsoft' && env.conf.SHELTER_PAGE === '/Pages/ResponsePage.aspx');
  check('pamięć otwarć dłuższa niż okno getData, getData nie dłuższe niż blok minionych dni', env.conf.SHELTER_KEEP_DAYS > env.conf.SHELTER_RECENT_DAYS && env.conf.SHELTER_RECENT_DAYS <= 14);
  check('limit bajtów poniżej limitu właściwości (9 KB)', env.conf.SHELTER_LIMITS.BYTES < 9 * 1024);
})();

console.log(failures ? `\n${failures} niepowodzeń.` : '\nWszystko zielone.');
process.exit(failures ? 1 : 0);

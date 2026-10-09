// Backend w izolacji: prawdziwe pliki .gs uruchamiane na atrapie arkusza.
// Wszystkie .gs sklejamy w JEDEN skrypt, bo w Apps Script dzielą wspólny zakres
// globalny — osobne vm.Script trzymałyby swoje `const` w prywatnych zakresach.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['Config.gs','Utils.gs','Settings.gs','Dogs.gs','Tasks.gs','History.gs','Setup.gs','WebApp.gs','Poll.gs','Diag.gs'];

/* ---------- atrapa arkusza ---------- */
let sheetSeq = 0;
function makeSheet(name, rows, onRename){
  const data = rows.map(r => r.slice());
  const widthOf = () => data.reduce((m,r)=>Math.max(m,r.length), 1);
  const pad = (r,w)=>{ while(r.length<w) r.push(''); return r; };

  function cell(r,c){ pad(data[r-1]||(data[r-1]=[]), c); return data[r-1]; }

  // każde wywołanie usługi arkusza (1.3.1: ile ich idzie pod blokadą — `calls` w makeContext)
  const call = () => { if(sheet._onCall) sheet._onCall(sheet._name); };
  const sheet = {
    _name: name, _data: data,
    _formats: {},          // kolumna -> format ('@' = tekst) — bug z datą 1899 jest do sprawdzenia
    _formatRanges: [],     // każde setNumberFormat z zakresem wierszy — format dokładanych wierszy (B51)
    _maxRows: null,        // stała liczba wierszy jak w Apps Script (`maxRows` w opisie zakładki); null = rośnie sama
    _reads: 0,             // ile razy czytano wartości — do testów kosztu (trimSlots_)
    _id: ++sheetSeq,       // jak getSheetId(): kopia ma inne id niż oryginał

    getName(){ return sheet._name; },
    getSheetId(){ call(); return sheet._id; },
    setName(n){ const old = sheet._name; sheet._name = n; if(onRename) onRename(old, n, sheet); return sheet; },
    getLastRow(){
      call();
      for(let i=data.length; i>0; i--){
        if(data[i-1].some(v=>v!=='' && v!=null)) return i;
      }
      return 0;
    },
    getMaxColumns(){ call(); return widthOf(); },
    // używane przez applyTextFormats_() — bez tego setup()/migrate() nie dawały się przetestować
    getMaxRows(){ call(); return sheet._maxRows != null ? sheet._maxRows : Math.max(data.length, 1); },
    insertColumnsAfter(after, n){ call(); data.forEach(r=>{ pad(r, after); for(let i=0;i<n;i++) r.splice(after,0,''); }); },
    insertRowsAfter(after, n){
      call();
      if(sheet._maxRows != null) sheet._maxRows += n;
      if(after < data.length) for(let i=0;i<n;i++) data.splice(after, 0, []);
    },
    setFrozenRows(){},
    appendRow(row){ call(); data.push(row.slice()); },
    deleteRow(r){ call(); data.splice(r-1,1); },
    getRange(row, col, nr, nc){
      const rows = nr === undefined ? 1 : nr;
      const cols = nc === undefined ? 1 : nc;
      // jak Apps Script: zakres poza szerokością zakładki rzuca błędem. Tylko na życzenie
      // (`strictWidth` w opisie zakładki) — reszta testów pisze w atrapę bez dokładania kolumn
      if(sheet._strict && col + cols - 1 > widthOf()) throw new Error('Zakres poza arkuszem: kolumna ' + (col + cols - 1) + ' > ' + widthOf());
      // to samo w dół: zakładka ze stałą liczbą wierszy (`maxRows`) nie rośnie od zapisu
      if(sheet._maxRows != null && row + rows - 1 > sheet._maxRows) throw new Error('Zakres poza arkuszem: wiersz ' + (row + rows - 1) + ' > ' + sheet._maxRows);
      return {
        getValues(){
          call();
          sheet._reads++;
          if(sheet._onRead) sheet._onRead(sheet._name);
          const out = [];
          for(let i=0;i<rows;i++){
            const line = cell(row+i, col+cols-1);
            out.push(line.slice(col-1, col-1+cols));
          }
          return out;
        },
        setValues(v){
          call();
          for(let i=0;i<rows;i++){
            const line = cell(row+i, col+cols-1);
            for(let j=0;j<cols;j++) line[col-1+j] = v[i][j];
          }
        },
        getValue(){ call(); return cell(row, col)[col-1]; },
        setValue(v){ call(); cell(row, col)[col-1] = v; },
        setNumberFormat(f){
          call();
          for(let j=0;j<cols;j++) sheet._formats[col+j] = f;
          sheet._formatRanges.push({ row, col, rows, cols, f });
          return this;
        },
      };
    },
  };
  return sheet;
}

function makeContext(opts){
  opts = opts || {};
  // zegar zamrożony, ale przestawialny (setNow) — dzień rezerwacyjny zmienia się
  // o godzinie resetu i testy muszą umieć przejść przez tę granicę w jednym scenariuszu
  let nowMs = opts.now ? Date.parse(opts.now) : Date.parse('2026-08-04T22:10:00+02:00');
  const props = Object.assign({}, opts.props);
  let propReads = 0;
  let propFail = null;             // (klucz, 'get'|'set') -> true = usługa właściwości rzuca (limit, awaria)
  const sheets = {};
  // Koszt usług w ms — zegar jest zamrożony, więc „wolne" wywołanie (dziennik spowolnień, Diag.gs)
  // odgrywamy, przesuwając go: `read[zakładka]` przy każdym odczycie wartości, `waitLock` przy braniu
  // blokady (`lockFail` — komunikat: blokada rzuca, jak po 20 s w Apps Script), `flush`, `template`
  // i `evaluate` (HtmlService). Domyślnie wszystko 0 — reszta testów tego nie widzi.
  const cost = { read: {}, waitLock: 0, lockFail: null, lockBusy: false, flush: 0, template: 0, evaluate: 0 };
  const spend = ms => { nowMs += ms || 0; };
  const html = { evaluated: [] };   // szablony złożone przez doGet (z polami: boot, served)
  // Wywołania usługi arkusza (1.3.1): `calls.sheets` — wszystkie (każda metoda zakładki, getSheetByName,
  // flush), `calls.bySheet[nazwa]`; `calls.locks` — dla każdej blokady licznik przy wzięciu i zwolnieniu,
  // czyli ile wywołań arkusza poszło pod nią (pomiar 9.10.2026: każde ~0,1 s, czasem przestój).
  const calls = { sheets: 0, bySheet: {}, locks: [] };
  const sheetCall = name => { calls.sheets++; if(name) calls.bySheet[name] = (calls.bySheet[name] || 0) + 1; };
  // CacheService (1.3.1): `cache.store` klucz -> {v, exp}; wygasa z zegarem testu; wartość ponad 100 KB
  // rzuca jak w Apps Script; `failCache(f)` — f(op, klucze) === true: usługa rzuca ('get' | 'put' | 'remove')
  const cache = { store: {}, ops: [], fail: null };
  const cacheOp = (op, keys) => {
    cache.ops.push({ op, keys: keys.slice() });
    if(cache.fail && cache.fail(op, keys)) throw new Error('Usługa pamięci podręcznej: awaria');
  };
  const cachePutOne = (k, v, ttl) => {
    if(String(v).length > 100 * 1024) throw new Error('Argument too large: value');
    cache.store[k] = { v: String(v), exp: nowMs + (ttl || 600) * 1000 };
  };
  // zmiana nazwy zakładki (przywrócenie kopii po cofnięciu wdrożenia) — pod nową nazwą w arkuszu
  const rename = (old, n, sh) => { if(sheets[old] === sh) delete sheets[old]; sheets[n] = sh; };
  const addSheet = (n, rows) => {
    const sh = (sheets[n] = makeSheet(n, rows, rename));
    sh._onRead = name => spend(cost.read[name]);
    sh._onCall = sheetCall;
    return sh;
  };
  (opts.sheets||[]).forEach(s=>{
    const sh = addSheet(s.name, s.rows);
    sh._strict = !!s.strictWidth;
    if(s.maxRows) sh._maxRows = s.maxRows;
  });
  const triggers = [];
  // UrlFetchApp: każde wywołanie trafia do `http.calls`, a odpowiada `http.handler(url, opts)` —
  // {code, body} albo wyjątek (awaria sieci). Bez handlera: 500, żeby niezamierzone wywołanie było widać.
  const http = { calls: [], handler: null };
  const consent = { granted: [], asked: [] };

  class FrozenDate extends Date {
    constructor(...a){ if(a.length===0) super(nowMs); else super(...a); }
    static now(){ return nowMs; }
  }

  // Europe/Warsaw w sierpniu = UTC+2; do testów wystarczy stałe przesunięcie
  const OFFSET_MIN = 120;
  function formatDate(d, tz, fmt){
    const t = new Date(d.getTime() + OFFSET_MIN*60000);
    const p = n => String(n).padStart(2,'0');
    if(fmt === 'yyyy-MM-dd') return `${t.getUTCFullYear()}-${p(t.getUTCMonth()+1)}-${p(t.getUTCDate())}`;
    if(fmt === 'H:mm')       return `${t.getUTCHours()}:${p(t.getUTCMinutes())}`;
    if(fmt === 'H')          return String(t.getUTCHours());
    throw new Error('nieobsługiwany format: '+fmt);
  }

  const ctx = {
    console,
    Date: FrozenDate,
    SpreadsheetApp: {
      getActiveSpreadsheet: ()=>({
        getSheetByName: n => { sheetCall(null); return sheets[n] || null; },
        insertSheet: (n, o) => {
          if(sheets[n]) throw new Error('Arkusz o nazwie „' + n + '" już istnieje');
          const sh = addSheet(n, o && o.template ? o.template._data : []);
          if(o && o.template) sh._formats = Object.assign({}, o.template._formats);
          return sh;
        },
      }),
      flush(){ sheetCall(null); spend(cost.flush); },
    },
    CacheService: { getScriptCache: ()=>({
      getAll(keys){
        cacheOp('get', keys);
        const out = {};
        keys.forEach(k => { const e = cache.store[k]; if(e && e.exp > nowMs) out[k] = e.v; });
        return out;
      },
      get(k){ cacheOp('get', [k]); const e = cache.store[k]; return e && e.exp > nowMs ? e.v : null; },
      put(k, v, ttl){ cacheOp('put', [k]); cachePutOne(k, v, ttl); },
      putAll(vals, ttl){
        cacheOp('put', Object.keys(vals));
        Object.keys(vals).forEach(k => { if(String(vals[k]).length > 100 * 1024) throw new Error('Argument too large: value'); });
        Object.keys(vals).forEach(k => cachePutOne(k, vals[k], ttl));
      },
      remove(k){ cacheOp('remove', [k]); delete cache.store[k]; },
      removeAll(keys){ cacheOp('remove', keys); keys.forEach(k => { delete cache.store[k]; }); },
    }) },
    HtmlService: {
      createTemplateFromFile(name){
        spend(cost.template);
        const tpl = { _name: name, evaluate(){
          spend(cost.evaluate);
          html.evaluated.push({ name, boot: tpl.boot, served: tpl.served });
          const out = { setTitle(){ return out; }, addMetaTag(){ return out; } };
          return out;
        } };
        return tpl;
      },
      createHtmlOutputFromFile: () => ({ getContent: () => '' }),
    },
    Utilities: { formatDate },
    Session: { getScriptTimeZone: ()=>'Europe/Warsaw' },
    LockService: { getScriptLock: ()=>({
      waitLock(){
        spend(cost.waitLock);
        if(cost.lockFail) throw new Error(cost.lockFail);
        calls.locks.push({ at: calls.sheets, end: null, cacheAt: cache.ops.length, cacheEnd: null });
      },
      // bez czekania (1.3.1, cacheGens_): `cost.lockBusy` — blokadę trzyma właśnie inny zapis
      tryLock(){
        if(cost.lockBusy || cost.lockFail) return false;
        calls.locks.push({ at: calls.sheets, end: null, cacheAt: cache.ops.length, cacheEnd: null, try: true });
        return true;
      },
      releaseLock(){ const l = calls.locks[calls.locks.length - 1]; if(l){ l.end = calls.sheets; l.cacheEnd = cache.ops.length; } },
    }) },
    PropertiesService: { getScriptProperties: ()=>({
      getProperty: k => { if(propFail && propFail(k, 'get')) throw new Error('Usługa właściwości: awaria'); return k in props ? props[k] : null; },
      getProperties: () => { propReads++; return Object.assign({}, props); },
      setProperty: (k,v) => {
        if(propFail && propFail(k, 'set')) throw new Error('Przekroczono limit rozmiaru właściwości');
        props[k] = String(v);
      },
      deleteProperty: k => { delete props[k]; },
    })},
    ScriptApp: {
      WeekDay: { SUNDAY:'SUNDAY', MONDAY:'MONDAY', TUESDAY:'TUESDAY', WEDNESDAY:'WEDNESDAY',
                 THURSDAY:'THURSDAY', FRIDAY:'FRIDAY', SATURDAY:'SATURDAY' },
      AuthMode: { FULL:'FULL' },
      // zgoda właściciela: `consent.granted` — zakresy już zatwierdzone; brak = jak w edytorze:
      // koniec wykonania (tu: wyjątek) i okno zgody (`consent.asked`)
      requireScopes(mode, scopes){
        consent.asked.push({ mode, scopes: scopes.slice() });
        const missing = scopes.filter(s => consent.granted.indexOf(s) < 0);
        if(missing.length) throw new Error('Wymagana zgoda: ' + missing.join(', '));
      },
      getProjectTriggers: ()=>triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if(i>=0) triggers.splice(i,1); },
      newTrigger(fn){
        const t = { _fn: fn, _hour: null, _weekDay: null, _everyWeeks: null, _everyDays: null, _nearMinute: null, _tz: null,
                    getHandlerFunction: ()=>fn };
        const b = {
          timeBased: ()=>b,
          everyDays(n){ t._everyDays = n; return b; },
          everyWeeks(n){ t._everyWeeks = n; return b; },
          onWeekDay(d){ t._weekDay = d; return b; },
          nearMinute(m){ t._nearMinute = m; return b; },
          inTimezone(z){ t._tz = z; return b; },
          atHour(h){ t._hour = h; return b; },
          create(){ triggers.push(t); return t; },
        };
        return b;
      },
    },
    UrlFetchApp: {
      fetch(url, opts){
        http.calls.push({ url, opts: opts || {} });
        const r = http.handler ? http.handler(url, opts || {}) : { code: 500, body: '' };
        return { getResponseCode: () => r.code, getContentText: () => r.body };
      },
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const src = FILES.map(f => fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
  // `const` na najwyższym poziomie skryptu ląduje w globalnym zakresie leksykalnym
  // kontekstu, a nie jako pole sandboxa — to, czego testy potrzebują, wystawiamy jawnie.
  const expose = `
    ;globalThis.__api = { endOfDay, getData, readDogs_, addDog, updateDog, removeDog, setResetHour,
                          resetHour_, installTriggers, getDiagnostics, migrate, setup,
                          reserve, markWalked, setFree, undoFirstWalk, setAllWalks,
                          readHistory_, getHistory, getHistoryDays, histCount_,
                          checkPin, requirePin_, pin_, env_, setMailTemplate, mailTemplate_, setMailSettings,
                          businessDate_, addDays_, readDogCatalog_, withLock_,
                          addTask, setTaskDone, removeTask, readTasks_, bootJson_, setGroup,
                          isDate_, posInt_, volNorm_, volAssign_, readSlots_, walksSheet_, trimSlots_,
                          pollMonday_, pollWeekLabel_, pollSettings_, setPollSettings, getPollChats, sendPollNow,
                          sendWeeklyPoll, pollPanel_, authorizeWhatsApp, getPollState,
                          doGet, reportDiag, diagServer_, diagBytes_, diagCaller_, dogTeam_, markTeam,
                          setDayReportSettings, getDayReportContacts, sendDayReportNow, dayReportText_, dayReportPanel_,
                          catalogLocked_, bootState_, cacheBump_ };
    ;globalThis.__conf = { DOG, DOG_WIDTH, DOG_HEADERS, HISTORY_DAYS, WALK_HEADERS, MAX_DAYS_AHEAD,
                           VOLUNTEER_COLORS, VOLUNTEER_MAX, VOLUNTEER_DAYS, WALK, WALKS_BACKUP, DEFAULT_POLL, POLL_LIMITS,
                           DIAG_SLOW_MS, DIAG_KEEP, DIAG_BYTES, DIAG_REPORT_MAX, PROP_DIAG_SERVER, PROP_DIAG_PHONES,
                           CACHE_PREFIX, CACHE_KEY };
    // każde wywołanie z przeglądarki to w Apps Script nowe wykonanie: zmienne globalne od zera
    ;globalThis.__newExecution = () => { walksLayoutOk_ = false; propsMemo_ = null; lockDepth_ = 0;
                                         lockKeepsDogs_ = false; volLock_ = null; };
  `;
  vm.runInContext(src + expose, ctx, { filename: 'g13-backend.js' });
  const setNow = iso => { nowMs = Date.parse(iso); };
  // Każde wywołanie z testu = osobne wykonanie Apps Script, jak google.script.run z telefonu.
  // Bez tego pamięć jednego wykonania (właściwości, sprawdzony układ zakładki) ciągnęłaby się
  // przez cały scenariusz i testy nie widziałyby tego, co widzi prawdziwy serwer.
  const api = {};
  Object.keys(ctx.__api).forEach(k => { api[k] = (...a) => { ctx.__newExecution(); return ctx.__api[k](...a); }; });
  return { ctx, api, conf: ctx.__conf, sheets, props, triggers, http, consent, cost, html, setNow, newExecution: ctx.__newExecution,
           now: () => nowMs, calls, cache,
           propReads: () => propReads, failProps: f => { propFail = f || null; },
           failCache: f => { cache.fail = f || null; } };
}

module.exports = { makeContext, makeSheet };

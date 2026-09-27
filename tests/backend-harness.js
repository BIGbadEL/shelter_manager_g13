// Backend w izolacji: prawdziwe pliki .gs uruchamiane na atrapie arkusza.
// Wszystkie .gs sklejamy w JEDEN skrypt, bo w Apps Script dzielą wspólny zakres
// globalny — osobne vm.Script trzymałyby swoje `const` w prywatnych zakresach.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['Config.gs','Utils.gs','Settings.gs','Dogs.gs','Tasks.gs','History.gs','Setup.gs','WebApp.gs'];

/* ---------- atrapa arkusza ---------- */
let sheetSeq = 0;
function makeSheet(name, rows, onRename){
  const data = rows.map(r => r.slice());
  const widthOf = () => data.reduce((m,r)=>Math.max(m,r.length), 1);
  const pad = (r,w)=>{ while(r.length<w) r.push(''); return r; };

  function cell(r,c){ pad(data[r-1]||(data[r-1]=[]), c); return data[r-1]; }

  const sheet = {
    _name: name, _data: data,
    _formats: {},          // kolumna -> format ('@' = tekst) — bug z datą 1899 jest do sprawdzenia
    _reads: 0,             // ile razy czytano wartości — do testów kosztu (trimSlots_)
    _id: ++sheetSeq,       // jak getSheetId(): kopia ma inne id niż oryginał

    getName(){ return sheet._name; },
    getSheetId(){ return sheet._id; },
    setName(n){ const old = sheet._name; sheet._name = n; if(onRename) onRename(old, n, sheet); return sheet; },
    getLastRow(){
      for(let i=data.length; i>0; i--){
        if(data[i-1].some(v=>v!=='' && v!=null)) return i;
      }
      return 0;
    },
    getMaxColumns(){ return widthOf(); },
    // używane przez applyTextFormats_() — bez tego setup()/migrate() nie dawały się przetestować
    getMaxRows(){ return Math.max(data.length, 1); },
    insertColumnsAfter(after, n){ data.forEach(r=>{ pad(r, after); for(let i=0;i<n;i++) r.splice(after,0,''); }); },
    setFrozenRows(){},
    appendRow(row){ data.push(row.slice()); },
    deleteRow(r){ data.splice(r-1,1); },
    getRange(row, col, nr, nc){
      const rows = nr === undefined ? 1 : nr;
      const cols = nc === undefined ? 1 : nc;
      return {
        getValues(){
          sheet._reads++;
          const out = [];
          for(let i=0;i<rows;i++){
            const line = cell(row+i, col+cols-1);
            out.push(line.slice(col-1, col-1+cols));
          }
          return out;
        },
        setValues(v){
          for(let i=0;i<rows;i++){
            const line = cell(row+i, col+cols-1);
            for(let j=0;j<cols;j++) line[col-1+j] = v[i][j];
          }
        },
        getValue(){ return cell(row, col)[col-1]; },
        setValue(v){ cell(row, col)[col-1] = v; },
        setNumberFormat(f){ for(let j=0;j<cols;j++) sheet._formats[col+j] = f; return this; },
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
  // zmiana nazwy zakładki (przywrócenie kopii po cofnięciu wdrożenia) — pod nową nazwą w arkuszu
  const rename = (old, n, sh) => { if(sheets[old] === sh) delete sheets[old]; sheets[n] = sh; };
  const addSheet = (n, rows) => (sheets[n] = makeSheet(n, rows, rename));
  (opts.sheets||[]).forEach(s=>{ addSheet(s.name, s.rows); });
  const triggers = [];

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
        getSheetByName: n => sheets[n] || null,
        insertSheet: (n, o) => {
          if(sheets[n]) throw new Error('Arkusz o nazwie „' + n + '" już istnieje');
          const sh = addSheet(n, o && o.template ? o.template._data : []);
          if(o && o.template) sh._formats = Object.assign({}, o.template._formats);
          return sh;
        },
      }),
      flush(){},
    },
    Utilities: { formatDate },
    Session: { getScriptTimeZone: ()=>'Europe/Warsaw' },
    LockService: { getScriptLock: ()=>({ waitLock(){}, releaseLock(){} }) },
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
      getProjectTriggers: ()=>triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if(i>=0) triggers.splice(i,1); },
      newTrigger(fn){
        const t = { _fn: fn, _hour: null, getHandlerFunction: ()=>fn };
        const b = {
          timeBased: ()=>b, everyDays: ()=>b, inTimezone: ()=>b,
          atHour(h){ t._hour = h; return b; },
          create(){ triggers.push(t); return t; },
        };
        return b;
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
                          checkPin, requirePin_, pin_, env_,
                          businessDate_, addDays_, readDogCatalog_, withLock_,
                          addTask, setTaskDone, removeTask, readTasks_, bootJson_, setGroup,
                          isDate_, posInt_, volNorm_, volAssign_, readSlots_, walksSheet_, trimSlots_ };
    ;globalThis.__conf = { DOG, DOG_WIDTH, DOG_HEADERS, HISTORY_DAYS, WALK_HEADERS, MAX_DAYS_AHEAD,
                           VOLUNTEER_COLORS, VOLUNTEER_MAX, VOLUNTEER_DAYS, WALK, WALKS_BACKUP };
    // każde wywołanie z przeglądarki to w Apps Script nowe wykonanie: zmienne globalne od zera
    ;globalThis.__newExecution = () => { walksLayoutOk_ = false; propsMemo_ = null; lockDepth_ = 0; };
  `;
  vm.runInContext(src + expose, ctx, { filename: 'g13-backend.js' });
  const setNow = iso => { nowMs = Date.parse(iso); };
  // Każde wywołanie z testu = osobne wykonanie Apps Script, jak google.script.run z telefonu.
  // Bez tego pamięć jednego wykonania (właściwości, sprawdzony układ zakładki) ciągnęłaby się
  // przez cały scenariusz i testy nie widziałyby tego, co widzi prawdziwy serwer.
  const api = {};
  Object.keys(ctx.__api).forEach(k => { api[k] = (...a) => { ctx.__newExecution(); return ctx.__api[k](...a); }; });
  return { ctx, api, conf: ctx.__conf, sheets, props, triggers, setNow, newExecution: ctx.__newExecution,
           propReads: () => propReads, failProps: f => { propFail = f || null; } };
}

module.exports = { makeContext, makeSheet };

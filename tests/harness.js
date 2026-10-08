process.env.TZ = 'Europe/Warsaw';   // testy liczą godziny jak telefon w Polsce, niezależnie od strefy maszyny (review PR #5, runda 3)
// Harness: ładuje prawdziwy Index+Styles+Script w jsdom, klika jak człowiek,
// a odpowiedzi "serwera" dostarczamy ręcznie w dowolnej kolejności.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// pliki aplikacji leżą piętro wyżej niż tests/ — liczone od tego pliku,
// żeby testy działały z dowolnego katalogu i na dowolnej maszynie
const ROOT = path.join(__dirname, '..');
const src_ = (file)=>fs.readFileSync(path.join(ROOT, file),'utf8');

function extract(file, tag){
  const src = src_(file);
  const m = src.match(new RegExp(`<${tag}>([\\s\\S]*)</${tag}>`));
  return m[1];
}

function buildApp(opts){
  opts = opts || {};
  // opts.boot — stan, który serwer wpisałby w stronę (bootJson_). Bez niego zostaje
  // surowy znacznik szablonu, którego nie da się sparsować — dokładnie ta sama ścieżka,
  // co przy błędzie po stronie serwera: przeglądarka pobiera stan zwykłym getData.
  const bodyHtml = src_('Index.html')
    .match(/<body>([\s\S]*)<\?!= include\('Script'\); \?>/)[1]
    .replace('<?!= boot ?>', opts.boot === undefined ? '<?!= boot ?>'
      : (typeof opts.boot === 'string' ? opts.boot : JSON.stringify(opts.boot)))
    // opts.served — chwila oddania strony przez doGet (dziennik spowolnień liczy od niej dojście strony)
    .replace('<?!= served ?>', opts.served === undefined ? '<?!= served ?>' : String(opts.served));

  // opts.url — strona pod prawdziwym adresem (localStorage działa tylko wtedy; about:blank go nie ma),
  // opts.storage — localStorage przed startem skryptu (to, co zostało po poprzednim otwarciu)
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`, Object.assign({
    runScripts: 'outside-only', pretendToBeVisual: true,
  }, opts.url ? { url: opts.url } : {}));
  const { window } = dom;
  window.confirm = () => true;
  if(opts.storage) Object.keys(opts.storage).forEach(k => window.localStorage.setItem(k, opts.storage[k]));

  // kontrolowany fake google.script.run
  const pending = [];   // {fn,args,ok,fail}
  const shipped = [];   // log wszystkich wysłanych wywołań
  // Dziennik spowolnień (reportDiag) odpowiada sam i nie staje w `pending` — inaczej respondNext
  // starszych testów trafiałby w niego zamiast w wywołanie, o które chodzi. `diagManual` — jak każde inne.
  const diagReports = [];
  function makeRunner(){
    const t = { _ok:null, _fail:null };
    const proxy = new Proxy(t, { get(tgt, p){
      if(p === 'withSuccessHandler') return f => { tgt._ok = f; return proxy; };
      if(p === 'withFailureHandler') return f => { tgt._fail = f; return proxy; };
      if(typeof p !== 'string') return undefined;
      if(p === 'reportDiag' && !opts.diagManual) return (entries) => {
        diagReports.push(entries);
        const ok = tgt._ok;
        setTimeout(() => { if(ok) ok({ ok: true, n: entries.length }); }, 0);
      };
      return (...args) => {
        shipped.push(p);
        pending.push({ fn:p, args, ok:tgt._ok, fail:tgt._fail });
        if(opts.onShip) opts.onShip(p, args);
      };
    }});
    return proxy;
  }
  window.google = { script: { run: makeRunner() } };
  // każdy dostęp do google.script.run tworzy świeży runner — jak w realu
  Object.defineProperty(window.google.script, 'run', { get: makeRunner });

  const script = extract('Script.html','script');
  const errors = [];
  window.addEventListener('error', e => errors.push(e.error && e.error.message || e.message));
  // opts.timing — krótsze czasy listy (cisza, zapowiedź przestawienia, osłona stuknięć, dymek);
  // aplikacja czyta je przy starcie, na telefonie obowiązują domyślne
  if(opts.timing) window.__G13_TIMING = opts.timing;
  // `dogs` w __dbg to spacer 1 każdego psa — tak czytają go testy psów jednospacerowych
  const exposed = script + '\n;window.__dbg = () => ({sending: isSending(), queueLen: queue.length, pending: [...pendingKeys.entries()], dogs: state.dogs.map(d=>{ const s = slotOf(state.date, d.id, 1); return s.status+":"+s.who; }), tasks: state.tasks.map(t=>t.id+":"+(t.done?1:0))});window.__force = () => { [...inflight.values()].forEach(s=>{ s.at = 0; }); };window.__setAdmin = (pin)=>{ state.admin=true; state.pin=pin; render("self"); };window.__enqueue = enqueue; window.__keyDog = keyDog; window.__keySlot = keySlot; window.__state = state;'
    + '\n;window.__settle = () => { lastTapAt = 0; reorderDueAt = 1; render(); };'   // udaje ciszę po dotknięciu i minioną zapowiedź
    + '\n;window.__order = () => [...viewEl.querySelectorAll("li.dog")].map(li => Number(li.dataset.dog));'
    + '\n;window.__tiles = () => [...viewEl.querySelectorAll("li.dog")].map(li => li.dataset.tile);'
    + '\n;window.__diag = () => ({ pending: diagPending, dev: diagDev });';   // dziennik spowolnień: kolejka do wysłania
  try { window.eval(exposed); } catch(e){ errors.push('EVAL: '+e.message); }

  return {
    window, dom, pending, shipped, errors, diagReports,
    // pomocnicze
    seed(data){ // odpowiedz na startowy getData
      const j = pending.shift();
      if(j.fn !== 'getData') throw new Error('expected initial getData, got '+j.fn);
      j.ok(data);
    },
    respondNext(res){ const j = pending.shift(); try{ j.ok(res); }catch(e){ errors.push('CB: '+e.message); } return j.fn; },
    failNext(msg){ const j = pending.shift(); try{ j.fail(new Error(msg)); }catch(e){ errors.push('CB: '+e.message); } return j.fn; },
    click(selector){
      const el = window.document.querySelector(selector);
      if(!el) throw new Error('no element for '+selector);
      el.dispatchEvent(new window.Event('click',{bubbles:true}));
    },
    type(selector, text){
      const el = window.document.querySelector(selector);
      if(!el) throw new Error('no input for '+selector);
      el.value = text;
    },
    html(){ return window.document.getElementById('view').innerHTML; },
    dogCard(){ return window.document.querySelector('.dog') ? window.document.querySelector('.dog').textContent.replace(/\s+/g,' ').trim() : '(brak)'; },
    state(){ return window.__dbg(); },
  };
}

const dogFree     = (o)=>Object.assign({id:1,name:'Borys',ident:'',box:'',dif:'easy',status:'free',who:'',time:'',lastWalk:'',note:'',walks:1,who1:'',time1:'',noteUntil:''},o);
const dogReserved = (who)=>dogFree({status:'reserved',who});
const dogWalked   = (who,time)=>dogFree({status:'walked',who,time:time||'14:00'});

module.exports = { buildApp, dogFree, dogReserved, dogWalked, ROOT };

// Pomiar otwierania strony — część testu wydania (RELEASE.md), tylko na TEŚCIE.
//
// Otwiera aplikację <ile> razy po kolei, z odstępem, tak jak telefon otwiera link: czas do pierwszego bajtu
// (tyle wolontariusz czeka na stronę), czy stan startowy przyszedł z pamięci serwera (`cached`, od 1.4) i chwila
// `served` z serwera. Niczego w aplikacji nie zapisuje. Surowe wyniki (JSONL) idą do katalogu tymczasowego —
// z nich i ze strony Wykonań (scripts/executions.js) składa się wynik testu wydania.
//
// Użycie: node scripts/perf.js <deploymentId> [ile=120] [odstęp_ms=1000]
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Odwraca jedną warstwę zapisu napisu JS (\x3c, \\, \/, \n…). */
const unescapeJs = s => s.replace(/\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})|\\([\s\S])/g, (m, x, u, c) =>
  x ? String.fromCharCode(parseInt(x, 16)) : u ? String.fromCharCode(parseInt(u, 16))
    : ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' })[c] || c);

/**
 * Strona z Apps Script to opakowanie Google, w którym nasz HTML siedzi w napisie JS zapisanym dwa razy
 * („\\\x22boot\\\x22"). Zwraca: czy to nasza strona (`app`), stan startowy (`boot`: obiekt, `null` = nie
 * wyszedł — telefon zrobi zwykłe getData, `undefined` = brak znacznika) i `served` (ms, zegar serwera).
 */
function parsePage(body) {
  const html = unescapeJs(unescapeJs(String(body || '')));
  const tag = id => {
    const m = html.match(new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>'));
    return m ? m[1] : undefined;
  };
  let boot = tag('boot');
  if (boot !== undefined) { try { boot = JSON.parse(boot); } catch (e) { boot = undefined; } }
  const served = Number(tag('served'));
  return { app: /class="vernum"/.test(html), boot: boot, served: Number.isFinite(served) && served > 0 ? served : null };
}

/** Percentyl jak w pomiarach z 9.10 (element na pozycji ⌊n·f⌋ posortowanej listy). */
const pct = (xs, f) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * f))] : null;

function summary(rows) {
  const ok = rows.filter(r => r.ttfb != null && !r.err);
  const xs = ok.map(r => r.ttfb).sort((a, b) => a - b);
  return {
    n: rows.length, ok: ok.length, errors: rows.length - ok.length,
    med: pct(xs, .5), p90: pct(xs, .9), max: xs.length ? xs[xs.length - 1] : null,
    over3: xs.filter(x => x >= 3000).length, over5: xs.filter(x => x >= 5000).length,
    cached: ok.filter(r => r.boot === 'cached').length, sheet: ok.filter(r => r.boot === 'sheet').length,
    noBoot: ok.filter(r => r.boot === 'none').length,
  };
}

const sec = ms => ms == null ? '—' : (ms / 1000).toFixed(2).replace('.', ',') + ' s';
const clock = t => new Date(t).toTimeString().slice(0, 8);

async function openOnce(url) {
  const t0 = Date.now();
  const rec = { t0 };
  const ctl = new AbortController();
  const kill = setTimeout(() => ctl.abort(), 400000);   // dłużej niż najdłuższe wykonanie (6 min)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
    rec.ttfb = Date.now() - t0;
    rec.code = res.status;
    const page = parsePage(await res.text());
    rec.total = Date.now() - t0;
    if (!res.ok || !page.app) throw new Error(`HTTP ${res.status}, bez strony aplikacji`);
    rec.boot = page.boot && typeof page.boot === 'object' ? (page.boot.cached ? 'cached' : 'sheet') : 'none';
    rec.served = page.served;
  } catch (e) {
    rec.total = Date.now() - t0;
    rec.err = String(e && e.message || e);
  } finally { clearTimeout(kill); }
  return rec;
}

async function main() {
  const [id, nArg, gapArg] = process.argv.slice(2);
  if (!id) { console.error('Podaj identyfikator wdrożenia.'); process.exitCode = 1; return; }
  const n = Number(nArg || 120), gap = Number(gapArg || 1000);
  const url = `https://script.google.com/macros/s/${id}/exec`;
  const out = path.join(os.tmpdir(), `g13-perf-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  console.log(`Pomiar otwierania strony: ${n} razy, co ${gap} ms po poprzednim → ${out}`);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const rec = await openOnce(url);
    rows.push(rec);
    fs.appendFileSync(out, JSON.stringify(rec) + '\n');
    if (rec.err || rec.ttfb >= 3000) console.log(`  ${clock(rec.t0)}  ${rec.err ? 'BŁĄD ' + rec.err : sec(rec.ttfb)}`);
    if ((i + 1) % 20 === 0) console.log(`  …${i + 1}/${n}`);
    if (i < n - 1) await new Promise(r => setTimeout(r, gap));
  }
  const s = summary(rows);
  console.log(`\nOkno: ${clock(rows[0].t0)}–${clock(rows[rows.length - 1].t0 + (rows[rows.length - 1].total || 0))} (czas tego komputera)`);
  console.log(`Do pierwszego bajtu: mediana ${sec(s.med)} · 90% ${sec(s.p90)} · najdłużej ${sec(s.max)} · ≥3 s: ${s.over3} · ≥5 s: ${s.over5}`);
  console.log(`Stan startowy: z pamięci ${s.cached} · z arkusza ${s.sheet} · bez stanu ${s.noBoot} · błędy ${s.errors}`);
  if (s.errors) process.exitCode = 1;   // nie process.exit(): tuż po fetch wywraca Node na Windows (warmup.js)
}

if (require.main === module) main();
module.exports = { parsePage, summary, pct };

// Wykonania w oknie czasu — część testu wydania (RELEASE.md). NIE dla Node.
//
// Uruchamia go Claude in Chrome (javascript_tool) na świeżo otwartej stronie Wykonań projektu TESTOWEGO
// (script.google.com → projekt testowy → Wykonania; strona po polsku, najnowsze na górze). Ten plik tylko
// definiuje funkcję; wynik daje drugie wywołanie, z oknem tak, jak pisze je strona:
//   await window.__g13exec('13 paź 2026, 17:03:50', '13 paź 2026, 17:09:00')
// Przewija kolejne strony, aż dojdzie przed początek okna, i liczy dla każdej funkcji: ile, mediana, 90%,
// najdłużej, ≥3 s, ≥5 s, stany inne niż „Ukończono" — percentyl jak w scripts/perf.js. Czas = strefa przeglądarki.
window.__g13exec = async (from, to) => {
  const MON = { sty: 0, lut: 1, mar: 2, kwi: 3, maj: 4, cze: 5, lip: 6, sie: 7, wrz: 8, 'paź': 9, lis: 10, gru: 11 };
  const ts = s => {
    const m = String(s).match(/(\d+) (\S+) (\d{4}), (\d\d):(\d\d):(\d\d)/);
    return m && m[2] in MON ? new Date(+m[3], MON[m[2]], +m[1], +m[4], +m[5], +m[6]).getTime() : NaN;
  };
  const t0 = ts(from), t1 = ts(to);
  if (isNaN(t0) || isNaN(t1)) throw new Error('Okno jak na stronie, np. „13 paź 2026, 17:03:50"');
  const RE = /Wersja (\d+)\t(\S+)\t([^\t]+)\t(\d+ \S+ \d{4}, \d\d:\d\d:\d\d)\t([\d.,]+) s\t\s*(\S+)/g;
  const page = () => {
    const out = [], text = document.body.innerText;
    let m; RE.lastIndex = 0;
    while ((m = RE.exec(text))) out.push({ v: +m[1], fn: m[2], at: m[4], t: ts(m[4]), s: parseFloat(m[5].replace(',', '.')), st: m[6] });
    return out;
  };
  const seen = new Map();
  const take = () => page().forEach(r => seen.set([r.at, r.fn, r.s, r.st].join('|'), r));
  const button = label => [...document.querySelectorAll('button,[role=button]')].find(b => b.getAttribute('aria-label') === label);
  const off = b => !b || b.disabled || b.getAttribute('aria-disabled') === 'true';
  const next = () => button('Przejdź na następną stronę');
  const first = button('Przejdź na pierwszą stronę');   // drugie wywołanie zaczynałoby od strony, na której skończyło pierwsze
  if (!off(first)) {
    const top = (page()[0] || {}).at;
    first.click();
    for (let i = 0; i < 40 && (page()[0] || {}).at === top; i++) await new Promise(r => setTimeout(r, 200));
  }
  take();
  let pages = 0, stop = '';
  const started = Date.now();
  while (true) {
    const rows = page(), last = rows[rows.length - 1];
    if (!last) { stop = 'brak wierszy na stronie'; break; }
    if (last.t < t0) { stop = 'doszło przed okno'; break; }
    if (pages >= 80 || Date.now() - started > 100000) { stop = 'limit stron/czasu'; break; }
    const b = next();
    if (off(b)) { stop = 'koniec listy'; break; }
    b.click(); pages++;
    let tries = 0;
    while (tries++ < 40) { await new Promise(r => setTimeout(r, 200)); const l = page().slice(-1)[0]; if (l && l.at !== last.at) break; }
    if (tries >= 40) { stop = 'strona się nie przewinęła'; break; }
    take();
  }
  const rows = [...seen.values()].filter(r => r.t >= t0 && r.t <= t1);
  const pct = (xs, f) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * f))] : null;
  const by = {};
  rows.forEach(r => (by[r.fn] = by[r.fn] || []).push(r));
  const stats = {};
  Object.keys(by).sort().forEach(fn => {
    const xs = by[fn].map(r => r.s).sort((a, b) => a - b);
    stats[fn] = { n: xs.length, med: pct(xs, .5), p90: pct(xs, .9), max: xs[xs.length - 1],
      over3: xs.filter(x => x >= 3).length, over5: xs.filter(x => x >= 5).length,
      notOk: by[fn].filter(r => r.st !== 'Ukończono').map(r => r.at.slice(-8) + ' ' + r.st) };
  });
  const line = r => r.at.slice(-8) + ' ' + r.fn + ' ' + r.s + ' s';
  return { window: from + ' – ' + to, pages: pages, stop: stop, rows: rows.length, stats: stats,
    slow: rows.filter(r => r.s >= 3).sort((a, b) => a.t - b.t).map(line),
    // pojedyncze wywołania poza odczytami — stąd czasy trzech rezerwacji naraz
    calls: rows.filter(r => r.fn !== 'doGet' && r.fn !== 'getData').sort((a, b) => a.t - b.t).map(line) };
};
'window.__g13exec gotowe';

/**
 * G13 Spacery — HISTORIA I NOCNY RESET.
 */

/* ---------- ODCZYT ---------- */

/**
 * Numer wiersza, od którego zaczyna się ostatnie HISTORY_DAYS dni.
 *
 * Historia rośnie bez końca — przy trzydziestu psach to kilkanaście tysięcy
 * wierszy rocznie — a telefon nie ma powodu ciągnąć jej w całości przy każdym
 * wejściu w zakładkę. Czytamy więc najpierw samą kolumnę dat (jeden zakres,
 * jedna kolumna), idziemy od dołu i liczymy RÓŻNE dni; dopiero wyliczony
 * kawałek pobieramy w pełnej szerokości. W arkuszu nic nie znika.
 *
 * Dni liczymy, zamiast brać stałą liczbę wierszy, bo liczba spacerów na dzień
 * zależy od wielkości grupy — "ostatnie 400 wierszy" raz znaczyłoby miesiąc,
 * a raz trzy dni.
 */
function historyStartRow_(sh, last) {
  const dates = sh.getRange(2, HIST.DATE, last - 1, 1).getValues();
  const seen = {};
  let days = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = cellDate_(dates[i][0]);
    if (!d || seen[d]) continue;
    if (days === HISTORY_DAYS) return i + 3;   // ten dzień już się nie mieści; blok zaczyna się wiersz niżej
    seen[d] = true;
    days++;
  }
  return 2;                                    // dni jest mniej niż limit — bierzemy wszystko
}

function readHistory_() {
  const sh = ss_().getSheetByName(SHEETS.HIST);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = historyStartRow_(sh, last);
  if (start > last) return [];
  return sh.getRange(start, 1, last - start + 1, HIST_WIDTH).getValues()
    .filter(r => r[HIST.DATE - 1] !== '' && r[HIST.DATE - 1] !== null)
    .map(r => ({
      date: cellDate_(r[HIST.DATE - 1]),
      name: String(r[HIST.DOG - 1]),
      who:  String(r[HIST.WHO - 1] || ''),
      time: cellTime_(r[HIST.TIME - 1]),
    }))
    .reverse();   // najnowsze na górze
}

/** Ile wpisów Historia ma naprawdę — do panelu, gdzie liczy się komplet, nie widok. */
function histCount_() {
  const sh = ss_().getSheetByName(SHEETS.HIST);
  const last = sh.getLastRow();
  return last < 2 ? 0 : last - 1;
}

/**
 * Minione dni do podglądu, od `from` do `to` włącznie: wpisy z Historii plus
 * spacery z dni, których nocne czyszczenie jeszcze nie domknęło (wyzwalacz
 * odpala się gdzieś w godzinie resetu, a w projekcie testowym nie ma go wcale).
 *
 * Historia bywa długa, więc najpierw czytamy samą kolumnę dat, a w pełnej
 * szerokości tylko zakres wierszy, w którym leżą szukane dni.
 */
function readHistoryDays_(from, to) {
  const out = [];
  const sh = ss_().getSheetByName(SHEETS.HIST);
  const last = sh.getLastRow();
  if (last >= 2) {
    const dates = sh.getRange(2, HIST.DATE, last - 1, 1).getValues().map(r => cellDate_(r[0]));
    let lo = -1, hi = -1;
    dates.forEach((d, i) => { if (d >= from && d <= to) { if (lo < 0) lo = i; hi = i; } });
    if (lo >= 0) {
      sh.getRange(lo + 2, 1, hi - lo + 1, HIST_WIDTH).getValues().forEach(r => {
        const d = cellDate_(r[HIST.DATE - 1]);
        if (d < from || d > to) return;
        out.push({ date: d, name: String(r[HIST.DOG - 1]), who: String(r[HIST.WHO - 1] || ''),
                   time: cellTime_(r[HIST.TIME - 1]) });
      });
    }
  }

  const labels = {};
  readDogCatalog_().forEach(d => { labels[d.id] = dogLabel_(d.name, d.ident, d.id); });
  readWalks_(walksSheet_()).forEach(w => {
    if (w.date < from || w.date > to) return;
    const name = labels[w.dogId] || ('Pies ' + w.dogId);
    if (w.who1) out.push({ date: w.date, name: name, who: w.who1, time: w.time1 });
    if (w.status === STATUS.WALKED) out.push({ date: w.date, name: name, who: w.who, time: w.time });
  });
  return out;
}

/* ---------- NOCNE CZYSZCZENIE ---------- */

/**
 * Uruchamiany przez wyzwalacz czasowy o godzinie z ustawień
 * (zakłada go installTriggers() — patrz Setup.gs i Settings.gs).
 *
 * Nie zeruje już żadnych psów: kolejny dzień i tak ma w zakładce Spacery
 * własne, puste wiersze, a aplikacja przechodzi na niego sama, punktualnie
 * o godzinie resetu (businessDate_). Czyszczenie tylko DOMYKA dni sprzed
 * bieżącego dnia rezerwacyjnego:
 *   1. ich odbyte spacery -> Historia (pod datą z wiersza) + data w ostatni_spacer,
 *      wiersze znikają ze Spacery; rezerwacje, z których nic nie wyszło, przepadają,
 *   2. notatki bez terminu znikają, z terminem — po swoim dniu,
 *   3. Zadania: usuwa TYLKO odhaczone; nieodhaczone zostają na kolejny dzień.
 *
 * Bezpieczne do uruchomienia w dowolnej chwili i dowolną liczbę razy: dzień,
 * który trwa, zostaje nietknięty, a zaległe dni (wyzwalacz nie zadziałał)
 * domykają się przy najbliższym uruchomieniu, w kolejności dat.
 */
function endOfDay() {
  withLock_(() => {
    const current = businessDate_();
    const lastWalk = closeWalks_(w => w.date < current);
    closeDogs_(current, lastWalk);
    clearDoneTasks_();
  });
}

/**
 * Zamyka wiersze zakładki Spacery spełniające `match`: odbyte spacery trafiają
 * do Historii pod SWOJĄ datą — każdy wiersz ją nosi, więc koniec zgadywania,
 * który dzień właśnie się skończył. Same wiersze znikają. Zwraca mapę
 * pies -> data jego ostatniego zamkniętego spaceru. Tylko pod blokadą.
 */
function closeWalks_(match) {
  const sh = walksSheetLocked_();
  const last = sh.getLastRow();
  if (last < 2) return {};
  const rows = sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues();
  const labels = {};
  readDogCatalog_().forEach(d => { labels[d.id] = dogLabel_(d.name, d.ident, d.id); });

  const keep = [], toHist = [], lastWalk = {};
  rows.forEach(r => {
    const w = mapWalkRow_(r);
    if (!isDate_(w.date) || !(w.dogId > 0)) return;   // pusty albo zepsuty wiersz wypada przy okazji
    if (!match(w)) { keep.push(r); return; }
    const label = labels[w.dogId] || ('Pies ' + w.dogId);
    const before = toHist.length;
    if (w.who1) toHist.push([w.date, label, w.who1, w.time1]);                    // pierwszy z dwóch
    if (w.status === STATUS.WALKED) toHist.push([w.date, label, w.who, w.time]);  // jedyny albo drugi
    if (toHist.length > before && !(lastWalk[w.dogId] >= w.date)) lastWalk[w.dogId] = w.date;
  });
  if (keep.length === rows.length) return lastWalk;

  if (toHist.length) {
    // chronologicznie: domykając kilka zaległych dni naraz, Historia zostaje po kolei
    toHist.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const hist = ss_().getSheetByName(SHEETS.HIST);
    hist.getRange(hist.getLastRow() + 1, 1, toHist.length, HIST_WIDTH).setValues(toHist);
  }
  // przepisujemy zakładkę w miejscu: dni otwarte na górę, zwolnione wiersze puste
  const blanks = rows.slice(keep.length).map(() => Array(WALK_WIDTH).fill(''));
  sh.getRange(2, 1, rows.length, WALK_WIDTH).setValues(keep.concat(blanks));
  return lastWalk;
}

/**
 * Katalog po zamknięciu dni: data ostatniego spaceru i notatki.
 * Notatka bez terminu żyje do czyszczenia; z terminem — do swojego dnia włącznie;
 * z terminem „nigdy" — dopóki ktoś jej nie skasuje.
 */
function closeDogs_(current, lastWalk) {
  const sh = ss_().getSheetByName(SHEETS.DOGS);
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2, 1, last - 1, DOG_WIDTH).getValues();
  vals.forEach(r => {
    const lw = lastWalk[Number(r[DOG.ID - 1])];
    if (lw && lw > cellDate_(r[DOG.LAST_WALK - 1])) r[DOG.LAST_WALK - 1] = lw;
    const until = cellDate_(r[DOG.NOTE_UNTIL - 1]);
    if (until !== NOTE_FOREVER && (!until || until < current)) {
      r[DOG.NOTE - 1] = '';
      r[DOG.NOTE_UNTIL - 1] = '';
    }
  });
  sh.getRange(2, 1, vals.length, DOG_WIDTH).setValues(vals);
}

function clearDoneTasks_() {
  const sh = ss_().getSheetByName(SHEETS.TASKS);
  if (!sh) return;
  const last = sh.getLastRow();
  if (last < 2) return;
  const st = sh.getRange(2, TASK.STATUS, last - 1, 1).getValues();
  for (let i = st.length - 1; i >= 0; i--) {     // od dołu, żeby numery wierszy się nie przesuwały
    if (String(st[i][0]) === 'done') sh.deleteRow(i + 2);
  }
}

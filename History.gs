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

/**
 * Ile kolumn Historii da się przeczytać. Zakładka sprzed kolumn `grupa` / `identyfikator`
 * bywa węższa niż HIST_WIDTH, a getRange poza szerokość zakładki rzuca błędem — Historia
 * przestałaby się otwierać do pierwszego nocnego czyszczenia, które kolumny dokłada.
 */
function histWidth_(sh) { return Math.min(HIST_WIDTH, sh.getMaxColumns()); }

/**
 * Kolumny dołożone do Historii później (`grupa`, `identyfikator`) — dokłada brakujące i ich
 * nagłówki. Numer psa jako tekst ('@'), ZANIM cokolwiek do niego trafi: „1/26" arkusz
 * zamieniłby na datę (ten sam błąd co z godziną, bug nr 3). Tylko pod blokadą albo z edytora.
 */
function histColumns_(sh) {
  const missing = HIST_WIDTH - sh.getMaxColumns();
  if (missing > 0) sh.insertColumnsAfter(sh.getMaxColumns(), missing);
  [HIST.GROUP, HIST.IDENT].forEach(c => {
    if (String(sh.getRange(1, c).getValue()) === HIST_HEADERS[c - 1]) return;
    sh.getRange(1, c).setValue(HIST_HEADERS[c - 1]);
    if (c === HIST.IDENT) sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
  });
}

/**
 * Miejsce na `n` nowych wpisów pod ostatnim zajętym wierszem Historii. Zakładka ma stałą liczbę
 * wierszy (nowa: 1000), a getRange poza nią rzuca błędem — w dniu, w którym Historia by się
 * zapełniła, nocne czyszczenie stawałoby i dni przestawałyby się zamykać. Dokładamy dokładnie
 * brakujące wiersze; niczego nie kasujemy (decyzja właściciela, 1.1.2: Historia trzyma komplet).
 * Nowe wiersze dostają format tekstowy na dacie, godzinie i numerze psa, ZANIM coś do nich trafi —
 * „17:21" i „1/26" arkusz zrobiłby datami (bug nr 3). Tylko pod blokadą.
 */
function histRoom_(sh, n) {
  const max = sh.getMaxRows(), need = sh.getLastRow() + n;
  if (need <= max) return;
  sh.insertRowsAfter(max, need - max);
  [HIST.DATE, HIST.TIME, HIST.IDENT].forEach(c => sh.getRange(max + 1, c, need - max, 1).setNumberFormat('@'));
}

/**
 * Numer psa po etykiecie z Historii — dla wpisów sprzed kolumny `identyfikator`, które
 * znają tylko imię. Wyłącznie jednoznacznie: dwa psy o tej samej etykiecie dają brak numeru
 * (zrzuty idą do władz schroniska — lepiej żaden numer niż cudzy).
 */
function identsByLabel_(catalog) {
  const map = {};
  catalog.forEach(d => {
    const label = dogLabel_(d.name, d.ident, d.id);
    map[label] = Object.prototype.hasOwnProperty.call(map, label) ? null : d.ident;
  });
  return label => (Object.prototype.hasOwnProperty.call(map, label) && map[label]) || '';
}

function readHistory_() {
  const sh = ss_().getSheetByName(SHEETS.HIST);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = historyStartRow_(sh, last);
  if (start > last) return [];
  return sh.getRange(start, 1, last - start + 1, histWidth_(sh)).getValues()
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
 * Każdy wpis niesie numer grupy tego dnia (`group`, 0 = bez grupy albo wpis sprzed
 * kolumny `grupa`) i numer psa (`ident`): z Historii, dla wpisów sprzed tej kolumny —
 * z katalogu po etykiecie (identsByLabel_), dla dni niezamkniętych — z katalogu po psie.
 *
 * Historia bywa długa, więc najpierw czytamy samą kolumnę dat, a w pełnej
 * szerokości tylko zakres wierszy, w którym leżą szukane dni.
 */
function readHistoryDays_(from, to) {
  const out = [];
  const catalog = readDogCatalog_();
  const sh = ss_().getSheetByName(SHEETS.HIST);
  const last = sh.getLastRow();
  if (last >= 2) {
    const dates = sh.getRange(2, HIST.DATE, last - 1, 1).getValues().map(r => cellDate_(r[0]));
    let lo = -1, hi = -1;
    dates.forEach((d, i) => { if (d >= from && d <= to) { if (lo < 0) lo = i; hi = i; } });
    if (lo >= 0) {
      const identOf = identsByLabel_(catalog);
      sh.getRange(lo + 2, 1, hi - lo + 1, histWidth_(sh)).getValues().forEach(r => {
        const d = cellDate_(r[HIST.DATE - 1]);
        if (d < from || d > to) return;
        const name = String(r[HIST.DOG - 1]);
        out.push({ date: d, name, who: String(r[HIST.WHO - 1] || ''),
                   time: cellTime_(r[HIST.TIME - 1]), group: posInt_(r[HIST.GROUP - 1]),
                   ident: String(r[HIST.IDENT - 1] == null ? '' : r[HIST.IDENT - 1]) || identOf(name) });
      });
    }
  }

  const dogs = {};
  catalog.forEach(d => { dogs[d.id] = d; });
  readSlots_(walksSheet_()).forEach(s => {
    if (s.date < from || s.date > to || s.status !== STATUS.WALKED) return;
    const d = dogs[s.dogId];
    out.push({ date: s.date, name: d ? dogLabel_(d.name, d.ident, d.id) : ('Pies ' + s.dogId), who: s.who, time: s.time,
               group: s.group, ident: d ? d.ident : '' });
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
 *   3. Zadania: usuwa TYLKO odhaczone; nieodhaczone zostają na kolejny dzień,
 *   4. kolory wolontariuszy dni zamkniętych przestają być potrzebne.
 *
 * Bezpieczne do uruchomienia w dowolnej chwili i dowolną liczbę razy: dzień,
 * który trwa, zostaje nietknięty, a zaległe dni (wyzwalacz nie zadziałał)
 * domykają się przy najbliższym uruchomieniu, w kolejności dat.
 */
function endOfDay() {
  const days = [];                                   // dni, których nasze spacery trafiły właśnie do Historii
  withLock_(() => {
    const current = businessDate_();
    const lastWalk = closeWalks_(s => s.date < current, days);
    closeDogs_(current, lastWalk);
    clearDoneTasks_();
    forgetVolunteers_(current);
  });
  // lista dnia do prowadzącej (1.3) — już bez blokady (bramka potrafi odpowiadać do minuty) i nigdy
  // nie zatrzyma czyszczenia: to jest zrobione, a błąd zostaje w panelu (sendClosedDayReports_)
  sendClosedDayReports_(days);
}

/**
 * Zamyka spacery zakładki Spacery spełniające `match`: odbyte (nasze) trafiają do Historii
 * pod SWOJĄ datą — każdy wiersz ją nosi, więc koniec zgadywania, który dzień właśnie
 * się skończył. Pies na dwa spacery daje dwa wpisy. Wpis niesie numer grupy dnia
 * (podgląd minionego dnia pokazuje, kto szedł razem) i numer psa z katalogu w tej chwili.
 * Same wiersze znikają. Zwraca mapę pies -> data jego ostatniego zamkniętego spaceru.
 * `days` (tablica, nieobowiązkowa) dostaje daty, których wpisy właśnie trafiły do Historii.
 * Tylko pod blokadą.
 */
function closeWalks_(match, days) {
  const sh = walksSheetLocked_();
  const last = sh.getLastRow();
  if (last < 2) return {};
  const rows = sh.getRange(2, 1, last - 1, WALK_WIDTH).getValues();
  const labels = {}, idents = {};
  readDogCatalog_().forEach(d => { labels[d.id] = dogLabel_(d.name, d.ident, d.id); idents[d.id] = d.ident; });

  const keep = [], toHist = [], lastWalk = {};
  rows.forEach(r => {
    const s = mapSlotRow_(r);
    if (!isDate_(s.date) || !(s.dogId > 0)) return;   // pusty albo zepsuty wiersz wypada przy okazji
    if (!match(s)) { keep.push(r); return; }
    if (!slotDone_(s)) return;                         // rezerwacja, z której nic nie wyszło — przepada
    if (!(lastWalk[s.dogId] >= s.date)) lastWalk[s.dogId] = s.date;
    // spacer wzięty przez grupę psa (1.3) to spacer psa, ale nie nasz: do Historii i maila nie idzie
    if (s.status === STATUS.TEAM) return;
    toHist.push({ row: [s.date, labels[s.dogId] || ('Pies ' + s.dogId), s.who, s.time, s.group || '', idents[s.dogId] || ''],
                  slot: s.slot });
  });
  if (keep.length === rows.length) return lastWalk;

  if (toHist.length) {
    // chronologicznie: domykając kilka zaległych dni naraz, Historia zostaje po kolei;
    // w obrębie dnia spacer 1/2 przed 2/2 (sort stabilny, numer spaceru tylko do porządku)
    toHist.sort((a, b) => (a.row[0] < b.row[0] ? -1 : a.row[0] > b.row[0] ? 1 : a.slot - b.slot));
    const hist = ss_().getSheetByName(SHEETS.HIST);
    histColumns_(hist);
    histRoom_(hist, toHist.length);
    hist.getRange(hist.getLastRow() + 1, 1, toHist.length, HIST_WIDTH).setValues(toHist.map(t => t.row));
    if (days) toHist.forEach(t => { if (days.indexOf(t.row[0]) < 0) days.push(t.row[0]); });
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
  const width = dogWidth_(sh);   // zakładka sprzed kolumny grupy psa bywa węższa niż DOG_WIDTH
  const vals = sh.getRange(2, 1, last - 1, width).getValues();
  vals.forEach(r => {
    const lw = lastWalk[Number(r[DOG.ID - 1])];
    if (lw && lw > cellDate_(r[DOG.LAST_WALK - 1])) r[DOG.LAST_WALK - 1] = lw;
    const until = cellDate_(r[DOG.NOTE_UNTIL - 1]);
    if (until !== NOTE_FOREVER && (!until || until < current)) {
      r[DOG.NOTE - 1] = '';
      r[DOG.NOTE_UNTIL - 1] = '';
    }
  });
  sh.getRange(2, 1, vals.length, width).setValues(vals);
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

/**
 * G13 Spacery — HISTORIA I NOCNY RESET.
 */

/* ---------- ODCZYT ---------- */

function readHistory_() {
  const sh = ss_().getSheetByName(SHEETS.HIST);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HIST_WIDTH).getValues()
    .filter(r => r[HIST.DATE - 1] !== '' && r[HIST.DATE - 1] !== null)
    .map(r => ({
      date: cellDate_(r[HIST.DATE - 1]),
      name: String(r[HIST.DOG - 1]),
      who:  String(r[HIST.WHO - 1] || ''),
      time: cellTime_(r[HIST.TIME - 1]),
    }))
    .reverse();   // najnowsze na górze
}

/* ---------- NOCNY RESET ---------- */

/**
 * Data, pod którą archiwizujemy spacery — czyli dzień, KTÓRY WŁAŚNIE SIĘ SKOŃCZYŁ.
 *
 * Przy resecie wieczorem (domyślne 22:00) to po prostu dziś. Ale godzina jest
 * ustawialna z panelu: reset o 3:00 czy 6:00 wypada już następnego dnia
 * kalendarzowego, a spacery odbyły się poprzedniego — bez tej korekty wpadłyby
 * do Historii pod złą datą i pies wyglądałby na wyprowadzonego dzisiaj.
 * Granicę stawiamy w południe: reset przed 12:00 zamyka dzień poprzedni.
 */
function archiveDate_() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, tz_(), 'H'));
  if (hour >= 12) return today_();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return Utilities.formatDate(yesterday, tz_(), 'yyyy-MM-dd');
}

/**
 * Uruchamiany przez wyzwalacz czasowy o godzinie z ustawień
 * (zakłada go installTriggers() — patrz Setup.gs i Settings.gs).
 * Robi trzy rzeczy:
 *   1. odbyte spacery (oba u psów 2-spacerowych) -> Historia + data w ostatni_spacer,
 *   2. wszystkie psy z powrotem na "wolny", notatki bez terminu znikają,
 *   3. Zadania: usuwa TYLKO odhaczone; nieodhaczone zostają na kolejny dzień.
 * Do testów można uruchomić ręcznie z edytora.
 */
function endOfDay() {
  withLock_(() => {
    archiveAndResetDogs_();
    clearDoneTasks_();
  });
}

function archiveAndResetDogs_() {
  const s = ss_();
  const sh = s.getSheetByName(SHEETS.DOGS);
  const last = sh.getLastRow();
  if (last < 2) return;

  const today = archiveDate_();
  const vals = sh.getRange(2, 1, last - 1, DOG_WIDTH).getValues();
  const toHist = [];

  vals.forEach(r => {
    const label = dogLabel_(String(r[DOG.NAME - 1] || ''), String(r[DOG.IDENT - 1] || ''), r[DOG.ID - 1]);
    let walkedAny = false;
    if (String(r[DOG.WHO1 - 1] || '') !== '') {          // pierwszy z dwóch spacerów
      toHist.push([today, label, String(r[DOG.WHO1 - 1]), cellTime_(r[DOG.TIME1 - 1])]);
      walkedAny = true;
    }
    if (String(r[DOG.STATUS - 1]) === STATUS.WALKED) {   // spacer (jedyny lub drugi)
      toHist.push([today, label, String(r[DOG.WHO - 1] || ''), cellTime_(r[DOG.TIME - 1])]);
      walkedAny = true;
    }
    if (walkedAny) r[DOG.LAST_WALK - 1] = today;         // zapamiętaj datę ostatniego spaceru
    r[DOG.STATUS - 1] = STATUS.FREE;
    r[DOG.WHO - 1] = '';
    r[DOG.TIME - 1] = '';
    // notatka bez terminu żyje jeden dzień; z terminem — do tego dnia włącznie
    const until = cellDate_(r[DOG.NOTE_UNTIL - 1]);
    if (!until || until <= today) {
      r[DOG.NOTE - 1] = '';
      r[DOG.NOTE_UNTIL - 1] = '';
    }
    r[DOG.WHO1 - 1] = '';
    r[DOG.TIME1 - 1] = '';
  });

  if (toHist.length) {
    const hist = s.getSheetByName(SHEETS.HIST);
    hist.getRange(hist.getLastRow() + 1, 1, toHist.length, HIST_WIDTH).setValues(toHist);
  }
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

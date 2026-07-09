/**
 * G13 Spacery — PIERWSZE URUCHOMIENIE I UTRZYMANIE.
 *
 * Na świeżym arkuszu uruchom ręcznie, RAZ, w tej kolejności:
 *   1. setup()            — tworzy zakładki, nagłówki, formaty, przykładowe psy
 *   2. installTriggers()  — zakłada wyzwalacz resetu o 22:00
 *
 * Masz już arkusz z danymi ze starszej wersji? Zamiast setup() uruchom migrate().
 */

/** Tworzy zakładki Psy / Historia / Zadania (istniejących nie nadpisuje). */
function setup() {
  const s = ss_();

  const dogs = s.getSheetByName(SHEETS.DOGS) || s.insertSheet(SHEETS.DOGS);
  if (dogs.getLastRow() === 0) {
    dogs.getRange(1, 1, 1, DOG_WIDTH).setValues([DOG_HEADERS]);
    dogs.getRange(2, 1, 3, DOG_WIDTH).setValues([
      [1, 'Borys', '',     'K-3', 'easy', STATUS.FREE, '', '', '', '', 1, '', ''],
      [2, 'Luna',  '1024', '',    'easy', STATUS.FREE, '', '', '', '', 2, '', ''],  // pies na 2 spacery dziennie
      [3, '',      '2077', 'K-9', 'hard', STATUS.FREE, '', '', '', '', 1, '', ''],  // nowy pies: jeszcze bez imienia
    ]);
    dogs.setFrozenRows(1);
  }

  const hist = s.getSheetByName(SHEETS.HIST) || s.insertSheet(SHEETS.HIST);
  if (hist.getLastRow() === 0) {
    hist.getRange(1, 1, 1, HIST_WIDTH).setValues([HIST_HEADERS]);
    hist.setFrozenRows(1);
  }

  const tasks = s.getSheetByName(SHEETS.TASKS) || s.insertSheet(SHEETS.TASKS);
  if (tasks.getLastRow() === 0) {
    tasks.getRange(1, 1, 1, TASK_WIDTH).setValues([TASK_HEADERS]);
    tasks.setFrozenRows(1);
  }

  applyTextFormats_();
}

/**
 * Migracja istniejącego arkusza do aktualnej struktury. Bezpieczna do
 * wielokrotnego uruchomienia; danych nie kasuje. Obsługuje:
 *  - najstarszy układ 6 kolumn (id|imie|trudnosc|status|kto|godzina),
 *  - arkusz bez zakładki Zadania,
 *  - brakujące formaty tekstowe (przyczyna buga z datą 1899 w godzinie).
 */
function migrate() {
  const dogs = ss_().getSheetByName(SHEETS.DOGS);
  if (dogs && String(dogs.getRange(1, 3).getValue()) === 'trudnosc') {
    dogs.insertColumnsAfter(2, 2);   // miejsce na identyfikator i boks
    dogs.getRange(1, DOG.IDENT).setValue('identyfikator');
    dogs.getRange(1, DOG.BOX).setValue('boks');
    dogs.getRange(1, DOG.LAST_WALK).setValue('ostatni_spacer');
  }
  if (dogs && String(dogs.getRange(1, DOG.NOTE).getValue()) !== 'notatka') {
    // kolumny dodane później: notatka | spacery | kto1 | godzina1
    dogs.getRange(1, DOG.NOTE, 1, 4).setValues([['notatka', 'spacery', 'kto1', 'godzina1']]);
  }
  setup();   // dołoży brakujące zakładki i formaty
}

/**
 * Format tekstowy ('@') na kolumnach dat i godzin — arkusz przestaje
 * zamieniać "17:21" na datę z 1899 r., a "2026-07-07" na obiekt daty.
 */
function applyTextFormats_() {
  const s = ss_();
  const textCols = [
    [SHEETS.DOGS,  [DOG.TIME, DOG.LAST_WALK, DOG.TIME1]],
    [SHEETS.HIST,  [HIST.DATE, HIST.TIME]],
    [SHEETS.TASKS, [TASK.DATE]],
  ];
  textCols.forEach(([name, cols]) => {
    const sh = s.getSheetByName(name);
    if (!sh) return;
    cols.forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'));
  });
}

/**
 * Zakłada dzienny wyzwalacz endOfDay (22:00–23:00 czasu polskiego).
 * BEZ NIEGO Historia pozostaje pusta, a lista nie zeruje się w nocy.
 * Bezpieczna do wielokrotnego uruchomienia — najpierw usuwa duplikaty.
 */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'endOfDay')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('endOfDay')
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .inTimezone(TIMEZONE)
    .create();
}

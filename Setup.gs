/**
 * G13 Spacery — PIERWSZE URUCHOMIENIE I UTRZYMANIE.
 *
 * Na świeżym arkuszu uruchom ręcznie, RAZ, w tej kolejności:
 *   1. setup()            — tworzy zakładki, nagłówki, formaty, przykładowe psy
 *   2. installTriggers()  — zakłada wyzwalacz resetu (domyślnie 22:00)
 *
 * Masz już arkusz z danymi ze starszej wersji? Zamiast setup() uruchom migrate().
 */

/**
 * Tworzy zakładki Psy / Spacery / Historia / Zadania (istniejących nie nadpisuje).
 * Zakładkę Spacery aplikacja umie też założyć sama przy pierwszym dostępie —
 * tu robimy to od razu, żeby świeży projekt miał komplet.
 */
function setup() {
  const s = ss_();

  const dogs = s.getSheetByName(SHEETS.DOGS) || s.insertSheet(SHEETS.DOGS);
  if (dogs.getLastRow() === 0) {
    dogs.getRange(1, 1, 1, DOG_WIDTH).setValues([DOG_HEADERS]);
    dogs.getRange(2, 1, 3, DOG_WIDTH).setValues([
      [1, 'Borys', '',     'K-3', 'easy', STATUS.FREE, '', '', '', '', 1, '', '', ''],
      [2, 'Luna',  '1024', '',    'easy', STATUS.FREE, '', '', '', '', 2, '', '', ''],  // pies na 2 spacery dziennie
      [3, '',      '2077', 'K-9', 'hard', STATUS.FREE, '', '', '', '', 1, '', '', ''],  // nowy pies: jeszcze bez imienia
    ]);
    dogs.setFrozenRows(1);
  }

  const hist = s.getSheetByName(SHEETS.HIST) || s.insertSheet(SHEETS.HIST);
  if (hist.getLastRow() === 0) {
    hist.getRange(1, 1, 1, HIST_WIDTH).setValues([HIST_HEADERS]);
    hist.setFrozenRows(1);
  } else {
    histGroupColumn_(hist);   // Historia sprzed kolumny grupa (dokłada ją też samo nocne czyszczenie)
  }

  const tasks = s.getSheetByName(SHEETS.TASKS) || s.insertSheet(SHEETS.TASKS);
  if (tasks.getLastRow() === 0) {
    tasks.getRange(1, 1, 1, TASK_WIDTH).setValues([TASK_HEADERS]);
    tasks.setFrozenRows(1);
  }

  walksSheet_();   // dzień psa — patrz Dogs.gs

  applyTextFormats_();
  warnIfNoPin_();
}

/**
 * Tryb edycji stoi na właściwości skryptu `pin`, której nie ma w kodzie.
 * Na świeżym projekcie łatwo o niej zapomnieć i zobaczyć tylko „Zły PIN",
 * więc mówimy o tym wprost w miejscu, przez które i tak się przechodzi.
 */
function warnIfNoPin_() {
  if (pin_()) return;
  console.log('UWAGA: PIN trybu edycji nie jest ustawiony, więc tryb edycji jest niedostępny.\n' +
              'Ustawienia projektu -> Właściwości skryptu -> dodaj właściwość "pin" o własnej wartości.');
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
  if (dogs) {
    // arkusz bywa węższy niż aktualna struktura — dołóż brakujące kolumny ZANIM
    // cokolwiek poniżej spróbuje w nie pisać (getRange poza szerokość rzuca błędem)
    const missing = DOG_WIDTH - dogs.getMaxColumns();
    if (missing > 0) dogs.insertColumnsAfter(dogs.getMaxColumns(), missing);
  }
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
  if (dogs && String(dogs.getRange(1, DOG.NOTE_UNTIL).getValue()) !== 'notatka_do') {
    dogs.getRange(1, DOG.NOTE_UNTIL).setValue('notatka_do');   // termin ważności notatki
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
    [SHEETS.DOGS,  [DOG.TIME, DOG.LAST_WALK, DOG.TIME1, DOG.NOTE_UNTIL]],
    [SHEETS.WALKS, [WALK.DATE, WALK.TIME]],
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
 * Zakłada dzienny wyzwalacz endOfDay o godzinie z ustawień (patrz Settings.gs).
 * BEZ NIEGO zamknięte dni nie trafiają do Historii, a notatki bez terminu
 * nie znikają. (Sama zmiana dnia na liście działa i bez niego — liczy ją
 * businessDate_ z zegara.)
 * Bezpieczna do wielokrotnego uruchomienia — najpierw usuwa duplikaty.
 *
 * Uwaga Apps Script: `atHour(h)` to okno h:00–h:59, nie punkt czasowy.
 * Wywoływana ponownie przy każdej zmianie godziny z panelu.
 */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'endOfDay')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('endOfDay')
    .timeBased()
    .everyDays(1)
    .atHour(resetHour_())
    .inTimezone(TIMEZONE)
    .create();
}

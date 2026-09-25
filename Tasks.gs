/**
 * G13 Spacery — ZADANIA.
 * Prowadząca dodaje/usuwa (PIN), wolontariusze odhaczają bez PIN-u.
 *
 * Każde zadanie ma DZIEŃ, od którego się pokazuje (kolumna `data`). Domyślnie
 * to bieżący dzień rezerwacyjny, ale prowadząca może zaplanować zadanie na
 * konkretny dzień — do tego czasu nie widać go na liście bieżącego dnia.
 * Nieodhaczone zadania przeżywają nocny reset i dostają odznakę "od N dni";
 * odhaczone znikają przy czyszczeniu (clearDoneTasks_ w History.gs).
 */

/* ---------- ODCZYT ---------- */

function readTasks_() {
  const sh = ss_().getSheetByName(SHEETS.TASKS);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, TASK_WIDTH).getValues()
    .filter(r => r[TASK.ID - 1] !== '' && r[TASK.ID - 1] !== null)
    .map(r => ({
      id:   Number(r[TASK.ID - 1]),
      text: String(r[TASK.TEXT - 1] || ''),
      date: cellDate_(r[TASK.DATE - 1]),
      done: String(r[TASK.STATUS - 1]) === 'done',
    }));
}

/* ---------- AKCJE WOLONTARIUSZY ---------- */

/**
 * Odhaczenie / odznaczenie zadania (pomyłki można cofać).
 * Zadanie zaplanowane na przyszły dzień odhacza się dopiero w jego dniu —
 * interfejs tego nie proponuje, a serwer pilnuje tego także przed kartami
 * otwartymi jeszcze przed wprowadzeniem dat, które pokazują wszystkie zadania.
 * Zwraca małe potwierdzenie zamiast pełnego stanu — interfejs jest
 * optymistyczny, a prawda i tak dojedzie z okresowym odświeżeniem.
 */
function setTaskDone(id, done) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.TASKS);
    const row = rowById_(sh, id);
    if (row > 0) {
      const date = cellDate_(sh.getRange(row, TASK.DATE).getValue());
      if (isDate_(date) && date > businessDate_()) throw new Error('To zadanie odhaczysz w jego dniu');
      sh.getRange(row, TASK.STATUS).setValue(done ? 'done' : 'open');
    }
    return { ok: row > 0, id: Number(id), done: !!done };
  });
}

/* ---------- AKCJE PROWADZĄCEJ ---------- */

/**
 * Nowe zadanie. `date` — dzień, od którego ma się pokazać; brak = bieżący dzień
 * rezerwacyjny (tak wołają karty otwarte przed wprowadzeniem dat). Liczymy od
 * dnia rezerwacyjnego, nie kalendarzowego: zadanie dodane o 21:00, gdy lista
 * pracuje już na jutrze, ma być jutrzejsze — a nie od razu „od wczoraj".
 */
function addTask(text, pin, date) {
  requirePin_(pin);
  const t = clean_(text, MAX_LEN.TASK);
  if (!t) throw new Error('Puste zadanie');
  const current = businessDate_();
  const d = (date == null || date === '') ? current : String(date);
  if (!isDate_(d)) throw new Error('Nieprawidłowa data zadania');
  if (d < current) throw new Error('Zadanie nie może być na dzień, który już minął');
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.TASKS);
    sh.appendRow([nextId_(sh), t, d, 'open']);
    return getData();
  });
}

function removeTask(id, pin) {
  requirePin_(pin);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.TASKS);
    const row = rowById_(sh, id);
    if (row > 0) sh.deleteRow(row);
    return getData();
  });
}

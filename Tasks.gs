/**
 * G13 Spacery — ZADANIA NA DZIŚ.
 * Prowadząca dodaje/usuwa (PIN), wolontariusze odhaczają bez PIN-u.
 * Nieodhaczone zadania przeżywają nocny reset i dostają odznakę "od N dni".
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
 * Zwraca małe potwierdzenie zamiast pełnego stanu — interfejs jest
 * optymistyczny, a prawda i tak dojedzie z okresowym odświeżeniem.
 */
function setTaskDone(id, done) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.TASKS);
    const row = rowById_(sh, id);
    if (row > 0) sh.getRange(row, TASK.STATUS).setValue(done ? 'done' : 'open');
    return { ok: row > 0, id: Number(id), done: !!done };
  });
}

/* ---------- AKCJE PROWADZĄCEJ ---------- */

function addTask(text, pin) {
  requirePin_(pin);
  const t = clean_(text, MAX_LEN.TASK);
  if (!t) throw new Error('Puste zadanie');
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.TASKS);
    sh.appendRow([nextId_(sh), t, today_(), 'open']);
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

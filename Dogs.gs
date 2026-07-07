/**
 * G13 Spacery — PSY.
 * Odczyt listy + akcje wolontariuszy (rezerwacja, spacer, zwolnienie)
 * + akcje prowadzącej (dodanie, edycja, usunięcie — chronione PIN-em).
 */

/* ---------- ODCZYT ---------- */

function readDogs_() {
  const sh = ss_().getSheetByName(SHEETS.DOGS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, DOG_WIDTH).getValues()
    .filter(r => r[DOG.ID - 1] !== '' && r[DOG.ID - 1] !== null)
    .map(r => ({
      id:       Number(r[DOG.ID - 1]),
      name:     String(r[DOG.NAME - 1] || ''),
      ident:    String(r[DOG.IDENT - 1] || ''),
      box:      String(r[DOG.BOX - 1] || ''),
      dif:      String(r[DOG.DIF - 1]) || 'easy',
      status:   String(r[DOG.STATUS - 1]) || STATUS.FREE,
      who:      String(r[DOG.WHO - 1] || ''),
      time:     cellTime_(r[DOG.TIME - 1]),
      lastWalk: cellDate_(r[DOG.LAST_WALK - 1]),
    }));
}

/* ---------- AKCJE WOLONTARIUSZY ---------- */

/** Rezerwuje psa — tylko jeśli wciąż wolny (kto pierwszy, ten lepszy). */
function reserve(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      const cur = String(sh.getRange(row, DOG.STATUS).getValue());
      if (cur === STATUS.FREE || cur === '') {
        sh.getRange(row, DOG.STATUS, 1, 3).setValues([[STATUS.RESERVED, clean_(name), '']]);
      }
    }
    return getData();
  });
}

/** Oznacza spacer jako odbyty; bez podanego imienia zachowuje rezerwującego. */
function markWalked(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      const existing = String(sh.getRange(row, DOG.WHO).getValue() || '');
      const who = clean_(name) || existing;
      sh.getRange(row, DOG.STATUS, 1, 3).setValues([[STATUS.WALKED, who, now_()]]);
    }
    return getData();
  });
}

/** Cofa psa do stanu "wolny" (zwolnienie rezerwacji albo cofnięcie spaceru). */
function setFree(id) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      sh.getRange(row, DOG.STATUS, 1, 3).setValues([[STATUS.FREE, '', '']]);
    }
    return getData();
  });
}

/* ---------- AKCJE PROWADZĄCEJ ---------- */

/** Wymusza: pies musi mieć imię LUB identyfikator (nowy pies bywa bez imienia). */
function dogFields_(data) {
  const name  = clean_(data && data.name,  MAX_LEN.NAME);
  const ident = clean_(data && data.ident, MAX_LEN.IDENT);
  const box   = clean_(data && data.box,   MAX_LEN.BOX);
  if (!name && !ident) throw new Error('Podaj imię lub nr identyfikacyjny');
  return { name, ident, box, dif: validDif_(data && data.dif) };
}

/** data = { name, ident, box, dif } — wszystko opcjonalne poza regułą wyżej. */
function addDog(data, pin) {
  requirePin_(pin);
  const d = dogFields_(data);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    sh.appendRow([nextId_(sh), d.name, d.ident, d.box, d.dif, STATUS.FREE, '', '', '']);
    return getData();
  });
}

/** Edycja psa: nadanie/zmiana imienia, identyfikatora, boksu, trudności. */
function updateDog(id, data, pin) {
  requirePin_(pin);
  const d = dogFields_(data);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) {
      sh.getRange(row, DOG.NAME, 1, 4).setValues([[d.name, d.ident, d.box, d.dif]]);
    }
    return getData();
  });
}

function removeDog(id, pin) {
  requirePin_(pin);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row > 0) sh.deleteRow(row);
    return getData();
  });
}

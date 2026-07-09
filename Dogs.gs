/**
 * G13 Spacery — PSY.
 * Odczyt listy + akcje wolontariuszy (rezerwacja, spacer, zwolnienie)
 * + akcje edycyjne (dodanie, edycja, usunięcie — chronione PIN-em).
 *
 * Wydajność: akcje wolontariuszy zwracają TYLKO zmieniony wiersz ({dog}),
 * nie cały stan — interfejs jest optymistyczny i dosynchronizowuje się
 * z okresowego odświeżania. Rzadkie akcje edycyjne zwracają pełny stan.
 */

/* ---------- ODCZYT ---------- */

/** Surowy wiersz arkusza -> obiekt psa dla interfejsu. */
function mapDogRow_(r) {
  return {
    id:       Number(r[DOG.ID - 1]),
    name:     String(r[DOG.NAME - 1] || ''),
    ident:    String(r[DOG.IDENT - 1] || ''),
    box:      String(r[DOG.BOX - 1] || ''),
    dif:      String(r[DOG.DIF - 1]) || 'easy',
    status:   String(r[DOG.STATUS - 1]) || STATUS.FREE,
    who:      String(r[DOG.WHO - 1] || ''),
    time:     cellTime_(r[DOG.TIME - 1]),
    lastWalk: cellDate_(r[DOG.LAST_WALK - 1]),
    note:     String(r[DOG.NOTE - 1] || ''),
    walks:    Number(r[DOG.WALKS - 1]) === 2 ? 2 : 1,
    who1:     String(r[DOG.WHO1 - 1] || ''),
    time1:    cellTime_(r[DOG.TIME1 - 1]),
  };
}

function readDogs_() {
  const sh = ss_().getSheetByName(SHEETS.DOGS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, DOG_WIDTH).getValues()
    .filter(r => r[DOG.ID - 1] !== '' && r[DOG.ID - 1] !== null)
    .map(mapDogRow_);
}

/** Wiersz psa po numerze wiersza — jeden odczyt zakresu. */
function readDogRow_(sh, row) {
  return sh.getRange(row, 1, 1, DOG_WIDTH).getValues()[0];
}

/* ---------- AKCJE WOLONTARIUSZY (zwracają {dog}) ---------- */

/**
 * Rezerwuje psa — tylko jeśli wciąż wolny (kto pierwszy, ten lepszy).
 * Zwraca faktyczny stan wiersza; interfejs porównuje go ze swoim
 * optymistycznym i pokazuje toast, gdy ktoś zdążył pierwszy.
 */
function reserve(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return { dog: null };
    const r = readDogRow_(sh, row);
    const cur = String(r[DOG.STATUS - 1]);
    if (cur === STATUS.FREE || cur === '') {
      r[DOG.STATUS - 1] = STATUS.RESERVED;
      r[DOG.WHO - 1] = clean_(name);
      r[DOG.TIME - 1] = '';
      sh.getRange(row, DOG.STATUS, 1, 3)
        .setValues([[r[DOG.STATUS - 1], r[DOG.WHO - 1], r[DOG.TIME - 1]]]);
    }
    return { dog: mapDogRow_(r) };
  });
}

/**
 * Oznacza spacer jako odbyty; bez podanego imienia zachowuje rezerwującego.
 * Pies na 2 spacery dziennie: pierwszy spacer zapisuje się w kto1/godzina1,
 * a pies wraca na "wolny" (do wzięcia drugi raz). Dopiero drugi spacer
 * przechodzi w pełny status "wyprowadzony".
 */
function markWalked(id, name) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return { dog: null };
    const r = readDogRow_(sh, row);
    const who = clean_(name) || String(r[DOG.WHO - 1] || '');
    const needsTwo = Number(r[DOG.WALKS - 1]) === 2;
    const firstDone = String(r[DOG.WHO1 - 1] || '') !== '';

    if (needsTwo && !firstDone) {
      r[DOG.WHO1 - 1] = who;
      r[DOG.TIME1 - 1] = now_();
      r[DOG.STATUS - 1] = STATUS.FREE;
      r[DOG.WHO - 1] = '';
      r[DOG.TIME - 1] = '';
      sh.getRange(row, DOG.STATUS, 1, 3).setValues([[STATUS.FREE, '', '']]);
      sh.getRange(row, DOG.WHO1, 1, 2).setValues([[r[DOG.WHO1 - 1], r[DOG.TIME1 - 1]]]);
    } else {
      r[DOG.STATUS - 1] = STATUS.WALKED;
      r[DOG.WHO - 1] = who;
      r[DOG.TIME - 1] = now_();
      sh.getRange(row, DOG.STATUS, 1, 3)
        .setValues([[r[DOG.STATUS - 1], r[DOG.WHO - 1], r[DOG.TIME - 1]]]);
    }
    return { dog: mapDogRow_(r) };
  });
}

/** Cofa omyłkowo odhaczony PIERWSZY z dwóch spacerów. */
function undoFirstWalk(id) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return { dog: null };
    const r = readDogRow_(sh, row);
    r[DOG.WHO1 - 1] = '';
    r[DOG.TIME1 - 1] = '';
    sh.getRange(row, DOG.WHO1, 1, 2).setValues([['', '']]);
    return { dog: mapDogRow_(r) };
  });
}

/** Cofa psa do stanu "wolny" (zwolnienie rezerwacji albo cofnięcie spaceru). */
function setFree(id) {
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    const row = rowById_(sh, id);
    if (row < 0) return { dog: null };
    const r = readDogRow_(sh, row);
    r[DOG.STATUS - 1] = STATUS.FREE;
    r[DOG.WHO - 1] = '';
    r[DOG.TIME - 1] = '';
    sh.getRange(row, DOG.STATUS, 1, 3).setValues([[STATUS.FREE, '', '']]);
    return { dog: mapDogRow_(r) };
  });
}

/* ---------- AKCJE EDYCYJNE — chronione PIN-em (zwracają pełny stan) ---------- */

/** Wymusza: pies musi mieć imię LUB identyfikator (nowy pies bywa bez imienia). */
function dogFields_(data) {
  const name  = clean_(data && data.name,  MAX_LEN.NAME);
  const ident = clean_(data && data.ident, MAX_LEN.IDENT);
  const box   = clean_(data && data.box,   MAX_LEN.BOX);
  const note  = clean_(data && data.note,  MAX_LEN.NOTE);
  const walks = Number(data && data.walks) === 2 ? 2 : 1;
  if (!name && !ident) throw new Error('Podaj imię lub nr identyfikacyjny');
  return { name, ident, box, dif: validDif_(data && data.dif), note, walks };
}

/** data = { name, ident, box, dif } — wszystko opcjonalne poza regułą wyżej. */
function addDog(data, pin) {
  requirePin_(pin);
  const d = dogFields_(data);
  return withLock_(() => {
    const sh = ss_().getSheetByName(SHEETS.DOGS);
    sh.appendRow([nextId_(sh), d.name, d.ident, d.box, d.dif, STATUS.FREE, '', '', '', d.note, d.walks, '', '']);
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
      sh.getRange(row, DOG.NOTE, 1, 2).setValues([[d.note, d.walks]]);
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

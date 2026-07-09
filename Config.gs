/**
 * G13 Spacery — KONFIGURACJA.
 * Jedyne miejsce, które edytujesz przy zmianie PIN-u albo struktury arkusza.
 *
 * Zmiana struktury (nowa kolumna itp.):
 *   1. dopisz kolumnę tutaj (mapy DOG/TASK + nagłówki),
 *   2. uwzględnij ją w Setup.gs (setup/migrate),
 *   3. dopisz odczyt/zapis w Dogs.gs lub Tasks.gs.
 */

/** >>> USTAW PRZED WDROŻENIEM <<<  PIN trybu edycji. */
const PIN = '1234';   // <--- ZMIEŃ na własny PIN

/** Nazwy zakładek arkusza. */
const SHEETS = {
  DOGS:  'Psy',
  HIST:  'Historia',
  TASKS: 'Zadania',
};

/** Zakładka Psy — numery kolumn (1 = A). */
const DOG = {
  ID: 1, NAME: 2, IDENT: 3, BOX: 4, DIF: 5, STATUS: 6, WHO: 7, TIME: 8, LAST_WALK: 9,
  NOTE: 10,    // notatka na dziś (znika przy nocnym resecie)
  WALKS: 11,   // ile spacerów dziennie wymaga pies: 1 lub 2
  WHO1: 12,    // kto odbył PIERWSZY z dwóch spacerów
  TIME1: 13,   // o której odbył się pierwszy z dwóch spacerów
};
const DOG_HEADERS = ['id', 'imie', 'identyfikator', 'boks', 'trudnosc', 'status', 'kto', 'godzina',
  'ostatni_spacer', 'notatka', 'spacery', 'kto1', 'godzina1'];
const DOG_WIDTH = DOG_HEADERS.length;

/** Zakładka Zadania. */
const TASK = { ID: 1, TEXT: 2, DATE: 3, STATUS: 4 };
const TASK_HEADERS = ['id', 'tresc', 'data', 'status'];
const TASK_WIDTH = TASK_HEADERS.length;

/** Zakładka Historia. */
const HIST = { DATE: 1, DOG: 2, WHO: 3, TIME: 4 };
const HIST_HEADERS = ['data', 'pies', 'kto', 'godzina'];
const HIST_WIDTH = HIST_HEADERS.length;

/** Dozwolone statusy i trudności. */
const STATUS = { FREE: 'free', RESERVED: 'reserved', WALKED: 'walked' };
const DIFFICULTIES = ['easy', 'med', 'hard'];

/** Limity długości pól (obrona przed wklejeniem elaboratu). */
const MAX_LEN = { NAME: 40, IDENT: 20, BOX: 20, TASK: 120, NOTE: 80 };

/** Strefa czasowa aplikacji — musi zgadzać się z appsscript.json. */
const TIMEZONE = 'Europe/Warsaw';

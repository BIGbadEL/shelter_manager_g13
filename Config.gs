/**
 * G13 Spacery — KONFIGURACJA.
 * Jedyne miejsce, które edytujesz przy zmianie PIN-u albo struktury arkusza.
 *
 * Zmiana struktury (nowa kolumna itp.):
 *   1. dopisz kolumnę tutaj (mapy DOG/TASK + nagłówki),
 *   2. uwzględnij ją w Setup.gs (setup/migrate),
 *   3. dopisz odczyt/zapis w Dogs.gs lub Tasks.gs.
 */

/**
 * PIN trybu edycji NIE JEST W KODZIE — mieszka we właściwościach skryptu,
 * tak samo jak godzina resetu (patrz Settings.gs, `pin_()`).
 *
 * Ustawienie / zmiana, bez wdrażania i bez śladu w repozytorium:
 *   Apps Script -> Ustawienia projektu -> Właściwości skryptu
 *   -> właściwość `pin`, wartość = Twój PIN.
 *
 * Dopóki właściwość nie jest ustawiona, tryb edycji jest niedostępny
 * (`checkPin` zwraca false, akcje edycyjne rzucają błędem). Celowo nie ma tu
 * żadnej wartości domyślnej: każdy PIN wpisany w kod trafiłby do historii gita
 * i przestałby być tajemnicą w chwili pierwszego commita.
 */

/** Nazwy zakładek arkusza. */
const SHEETS = {
  DOGS:  'Psy',
  WALKS: 'Spacery',
  HIST:  'Historia',
  TASKS: 'Zadania',
};

/**
 * Zakładka Psy — KATALOG, czyli kim jest pies. Numery kolumn (1 = A).
 *
 * Kolumny STATUS, WHO, TIME, WHO1, TIME1 to pozostałość po modelu, w którym
 * arkusz znał tylko jeden dzień i trzymał go wprost w wierszu psa. Od
 * wprowadzenia dat stan dnia żyje w zakładce Spacery, a te kolumny czytamy
 * wyłącznie RAZ — przy jednorazowym przeniesieniu stanu (importDayState_).
 * Zostają w arkuszu, bo cofnięcie wdrożenia do starej wersji znów by ich użyło.
 */
const DOG = {
  ID: 1, NAME: 2, IDENT: 3, BOX: 4, DIF: 5,
  STATUS: 6, WHO: 7, TIME: 8,   // stary model — patrz wyżej
  LAST_WALK: 9,                 // data ostatniego spaceru (dopisuje ją nocne czyszczenie)
  NOTE: 10,       // notatka przy psie
  WALKS: 11,      // ile spacerów dziennie wymaga pies: 1 lub 2
  WHO1: 12,       // stary model — patrz wyżej
  TIME1: 13,      // stary model — patrz wyżej
  NOTE_UNTIL: 14, // do kiedy notatka ma przeżyć czyszczenie ('' = do najbliższego)
};
const DOG_HEADERS = ['id', 'imie', 'identyfikator', 'boks', 'trudnosc', 'status', 'kto', 'godzina',
  'ostatni_spacer', 'notatka', 'spacery', 'kto1', 'godzina1', 'notatka_do'];
const DOG_WIDTH = DOG_HEADERS.length;

/**
 * Zakładka Spacery — co się dzieje z psem KONKRETNEGO DNIA.
 * Jeden wiersz na parę (data, pies); brak wiersza = pies tego dnia wolny.
 * Trzyma wyłącznie dni otwarte (bieżący i przyszłe) — nocne czyszczenie
 * przenosi dni zamknięte do Historii, więc zakładka zostaje mała.
 */
const WALK = { DATE: 1, DOG: 2, STATUS: 3, WHO: 4, TIME: 5, WHO1: 6, TIME1: 7 };
const WALK_HEADERS = ['data', 'pies_id', 'status', 'kto', 'godzina', 'kto1', 'godzina1'];
const WALK_WIDTH = WALK_HEADERS.length;

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

/**
 * Termin notatki „nigdy" — notatka nie znika przy żadnym czyszczeniu, dopóki
 * ktoś jej ręcznie nie skasuje. Trzymamy go w kolumnie notatka_do jako słowo,
 * żeby w arkuszu czytało się to bez tłumaczenia. Interfejs zna tę samą wartość.
 */
const NOTE_FOREVER = 'nigdy';

/** Limity długości pól (obrona przed wklejeniem elaboratu). */
const MAX_LEN = { NAME: 40, IDENT: 20, BOX: 20, TASK: 120, NOTE: 80 };

/** Strefa czasowa aplikacji — musi zgadzać się z appsscript.json. */
const TIMEZONE = 'Europe/Warsaw';

/**
 * Ile ostatnich dni Historii dostaje przeglądarka na raz.
 * Arkusz trzyma komplet i nic z niego nie znika — to tylko granica tego,
 * co ma sens ładować na telefon. Minione dni przeglądane strzałką przychodzą
 * blokami tej samej długości (getHistoryDays), a getHistory zostaje dla kart
 * otwartych jeszcze przed wprowadzeniem dat.
 */
const HISTORY_DAYS = 14;

/**
 * Domyślna godzina nocnego czyszczenia listy (0–23).
 * To tylko wartość startowa — prowadząca zmienia ją z panelu w trybie edycji,
 * a wtedy zapisuje się w Script Properties (patrz Settings.gs).
 */
const DEFAULT_RESET_HOUR = 22;

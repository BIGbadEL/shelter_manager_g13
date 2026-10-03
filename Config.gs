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
 * Zakładka Spacery — co się dzieje z KONKRETNYM SPACEREM psa danego dnia.
 * Jeden wiersz na trójkę (data, pies, numer spaceru); brak wiersza = ten spacer
 * wolny i bez grupy. Pies na dwa spacery ma spacery 1 i 2 — każdy z własną
 * rezerwacją, własnym „wyprowadzony" i własną grupą (patrz SORTING.md).
 * Trzyma wyłącznie dni otwarte (bieżący i przyszłe) — nocne czyszczenie
 * przenosi dni zamknięte do Historii, więc zakładka zostaje mała.
 */
const WALK = {
  DATE: 1, DOG: 2,
  SLOT: 3,    // który to spacer psa tego dnia: 1, 2, … (dziś najwyżej tyle, ile `spacery` w Psy)
  STATUS: 4, WHO: 5, TIME: 6,
  GROUP: 7,   // numer grupy (spaceru grupowego) tego dnia; puste = spacer bez grupy
};
const WALK_HEADERS = ['data', 'pies_id', 'spacer', 'status', 'kto', 'godzina', 'grupa'];
const WALK_WIDTH = WALK_HEADERS.length;

/**
 * Poprzedni układ zakładki Spacery (wiersz na psa, drugi spacer w kto1/godzina1).
 * Czytany wyłącznie przy jednorazowym przepisaniu na układ ze spacerami
 * (ensureWalksLayout_ w Dogs.gs). Bez kolumny grupa — jeszcze starszy wariant.
 */
const WALK_V1 = { DATE: 1, DOG: 2, STATUS: 3, WHO: 4, TIME: 5, WHO1: 6, TIME1: 7, GROUP: 8 };

/**
 * Nazwa kopii zakładki Spacery w starym układzie, robionej tuż przed jej przepisaniem.
 * Poprzednia wersja kodu nie umie czytać nowego układu, więc bez kopii cofnięcie
 * wdrożenia nie miałoby do czego wrócić (procedura w README, „Cofnięcie wdrożenia").
 */
const WALKS_BACKUP = 'Spacery (stary układ)';

/**
 * Ile kolorów mają wolontariusze. Dzień przydziela je po kolei (bez powtórek, dopóki
 * starczy), a interfejs ma paletę dokładnie tej długości — pilnuje tego test.
 */
const VOLUNTEER_COLORS = 10;

/**
 * Sufity przydziału kolorów. Przydział dnia siedzi we właściwości skryptu, a właściwości
 * mają limity: 9 KB na wartość i 500 KB na wszystkie razem. Imię raz wpisane zostaje
 * w przydziale do końca dnia (także po zwolnieniu rezerwacji), a rezerwować można z
 * publicznego API na rok naprzód — bez sufitów da się zapchać właściwości, a wtedy nie
 * zapisze się nic, także znacznik układu Spacery. Ponad sufit: kolor „z imienia", bez zapisu.
 *  - VOLUNTEER_MAX — osób w przydziale jednego dnia (60 imion to ok. 3 KB),
 *  - VOLUNTEER_DAYS — dni z przydziałem naraz (nocne czyszczenie zapomina dni zamknięte,
 *    więc w zwykłym użyciu to kilka dni).
 * VOLUNTEER_MAX jest też w Script.html (VOL_MAX) — pilnuje tego test.
 */
const VOLUNTEER_MAX = 60;
const VOLUNTEER_DAYS = 31;

/** Zakładka Zadania. */
const TASK = { ID: 1, TEXT: 2, DATE: 3, STATUS: 4 };
const TASK_HEADERS = ['id', 'tresc', 'data', 'status'];
const TASK_WIDTH = TASK_HEADERS.length;

/**
 * Zakładka Historia. `grupa` — numer spaceru grupowego tego dnia (puste = bez grupy),
 * `identyfikator` — numer psa w chwili spaceru (zrzuty historii idą do władz schroniska;
 * numer ma przetrwać przemianowanie i usunięcie psa). Obie kolumny doszły później:
 * starsze wpisy ich nie mają, a starsza zakładka bywa węższa niż HIST_WIDTH — czytamy
 * najwyżej tyle kolumn, ile ma (histWidth_), a nocne czyszczenie dokłada brakujące (histColumns_).
 */
const HIST = { DATE: 1, DOG: 2, WHO: 3, TIME: 4, GROUP: 5, IDENT: 6 };
const HIST_HEADERS = ['data', 'pies', 'kto', 'godzina', 'grupa', 'identyfikator'];
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

/** Limity długości pól (obrona przed wklejeniem elaboratu). MAIL — treść maila z listą (właściwość skryptu). */
const MAX_LEN = { NAME: 40, IDENT: 20, BOX: 20, TASK: 120, NOTE: 80, MAIL: 2000 };

/**
 * Treść maila z listą spacerów dnia (schronisko chce listę psów z numerami i datą) — domyślna,
 * dopóki prowadząca nie ustawi własnej w panelu (właściwość `mailTemplate`, Settings.gs).
 * [DATA] — dzień (dd.mm.rrrr), [LISTA] — psy jako CSV: data, pies, numer. Po „Pozdrawiam,"
 * zostaje pusta linia na podpis.
 */
const DEFAULT_MAIL_TEMPLATE = 'Dzień dobry,\nPrzesyłam listę spacerową z [DATA] z grupy G13.\n[LISTA]\nPozdrawiam,\n';

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
 * Jak daleko do przodu wolno rezerwować i planować grupy. Bez granicy dałoby się
 * zapisać rok 9999 — taki wiersz jechałby do każdego telefonu w getData i nigdy by
 * się nie domknął. Rok z zapasem wystarcza na każde planowanie w schronisku.
 */
const MAX_DAYS_AHEAD = 365;

/**
 * Domyślna godzina nocnego czyszczenia listy (0–23).
 * To tylko wartość startowa — prowadząca zmienia ją z panelu w trybie edycji,
 * a wtedy zapisuje się w Script Properties (patrz Settings.gs).
 */
const DEFAULT_RESET_HOUR = 22;

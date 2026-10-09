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
  TEAM: 15,       // grupa wolontariuszy, do której należy pies ('' = nasza, HOME_TEAM) — patrz niżej
};
const DOG_HEADERS = ['id', 'imie', 'identyfikator', 'boks', 'trudnosc', 'status', 'kto', 'godzina',
  'ostatni_spacer', 'notatka', 'spacery', 'kto1', 'godzina1', 'notatka_do', 'grupa_psa'];
const DOG_WIDTH = DOG_HEADERS.length;

/**
 * Psy innych grup (1.3). Pomagamy wyprowadzać psy innych grup wolontariuszy, a żeby zapisy szły
 * przez aplikację, te psy stoją w naszym katalogu. Na liście dnia to osobna lista pod naszą,
 * sortowana osobno (SORTING.md). Kolumna `grupa_psa`: pusta = nasza grupa (HOME_TEAM) — tak
 * czytają się wszystkie psy sprzed tej kolumny; inna wartość = nazwa grupy, np. „G7". Doszła
 * później, więc zakładka bywa od niej węższa: czytamy najwyżej tyle kolumn, ile ma (dogWidth_),
 * a pierwszy zapis grupy dokłada kolumnę sam (dogColumns_). HOME_TEAM jest też w Script.html.
 */
const HOME_TEAM = 'G13';

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

/**
 * Ile ostatnich dodań psa pamięta serwer (token -> id, właściwość `dogAdds`). Powtórka tego
 * samego „Dodaj" przychodzi w ciągu sekund, więc dwadzieścia z dużym zapasem pokrywa nawet
 * dodawanie całej grupy psów pod rząd.
 */
const DOG_ADDS_KEEP = 20;

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

/**
 * Dozwolone statusy i trudności. TEAM (1.3) — spacer psa innej grupy bierze jego własna grupa
 * („Bierze G7"): psa nie musimy wyprowadzać, a spacer nie jest nasz — nie idzie do Historii
 * (markTeam w Dogs.gs, closeWalks_ w History.gs). `kto` = nazwa tej grupy.
 */
const STATUS = { FREE: 'free', RESERVED: 'reserved', WALKED: 'walked', TEAM: 'team' };
const DIFFICULTIES = ['easy', 'med', 'hard'];

/**
 * Termin notatki „nigdy" — notatka nie znika przy żadnym czyszczeniu, dopóki
 * ktoś jej ręcznie nie skasuje. Trzymamy go w kolumnie notatka_do jako słowo,
 * żeby w arkuszu czytało się to bez tłumaczenia. Interfejs zna tę samą wartość.
 */
const NOTE_FOREVER = 'nigdy';

/**
 * Limity długości pól (obrona przed wklejeniem elaboratu). MAIL, MAIL_TO, MAIL_SUBJECT — treść,
 * odbiorcy i temat maila z listą (właściwości skryptu; te same liczby w Script.html).
 */
const MAX_LEN = { NAME: 40, IDENT: 20, BOX: 20, TASK: 120, NOTE: 80, MAIL: 2000, MAIL_TO: 300, MAIL_SUBJECT: 150, TEAM: 20 };

/** Temat maila z listą spacerów — domyślny, dopóki prowadząca nie ustawi własnego (właściwość `mailSubject`). */
const DEFAULT_MAIL_SUBJECT = 'Lista spacerowa G13 z [DATA]';

/**
 * Treść maila z listą spacerów dnia (schronisko chce listę psów z numerami i datą) — domyślna,
 * dopóki prowadząca nie ustawi własnej w panelu (właściwość `mailTemplate`, Settings.gs).
 * [DATA] — dzień (dd.mm.rrrr), [LISTA] — psy jako CSV: data, pies, numer. Po „Pozdrawiam,"
 * zostaje pusta linia na podpis.
 */
const DEFAULT_MAIL_TEMPLATE = 'Dzień dobry,\nPrzesyłam listę spacerową z [DATA] z grupy G13.\n[LISTA]\nPozdrawiam,\n';

/**
 * Ankieta tygodniowa na WhatsAppie (1.2, Poll.gs) — „Grafik" w grupie wolontariuszy: raz w tygodniu,
 * w ustawionym dniu i godzinie, z wybranymi odpowiedziami. Domyślne ustawienia odwzorowują ankiety,
 * które prowadzący robił ręcznie (zrzuty z 27.09 i 5.10.2026): pytanie z tygodniem, dni tygodnia
 * i „Nie mogę", kilka odpowiedzi naraz. Wysyłanie wyłączone, dopóki prowadząca go nie włączy.
 * [TYDZIEŃ] — tydzień od poniedziałku do niedzieli, „28.09-04.10" albo „05-11.10" (pollWeekLabel_).
 * day: 0 = niedziela … 6 = sobota (jak getDay), hour: 0–23 (ankieta idzie między hour:00 a hour:30).
 */
const DEFAULT_POLL = {
  question: 'Grafik [TYDZIEŃ]',
  options: ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela', 'Nie mogę'],
  multi: true, day: 0, hour: 12, enabled: false, chatId: '', chatName: '',
};

/**
 * Limity ankiety. OPTION i OPTIONS_MAX — tyle przyjmuje bramka (Green API sendPoll: 2–12 odpowiedzi,
 * każda do 100 znaków, pytanie do 255). QUESTION z zapasem na rozwinięte [TYDZIEŃ]. Te same liczby
 * w Script.html — pilnuje tego test.
 */
const POLL_LIMITS = { QUESTION: 200, OPTION: 100, OPTIONS_MIN: 2, OPTIONS_MAX: 12 };

/**
 * Ile godzin po ustawionej godzinie ankieta tygodnia jeszcze idzie sama (wyzwalacz bywa spóźniony).
 * Później — już nie: ankieta w środę na „ten" tydzień nikomu się nie przyda, a sendWeeklyPoll jest
 * publiczne (wyzwalacz musi wołać funkcję bez „_") — poza tym oknem nikt nie wyśle nią niczego.
 */
const POLL_WINDOW_H = 3;

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

/**
 * Dziennik spowolnień (Diag.gs, Panel → „Dziennik spowolnień"). Wywołanie serwera dłuższe niż
 * DIAG_SLOW_MS trafia do dziennika z rozbiciem na kroki; telefony dosyłają, co same widziały
 * (reportDiag). Zwykle wywołanie trwa ~1–2 s (dziennik wykonań Google z 1–8.10.2026: połowa
 * do 1,7 s, 99% do 4,4 s), więc 3 s to już coś do obejrzenia, a nie codzienny szum.
 * Sufity, bo właściwość ma limit 9 KB na wartość: DIAG_KEEP wpisów na stronę (serwer, telefony),
 * DIAG_BYTES bajtów razem, DIAG_REPORT_MAX wpisów z telefonu na jedno wywołanie.
 */
const DIAG_SLOW_MS = 3000;
const DIAG_KEEP = 30;
const DIAG_BYTES = 8000;
const DIAG_REPORT_MAX = 10;

/**
 * G13 Spacery — SERWOWANIE STRONY I API ODCZYTU.
 * Funkcje bez sufiksu "_" są wywoływane z przeglądarki przez google.script.run.
 */

function doGet() {
  const page = HtmlService.createTemplateFromFile('Index');
  page.boot = bootJson_();
  return page.evaluate()
    .setTitle('Grupa G13 — spacery')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Stan startowy wpisany wprost w stronę (<script type="application/json" id="boot">).
 *
 * Bez tego telefon po załadowaniu strony musiał jeszcze raz zapytać serwer o dane —
 * a przelot google.script.run to na komórce nierzadko sekunda albo dwie, przez które
 * wisiało „Ładowanie…". Serwer i tak właśnie składa stronę, więc dorzucenie stanu
 * kosztuje ułamek drugiego przelotu. To STAN początkowy, nie wartość w szablonie
 * kafelka (patrz bug nr 7 w CLAUDE.md) — kafelki dalej rysuje przeglądarka.
 *
 * `<` zamieniamy na <, żeby żadne imię ani notatka nie zamknęły znacznika
 * <script>. Błąd odczytu nie może zablokować strony: wtedy `null`, a przeglądarka
 * pobiera stan zwykłą drogą.
 */
function bootJson_() {
  try {
    return JSON.stringify(getData()).replace(/</g, '\\u003c');
  } catch (e) {
    return 'null';
  }
}

/** Wkleja plik HTML do szablonu — używane w Index.html: <?!= include('Styles'); ?> */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Cały stan w jednym wywołaniu.
 *
 *  - `dogs`  — katalog psów ze stanem BIEŻĄCEGO dnia wpisanym w każdego psa:
 *              dokładnie ten kształt znają karty otwarte przed wprowadzeniem dat,
 *  - `walks` — wszystkie dni otwarte (bieżący i przyszłe), wiersz na parę (dzień, pies).
 *              Mała lista, a dzięki niej strzałka w przyszłość nie czeka na serwer,
 *  - `today` — data kalendarzowa (Europe/Warsaw) do odznak "od wczoraj" i terminów,
 *  - `businessDate` — bieżący dzień rezerwacyjny (od godziny resetu, nie od północy).
 */
function getData() {
  const date = businessDate_();
  const catalog = readDogCatalog_();
  const known = {};
  catalog.forEach(d => { known[d.id] = true; });
  const walks = readWalks_(walksSheet_()).filter(w => known[w.dogId] && hasWalkState_(w));
  const current = {};
  walks.forEach(w => { if (w.date === date) current[w.dogId] = w; });
  return {
    dogs: catalog.map(d => withWalk_(d, current[d.id])),
    walks: walks,
    tasks: readTasks_(),
    today: today_(),
    businessDate: date,
    resetHour: resetHour_(),
    env: env_(),
  };
}

/** Dane do panelu diagnostycznego (tylko tryb edycji — stąd PIN). */
function getDiagnostics(pin) {
  requirePin_(pin);
  const t = triggerInfo_();
  return {
    resetHour: resetHour_(),
    triggerInstalled: t.installed,
    triggerCount: t.count,
    timezone: tz_(),
    env: env_() || '(nieoznaczone — traktowane jak test)',
    serverTime: now_(),
    serverDate: today_(),
    businessDate: businessDate_(),
    dogCount: readDogs_().length,
    taskCount: readTasks_().length,
    histCount: histCount_(),      // komplet z arkusza, nie tylko widoczny wycinek
  };
}

/**
 * Ostatnie dni Historii naraz — dla kart otwartych jeszcze przed wprowadzeniem
 * dat, które mają zakładkę „Historia". Nowy interfejs pyta o konkretne dni
 * przez getHistoryDays.
 */
function getHistory() {
  return { history: readHistory_(), days: HISTORY_DAYS };
}

/**
 * Minione dni do podglądu (strzałka wstecz), od `from` do `to` włącznie.
 * Zakres przycinamy do dni faktycznie zamkniętych i do dwóch miesięcy naraz —
 * przeglądarka prosi o bloki po dwa tygodnie, więcej nie ma sensu ciągnąć na telefon.
 */
function getHistoryDays(from, to) {
  if (!isDate_(from) || !isDate_(to)) throw new Error('Nieprawidłowa data');
  const lastClosed = addDays_(businessDate_(), -1);
  const b = to < lastClosed ? String(to) : lastClosed;
  const floor = addDays_(b, -61);
  const a = from > floor ? String(from) : floor;
  return { history: a > b ? [] : readHistoryDays_(a, b) };
}

function checkPin(pin) {
  const real = pin_();
  return !!real && String(pin) === real;
}

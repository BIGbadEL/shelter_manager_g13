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
 *  - `dogs`  — katalog psów ze stanem BIEŻĄCEGO dnia wpisanym w każdego psa w starym
 *              kształcie (status/kto/kto1): tak czytają go karty otwarte przed
 *              wprowadzeniem dat i spacerów. Nowy interfejs bierze z niego tylko katalog,
 *  - `slots` — wszystkie spacery dni otwartych (bieżący i przyszłe): wiersz na trójkę
 *              (dzień, pies, numer spaceru), tylko te ze stanem. Mała lista, a dzięki
 *              niej strzałka w przyszłość nie czeka na serwer,
 *  - `volunteers` — kolory wolontariuszy dni otwartych: data -> {imię -> numer koloru},
 *  - `today` — data kalendarzowa (Europe/Warsaw) do odznak "od wczoraj" i terminów,
 *  - `businessDate` — bieżący dzień rezerwacyjny (od godziny resetu, nie od północy),
 *  - `mailTo`, `mailSubject`, `mailTemplate` — mail z listą spacerów dla schroniska (przycisk
 *              w minionym dniu, ustawiany w panelu). Odbiorca jest tu jawny dla każdego z linkiem,
 *              tak jak cała lista psów — to adres schroniska, nie osoby prywatnej.
 *
 * Pole `walks` (wiersz na psa) zniknęło razem ze starym układem — karta z wersji
 * z datami, ale sprzed spacerów, bez niego wraca do stanu bieżącego dnia z `dogs`.
 */
function getData() {
  const date = businessDate_();
  const catalog = readDogCatalog_();
  const known = {};
  catalog.forEach(d => { known[d.id] = true; });
  const slots = readSlots_(walksSheet_()).filter(s => known[s.dogId] && hasSlotState_(s));
  const today = {};
  slots.forEach(s => { if (s.date === date) (today[s.dogId] = today[s.dogId] || []).push(s); });
  return {
    dogs: catalog.map(d => legacyView_(d, today[d.id])),
    slots: slots,
    volunteers: volunteersOpen_(date),
    tasks: readTasks_(),
    today: today_(),
    businessDate: date,
    resetHour: resetHour_(),
    env: env_(),
    mailTemplate: mailTemplate_(),
    mailTo: mailTo_(),
    mailSubject: mailSubject_(),
  };
}

/**
 * Dane do panelu diagnostycznego (tylko tryb edycji — stąd PIN). `poll` — ankieta tygodniowa
 * (Poll.gs, bez tokenu bramki); jej awaria nie może zabrać panelu, więc wtedy `null`.
 */
function getDiagnostics(pin) {
  requirePin_(pin);
  const t = triggerInfo_();
  let poll = null;
  try { poll = pollPanel_(true); } catch (e) { poll = null; }
  return {
    poll: poll,
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

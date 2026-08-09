/**
 * G13 Spacery — SERWOWANIE STRONY I API ODCZYTU.
 * Funkcje bez sufiksu "_" są wywoływane z przeglądarki przez google.script.run.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Grupa G13 — spacery')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Wkleja plik HTML do szablonu — używane w Index.html: <?!= include('Styles'); ?> */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Cały stan dnia w jednym wywołaniu. `today` idzie z serwera, żeby odznaki
 * "od wczoraj" liczyły się w polskiej strefie niezależnie od telefonu.
 */
function getData() {
  return { dogs: readDogs_(), tasks: readTasks_(), today: today_(), resetHour: resetHour_() };
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
    serverTime: now_(),
    serverDate: today_(),
    dogCount: readDogs_().length,
    taskCount: readTasks_().length,
    histCount: histCount_(),      // komplet z arkusza, nie tylko widoczny wycinek
  };
}

/** `days` idzie z serwera, żeby interfejs nie musiał znać limitu drugi raz. */
function getHistory() {
  return { history: readHistory_(), days: HISTORY_DAYS };
}

function checkPin(pin) {
  const real = pin_();
  return !!real && String(pin) === real;
}

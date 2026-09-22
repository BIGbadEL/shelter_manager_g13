/**
 * G13 Spacery — USTAWIENIA APLIKACJI.
 *
 * Ustawienia siedzą w Script Properties, nie w arkuszu: są malutkie, a odczyt
 * jest natychmiastowy (nie kosztuje otwarcia zakładki przy każdym getData).
 *
 * Godzina czyszczenia listy jest jednocześnie godziną wyzwalacza `endOfDay`.
 * Zmiana z interfejsu MUSI więc przełożyć wyzwalacz — robi to setResetHour().
 */

const PROP_RESET_HOUR = 'resetHour';
const PROP_PIN = 'pin';
const PROP_ENV = 'env';

/**
 * Które to środowisko. Liczy się dokładnie jedna wartość: `prod`.
 *
 * Uwaga na kierunek tej flagi — jest odwrotnie, niż podpowiada odruch.
 * To PRODUKCJA musi się zadeklarować, a wszystko inne jest testem z urzędu.
 * Projekt testowy powstaje przez skopiowanie arkusza produkcyjnego i nie ma
 * własnych właściwości, więc gdyby to test musiał się oznaczać, zapomnienie
 * dawałoby środowisko testowe wyglądające jak produkcja — a wtedy ktoś kasuje
 * psa „na teście", który wcale nie jest testem. Przy tym kierunku zapomnienie
 * daje pasek ostrzegawczy na produkcji: widać od razu i nikomu to nie szkodzi.
 */
function env_() {
  return String(PropertiesService.getScriptProperties().getProperty(PROP_ENV) || '');
}

/**
 * PIN trybu edycji. Pusto = nie ustawiono, czyli tryb edycji niedostępny.
 * Świadomie bez wartości domyślnej — PIN wpisany w kod jest publiczny
 * od pierwszego commita (patrz komentarz w Config.gs).
 */
function pin_() {
  return String(PropertiesService.getScriptProperties().getProperty(PROP_PIN) || '');
}

/** Godzina nocnego resetu (0–23). Brak ustawienia = wartość domyślna z Config.gs. */
function resetHour_() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_RESET_HOUR);
  const h = Number(raw);
  return (raw !== null && Number.isInteger(h) && h >= 0 && h <= 23) ? h : DEFAULT_RESET_HOUR;
}

/** Waliduje godzinę podaną z interfejsu; rzuca błędem widocznym jako toast. */
function validHour_(hour) {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error('Godzina musi być z zakresu 0–23');
  return h;
}

/**
 * Ustawia godzinę czyszczenia i od razu przekłada wyzwalacz.
 * Zwraca pełny stan — interfejs odświeży nagłówek i stopkę.
 */
function setResetHour(hour, pin) {
  requirePin_(pin);
  const h = validHour_(hour);
  PropertiesService.getScriptProperties().setProperty(PROP_RESET_HOUR, String(h));
  installTriggers();        // wyzwalacz musi iść za ustawieniem, inaczej reset zostałby o starej porze
  return getData();
}

/** Stan wyzwalacza do panelu diagnostycznego — czy reset w ogóle jest uzbrojony. */
function triggerInfo_() {
  const n = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'endOfDay').length;
  return { installed: n > 0, count: n };
}

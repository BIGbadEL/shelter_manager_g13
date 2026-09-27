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
const PROP_WALKS_IMPORTED = 'walksImported';   // data jednorazowego przeniesienia stanu dnia z Psy do Spacery
const PROP_WALK_COLS = 'walkCols';             // szerokość zakładki Spacery, którą już sprawdziliśmy

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

/**
 * Bieżący DZIEŃ REZERWACYJNY — ten, na którym wolontariusze właśnie pracują.
 *
 * Granicą dnia jest godzina czyszczenia, nie północ: przed nią można jeszcze
 * rezerwować na dzień, który trwa, a po niej aplikacja od razu pracuje na
 * następnym. Przy resecie wieczornym (domyślne 22:00, u was 20:00):
 *   przed resetem -> dziś,   od resetu -> jutro.
 *
 * Przy resecie PORANNYM ta sama reguła byłaby błędna: reset o 6:00 kazałby
 * o 10:00 rezerwować psy na jutro przez cały dzień. Dlatego granicą jest
 * południe, tak jak dawniej przy archiwizacji — reset przed 12:00 zamyka
 * dzień POPRZEDNI:
 *   przed resetem -> wczoraj, od resetu -> dziś.
 *
 * Liczymy od `h:00`, choć wyzwalacz Google odpala się gdzieś w oknie
 * h:00–h:59. Dzień zmienia się punktualnie; nocne czyszczenie tylko domyka
 * zamknięty dzień, gdy dojdzie do niego kolej (patrz endOfDay w History.gs).
 */
function businessDate_() {
  const today = today_();
  const hour = Number(Utilities.formatDate(new Date(), tz_(), 'H'));
  const reset = resetHour_();
  if (reset >= 12) return hour >= reset ? addDays_(today, 1) : today;
  return hour >= reset ? today : addDays_(today, -1);
}

/** Waliduje godzinę podaną z interfejsu; rzuca błędem widocznym jako toast. */
function validHour_(hour) {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error('Godzina musi być z zakresu 0–23');
  return h;
}

/**
 * Ustawia godzinę czyszczenia i od razu przekłada wyzwalacz.
 * Zwraca pełny stan — interfejs odświeży nagłówek.
 *
 * Zmiana, która COFNĘŁABY dzień rezerwacyjny, jest odrzucana: przy resecie 20:00
 * o 21:00 lista pracuje na jutrze, a przestawienie na 8:00 wróciłoby do dziś —
 * dnia już zamkniętego i przeniesionego do Historii, który otworzyłby się od nowa.
 * Po nowej godzinie ta sama zmiana przechodzi bez cofania. Przeskok do przodu
 * (godzina, która dziś już minęła) jest dozwolony i Panel o nim uprzedza.
 */
function setResetHour(hour, pin) {
  requirePin_(pin);
  const h = validHour_(hour);
  const props = PropertiesService.getScriptProperties();
  return withLock_(() => {
    const before = businessDate_();
    const old = props.getProperty(PROP_RESET_HOUR);
    props.setProperty(PROP_RESET_HOUR, String(h));
    if (businessDate_() < before) {
      if (old === null) props.deleteProperty(PROP_RESET_HOUR); else props.setProperty(PROP_RESET_HOUR, old);
      throw new Error('Teraz ta zmiana cofnęłaby listę na dzień już zamknięty — ustaw ją po '
                      + String(h).padStart(2, '0') + ':00');
    }
    installTriggers();      // wyzwalacz musi iść za ustawieniem, inaczej reset zostałby o starej porze
    return getData();
  });
}

/** Stan wyzwalacza do panelu diagnostycznego — czy reset w ogóle jest uzbrojony. */
function triggerInfo_() {
  const n = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'endOfDay').length;
  return { installed: n > 0, count: n };
}

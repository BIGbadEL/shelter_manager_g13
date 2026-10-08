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
const PROP_WALKS_LAYOUT = 'walksLayout';       // zakładka Spacery sprawdzona: '2:<id zakładki>' (patrz ensureWalksLayout_)
const PROP_VOL_PREFIX = 'vol:';                // 'vol:2026-09-27' -> kolory wolontariuszy tego dnia (JSON)
const PROP_MAIL_TEMPLATE = 'mailTemplate';     // treść maila z listą spacerów (panel); brak = DEFAULT_MAIL_TEMPLATE
const PROP_MAIL_TO = 'mailTo';                 // odbiorcy tego maila, „a@b.pl, c@d.pl"; brak = wpisuje się w poczcie
const PROP_MAIL_SUBJECT = 'mailSubject';       // temat tego maila; brak = DEFAULT_MAIL_SUBJECT
const PROP_DOG_ADDS = 'dogAdds';               // ostatnie dodania psów z panelu {token: id} — patrz dogAdds_ w Dogs.gs
const PROP_POLL = 'poll';                      // ankieta tygodniowa (JSON, panel) — patrz Poll.gs
const PROP_POLL_SENT = 'pollSent';             // wysłane ankiety {'<grupa>|<poniedziałek>': {at, pending}} — każda raz
const PROP_POLL_LAST = 'pollLast';             // ostatnia próba wysłania (JSON) — do panelu
const PROP_DIAG_SERVER = 'diagServer';        // dziennik spowolnień: wolne wywołania serwera (JSON) — Diag.gs
const PROP_DIAG_PHONES = 'diagPhones';        // dziennik spowolnień: to, co dosłały telefony (reportDiag)
// Dostęp do bramki WhatsAppa (Green API) — ustawiane RĘCZNIE we właściwościach skryptu, jak PIN:
// nigdy w kodzie, nigdy w getData ani w odpowiedzi do przeglądarki (token daje pełny dostęp do konta).
const PROP_GREEN_URL = 'greenApiUrl';          // apiUrl instancji, np. https://7103.api.greenapi.com
const PROP_GREEN_ID = 'greenApiInstance';      // idInstance
const PROP_GREEN_TOKEN = 'greenApiToken';      // apiTokenInstance

/**
 * Wszystkie właściwości skryptu — czytane RAZ na wykonanie. Każde getProperty to
 * osobne wywołanie usługi z dziennym limitem, a getData leci co 15 s z każdego
 * telefonu i pyta o kilka z nich. Zmienne globalne żyją jedno wykonanie, więc
 * pamięć niczego nie przetrzymuje między żądaniami.
 */
let propsMemo_ = null;
function props_() {
  if (!propsMemo_) propsMemo_ = PropertiesService.getScriptProperties().getProperties() || {};
  return propsMemo_;
}
function prop_(k) { const v = props_()[k]; return v === undefined ? null : v; }
function setProp_(k, v) {
  PropertiesService.getScriptProperties().setProperty(k, String(v));
  if (propsMemo_) propsMemo_[k] = String(v);
}
function delProp_(k) {
  PropertiesService.getScriptProperties().deleteProperty(k);
  if (propsMemo_) delete propsMemo_[k];
}

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
  return String(prop_(PROP_ENV) || '');
}

/**
 * PIN trybu edycji. Pusto = nie ustawiono, czyli tryb edycji niedostępny.
 * Świadomie bez wartości domyślnej — PIN wpisany w kod jest publiczny
 * od pierwszego commita (patrz komentarz w Config.gs).
 */
function pin_() {
  return String(prop_(PROP_PIN) || '');
}

/** Godzina nocnego resetu (0–23). Brak ustawienia = wartość domyślna z Config.gs. */
function resetHour_() {
  const raw = prop_(PROP_RESET_HOUR);
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
  return withLock_(() => {
    const before = businessDate_();
    const old = prop_(PROP_RESET_HOUR);
    setProp_(PROP_RESET_HOUR, h);
    if (businessDate_() < before) {
      if (old === null) delProp_(PROP_RESET_HOUR); else setProp_(PROP_RESET_HOUR, old);
      throw new Error('Teraz ta zmiana cofnęłaby listę na dzień już zamknięty — ustaw ją po '
                      + String(h).padStart(2, '0') + ':00');
    }
    installTriggers();      // wyzwalacz musi iść za ustawieniem, inaczej reset zostałby o starej porze
    return getData();
  });
}

/** Treść maila z listą spacerów dnia — ustawiona w panelu albo domyślna (Config.gs). */
function mailTemplate_() {
  const t = prop_(PROP_MAIL_TEMPLATE);
  return t ? String(t) : DEFAULT_MAIL_TEMPLATE;
}

/** Odbiorcy maila z listą — ustawieni w panelu, „a@b.pl, c@d.pl"; '' = adres wpisuje się w poczcie. */
function mailTo_() { return String(prop_(PROP_MAIL_TO) || ''); }

/** Temat maila z listą — ustawiony w panelu albo domyślny (Config.gs). [DATA] podstawia przeglądarka. */
function mailSubject_() {
  const s = prop_(PROP_MAIL_SUBJECT);
  return s ? String(s) : DEFAULT_MAIL_SUBJECT;
}

/** Wszystkie trzy ustawienia maila naraz — tak oddaje je zapis i tak niesie je getData. */
function mailSettings_() {
  return { mailTo: mailTo_(), mailSubject: mailSubject_(), mailTemplate: mailTemplate_() };
}

/**
 * Treść maila z panelu: końce linii ujednolicone, [LISTA] obowiązkowa (mail bez listy psów nie
 * ma po co wychodzić), długość ograniczona (właściwości skryptu mają limit rozmiaru, B46).
 * '' = treść pusta, czyli domyślna.
 */
function mailBody_(text) {
  const t = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (!t.trim()) return '';
  if (t.length > MAX_LEN.MAIL) throw new Error('Treść maila jest za długa — najwyżej ' + MAX_LEN.MAIL + ' znaków');
  if (t.indexOf('[LISTA]') < 0) throw new Error('W treści musi zostać [LISTA] — w to miejsce trafia lista psów');
  return t;
}

/**
 * Odbiorcy z panelu: przecinki, średniki i spacje rozdzielają, wynik „a@b.pl, c@d.pl". Adres
 * idzie wprost do linku mailto:, więc dopuszczamy tylko zwykłe adresy — „?", „&", „#" czy „,"
 * w środku rozbiłyby link albo dopisały ukrytego odbiorcę, a „%" poczta odkodowuje („%41" to „A"),
 * więc mail poszedłby gdzie indziej, niż wpisano (review PR #5). '' = bez odbiorcy.
 */
function mailAddresses_(raw) {
  const list = String(raw == null ? '' : raw).split(/[\s,;]+/).filter(Boolean);
  const bad = list.filter(a => !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(a));
  if (bad.length) throw new Error('To nie wygląda na adres e-mail: ' + bad[0]);
  const s = list.join(', ');
  if (s.length > MAX_LEN.MAIL_TO) throw new Error('Za dużo odbiorców — najwyżej ' + MAX_LEN.MAIL_TO + ' znaków');
  return s;
}

/**
 * Zapisuje treść maila z panelu — dla kart otwartych jeszcze na 1.1.2 (sama treść). Nowy panel
 * zapisuje wszystko naraz przez setMailSettings. Idempotentna (RETRIABLE).
 */
function setMailTemplate(text, pin) {
  requirePin_(pin);
  const t = mailBody_(text);
  withLock_(() => { if (t) setProp_(PROP_MAIL_TEMPLATE, t); else delProp_(PROP_MAIL_TEMPLATE); });
  return { mailTemplate: mailTemplate_() };
}

/**
 * Ustawienia maila do schroniska z panelu (1.2): `{to, subject, body}`. Przycisk w minionym dniu
 * otwiera z nich aplikację pocztową (mailto:). Najpierw sprawdzamy wszystko, dopiero potem
 * zapisujemy — zły adres nie może zostawić nowej treści przy starym odbiorcy. Pusty temat
 * i treść = domyślne, pusty odbiorca = adres wpisuje się w poczcie. Idempotentna (RETRIABLE).
 */
function setMailSettings(settings, pin) {
  requirePin_(pin);
  const o = settings || {};
  const to = mailAddresses_(o.to);
  const subject = String(o.subject == null ? '' : o.subject).replace(/[\r\n]+/g, ' ').trim();
  if (subject.length > MAX_LEN.MAIL_SUBJECT) throw new Error('Temat jest za długi — najwyżej ' + MAX_LEN.MAIL_SUBJECT + ' znaków');
  const body = mailBody_(o.body);
  withLock_(() => {
    if (to) setProp_(PROP_MAIL_TO, to); else delProp_(PROP_MAIL_TO);
    if (subject) setProp_(PROP_MAIL_SUBJECT, subject); else delProp_(PROP_MAIL_SUBJECT);
    if (body) setProp_(PROP_MAIL_TEMPLATE, body); else delProp_(PROP_MAIL_TEMPLATE);
  });
  return mailSettings_();
}

/** Stan wyzwalacza do panelu diagnostycznego — czy reset w ogóle jest uzbrojony. */
function triggerInfo_() {
  const n = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'endOfDay').length;
  return { installed: n > 0, count: n };
}

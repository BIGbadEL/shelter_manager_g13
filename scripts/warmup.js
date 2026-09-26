// Otwiera aplikację zaraz po wdrożeniu — dokładnie tak, jakby ktoś kliknął link.
//
// Pierwszy dostęp do wersji z datami przenosi stan dnia ze starych kolumn Psy
// (importDayState_ w Dogs.gs) i dostaje datę dnia, który wtedy trwa. Ma się to
// stać TERAZ, w chwili wdrożenia — a nie dopiero przy nocnym czyszczeniu, gdy
// nikt nie otworzy linku, a dzień zdążył się przełamać. Przy kolejnych
// wdrożeniach to po prostu sprawdzenie, że strona się otwiera.
//
// Użycie: node scripts/warmup.js <deploymentId>
const id = process.argv[2];
if (!id) { console.error('Podaj identyfikator wdrożenia.'); process.exit(1); }
const url = `https://script.google.com/macros/s/${id}/exec`;

(async () => {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const body = await res.text();
    // strona aplikacji niesie nagłówek „Spacery"; strona logowania Google — nie
    if (!res.ok || !/Spacery/.test(body)) throw new Error(`HTTP ${res.status}, bez strony aplikacji`);
    console.log('Aplikacja otwarta po wdrożeniu: ' + url);
  } catch (e) {
    console.error('UWAGA: nie udało się otworzyć aplikacji po wdrożeniu (' + e.message + ').');
    console.error('Otwórz link ręcznie TERAZ, przed godziną czyszczenia: ' + url);
    process.exitCode = 1;   // nie process.exit(): tuż po fetch wywraca Node na Windows (asercja libuv)
  }
})();

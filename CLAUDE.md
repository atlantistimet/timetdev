@AGENTS.md

# Timeet Marketplace — istruzioni di lavoro

App per prenotare il tempo delle persone (solo 18+), società Atlantis S.r.l. Come è fatto il codice, come si avvia e cosa fa ogni funzione server: `README.md`. Le regole generali di Expo: `AGENTS.md` (qui sopra).
Lo stato dei lavori, le decisioni e le specifiche (strategia, fiscale, Team, check-in…) **non vanno mai nel repository, che è pubblico**. Stanno nel Project "TIMET / MIDNIGHT" su Claude e ne esiste una copia in locale nella cartella `docs-private/` (ignorata da git, creata da Nicolò sul suo Mac).
- **Leggi `docs-private/` prima di lavorare su una specifica**: parti da `timeet-stato-lavori.md`, che dice cosa è fatto, cosa manca e quali documenti valgono. Se un file non c'è, chiedi a Nicolò.
- **Non committare mai nulla di `docs-private/`** (è in `.gitignore`: controlla con `git status` prima di ogni commit) e non copiarne il contenuto in README, commenti nel codice, messaggi di commit o altri file tracciati.
- **`docs-private/` è la base dei documenti** (vale più della copia nel Project). A ogni lavoro chiuso aggiorna `docs-private/timeet-stato-lavori.md`: cosa è stato fatto, migrazioni applicate, decisioni prese, cosa resta. Se una specifica cambia, aggiorna il suo file. Non toccare gli altri.
- Se il documento di stato e il codice si contraddicono, dimmelo invece di scegliere.
- I documenti **già nel repository** (`README.md`, `CLAUDE.md`, `AGENTS.md`, `supabase/checks/`) si aggiornano invece su git, nello stesso commit del lavoro: per esempio la tabella delle migrazioni del README a ogni nuova migrazione. Sono pubblici: niente di riservato.

## Come lavora Nicolò (valgono sempre)
- **Rispondi in italiano.** I testi dell'app sono in italiano e l'inglese è la seconda lingua: ogni chiave nuova va in `src/i18n/locales/it.json` **e** `en.json`. Nessun testo scritto nel codice.
- **Cambi di grafica o di schermata: prima i disegni.** I disegni si decidono nella chat di strategia: se Nicolò passa un disegno approvato, segui quello e non inventare grafica. Se per una parte il disegno non c'è ancora, mostra almeno due ipotesi di mockup (cornice da telefono verticale, icone Tabler, niente emoji nei mockup, colori di `src/theme.ts`: lime `#E7FF67`, inchiostro `#151515`, fondo `#F2F2EF`) e implementa solo dopo la sua scelta.
- **Versione completa, non ridotta.** Se il disegno richiede campi o tabelle nuove, si fanno. Niente "per ora solo…".
- **Dopo ogni modifica dagli sempre i comandi completi per vederla**, in ordine: `cd ~/dev/timeet && git pull && npx expo start --dev-client` (poi `r` per ricaricare, `w` per il browser). Se cambiano librerie native o `app.json`: `npx expo prebuild --platform ios` e `npx expo run:ios --device`. Non chiedergli di applicare file a mano: lo fai tu.
- Non riproporgli di limitare i venditori ai soli con partita IVA: è deciso, tutti i tipi sono ammessi al lancio.
- Una sola cartella di lavoro: `~/dev/timeet` (repository `atlantistimet/timetdev`, ramo `main`). Niente copie altrove.

## Prima di dichiarare finito un lavoro
- `npx tsc --noEmit` e `npx eslint .` senza errori.
- Le regole ESLint attive includono: `react-hooks` (purezza, `rules-of-hooks`, `exhaustive-deps`), `static-components` (nessun componente definito dentro un altro), `set-state-in-effect`, variabili inutilizzate.
- Per le schermate: prova reale. Esporta il web (`npx expo export --platform web --output-dir <cartella temporanea>`), servilo e guardalo con uno screenshot a 390×844 prima di dire che funziona. Le rotte di prova temporanee vanno tolte prima del commit.
- Commit piccoli e in italiano, con il messaggio che spiega il perché.

## Database e segreti
- **Mai committare segreti** (il repository è pubblico). `.env` è ignorato; la service role key sta solo nelle edge functions.
- Le migrazioni stanno in `supabase/migrations`, numerate; la prossima libera è la **0041**. Prima di scriverne una, verifica il numero con `ls supabase/migrations`.
- **Applicare una migrazione in produzione solo dopo l'OK esplicito di Nicolò**, ogni volta. Per il token Supabase (`sbp_…`): chiedi il permesso ogni volta prima di usarlo, passalo solo come variabile d'ambiente, non stamparlo e non ripeterlo in chat né nei commit. Ricorda a Nicolò di revocarlo a fine lavoro.
- Applicazione via API di gestione: `POST https://api.supabase.com/v1/projects/eyhloxoknuqezjhbkzst/database/query` con `{"query": "..."}` e `Authorization: Bearer $TOKEN` (aggiungi un `User-Agent`).
- Stato verificato delle migrazioni: `supabase/checks/migrations_check.sql` (sola lettura, da incollare nel SQL Editor).
- Importi sempre in centesimi (integer); date sempre `timestamptz` (UTC). Le scritture di denaro passano solo dal server con service role.

## Trappole già incontrate
- Hermes (iPhone) non ha `Intl.RelativeTimeFormat`: usa solo `Intl.DateTimeFormat` e `NumberFormat`. Il tempo relativo è `timeAgo` in `src/lib/time.ts`.
- In questa versione di React Native `StyleSheet.absoluteFillObject` non esiste: usa `absoluteFill` o proprietà assolute esplicite.
- Reanimated 4: `useSharedValue` con `.set()` / `.get()`.
- Con Expo Router, senza `unstable_settings.initialRouteName` si apre la prima schermata dichiarata: in `(app)/_layout.tsx` è impostata su `(tabs)`.
- Le librerie si aggiungono con `npx expo install`, mai con `npm add`. Non eseguire `npm audit fix --force`.
- iPhone: una sola build alla volta (due `run:ios` insieme → "database is locked"); se la scelta del dispositivo dice "no matches" usa `--device 00008130-000A556E3E8B803A`. Una nuova funzione Apple in `app.json` (es. Associated Domains, notifiche push) va prima attivata sull'identificativo nel portale Apple (`world.timeet.dev` per lo sviluppo, `world.timeet` per l'app vera), altrimenti la firma fallisce.
- Due app, decise il 23 novembre 2026: `world.timeet` (nome `Timeet`, TestFlight e App Store, l'unica con i link `timeet.world`) e `world.timeet.dev` (nome `Timeet Dev`, sviluppo, si installa accanto). Si distinguono con `APP_VARIANT` in `app.config.ts` (senza variabile = sviluppo; `production` = app vera; la cartella `ios/` va rigenerata con `prebuild --clean` quando si cambia variante); dettagli nel README, «Expo, credenziali e identificativi dell'app». Per le notifiche push: Expo Push Service su iPhone e Android, Web Push sul web più avanti.
- Build iPhone, tre trappole (25-26 novembre 2026): (1) se `prebuild` si ferma con `Unicode Normalization not appropriate for ASCII-8BIT`, prefissa il comando con `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`; (2) se Xcode dice che il profilo «does not support the Push Notifications capability», il profilo locale è vecchio: `xcodebuild -workspace ios/TimeetDev.xcworkspace -scheme TimeetDev -configuration Debug -destination 'id=<dispositivo>' -allowProvisioningUpdates build` lo rigenera, poi `run:ios`; (3) schermate bianche con la rotella = l'app non raggiunge il server di sviluppo (rete cambiata o server spento): riavvia `npx expo start --dev-client` e ricollega l'app all'indirizzo che stampa.
- iOS 26 disegna da solo una fascia chiara sfocata sotto l'orologio dove il contenuto scorre: dentro le schede in basso va spenta sulla lista che scorre, e `Screen` lo fa con `ScrollViewMarker` di `react-native-screens/experimental` (solo iOS). Se una schermata nuova usa una `ScrollView` propria, avvolgila allo stesso modo. La parte alta trasparente (`TopFade`) usa `@react-native-masked-view/masked-view` (già nella build) e `expo-blur`; sul web usa una maschera CSS, su Android resta solo il velo.
- Chiavi e credenziali (file `.p8` di Apple, chiave di servizio Firebase, token): mai nel repository, mai incollate in chat e mai allegate con `@`: si indicano solo per percorso e si usano nel terminale di Nicolò. Il Key ID e il Team ID non sono segreti.
- Sito web: ogni push su `main` pubblica `timeet.world` su Vercel. Il DNS sta su Hostinger: non toccare i record della posta (MX, SPF, DKIM, DMARC, autodiscover/autoconfig).
- **Commit e push li fai tu** (deciso il 23 novembre 2026; le credenziali GitHub funzionano da qui). A ogni lavoro chiuso, con `tsc` ed `eslint` puliti: controlla `git status` (niente `docs-private/`, niente segreti), fai commit piccoli e poi `git push origin main`. Ogni push su `main` ripubblica `timeet.world` su Vercel: dillo a Nicolò nel riepilogo. Mai `push --force`, mai riscrivere la cronologia già pubblicata. Questo non cambia le altre regole: migrazioni in produzione solo con l'OK esplicito di Nicolò.
- L'app è firmata con il team Apple Developer di Atlantis srl (`4S9758D224`, in `app.json`): la firma dura un anno. Se l'iPhone ha ancora una copia installata con il team personale, va eliminata prima di reinstallare (vedi "Installare l'app su iPhone" nel README).

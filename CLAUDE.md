@AGENTS.md

# Timeet Marketplace — istruzioni di lavoro

App per prenotare il tempo delle persone (solo 18+), società Atlantis S.r.l. Come è fatto il codice, come si avvia e cosa fa ogni funzione server: `README.md`. Le regole generali di Expo: `AGENTS.md` (qui sopra).
Lo stato dei lavori, le decisioni e le specifiche non stanno in questo repository (è pubblico): stanno nel Project "TIMET / MIDNIGHT" su Claude. Se ti servono, chiedi a Nicolò.

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
- Le migrazioni stanno in `supabase/migrations`, numerate; la prossima libera è la **0040**. Prima di scriverne una, verifica il numero con `ls supabase/migrations`.
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
- L'app è firmata con il team Apple Developer di Atlantis srl (`4S9758D224`, in `app.json`): la firma dura un anno. Se l'iPhone ha ancora una copia installata con il team personale, va eliminata prima di reinstallare (vedi "Installare l'app su iPhone" nel README).

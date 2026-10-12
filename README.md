# Timeet Marketplace

App per prenotare il tempo delle persone (solo 18+). Un'unica base di codice per iOS, Android e web.

## Stack

- **App**: Expo (React Native, TypeScript), development build
- **Backend**: Supabase (database, login, storage, chat realtime, edge functions)
- **Pagamenti**: Stripe Connect (account Express per i venditori). Il cliente paga sul conto della piattaforma; a sessione conclusa il server trasferisce al venditore l'importo meno la commissione. Per le chiamate al minuto si blocca l'importo sulla carta (manual capture) e si incassano solo i minuti effettivi. Nessun wallet.
- **Videochiamate**: LiveKit
- **Lingue**: i18next + expo-localization, italiano e inglese dal lancio

## Struttura

```
src/app/                        schermate (Expo Router): ogni file è una route
  login, register, adult        accesso, registrazione, conferma maggiore età (visibili senza sessione / senza 18+)
  (app)/                        area protetta: raggiungibile solo con sessione e 18+ confermato
src/components/ui.tsx           componenti base (campi, pulsanti, checkbox, schermata)
src/i18n/                       configurazione lingue e file di traduzione (locales/it.json, en.json)
src/lib/supabase.ts             client Supabase
src/lib/auth.tsx                sessione e profilo (AuthProvider, useAuth)
src/lib/auth-errors.ts          errori di Supabase Auth → messaggi tradotti
supabase/migrations/0001_init.sql            schema iniziale (tabelle, vincoli, RLS, categorie)
supabase/migrations/0002_stripe_connect.sql  da Mangopay a Stripe Connect (pagamenti, trasferimenti, cursore chiamate)
```

## Avvio

```bash
npm install
cp .env.example .env     # inserisci URL e anon key del progetto Supabase
npm run web              # oppure npm run ios / npm run android
```

Le migrazioni in `supabase/migrations` si applicano in ordine dal SQL editor di Supabase o con la Supabase CLI (`supabase db push`). Sul progetto attuale sono già applicate la 0001 e la 0002.

## Login

- Registrazione e accesso con email e password. La registrazione richiede la dichiarazione di avere almeno 18 anni, salvata in `profiles.adult_confirmed_at`.
- Chi ha un account ma non ha dichiarato la maggiore età (per esempio chi entrerà con Apple o Google) passa dalla schermata `adult` prima di vedere l'app.
- Per ora la conferma email è **spenta** sul progetto Supabase (il mittente incluso è limitato a 2 email all'ora). Prima del lancio va riattivata insieme a un servizio SMTP proprio; l'app gestisce già il caso "controlla la tua email". Con la conferma attiva servono anche il Site URL e i Redirect URLs (`timeet://login-callback/`) in Authentication → URL Configuration.
- La dichiarazione 18+ è un'autodichiarazione: le azioni sensibili (prenotare, vendere) vanno controllate di nuovo lato server su `adult_confirmed_at`.

## Regole di progetto

- Nessun testo scritto nel codice: tutto passa dai file di traduzione. Per aggiungere una lingua basta un nuovo file in `src/i18n/locales` e una riga in `src/i18n/index.ts`.
- Importi sempre in centesimi (integer), date sempre `timestamptz` (UTC).
- Le scritture di denaro (prenotazioni, chiamate, movimenti) passano solo dal server con service role: per gli utenti ci sono solo policy di lettura.
- Ogni testo scritto dagli utenti porta la propria lingua; le traduzioni automatiche sono in cache nella tabella `content_versions`.
- Non committare mai chiavi segrete (`.env` è ignorato). La service role key va solo nelle edge functions.

## Prossimi passi tecnici

1. Account Stripe di Atlantis srl (modalità test), poi edge functions per account Express dei venditori, pagamenti e trasferimenti.
2. Prototipo LiveKit + Expo (chiamate in background, CallKit su iOS, webhook per il conteggio minuti).
3. Login con Apple e Google (servono gli account sviluppatore di Atlantis srl).
4. Prima del lancio: SMTP proprio e conferma email attiva; sessione in storage cifrato (oggi AsyncStorage).

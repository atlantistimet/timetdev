# Timeet Marketplace

App per prenotare il tempo delle persone (solo 18+). Un'unica base di codice per iOS, Android e web.

## Stack

- **App**: Expo (React Native, TypeScript), development build
- **Backend**: Supabase (database, login, storage, chat realtime, edge functions)
- **Pagamenti**: Mangopay (wallet per utente; la fonte di verità del saldo è Mangopay, il database ne tiene una copia)
- **Videochiamate**: LiveKit
- **Lingue**: i18next + expo-localization, italiano e inglese dal lancio

## Struttura

```
src/app/                        schermate (Expo Router): ogni file è una route
src/i18n/                       configurazione lingue e file di traduzione (locales/it.json, en.json)
src/lib/supabase.ts             client Supabase
supabase/migrations/0001_init.sql   schema iniziale (tabelle, vincoli, RLS, categorie)
```

## Avvio

```bash
npm install
cp .env.example .env     # inserisci URL e anon key del progetto Supabase
npm run web              # oppure npm run ios / npm run android
```

La migrazione `0001_init.sql` si applica dal SQL editor di Supabase o con la Supabase CLI (`supabase db push`).

## Regole di progetto

- Nessun testo scritto nel codice: tutto passa dai file di traduzione. Per aggiungere una lingua basta un nuovo file in `src/i18n/locales` e una riga in `src/i18n/index.ts`.
- Importi sempre in centesimi (integer), date sempre `timestamptz` (UTC).
- Le scritture di denaro (prenotazioni, chiamate, movimenti) passano solo dal server con service role: per gli utenti ci sono solo policy di lettura.
- Ogni testo scritto dagli utenti porta la propria lingua; le traduzioni automatiche sono in cache nella tabella `content_versions`.
- Non committare mai chiavi segrete (`.env` è ignorato). La service role key va solo nelle edge functions.

## Prossimi passi tecnici

1. Creare il progetto Supabase e applicare la migrazione.
2. Prototipo LiveKit + Expo (chiamate in background, CallKit su iOS, webhook per il conteggio minuti).
3. Login (email, Apple, Google) con conferma 18+.

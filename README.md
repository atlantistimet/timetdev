# Timeet Marketplace

App per prenotare il tempo delle persone (solo 18+). Un'unica base di codice per iOS, Android e web.

## Stack

- **App**: Expo (React Native, TypeScript), development build
- **Backend**: Supabase (database, login, storage, chat realtime, edge functions)
- **Pagamenti**: Stripe Connect con **addebiti diretti** (direct charges). Il cliente paga direttamente il venditore (PaymentIntent sull'account Stripe del venditore); Atlantis incassa solo la propria commissione (application fee) e fattura solo quella. Account dei venditori: Accounts v2, dashboard Express, commissioni Stripe a carico del venditore, saldi negativi a carico di Stripe, verifica d'identità raccolta da Stripe. Questa combinazione richiede oggi la versione API di anteprima `2026-09-30.preview` (la stabile `2026-09-30.endive` la rifiuta): da rivalutare prima del lancio. Per le chiamate al minuto si blocca l'importo sulla carta (manual capture) e si incassano solo i minuti effettivi. Nessun wallet, nessun trasferimento da parte nostra.
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
supabase/functions/             funzioni server (Deno): stripe-connect-onboarding, stripe-webhook, create-booking-payment, cancel-booking, expire-unpaid-bookings, _shared
supabase/migrations/0001_init.sql            schema iniziale (tabelle, vincoli, RLS, categorie)
supabase/migrations/0002_stripe_connect.sql  da Mangopay a Stripe Connect (pagamenti, cursore chiamate)
supabase/migrations/0003_direct_charges.sql  addebiti diretti: via i trasferimenti, commissione (application fee) sui pagamenti
supabase/migrations/0004_cancel_policies.sql policy di cancellazione a fasce decise dal venditore (standard: 100% fino a 48 h, 50% fino a 2 h, poi 0%)
supabase/migrations/0005_service_cancel_policy.sql policy di cancellazione per servizio (vuoto = predefinita del venditore)
supabase/migrations/0006_service_cancel_tiers.sql fasce di rimborso proprie di ogni offerta (sostituisce la 0005; vuoto = predefinita del venditore)
supabase/migrations/0007_offers.sql offerte con sconto, validità (giorni, periodo, giorni della settimana, fasce orarie), messaggio e fasce di rimborso proprie
supabase/migrations/0008_seller_busy.sql orari occupati di un venditore (solo intervalli, per chi prenota)
supabase/migrations/0009_service_places.sql luoghi dei servizi (online, nel luogo del venditore, a domicilio), costo spazio, vincoli
```

## Avvio

```bash
npm install
cp .env.example .env     # inserisci URL e anon key del progetto Supabase
npm run web              # oppure npm run ios / npm run android
```

Le migrazioni in `supabase/migrations` si applicano in ordine dal SQL editor di Supabase o con la Supabase CLI (`supabase db push`). Sul progetto attuale sono applicate la 0001–0009.

## Login

- Registrazione e accesso con email e password. La registrazione richiede la dichiarazione di avere almeno 18 anni, salvata in `profiles.adult_confirmed_at`.
- Chi ha un account ma non ha dichiarato la maggiore età (per esempio chi entrerà con Apple o Google) passa dalla schermata `adult` prima di vedere l'app.
- Per ora la conferma email è **spenta** sul progetto Supabase (il mittente incluso è limitato a 2 email all'ora). Prima del lancio va riattivata insieme a un servizio SMTP proprio; l'app gestisce già il caso "controlla la tua email". Con la conferma attiva servono anche il Site URL e i Redirect URLs (`timeet://login-callback/`) in Authentication → URL Configuration.
- La dichiarazione 18+ è un'autodichiarazione: le azioni sensibili (prenotare, vendere) vanno controllate di nuovo lato server su `adult_confirmed_at`.

## Funzioni Stripe (supabase/functions)

- `stripe-connect-onboarding`: chiamata dall'app con la sessione dell'utente (richiede 18+ dichiarato). `{action:'onboard'}` crea una sola volta l'account Stripe del venditore e restituisce il link all'onboarding ospitato; `{action:'refresh'}` rilegge lo stato da Stripe.
- `stripe-webhook`: due destinazioni Stripe, due segreti di firma. "Il tuo account" (payload Thin, eventi `v2.core.account...`) aggiorna `stripe_accounts`; "Account connessi" (payload Snapshot, `payment_intent.succeeded|payment_failed|canceled`) aggiorna `payments` e libera lo slot se il pagamento è annullato.
- `create-booking-payment`: l'app la chiama con la sessione dell'utente per prenotare uno slot; calcola le commissioni (`_shared/fees.ts`), crea la prenotazione e il PaymentIntent (addebito diretto con application fee), con luogo (online, sede, domicilio) ed extra di spazio o trasferta e restituisce il `client_secret`.
- `cancel-booking`: annulla una prenotazione (cliente o venditore) e rimborsa secondo le fasce congelate nella prenotazione (`bookings.cancel_tiers`); se annulla il venditore il rimborso è totale. Il rimborso include la quota proporzionale della commissione Timeet. `preview:true` restituisce solo l'importo.
- `expire-unpaid-bookings`: annulla (PaymentIntent e prenotazione) i pagamenti non completati dopo 15 minuti. Protetta dal segreto `CRON_SECRET` (header `x-cron-secret`), chiamata ogni 5 minuti da pg_cron. Il job non sta nelle migrazioni perché contiene il segreto; per ricrearlo (SQL Editor, con pg_net e pg_cron attivi):
  `select cron.schedule('expire-unpaid-bookings','*/5 * * * *', $$select net.http_post(url:='https://<ref>.supabase.co/functions/v1/expire-unpaid-bookings', headers:=jsonb_build_object('x-cron-secret','<CRON_SECRET>','Content-Type','application/json'), body:='{}'::jsonb)$$);`
- Segreti (Supabase → Edge Functions → Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `CRON_SECRET`; facoltativi `PUBLIC_PROFILE_BASE_URL` (default `https://timeet.world`), `STRIPE_API_VERSION`, `ONBOARDING_RETURN_URL`, `ONBOARDING_REFRESH_URL` (di prova puntano a localhost:8081).
- Funzioni pubblicate su Supabase e provate dal vivo sulla sandbox (onboarding, webhook, pagamento con carta di prova, scadenza). Stripe è chiamata via REST senza libreria. Le versioni API sono fissate in `_shared/stripe.ts`. Sono escluse da lint e typecheck dell'app (girano su Deno).

## Regole di progetto

- Nessun testo scritto nel codice: tutto passa dai file di traduzione. Per aggiungere una lingua basta un nuovo file in `src/i18n/locales` e una riga in `src/i18n/index.ts`.
- Importi sempre in centesimi (integer), date sempre `timestamptz` (UTC).
- Le scritture di denaro (prenotazioni, chiamate, movimenti) passano solo dal server con service role: per gli utenti ci sono solo policy di lettura.
- Ogni testo scritto dagli utenti porta la propria lingua; le traduzioni automatiche sono in cache nella tabella `content_versions`.
- Non committare mai chiavi segrete (`.env` è ignorato). La service role key va solo nelle edge functions.

## Prossimi passi tecnici

1. Stripe (sandbox `timeet-test` di Atlantis srl creata): attivare Connect, poi edge functions per onboarding dei venditori (Accounts v2, dashboard Express), PaymentIntent sull'account del venditore con `application_fee_amount`, cattura parziale per le chiamate al minuto, webhook. Da verificare in sandbox: commissione alla cattura parziale, pianificazione dei payout, carte salvate per account venditore.
2. Prototipo LiveKit + Expo (chiamate in background, CallKit su iOS, webhook per il conteggio minuti).
3. Login con Apple e Google (servono gli account sviluppatore di Atlantis srl).
4. Prima del lancio: SMTP proprio e conferma email attiva; sessione in storage cifrato (oggi AsyncStorage).

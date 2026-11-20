# Timeet Marketplace

App per prenotare il tempo delle persone (solo 18+). Un'unica base di codice per iOS, Android e web. Repository `atlantistimet/timetdev`, ramo `main`; sul Mac la cartella è `~/dev/timeet`.

> Lo **stato dei lavori** (cosa è fatto, cosa manca, decisioni, blocchi) non sta qui ma nel documento `timeet-stato-lavori` del progetto TIMET / MIDNIGHT su Claude. Questo README descrive solo come è fatto il codice e come si avvia. Ultimo aggiornamento: 20 novembre 2026.

## Stack

- **App**: Expo SDK 57 (React Native 0.86, TypeScript strict), Expo Router, development build (non Expo Go: ci sono moduli nativi per Stripe, LiveKit e WebRTC)
- **Backend**: Supabase (database, login, storage, chat realtime, edge functions, pg_cron)
- **Pagamenti**: Stripe Connect con **addebiti diretti** (direct charges). Il cliente paga direttamente il venditore (PaymentIntent sull'account Stripe del venditore); Atlantis incassa solo la propria commissione (application fee) e fattura solo quella. Account dei venditori: Accounts v2, dashboard Express, commissioni Stripe a carico del venditore, saldi negativi a carico di Stripe, verifica d'identità raccolta da Stripe. Questa combinazione richiede oggi la versione API di anteprima `2026-09-30.preview` (la stabile `2026-09-30.endive` la rifiuta): da rivalutare prima del lancio. Per le chiamate al minuto si blocca l'importo sulla carta (manual capture) e si incassano solo i minuti effettivi. Nessun wallet, nessun trasferimento da parte nostra.
- **Videochiamate**: LiveKit (nativo su iPhone, browser sul web)
- **Lingue**: i18next + expo-localization, italiano e inglese dal lancio
- **Web**: export statico (`npm run build:web` → `dist`), ospitato su Vercel (`vercel.json`), dominio `timeet.world`

## Struttura

```
src/app/                        schermate (Expo Router): ogni file è una route
  welcome, login, register,     accesso e registrazione (4 passi: nome, email, password, consensi), recupero password,
  forgot-password,              conferma maggiore età (visibili senza sessione / senza 18+)
  reset-password, adult
  terms-update                  nuova accettazione dei documenti legali quando cambia LEGAL_VERSION
  legal/[doc]                   lettore dei documenti legali (visibile anche senza sessione)
  (app)/                        area protetta: sessione, 18+ confermato e documenti accettati
    (tabs)/                     Esplora/feed, servizi, messaggi, prenotazioni, profilo
    service, s, o, p, u,        pagine di servizio, slot singolo (/s/<codice>), offerta, post, profilo pubblico
    book, session               prenotazione e pagina della sessione
    call, call-start            chiamate al minuto
    chat                        conversazioni
    my-services, service-edit,  strumenti del venditore: servizi, offerte, link "Slot singolo", disponibilità,
    my-offers, offer-edit,      policy di cancellazione, incassi
    slot-links, slot-link-edit,
    availability, policies,
    policy-edit, earnings
    new-post, notifications,    social e account: nuovo post, notifiche, collegamenti (follower/seguiti), profili bloccati,
    connections, blocked,       assistenza, privacy e legale, eliminazione account
    support, legal,
    privacy-consents,
    delete-account
src/components/                 componenti condivisi (ui.tsx, Pressable, SheetModal, TimeWheel, TimeRangeSheet,
                                AvailabilityPanel, CommentsSection, PostCard, ServiceCard, CallRoom, ...)
src/content/legal.ts            testi legali IT/EN, LEGAL_VERSION, dati dell'azienda (bozza da rivedere con un legale)
src/i18n/                       configurazione lingue e file di traduzione (locales/it.json, en.json)
src/lib/                        accesso ai dati e logica per area (auth, consents, booking, calls, chat, feed, explore,
                                availability, slots, offers, cancel-policy, notifications, safety, time, ...)
src/theme.ts                    colori, caratteri, useTheme()
supabase/checks/                controllo in sola lettura delle migrazioni applicate
plugins/withNoScriptSandbox.js  plugin di configurazione: disattiva il sandbox degli script di build di Xcode
supabase/functions/             funzioni server (Deno), vedi sotto
supabase/migrations/            schema del database, numerate in ordine
```

## Migrazioni (`supabase/migrations`, 0001–0040)

Si applicano in ordine dal SQL editor di Supabase o con la Supabase CLI (`supabase db push`). Le migrazioni non registrano il loro stato nel database quando si applicano dall'editor, quindi **questo README non può dire cosa è applicato sul progetto**: lo stato verificato è nel documento `timeet-stato-lavori`. Per verificare lo stato reale, incolla `supabase/checks/migrations_check.sql` nel SQL Editor di Supabase (sola lettura: dice per ogni migrazione 0026–0040 se i suoi oggetti esistono). Al 21 novembre 2026 risultano applicate in produzione tutte le migrazioni 0001–0039 (la 0026–0039 verificate con quella query, tutte ok); la **0040 è scritta ma non ancora applicata**. La prossima libera è la **0041**.

| Migrazione | Contenuto |
|---|---|
| 0001 `init` | schema iniziale: tabelle, vincoli, RLS, categorie |
| 0002 `stripe_connect` | da Mangopay a Stripe Connect (pagamenti, cursore chiamate) |
| 0003 `direct_charges` | addebiti diretti: via i trasferimenti, commissione sui pagamenti |
| 0004–0006 | policy di cancellazione a fasce (standard: 100% fino a 48 h, 50% fino a 2 h, poi 0%), per venditore e per servizio (0006 sostituisce la 0005) |
| 0007 `offers` | offerte con sconto, validità e fasce di rimborso proprie |
| 0008 `seller_busy` | orari occupati di un venditore (solo intervalli) |
| 0009 `service_places` | luoghi dei servizi (online, nel luogo del venditore, a domicilio), costo spazio |
| 0010 `service_photos` | foto dei servizi (bucket `service-media`, max 6) |
| 0011 `slot_links` | link per uno slot personalizzato, lettura per codice solo autenticati |
| 0012 `media_feed` | media e feed: bucket `media`, anteprima dei link, post con link |
| 0013 `booking_outcome` | esito della sessione e chiusura automatica dopo 24 ore (job `auto-complete-bookings`) |
| 0014 `comments` | commenti ai post |
| 0015 `exact_slots_session_page` | slot a orario preciso o immediato, richieste di fattura/ricevuta, mance |
| 0016 `calls` | chiamate al minuto: stato, scadenze, blocchi da 15 minuti, job `sweep-calls` ogni minuto |
| 0017 `weekly_availability` | disponibilità settimanale a periodo (generale, per servizio, per offerta), giorni chiusi, `available_windows` / `schedule_covers` |
| 0018 `instant_booking` | prenota ora |
| 0019 `soft_delete` | eliminazione di servizi, offerte e link senza perdere le prenotazioni |
| 0020 `notifications` | notifiche da trigger, job giornaliero `availability-expiry` |
| 0021 `review_reply` | risposta del venditore alle recensioni |
| 0022 `realtime_chat` | chat in tempo reale |
| 0023 `chat_media_block` | media in chat, blocco utenti, segnalazione messaggi |
| 0024 `tag_notifications` | notifiche dei tag |
| 0025 `author_tags` | l'autore aggiunge e toglie tag a un post pubblicato |
| 0026 `link_only_services` | slot personalizzato: servizi "solo-link" |
| 0027 `categories_stats` | categorie e sottocategorie, `profiles.is_admin`, statistiche del profilo |
| 0028 `avatars` | foto profilo (bucket `avatars`) |
| 0029 `call_extras` | chiamate: blocco di durata scelto, minuti aggiunti, recensione e mancia |
| 0030 `message_reactions` | reazioni ai messaggi |
| 0031 `chat_voice_docs` | messaggi vocali e documenti in chat (bucket `chat-media`) |
| 0032 `service_category` | categoria facoltativa per servizio |
| 0033 `auto_handle` | handle automatico `nome.cognome` |
| 0034 `post_review` | recensione ricondivisa in un post (anonima o pubblica) |
| 0035 `post_tag_role` | tag come menzione o collaboratore |
| 0036 `profile_link` | link in bio |
| 0037 `service_pricing` | modelli di prezzo: a blocchi o a tempo (`pricing`, `max_consecutive`, `max_duration_min`) |
| 0038 `safety_support` | segnalazioni, blocchi, assistenza (`support_tickets`), eliminazione account (`profiles.deleted_at`) |
| 0039 `legal_consents` | accettazioni dei documenti legali e consensi, con versione e data (`legal_acceptances`, `consent_prefs`, `consent_events`, funzioni `accept_legal` e `set_consent`) |
| 0040 `booking_checkin` | check-in con QR per le sessioni in presenza (`bookings.checked_in_at`, `checked_in_by`, `auto_no_show_at`), funzioni `checkin_status` / `checkin_booking` (solo service role), no-show automatico con correzione del venditore (`confirm_attended`) e contestazione del cliente (`dispute_no_show`) entro 24 ore, notifica `booking_no_show`, job `booking-checkin-sweep` |

## Avvio

```bash
npm install
cp .env.example .env     # URL e anon key del progetto Supabase, chiave pubblica Stripe
npm run web              # browser, oppure npm run ios / npm run android
```

Il file `.env` non è nel repository: tienine una copia in un gestore di password.

Dopo ogni aggiornamento del codice:

```bash
cd ~/dev/timeet && git pull && npx expo start --clear     # con la build di sviluppo già sul telefono: --dev-client; "r" per ricaricare
```

`npx expo run:ios --device` serve solo la prima volta o quando cambiano librerie native o `app.json`. Non eseguire `npm audit fix --force`.

### Installare l'app su iPhone

- Con l'account Apple gratuito ("Personal Team") la firma dell'app **scade dopo 7 giorni**: l'icona resta ma iOS dice che l'app non è più disponibile. Si risolve reinstallando con il cavo: `cd ~/dev/timeet && git pull && npx expo run:ios --device`. L'account Apple Developer a pagamento di Atlantis srl è attivo (Team ID `4S9758D224`, in `app.json`): con quello la firma dura un anno e si può usare TestFlight. Se l'app era stata installata con il team personale, va prima eliminata dal telefono.
- Se Xcode dice "No profiles for 'world.timeet.dev'": `cd ~/dev/timeet && xed ios`, poi target Timeet → Signing & Capabilities → "Automatically manage signing" e scegli **Atlantis srl**; quindi ▶ con l'iPhone selezionato (da Xcode il profilo viene creato; da Terminale `expo run:ios` non può).
- Al primo avvio, Impostazioni → Generali → VPN e gestione dispositivo → profilo sviluppatore → Autorizza. La Modalità sviluppatore deve essere attiva.
- La cartella `ios/` è generata (non è nel repository). Se manca o è vecchia: `npx expo prebuild --platform ios`. Il plugin `plugins/withNoScriptSandbox.js` (in `app.json`) spegne il sandbox degli script di Xcode, che altrimenti fa fallire la build con "Operation not permitted" su `ip.txt`.
- Regola Hermes: nel codice niente `Intl` oltre a `DateTimeFormat` e `NumberFormat`.

## Login e documenti legali

- Registrazione in quattro passi (nome, email, password, consensi) e accesso con email e password. La registrazione richiede la dichiarazione di avere almeno 18 anni (`profiles.adult_confirmed_at`), l'accettazione di Regole e termini e della privacy; la ricezione di novità e offerte è facoltativa e spenta.
- Chi ha un account ma non ha dichiarato la maggiore età passa dalla schermata `adult` prima di vedere l'app.
- Le accettazioni sono registrate con versione, lingua e data in `legal_acceptances`. Alzando `LEGAL_VERSION` in `src/content/legal.ts` tutti gli utenti vedono `/terms-update` al successivo accesso e devono accettare di nuovo. Impostazioni → Privacy e legale contiene i documenti e il centro consensi.
- I testi in `src/content/legal.ts` sono una **bozza** da far rivedere a un legale. Sede legale e partita IVA di Atlantis S.r.l. sono compilate in `COMPANY`.
- Per ora la conferma email è **spenta** sul progetto Supabase (il mittente incluso è limitato a 2 email all'ora). Prima del lancio va riattivata insieme a un servizio SMTP proprio; l'app gestisce già il caso "controlla la tua email". Con la conferma attiva servono anche il Site URL e i Redirect URLs (`https://timeet.world/**` e `timeet://**`) in Authentication → URL Configuration.
- La dichiarazione 18+ è un'autodichiarazione: le azioni sensibili (prenotare, vendere) vanno controllate di nuovo lato server su `adult_confirmed_at`.

## Funzioni Stripe (supabase/functions)

- `stripe-connect-onboarding`: chiamata dall'app con la sessione dell'utente (richiede 18+ dichiarato). `{action:'onboard'}` crea una sola volta l'account Stripe del venditore e restituisce il link all'onboarding ospitato; `{action:'refresh'}` rilegge lo stato da Stripe.
- `stripe-webhook`: due destinazioni Stripe, due segreti di firma. "Il tuo account" (payload Thin, eventi `v2.core.account...`) aggiorna `stripe_accounts`; "Account connessi" (payload Snapshot, `payment_intent.succeeded|payment_failed|canceled`) aggiorna `payments` e libera lo slot se il pagamento è annullato.
- `create-booking-payment`: l'app la chiama con la sessione dell'utente per prenotare uno slot; calcola le commissioni (`_shared/fees.ts`), crea la prenotazione e il PaymentIntent (addebito diretto con application fee), con luogo (online, sede, domicilio) ed extra di spazio o trasferta e restituisce il `client_secret`.
- `cancel-booking`: annulla una prenotazione (cliente o venditore) e rimborsa secondo le fasce congelate nella prenotazione (`bookings.cancel_tiers`); se annulla il venditore il rimborso è totale. Il rimborso include la quota proporzionale della commissione Timeet. `preview:true` restituisce solo l'importo. Dopo il check-in il cliente non può più annullare (`checked_in`); il venditore sì.
- `booking-checkin-token` e `booking-checkin`: check-in con QR delle sessioni in presenza (0040). Sede: mostra il venditore, scansiona il cliente; domicilio: il contrario. `booking-checkin-token` (chi mostra, `{booking_id}`) restituisce token, codice a 6 cifre, secondi alla rotazione e link `https://timeet.world/checkin/<booking>/<token>`; `booking-checkin` (chi arriva, `{booking_id, token}` oppure `{booking_id, code}`) verifica il token e registra il check-in. Token: HMAC-SHA256 di prenotazione + finestra di 60 s col segreto `CHECKIN_SECRET`, valgono la finestra corrente e la precedente; dopo 10 codici sbagliati il codice non si accetta più. Il check-in non muove denaro. Finestra: da 15 minuti prima dell'inizio alla fine.
- `create-package-payment`: pagamento unico di un pacchetto (addebito diretto con application fee). Il pagamento reale è ancora da provare.
- `create-tip-payment`: mancia a fine sessione o chiamata, anche con un tocco usando la carta salvata (commissione 5%, senza fisso).
- `delete-account`: eliminazione dell'account su richiesta dell'utente (profilo anonimizzato, contenuti nascosti, email liberata); rifiutata con prenotazioni future o una chiamata in corso.
- `call-action` e `sweep-calls`: chiamate al minuto (token LiveKit firmato dal server, avvio, risposta, aggiunta minuti, chiusura; `sweep-calls` chiude e incassa quelle scadute, una volta al minuto da pg_cron). Segreti `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `CRON_SECRET`.
- `expire-unpaid-bookings`: annulla (PaymentIntent e prenotazione) i pagamenti non completati dopo 15 minuti. Protetta dal segreto `CRON_SECRET` (header `x-cron-secret`), chiamata ogni 5 minuti da pg_cron. Il job non sta nelle migrazioni perché contiene il segreto; per ricrearlo (SQL Editor, con pg_net e pg_cron attivi):
  `select cron.schedule('expire-unpaid-bookings','*/5 * * * *', $$select net.http_post(url:='https://<ref>.supabase.co/functions/v1/expire-unpaid-bookings', headers:=jsonb_build_object('x-cron-secret','<CRON_SECRET>','Content-Type','application/json'), body:='{}'::jsonb)$$);`
- Segreti (Supabase → Edge Functions → Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `CRON_SECRET`, `CHECKIN_SECRET` (check-in, stringa casuale lunga); facoltativi `PUBLIC_PROFILE_BASE_URL` (default `https://timeet.world`), `STRIPE_API_VERSION`, `ONBOARDING_RETURN_URL`, `ONBOARDING_REFRESH_URL` (di prova puntano a localhost:8081).
- Funzioni pubblicate su Supabase e provate dal vivo sulla sandbox (onboarding, webhook, pagamento con carta di prova, scadenza). Stripe è chiamata via REST senza libreria. Le versioni API sono fissate in `_shared/stripe.ts`. Sono escluse da lint e typecheck dell'app (girano su Deno).

## Job pianificati (pg_cron)

| Job | Frequenza | Cosa fa |
|---|---|---|
| `expire-unpaid-bookings` | ogni 5 minuti | annulla i pagamenti non completati dopo 15 minuti |
| `sweep-calls` | ogni minuto | chiude e incassa le chiamate scadute o cadute |
| `auto-complete-bookings` | ogni 30 minuti | conclude le sessioni dopo 24 ore |
| `availability-expiry` | ogni giorno alle 7:00 UTC | avvisa i venditori la cui disponibilità sta per scadere |
| `booking-checkin-sweep` | ogni 5 minuti | in presenza: conclude a fine sessione quelle con check-in, segna assenti quelle pagate senza check-in 15 minuti dopo l'inizio (prenota ora: a fine sessione) |

I job che chiamano le funzioni contengono il segreto `CRON_SECRET` e per questo non sono creati dalle migrazioni dove serve il segreto (vedi `expire-unpaid-bookings`).

## Regole di progetto

- Nessun testo scritto nel codice: tutto passa dai file di traduzione. Per aggiungere una lingua basta un nuovo file in `src/i18n/locales` e una riga in `src/i18n/index.ts`.
- Importi sempre in centesimi (integer), date sempre `timestamptz` (UTC).
- Le scritture di denaro (prenotazioni, chiamate, movimenti) passano solo dal server con service role: per gli utenti ci sono solo policy di lettura.
- Ogni testo scritto dagli utenti porta la propria lingua; le traduzioni automatiche sono in cache nella tabella `content_versions`.
- Non committare mai chiavi segrete (`.env` è ignorato). La service role key va solo nelle edge functions.
- Prima di dichiarare finito un lavoro: `npx tsc --noEmit` e `npx expo lint` senza errori.

# Timeet Marketplace

App per prenotare il tempo delle persone (solo 18+). Un'unica base di codice per iOS, Android e web. Repository `atlantistimet/timetdev`, ramo `main`; sul Mac la cartella è `~/dev/timeet`.

> Lo **stato dei lavori** (cosa è fatto, cosa manca, decisioni, blocchi) non sta qui ma nel documento `timeet-stato-lavori` del progetto TIMET / MIDNIGHT su Claude. Questo README descrive solo come è fatto il codice e come si avvia. Ultimo aggiornamento: 23 novembre 2026.

## Stack

- **App**: Expo SDK 57 (React Native 0.86, TypeScript strict), Expo Router, development build (non Expo Go: ci sono moduli nativi per Stripe, LiveKit e WebRTC)
- **Backend**: Supabase (database, login, storage, chat realtime, edge functions, pg_cron)
- **Pagamenti**: Stripe Connect con **addebiti diretti** (direct charges). Il cliente paga direttamente il venditore (PaymentIntent sull'account Stripe del venditore); Atlantis incassa solo la propria commissione (application fee) e fattura solo quella. Account dei venditori: Accounts v2, dashboard Express, commissioni Stripe a carico del venditore, saldi negativi a carico di Stripe, verifica d'identità raccolta da Stripe. Questa combinazione richiede oggi la versione API di anteprima `2026-09-30.preview` (la stabile `2026-09-30.endive` la rifiuta): da rivalutare prima del lancio. Per le chiamate al minuto si blocca l'importo sulla carta (manual capture) e si incassano solo i minuti effettivi. Nessun wallet, nessun trasferimento da parte nostra.
- **Videochiamate**: LiveKit (nativo su iPhone, browser sul web)
- **Notifiche push** (deciso il 23 novembre 2026): iPhone e Android passano dall'**Expo Push Service** (token da `getExpoPushTokenAsync`, invio dal server a `https://exp.host/--/api/v2/push/send`, fino a 100 messaggi per richiesta); il web (sito e webapp) userà **Web Push** con chiavi VAPID, in un secondo momento. Il consenso `marketing_push` riguarda solo le promozioni: le notifiche di servizio (prenotazioni, messaggi, pagamenti) partono sempre. Stato: account Expo e credenziali Apple pronti (vedi «Expo, credenziali e identificativi dell'app»); tabella dei dispositivi (0042), registrazione del token nell'app e invio dal server (0043, `push-send`) sono fatti; mancano la prova su iPhone, l'interruttore nelle impostazioni e Android.
- **Lingue**: i18next + expo-localization, italiano e inglese dal lancio
- **Web**: export statico (`npm run build:web` → `dist`), ospitato su Vercel (`vercel.json`; progetto `timetdev` nel team Vercel «Timet», collegato a GitHub: ogni push su `main` pubblica il sito; variabili `EXPO_PUBLIC_*` impostate nel progetto). Dominio `timeet.world` (principale) e `www.timeet.world` (308 verso il principale), registrato su Hostinger: lì il record A `@` e il CNAME `www` puntano a Vercel, mentre i record della posta Hostinger (MX, SPF, DKIM, DMARC, autodiscover/autoconfig) restano com'erano. Online dal 21 novembre 2026.
- **Link che aprono l'app** (Universal Links): `public/.well-known/apple-app-site-association` (copiato in `dist` dall'export, servito come JSON da `vercel.json`) e `ios.associatedDomains` in `app.json` per `timeet.world` e `www.timeet.world`. Percorsi: `/checkin/*`, `/s/*`, `/u/*`, `/o/*`, `/p/*`, `/service/*`. Oggi nel file c'è l'app `4S9758D224.world.timeet.dev`; deciso il 23 novembre 2026: i link restano attivi **solo sull'app vera** (`world.timeet`), non sull'app di sviluppo, e il file va aggiornato quando l'app vera esiste (vedi «Expo, credenziali e identificativi dell'app»). Sull'identificativo dell'app nel portale Apple (Identifiers) deve essere attiva la funzione Associated Domains, altrimenti la build si ferma con «Provisioning Profile … does not support the Associated Domains capability». Provati il 21 novembre 2026: un link `https://timeet.world/u/…` toccato in Note apre l'app.

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
    book, session, checkin      prenotazione, pagina della sessione, link del QR del check-in (/checkin/<prenotazione>/<token>)
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
                                AvailabilityPanel, CommentsSection, PostCard, ServiceCard, CallRoom, ...);
                                settings.tsx = ritmo comune delle impostazioni (SettingsPage, Section, Group, GroupRow);
                                TopFade.tsx = parte alta trasparente e sfocata, usata da Screen e dalla chat
src/content/legal.ts            testi legali IT/EN, LEGAL_VERSION, dati dell'azienda (bozza da rivedere con un legale)
src/i18n/                       configurazione lingue e file di traduzione (locales/it.json, en.json)
src/lib/                        accesso ai dati e logica per area (auth, consents, booking, calls, chat, feed, explore,
                                availability, slots, offers, cancel-policy, notifications, safety, time, ...)
src/theme.ts                    colori, caratteri, useTheme()
supabase/checks/                controllo in sola lettura delle migrazioni applicate
plugins/withNoScriptSandbox.js  plugin di configurazione: disattiva il sandbox degli script di build di Xcode
app.config.ts                   configurazione dinamica sopra app.json: app vera o di sviluppo con APP_VARIANT
supabase/functions/             funzioni server (Deno), vedi sotto
supabase/migrations/            schema del database, numerate in ordine
```

## Migrazioni (`supabase/migrations`, 0001–0040 e 0042–0044)

Si applicano in ordine dal SQL editor di Supabase o con la Supabase CLI (`supabase db push`). Le migrazioni non registrano il loro stato nel database quando si applicano dall'editor, quindi **questo README non può dire cosa è applicato sul progetto**: lo stato verificato è nel documento `timeet-stato-lavori`. Per verificare lo stato reale, incolla `supabase/checks/migrations_check.sql` nel SQL Editor di Supabase (sola lettura: dice per ogni migrazione 0026–0044 se i suoi oggetti esistono). Al 21 novembre 2026 risultano applicate in produzione tutte le migrazioni 0001–0039 (la 0026–0039 verificate con quella query, tutte ok); la **0040** è applicata il 21 novembre 2026, con le funzioni `booking-checkin-token`, `booking-checkin` e la nuova `cancel-booking` pubblicate e il segreto `CHECKIN_SECRET` creato. La **0042** (dispositivi push) e la **0043** (invio push, con la funzione `push-send` pubblicata) sono applicate il 25 novembre 2026, la **0044** (scelte per categoria) il 26 novembre 2026. La **0041** è riservata a `seller_fiscal`; la prossima libera dopo la 0044 è la **0045**.

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
| 0042 `push_devices` | dispositivi per le notifiche push (`push_devices`, un token Expo per installazione; lettura solo dei propri; scrittura con `register_push_device` e `unregister_push_device`) |
| 0043 `push_trigger` | invio delle notifiche push: il segreto condiviso `CRON_SECRET` si copia in Vault (`cron_secret`) dal job che già lo usa, la funzione `notif_send_push` chiama `push-send` con `pg_net`, trigger `notifications_push_insert` e `notifications_push_message` (un nuovo messaggio aggiorna la notifica non letta); l'invio non blocca mai la creazione della notifica |
| 0044 `notification_prefs` | scelte sulle notifiche push per categoria (prenotazioni, messaggi, pagamenti e mance, chiamate perse, community, recensioni, disponibilità): tabella `notification_prefs` (lettura dei propri dati, senza riga la categoria è accesa) e funzione `set_push_category`; riguardano solo la push sul telefono, l'elenco Notifiche nell'app riceve sempre tutto |

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

- L'app è firmata con l'account Apple Developer di Atlantis srl (Team ID `4S9758D224`, in `app.json`): la firma dura un anno e si può usare TestFlight. Se sul telefono c'è ancora una copia installata con il team personale, va prima eliminata. Installazione con il cavo o in rete: `cd ~/dev/timeet && npx expo run:ios --device 00008130-000A556E3E8B803A` (l'identificativo dell'iPhone di prova; se la scelta del dispositivo dice "no matches", il telefono è bloccato o non raggiungibile: sbloccarlo, oppure passare l'identificativo come qui). `xcrun devicectl list devices` mostra i dispositivi visibili.
- Una build alla volta: due `run:ios` (o Xcode ▶) insieme falliscono con "database is locked". Fermare l'altra e rilanciare.
- Se la build dice "Provisioning Profile … does not support the … capability": attivare quella funzione sull'identificativo `world.timeet.dev` in developer.apple.com → Identifiers (oggi attiva: Associated Domains); se il profilo vecchio resta in memoria, toglierlo da `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` e rilanciare, così ne viene scaricato uno nuovo.
- Se Xcode dice "No profiles for 'world.timeet.dev'": `cd ~/dev/timeet && xed ios`, poi target Timeet → Signing & Capabilities → "Automatically manage signing" e scegli **Atlantis srl**; quindi ▶ con l'iPhone selezionato (da Xcode il profilo viene creato; da Terminale `expo run:ios` non può).
- Al primo avvio, Impostazioni → Generali → VPN e gestione dispositivo → profilo sviluppatore → Autorizza. La Modalità sviluppatore deve essere attiva.
- La cartella `ios/` è generata (non è nel repository). Se manca o è vecchia: `npx expo prebuild --platform ios`. Il plugin `plugins/withNoScriptSandbox.js` (in `app.json`) spegne il sandbox degli script di Xcode, che altrimenti fa fallire la build con "Operation not permitted" su `ip.txt`.
- Regola Hermes: nel codice niente `Intl` oltre a `DateTimeFormat` e `NumberFormat`.

### Expo, credenziali e identificativi dell'app

- **Account Expo**: organizzazione `atlantis_it` (proprietaria), progetto `timeet`. `owner` ed `extra.eas.projectId` sono in `app.json` (il `projectId` non è un segreto); `eas.json` ha i profili `development` e `production`. Per i comandi `eas`: `npx eas-cli@latest login` (accesso dal browser), poi `npx eas-cli@latest whoami`.
- **iPhone, chiave push**: su Apple è attiva la funzione Push Notifications su `world.timeet.dev`, senza Broadcast Capability (serve alle Live Activities; i messaggi a un gruppo si fanno inviando una notifica a ogni dispositivo dal server). La chiave APNs (`.p8`, ambiente Sandbox & Production) è caricata su Expo con `eas credentials` (iOS → production → Push Notifications → «Add a new push key», senza accedere ad Apple e rispondendo «no» a «Generate») e assegnata a `world.timeet.dev`. Il file `.p8` sta fuori dal repository e in un gestore di password (Apple ne consente 2 per account). Expo non ha potuto validare la chiave perché non è stato fatto l'accesso ad Apple: la validità si verifica con la prima push.
- **Android**: ancora da fare. Progetto Firebase con i pacchetti di entrambe le app, `google-services.json` indicato in `android.googleServicesFile`, chiave di servizio FCM v1 caricata su Expo con `eas credentials`. La chiave di servizio non va nel repository.
- **Due app (deciso il 23 novembre 2026)**: l'app vera, per TestFlight e App Store, ha identificativo `world.timeet` e nome `Timeet`; l'app di sviluppo, che si installa accanto, resta `world.timeet.dev` con nome `Timeet Dev` (stessi valori come `package` su Android). TestFlight e App Store sono la stessa app su App Store Connect, e l'identificativo non si cambia dopo averla creata. La differenza è gestita da `app.config.ts` (parte da `app.json`) con la variabile `APP_VARIANT`: `production` = app vera; `development` o nessuna variabile = app di sviluppo, come prima; qualunque altro valore ferma il comando con un errore, per evitare che un refuso produca la variante sbagliata. Cambiano nome, `ios.bundleIdentifier`, `android.package` e lo schema generato da `expo-dev-client` (solo sviluppo); schema `timeet`, `associatedDomains`, `owner` e `projectId` sono uguali nelle due varianti (da separarli quando l'app vera esiste e il file `apple-app-site-association` è aggiornato). La cartella `ios/` riflette sempre l'ultima variante generata, quindi la stessa variabile va su `prebuild` e `run`. Sviluppo, come sempre: `npx expo run:ios --device`. App vera: `APP_VARIANT=production npx expo prebuild --clean --platform ios`, poi Archive da Xcode (`xed ios`) e invio a TestFlight; per tornare allo sviluppo `npx expo prebuild --clean --platform ios` e `npx expo run:ios --device`. Controllo: `APP_VARIANT=production npx expo config --type public`. EAS Build (cloud) eviterebbe questo passaggio: secondo le pagine Expo del 2 novembre 2026 il piano gratuito include 15 build iOS al mese in coda a bassa priorità; non è ancora adottato.
- Le funzioni Apple (Associated Domains, Push Notifications) vanno attivate su **entrambi** gli identificativi, e la chiave push assegnata a ciascuno.
- Per ora le due app usano lo stesso progetto Supabase (produzione); un progetto di sviluppo separato è una decisione rimandata.

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
- `push-send`: invio di una notifica push a tutti i dispositivi di chi la riceve (0043). Chiamata dal database (trigger su `notifications`, via `pg_net`) con `CRON_SECRET` nell'header `x-cron-secret`, body `{id}`; salta le categorie spente dall'utente (`_shared/push-categories.ts`, allineato a `src/lib/push-prefs.ts`), compone il testo it/en (`_shared/push-texts.ts`, da tenere allineato a `notifications.kind` dell'app), manda a Expo Push Service con il badge delle non lette e cancella i token che rispondono `DeviceNotRegistered`. Le ricevute di Expo non si controllano ancora.
- `push-test`: notifica di prova, chiamata dall'app con la sessione dell'utente (impostazioni delle notifiche); manda una push ai soli dispositivi di chi la chiede, senza creare notifiche nell'app.
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
- Prima di dichiarare finito un lavoro: `npx tsc --noEmit` e `npx eslint .` senza errori.

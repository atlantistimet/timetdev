/**
 * Testi legali di Timeet. Sono BOZZE da far rivedere a un legale prima della pubblicazione.
 * Stanno qui, separati dal codice dell'app: per cambiare un testo basta modificare questo file;
 * per imporre una nuova accettazione si alza LEGAL_VERSION.
 */

export type Lang = 'it' | 'en';
type L = Record<Lang, string>;

export const LEGAL_VERSION = '1.0';
export const LEGAL_EFFECTIVE: L = { it: '7 novembre 2026', en: '7 November 2026' };

export const COMPANY = {
  name: 'Atlantis S.r.l.',
  // Da completare con i dati ufficiali prima della pubblicazione.
  address: '[indirizzo sede legale]',
  vat: '[partita IVA]',
  email: 'legal@timeet.world',
  privacyEmail: 'privacy@timeet.world',
};

export type LegalKey = 'terms' | 'privacy' | 'community' | 'seller' | 'info';
export type LegalSection = { title: L; body: L };
export type LegalDoc = { key: LegalKey; title: L; summary: L; sections: LegalSection[] };

const c = COMPANY;

export const legalDocs: LegalDoc[] = [
  {
    key: 'terms',
    title: { it: 'Termini di servizio', en: 'Terms of service' },
    summary: {
      it: 'Timeet è un marketplace per prenotare il tempo delle persone. Serve avere almeno 18 anni. Chi vende è responsabile del proprio servizio, Timeet gestisce piattaforma, pagamenti e assistenza.',
      en: 'Timeet is a marketplace for booking people’s time. You must be at least 18. Sellers are responsible for their own service; Timeet runs the platform, payments and support.',
    },
    sections: [
      {
        title: { it: '1. Chi siamo e cosa facciamo', en: '1. Who we are and what we do' },
        body: {
          it: `Timeet è un servizio di ${c.name} (${c.address}, P.IVA ${c.vat}). Mettiamo in contatto chi offre il proprio tempo (venditori) e chi lo prenota (clienti): slot, sessioni a tempo, pacchetti e chiamate a minuto. Non siamo parte del rapporto tra venditore e cliente: forniamo la piattaforma.`,
          en: `Timeet is a service of ${c.name} (${c.address}, VAT ${c.vat}). We connect people who offer their time (sellers) with people who book it (clients): slots, timed sessions, packages and per-minute calls. We are not a party to the agreement between seller and client: we provide the platform.`,
        },
      },
      {
        title: { it: '2. Requisiti e account', en: '2. Eligibility and account' },
        body: {
          it: 'Per usare Timeet devi avere almeno 18 anni e fornire dati veri. Sei responsabile del tuo account e della sua password. Un account è personale e non si può cedere. Possiamo sospendere gli account che violano questi termini o le regole della community.',
          en: 'To use Timeet you must be at least 18 and provide truthful information. You are responsible for your account and password. An account is personal and cannot be transferred. We may suspend accounts that breach these terms or the community rules.',
        },
      },
      {
        title: { it: '3. Prenotazioni e pagamenti', en: '3. Bookings and payments' },
        body: {
          it: 'I pagamenti sono gestiti da Stripe. Il prezzo mostrato è quello che paghi; la commissione di Timeet è a carico del venditore e indicata nelle Condizioni per i venditori. Le chiamate a minuto vengono addebitate in base alla durata effettiva. Le regole di cancellazione e rimborso sono quelle indicate dal venditore nel servizio, nei limiti di legge.',
          en: 'Payments are processed by Stripe. The price shown is the price you pay; Timeet’s fee is charged to the seller and described in the Seller terms. Per-minute calls are charged by actual duration. Cancellation and refund rules are those set by the seller on the service, within the limits of the law.',
        },
      },
      {
        title: { it: '4. Contestazioni', en: '4. Disputes' },
        body: {
          it: 'Se qualcosa non è andato come promesso puoi aprire una richiesta dall’app (Assistenza). Esaminiamo il caso e possiamo decidere un rimborso totale o parziale. Il diritto di recesso dei consumatori si applica nei limiti previsti per i servizi che iniziano prima della scadenza del termine, quando richiedi l’esecuzione immediata.',
          en: 'If something did not go as promised you can open a request from the app (Support). We review the case and may decide on a full or partial refund. Consumer withdrawal rights apply within the limits set for services that start before the withdrawal period ends, when you ask for immediate performance.',
        },
      },
      {
        title: { it: '5. Contenuti e licenza', en: '5. Content and licence' },
        body: {
          it: 'I contenuti che pubblichi restano tuoi. Ci concedi una licenza non esclusiva per mostrarli nell’app e nelle anteprime di condivisione. Garantisci di avere i diritti per pubblicarli. Rimuoviamo i contenuti segnalati che violano la legge o le regole della community.',
          en: 'Content you publish remains yours. You grant us a non-exclusive licence to display it in the app and in share previews. You guarantee you have the right to publish it. We remove reported content that breaches the law or the community rules.',
        },
      },
      {
        title: { it: '6. Responsabilità', en: '6. Liability' },
        body: {
          it: 'Il venditore risponde del proprio servizio. Timeet risponde dei danni causati da dolo o colpa grave e di quanto la legge non permette di escludere; negli altri casi la responsabilità è limitata all’importo pagato per la prenotazione interessata. Non garantiamo che l’app sia sempre disponibile senza interruzioni.',
          en: 'The seller is responsible for their service. Timeet is liable for damage caused by wilful misconduct or gross negligence and for anything the law does not allow us to exclude; otherwise liability is limited to the amount paid for the booking concerned. We do not guarantee the app is always available without interruption.',
        },
      },
      {
        title: { it: '7. Modifiche, legge applicabile', en: '7. Changes and governing law' },
        body: {
          it: 'Se cambiamo questi termini in modo rilevante ti avvisiamo e ti chiediamo di accettare la nuova versione. Si applica la legge italiana; per i consumatori resta il foro del loro luogo di residenza. Per scrivere a noi: ' + c.email + '.',
          en: 'If we change these terms materially we will tell you and ask you to accept the new version. Italian law applies; consumers keep the courts of their place of residence. Contact us at ' + c.email + '.',
        },
      },
    ],
  },
  {
    key: 'privacy',
    title: { it: 'Informativa privacy', en: 'Privacy policy' },
    summary: {
      it: 'Usiamo i tuoi dati per far funzionare Timeet: account, prenotazioni, pagamenti, chat e chiamate. Non vendiamo i tuoi dati. Puoi scaricarli o cancellarli quando vuoi.',
      en: 'We use your data to run Timeet: account, bookings, payments, chat and calls. We do not sell your data. You can download or delete it at any time.',
    },
    sections: [
      {
        title: { it: '1. Titolare del trattamento', en: '1. Data controller' },
        body: {
          it: `${c.name}, ${c.address}, P.IVA ${c.vat}. Contatto privacy: ${c.privacyEmail}.`,
          en: `${c.name}, ${c.address}, VAT ${c.vat}. Privacy contact: ${c.privacyEmail}.`,
        },
      },
      {
        title: { it: '2. Quali dati trattiamo', en: '2. What data we process' },
        body: {
          it: 'Dati dell’account (nome, email, lingua, data di conferma della maggiore età); profilo pubblico (foto, descrizione, servizi); prenotazioni, messaggi e recensioni; dati di pagamento gestiti da Stripe (noi non vediamo il numero della carta); dati tecnici (dispositivo, log, indirizzo IP); segnalazioni e richieste di assistenza.',
          en: 'Account data (name, email, language, date you confirmed being an adult); public profile (photo, bio, services); bookings, messages and reviews; payment data handled by Stripe (we never see your card number); technical data (device, logs, IP address); reports and support requests.',
        },
      },
      {
        title: { it: '3. Perché e su quale base', en: '3. Why and on what basis' },
        body: {
          it: 'Per eseguire il contratto: creare l’account, gestire prenotazioni, pagamenti, chat e chiamate. Per obbligo di legge: fatturazione, antiriciclaggio, richieste delle autorità, obblighi del Digital Services Act. Per legittimo interesse: sicurezza, prevenzione frodi, miglioramento del servizio. Con il tuo consenso: email e notifiche promozionali, che puoi revocare in ogni momento.',
          en: 'To perform the contract: create your account, manage bookings, payments, chat and calls. To comply with the law: invoicing, anti-money-laundering, authority requests, Digital Services Act duties. For legitimate interests: security, fraud prevention, improving the service. With your consent: promotional emails and notifications, which you can withdraw at any time.',
        },
      },
      {
        title: { it: '4. Con chi condividiamo i dati', en: '4. Who we share data with' },
        body: {
          it: 'Fornitori che trattano dati per nostro conto: Supabase (database e autenticazione), Stripe (pagamenti), LiveKit (chiamate audio e video), servizi di invio email e notifiche. Gli altri utenti vedono solo ciò che rendi pubblico o che serve alla prenotazione. Alcuni fornitori possono trattare dati fuori dallo Spazio Economico Europeo con garanzie adeguate (clausole contrattuali standard).',
          en: 'Providers processing data on our behalf: Supabase (database and authentication), Stripe (payments), LiveKit (audio and video calls), email and notification services. Other users only see what you make public or what a booking requires. Some providers may process data outside the European Economic Area with appropriate safeguards (standard contractual clauses).',
        },
      },
      {
        title: { it: '5. Per quanto tempo', en: '5. How long we keep it' },
        body: {
          it: 'Finché hai un account. Se lo elimini, anonimizziamo il profilo e cancelliamo i dati non necessari; conserviamo per il tempo richiesto dalla legge i dati contabili e fiscali e quelli utili a difendere un diritto in giudizio. Le prove di accettazione dei termini e dei consensi sono conservate per dimostrare di aver rispettato la legge.',
          en: 'While you have an account. If you delete it, we anonymise your profile and erase data that is no longer needed; we keep accounting and tax data for the period required by law, and data needed to defend legal claims. Records of your acceptance of terms and consents are kept to show we complied with the law.',
        },
      },
      {
        title: { it: '6. I tuoi diritti', en: '6. Your rights' },
        body: {
          it: `Puoi accedere ai tuoi dati, correggerli, cancellarli, limitarne l’uso, opporti, ottenerne una copia portabile e revocare i consensi. Dall’app: Impostazioni → Privacy e consensi. Oppure scrivi a ${c.privacyEmail}. Hai anche il diritto di reclamo al Garante per la protezione dei dati personali.`,
          en: `You may access, correct, erase, restrict, object to, and port your data, and withdraw consents. In the app: Settings → Privacy and consents. Or write to ${c.privacyEmail}. You also have the right to lodge a complaint with your data protection authority.`,
        },
      },
      {
        title: { it: '7. Minori', en: '7. Minors' },
        body: {
          it: 'Timeet è riservato a persone di almeno 18 anni. Se scopriamo che un account appartiene a un minore lo chiudiamo.',
          en: 'Timeet is for people aged 18 or over. If we find an account belongs to a minor we close it.',
        },
      },
    ],
  },
  {
    key: 'community',
    title: { it: 'Regole della community', en: 'Community rules' },
    summary: {
      it: 'Rispetto, onestà e sicurezza. Timeet è per vendere e comprare tempo: niente servizi sessuali, niente molestie, niente raggiri. Se qualcosa non va, segnalalo.',
      en: 'Respect, honesty and safety. Timeet is for buying and selling time: no sexual services, no harassment, no scams. If something is wrong, report it.',
    },
    sections: [
      {
        title: { it: '1. Rispetto e sicurezza', en: '1. Respect and safety' },
        body: {
          it: 'Tratta le persone con rispetto. Vietati molestie, minacce, discriminazione, incitamento all’odio e pressioni per spostare la conversazione o il pagamento fuori da Timeet.',
          en: 'Treat people with respect. Harassment, threats, discrimination, hate speech and pressure to move the conversation or payment off Timeet are not allowed.',
        },
      },
      {
        title: { it: '2. Contenuti vietati', en: '2. Prohibited content' },
        body: {
          it: 'Contenuti illegali, violenti, sessualmente espliciti o che sfruttano minori; spam e truffe; furto d’identità; contenuti che violano diritti altrui; informazioni personali di terzi pubblicate senza consenso.',
          en: 'Illegal, violent or sexually explicit content, or content exploiting minors; spam and scams; impersonation; content infringing others’ rights; personal information of third parties posted without consent.',
        },
      },
      {
        title: { it: '3. Servizi consentiti', en: '3. Allowed services' },
        body: {
          it: 'Puoi offrire il tuo tempo per consulenze, lezioni, compagnia, coaching, ascolto, attività e altro, purché legale e descritto onestamente. Non sono ammessi servizi sessuali o di natura erotica, servizi che richiedono licenze che non possiedi, né consigli medici o legali presentati come sostitutivi di un professionista abilitato.',
          en: 'You may offer your time for consulting, lessons, company, coaching, listening, activities and more, as long as it is lawful and honestly described. Sexual or erotic services are not allowed, nor services requiring licences you do not hold, nor medical or legal advice presented as a substitute for a licensed professional.',
        },
      },
      {
        title: { it: '4. Recensioni oneste', en: '4. Honest reviews' },
        body: {
          it: 'Le recensioni si scrivono solo dopo un’esperienza vera. Vietato comprare, scambiare o falsificare recensioni, e recensire per vendetta o ricatto.',
          en: 'Reviews are written only after a real experience. Buying, swapping or faking reviews, and reviewing out of revenge or blackmail, are not allowed.',
        },
      },
      {
        title: { it: '5. Come segnaliamo e interveniamo', en: '5. How we act on reports' },
        body: {
          it: 'Puoi segnalare profili, post, commenti, recensioni e messaggi dal menu ⋯ o da “Segnala”. Esaminiamo ogni segnalazione e possiamo rimuovere contenuti, limitare o sospendere account e, nei casi gravi, avvisare le autorità. Ti spieghiamo la decisione e puoi chiederne il riesame dall’Assistenza.',
          en: 'You can report profiles, posts, comments, reviews and messages from the ⋯ menu or “Report”. We review every report and may remove content, restrict or suspend accounts and, in serious cases, notify the authorities. We explain our decision and you can ask for a review through Support.',
        },
      },
    ],
  },
  {
    key: 'seller',
    title: { it: 'Condizioni per i venditori', en: 'Seller terms' },
    summary: {
      it: 'Chi vende su Timeet è un professionista o un privato che offre il proprio tempo: è responsabile di prezzi, fisco e qualità. Timeet trattiene una commissione e paga tramite Stripe.',
      en: 'Anyone selling on Timeet is a professional or private individual offering their time: they are responsible for prices, taxes and quality. Timeet keeps a fee and pays out through Stripe.',
    },
    sections: [
      {
        title: { it: '1. Requisiti', en: '1. Requirements' },
        body: {
          it: 'Maggiore età, account verificato su Stripe Connect e dati veri. Sei tu a decidere cosa offri, a che prezzo e quando.',
          en: 'Adult, account verified on Stripe Connect, truthful information. You decide what you offer, at what price and when.',
        },
      },
      {
        title: { it: '2. Commissioni e pagamenti', en: '2. Fees and payouts' },
        body: {
          it: 'Timeet trattiene una commissione su ogni vendita, mostrata prima di pubblicare un servizio. I pagamenti ti vengono accreditati tramite Stripe secondo i tempi di Stripe.',
          en: 'Timeet keeps a fee on each sale, shown before you publish a service. Payouts are credited to you through Stripe on Stripe’s schedule.',
        },
      },
      {
        title: { it: '3. Fisco e obblighi', en: '3. Taxes and duties' },
        body: {
          it: 'Sei responsabile dei tuoi obblighi fiscali, contributivi e di eventuali autorizzazioni. Timeet non è tuo datore di lavoro né tuo agente.',
          en: 'You are responsible for your tax, social contribution and any licensing duties. Timeet is not your employer or agent.',
        },
      },
      {
        title: { it: '4. Qualità e cancellazioni', en: '4. Quality and cancellations' },
        body: {
          it: 'Presenta il servizio in modo onesto, rispetta gli orari e le politiche di cancellazione che scegli. Cancellazioni ripetute o servizi non erogati possono portare a sospensione e rimborsi a tuo carico.',
          en: 'Describe the service honestly, keep to the times and cancellation policies you choose. Repeated cancellations or undelivered services may lead to suspension and refunds charged to you.',
        },
      },
    ],
  },
  {
    key: 'info',
    title: { it: 'Informazioni legali', en: 'Legal information' },
    summary: {
      it: 'Chi gestisce Timeet e come contattarci.',
      en: 'Who runs Timeet and how to contact us.',
    },
    sections: [
      {
        title: { it: 'Società', en: 'Company' },
        body: {
          it: `${c.name}\nSede legale: ${c.address}\nP.IVA: ${c.vat}\nContatti: ${c.email}`,
          en: `${c.name}\nRegistered office: ${c.address}\nVAT: ${c.vat}\nContact: ${c.email}`,
        },
      },
      {
        title: { it: 'Segnalazioni (Digital Services Act)', en: 'Reports (Digital Services Act)' },
        body: {
          it: 'Punto di contatto per autorità e utenti ai sensi del Regolamento (UE) 2022/2065: ' + c.email + '. I contenuti illegali si segnalano dall’app.',
          en: 'Point of contact for authorities and users under Regulation (EU) 2022/2065: ' + c.email + '. Report illegal content from the app.',
        },
      },
      {
        title: { it: 'Risoluzione delle controversie online', en: 'Online dispute resolution' },
        body: {
          it: 'I consumatori UE possono rivolgersi agli organismi di risoluzione alternativa delle controversie indicati dalla Commissione europea.',
          en: 'EU consumers may use the alternative dispute resolution bodies listed by the European Commission.',
        },
      },
    ],
  },
];

export function getLegalDoc(key: string): LegalDoc | undefined {
  return legalDocs.find((d) => d.key === key);
}

/** Documenti da accettare esplicitamente. */
export const ACCEPTED_DOCS = ['terms', 'community', 'privacy'] as const;

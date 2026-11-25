// Testi delle notifiche push (it/en). Sono gli stessi di `notifications.kind` nell'app (src/i18n/locales): se cambiano là, vanno aggiornati anche qui.
type Lang = 'it' | 'en';

const TEXTS: Record<Lang, Record<string, string>> = {
  it: {
    booking_new: '{{name}} ha prenotato «{{title}}» per {{date}}.',
    package_new: '{{name}} ha acquistato il pacchetto «{{title}}».',
    booking_cancelled: '{{name}} ha annullato «{{title}}» del {{date}}.',
    tip: '{{name}} ti ha lasciato una mancia di {{amount}}.',
    message: '{{name}} ti ha scritto ({{count}}).',
    comment: '{{name}} ha commentato il tuo post: «{{snippet}}»',
    follow: '{{name}} ha iniziato a seguirti.',
    review: '{{name}} ti ha lasciato una recensione ({{rating}}/5).',
    call_missed: 'Chiamata persa da {{name}} per «{{title}}».',
    availability_expiring: 'La tua disponibilità scade il {{date}}: rinnovala per restare prenotabile.',
    tag_request: '{{name}} ti ha taggato in un post.',
    review_reply: '{{name}} ha risposto alla tua recensione: «{{snippet}}»',
    tag_accepted: '{{name}} ha accettato il tag nel tuo post.',
    review_shared: '{{name}} ha ricondiviso la tua recensione in un post. Vuoi restare anonimo o mostrarti con nome e foto?',
    booking_no_show_seller: '{{name}} risulta assente a «{{title}}» del {{date}}: nessun check-in. Se c\'era, correggi entro 24 ore.',
    booking_no_show_client: 'Risulti assente a «{{title}}» del {{date}}: nessun check-in. Se c\'eri, contesta entro 24 ore.',
  },
  en: {
    booking_new: '{{name}} booked "{{title}}" for {{date}}.',
    package_new: '{{name}} bought the "{{title}}" package.',
    booking_cancelled: '{{name}} cancelled "{{title}}" on {{date}}.',
    tip: '{{name}} left you a {{amount}} tip.',
    message: '{{name}} wrote to you ({{count}}).',
    comment: '{{name}} commented on your post: "{{snippet}}"',
    follow: '{{name}} started following you.',
    review: '{{name}} left you a review ({{rating}}/5).',
    call_missed: 'Missed call from {{name}} for "{{title}}".',
    availability_expiring: 'Your availability ends on {{date}}: renew it to stay bookable.',
    tag_request: '{{name}} tagged you in a post.',
    review_reply: '{{name}} replied to your review: "{{snippet}}"',
    tag_accepted: '{{name}} accepted the tag in your post.',
    review_shared: '{{name}} reshared your review in a post. Do you want to stay anonymous or show your name and photo?',
    booking_no_show_seller: '{{name}} is marked as a no-show for "{{title}}" on {{date}}: no check-in. If they were there, correct it within 24 hours.',
    booking_no_show_client: 'You\'re marked as a no-show for "{{title}}" on {{date}}: no check-in. If you were there, dispute it within 24 hours.',
  },
};

const TZ = 'Europe/Rome';

/** Testo della notifica nella lingua del destinatario, o null se il tipo non è noto. */
export function pushBody(kind: string, payload: Record<string, unknown>, lang: string): string | null {
  const l: Lang = lang === 'en' ? 'en' : 'it';
  const key = kind === 'booking_no_show' ? `booking_no_show_${payload.role === 'seller' ? 'seller' : 'client'}` : kind;
  const template = TEXTS[l][key];
  if (!template) return null;
  const date = payload.starts_at
    ? new Intl.DateTimeFormat(l, { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(String(payload.starts_at)))
    : payload.ends_on
      ? new Intl.DateTimeFormat(l, { dateStyle: 'long', timeZone: TZ }).format(new Date(String(payload.ends_on)))
      : '';
  const euro = (cents: unknown) => new Intl.NumberFormat(l, { style: 'currency', currency: 'EUR' }).format(Number(cents ?? 0) / 100);
  const values: Record<string, string> = {
    name: String(payload.name ?? ''),
    title: String(payload.title ?? ''),
    count: String(Number(payload.count ?? 1)),
    snippet: String(payload.snippet ?? ''),
    rating: String(payload.rating ?? ''),
    amount: euro(payload.amount_cents),
    refund: euro(payload.refund_cents),
    date,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? '');
}

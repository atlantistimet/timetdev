import { localParts } from '@/lib/validity';

/** Istante corrispondente a un giorno (AAAA-MM-GG) e un'ora (HH:MM) dell'ora di Roma. */
export function romeToDate(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  let t = target;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(t));
    const [py, pm, pd] = p.date.split('-').map(Number);
    const shown = Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60);
    t += target - shown;
  }
  return new Date(t);
}

/** I prossimi `count` giorni a partire da domani, come stringhe AAAA-MM-GG dell'ora di Roma. */
export function nextDays(count: number, now: number): string[] {
  const [y, m, d] = localParts(new Date(now)).date.split('-').map(Number);
  return [...Array(count)].map((_, i) => new Date(Date.UTC(y, m - 1, d + i + 1)).toISOString().slice(0, 10));
}

/** Etichetta breve di un giorno AAAA-MM-GG nella lingua indicata. */
export function dayLabel(date: string, language: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(language, options).format(new Date(y, m - 1, d));
}

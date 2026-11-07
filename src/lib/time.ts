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

/** I prossimi `count` giorni (da domani, o da oggi con `includeToday`), come stringhe AAAA-MM-GG dell'ora di Roma. */
export function nextDays(count: number, now: number, includeToday = false): string[] {
  const [y, m, d] = localParts(new Date(now)).date.split('-').map(Number);
  const shift = includeToday ? 0 : 1;
  return [...Array(count)].map((_, i) => new Date(Date.UTC(y, m - 1, d + i + shift)).toISOString().slice(0, 10));
}

/** Etichetta breve di un giorno AAAA-MM-GG nella lingua indicata. */
export function dayLabel(date: string, language: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(language, options).format(new Date(y, m - 1, d));
}

/** Tempo relativo ("3 h fa"). Intl.RelativeTimeFormat non esiste nel motore JS del telefono (Hermes): formato a mano. */
export function timeAgo(iso: string, language: string, nowMs: number): string {
  const it = language.startsWith('it');
  const diff = (new Date(iso).getTime() - nowMs) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return it ? 'adesso' : 'now';
  const [n, unit] =
    abs < 3600 ? [Math.round(abs / 60), it ? 'min' : 'min'] :
    abs < 86_400 ? [Math.round(abs / 3600), it ? 'h' : 'h'] :
    [Math.round(abs / 86_400), it ? 'g' : 'd'];
  if (diff > 0) return it ? `tra ${n} ${unit}` : `in ${n} ${unit}`;
  return it ? `${n} ${unit} fa` : `${n} ${unit} ago`;
}


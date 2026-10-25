/** Finestra libera [from, to) in millisecondi. */
export type Interval = { from: number; to: number };

const HOUR = 3_600_000;

/**
 * Orari di inizio proposti al cliente: l'inizio di ogni finestra e poi ogni ora in punto, purché futuri
 * e con tutta la durata dentro la stessa finestra continua (le finestre arrivano già senza l'occupato).
 */
export function startsInWindows(windows: Interval[], durationMin: number, now: number): number[] {
  const len = durationMin * 60_000;
  const out = new Set<number>();
  for (const w of windows) {
    const candidates = [w.from];
    for (let t = Math.ceil((w.from + 1) / HOUR) * HOUR; t < w.to; t += HOUR) candidates.push(t);
    for (const start of candidates) if (start > now && start + len <= w.to) out.add(start);
  }
  return [...out].sort((a, b) => a - b);
}

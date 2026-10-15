/** Intervalli [from, to) in millisecondi. */
export type Interval = { from: number; to: number };

/** Vero se [start, end] è coperto senza buchi dagli intervalli aperti. */
export function isCovered(open: Interval[], start: number, end: number): boolean {
  let cursor = start;
  for (const r of [...open].sort((a, b) => a.from - b.from)) {
    if (r.from <= cursor && r.to > cursor) cursor = r.to;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

/** Orari di inizio prenotabili: ogni inizio di fascia aperta, futuro, coperto per tutta la durata e senza sovrapposizioni. */
export function bookableStarts(open: Interval[], busy: Interval[], durationMin: number, now: number): number[] {
  const len = durationMin * 60_000;
  return [...new Set(open.map((r) => r.from))]
    .filter((start) => start > now)
    .filter((start) => isCovered(open, start, start + len))
    .filter((start) => !busy.some((b) => b.from < start + len && b.to > start))
    .sort((a, b) => a - b);
}

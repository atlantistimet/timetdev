// Validità di un'offerta (giorni, periodo, giorni della settimana, fasce orarie). Orari locali Europe/Rome.
// Copia identica in src/lib/validity.ts: se cambia una, cambia anche l'altra.
export type Range = { from: string; to: string };
export type Validity = { modes: string[]; days: string[]; from: string; to: string; wdays: number[]; ranges: Range[] };

export const EMPTY_VALIDITY: Validity = { modes: [], days: [], from: '', to: '', wdays: [], ranges: [{ from: '09:00', to: '13:00' }] };

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
});
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Data (AAAA-MM-GG), giorno della settimana (0 = domenica) e minuti dalla mezzanotte, in ora di Roma. */
export function localParts(d: Date): { date: string; wday: number; minutes: number } {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    wday: WEEKDAYS[p.weekday] ?? 0,
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

const toMinutes = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Vero se lo slot [startsAt, endsAt] rispetta tutte le condizioni dell'offerta. */
export function offerApplies(v: Validity | null | undefined, startsAt: Date, endsAt: Date): boolean {
  if (!v || !Array.isArray(v.modes) || v.modes.length === 0) return true;
  const s = localParts(startsAt);
  const e = localParts(endsAt);
  for (const mode of v.modes) {
    if (mode === 'giorni') {
      if (!v.days?.includes(s.date)) return false;
    } else if (mode === 'periodo') {
      if (v.from && s.date < v.from) return false;
      if (v.to && s.date > v.to) return false;
    } else if (mode === 'settimana') {
      if (!v.wdays?.includes(s.wday)) return false;
    } else if (mode === 'orari') {
      const ok = (v.ranges ?? []).some((r) => {
        const from = toMinutes(r.from);
        const to = toMinutes(r.to);
        return from !== null && to !== null && e.date === s.date && s.minutes >= from && e.minutes <= to;
      });
      if (!ok) return false;
    } else {
      return false;
    }
  }
  return true;
}

/** Errore di compilazione (chiave breve) oppure null. */
export function validateValidity(v: Validity): string | null {
  for (const mode of v.modes) {
    if (mode === 'giorni' && v.days.length === 0) return 'days';
    if (mode === 'periodo') {
      if (!v.from && !v.to) return 'period';
      if (v.from && v.to && v.from > v.to) return 'period';
    }
    if (mode === 'settimana' && v.wdays.length === 0) return 'weekdays';
    if (mode === 'orari') {
      if (v.ranges.length === 0) return 'ranges';
      for (const r of v.ranges) {
        const from = toMinutes(r.from);
        const to = toMinutes(r.to);
        if (from === null || to === null || from >= to) return 'ranges';
      }
    }
  }
  return null;
}

export const discountedCents = (priceCents: number, discountPct: number) => Math.round((priceCents * (100 - discountPct)) / 100);

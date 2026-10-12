// Policy di cancellazione a fasce: "con almeno N ore di anticipo si rimborsa il X%".
// Vale la fascia con il più alto N non superiore all'anticipo reale. Le stesse regole sono nel database (valid_cancel_tiers).
export type Tier = { hours_before: number; refund_pct: number };

// Policy standard di Timeet: 100% fino a 2 giorni prima, 50% fino a 2 ore prima, poi 0% (e 0% in caso di assenza).
export const STANDARD_TIERS: Tier[] = [
  { hours_before: 48, refund_pct: 100 },
  { hours_before: 2, refund_pct: 50 },
  { hours_before: 0, refund_pct: 0 },
];

export function refundPercent(tiers: Tier[], startsAt: Date, now: Date = new Date()): number {
  const hoursLeft = (startsAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft < 0) return 0; // sessione già iniziata
  const sorted = [...tiers].sort((a, b) => b.hours_before - a.hours_before);
  return sorted.find((tier) => hoursLeft >= tier.hours_before)?.refund_pct ?? 0;
}

/** Importo da rimborsare sul totale incassato (prezzo + commissione cliente), arrotondato al centesimo. */
export function refundAmount(totalCents: number, pct: number): number {
  return Math.round((totalCents * pct) / 100);
}

// Commissioni Timeet su una prenotazione (importi in centesimi). Unica fonte di verità lato server.
//  - da 15 € in su: cliente 1 € fisso; venditore 1 € + 5%
//  - sotto i 15 €: cliente 5%; venditore 5%
//  - venditore Pro: solo il 5% (niente quota fissa)
// La base di calcolo è prezzo del servizio + eventuale extra (trasferta/spazio).
export const FIXED_FEE_CENTS = 100;
export const FIXED_FEE_THRESHOLD_CENTS = 1500;
export const PERCENT_FEE = 0.05;

export type Fees = { clientFeeCents: number; sellerFeeCents: number; applicationFeeCents: number; totalChargeCents: number };

export function bookingFees(baseCents: number, isPro: boolean): Fees {
  const percent = Math.round(baseCents * PERCENT_FEE);
  const fixedApplies = baseCents >= FIXED_FEE_THRESHOLD_CENTS;
  const clientFeeCents = fixedApplies ? FIXED_FEE_CENTS : percent;
  const sellerFeeCents = isPro ? percent : fixedApplies ? FIXED_FEE_CENTS + percent : percent;
  return {
    clientFeeCents,
    sellerFeeCents,
    applicationFeeCents: clientFeeCents + sellerFeeCents,
    totalChargeCents: baseCents + clientFeeCents,
  };
}

// ---------- Chiamate al minuto ----------
// Cliente: 5% + 0,50 € sul totale dei minuti; venditore: 5% + 0,50 € (Pro: solo 5%).
// Con più blocchi da 15 minuti la quota fissa si applica una volta sola, sul primo blocco.
export const CALL_FIXED_FEE_CENTS = 50;
export const CALL_BLOCK_MIN = 15;
export const CALL_MIN_BILLED_MIN = 5;
export const CALL_MAX_MIN = 60;
export const CALL_RING_SECONDS = 60;
/** I battiti arrivano ogni 10 s: oltre questa soglia senza battiti la persona è considerata caduta. */
export const CALL_STALE_SECONDS = 75;

export function callBlockFees(baseCents: number, isFirstBlock: boolean, isPro: boolean) {
  const percent = Math.round(baseCents * PERCENT_FEE);
  const fixed = isFirstBlock ? CALL_FIXED_FEE_CENTS : 0;
  const clientFeeCents = percent + fixed;
  const sellerFeeCents = percent + (isPro ? 0 : fixed);
  return { clientFeeCents, sellerFeeCents, applicationFeeCents: clientFeeCents + sellerFeeCents, totalChargeCents: baseCents + clientFeeCents };
}
/** Tariffa minima al minuto: sotto, la commissione (con la quota fissa) supererebbe l'incasso dei 5 minuti minimi. */
export const CALL_MIN_RATE_CENTS = 50;
export const CALL_AWAITING_PAYMENT_MINUTES = 15;
